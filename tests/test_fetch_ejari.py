"""The daily pull: once-per-day guard, missing keys, response shapes and inbox import."""
import json
import os
import unittest
from unittest import mock

from helpers import TempData, store

import fetch_ejari  # noqa: E402


class PullGuardTests(TempData):
    def setUp(self):
        super().setUp()
        self._paths = (fetch_ejari.STATE, fetch_ejari.INBOX)
        fetch_ejari.STATE = os.path.join(self.tmp, "state.json")
        fetch_ejari.INBOX = os.path.join(self.tmp, "inbox")

    def tearDown(self):
        fetch_ejari.STATE, fetch_ejari.INBOX = self._paths
        super().tearDown()

    def state(self):
        with open(fetch_ejari.STATE) as f:
            return json.load(f)

    def run_main(self, env):
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(fetch_ejari, "pull_api", return_value=([], None)) as pull:
            fetch_ejari.main()
        return pull

    def test_no_credentials_skips_the_api(self):
        pull = self.run_main({"DUBAI_PULSE_KEY": "", "DUBAI_PULSE_SECRET": ""})
        pull.assert_not_called()
        self.assertEqual(self.state()["last_api_status"], "no credentials")

    def test_only_one_pull_per_dubai_day(self):
        keys = {"DUBAI_PULSE_KEY": "k", "DUBAI_PULSE_SECRET": "s", "FORCE": "0"}
        self.assertEqual(self.run_main(keys).call_count, 1)
        self.assertEqual(self.state()["last_api_pull_date"], store.today_dubai().isoformat())
        self.assertEqual(self.run_main(keys).call_count, 0, "second run the same day must not call the API")
        self.assertEqual(self.run_main({**keys, "FORCE": "1"}).call_count, 1, "FORCE=1 overrides")

    def test_a_failed_pull_still_counts_as_todays_try(self):
        keys = {"DUBAI_PULSE_KEY": "k", "DUBAI_PULSE_SECRET": "s", "FORCE": "0"}
        with mock.patch.dict(os.environ, keys), \
             mock.patch.object(fetch_ejari, "pull_api", return_value=([], "stopped: HTTP 429")):
            fetch_ejari.main()
        self.assertTrue(self.state()["last_api_status"].startswith("stopped"))
        self.assertEqual(self.run_main(keys).call_count, 0)

    def test_inbox_csv_is_imported_and_removed(self):
        self.write("inbox/rents.csv",
                   "Start Date,End Date,Annual Amount,Area,Project\n"
                   "05-11-2026,04-11-2027,65000,Al Barsha South Fourth,Bloom Towers\n")
        self.run_main({"DUBAI_PULSE_KEY": ""})
        self.assertEqual(os.listdir(fetch_ejari.INBOX), [])
        self.assertEqual(self.state()["last_manual_import"]["added"], 1)
        self.assertEqual(len(list(store.iter_all())), 1)


class FakePulse:
    """Answers like the Dubai Pulse API: pages of a start-date window, 401 when the token is stale."""

    def __init__(self, n_per_window=2500, expire_at=None, fail_at=None):
        self.n, self.expire_at, self.fail_at, self.calls, self.tokens = n_per_window, expire_at, fail_at, [], 0

    def token(self, key, secret):
        self.tokens += 1
        return f"t{self.tokens}"

    def http(self, req):
        from urllib.parse import parse_qs, urlparse
        q = parse_qs(urlparse(req.full_url).query)
        self.calls.append((q["filter"][0], int(q["offset"][0]), req.get_header("Authorization")))
        if self.fail_at is not None and len(self.calls) == self.fail_at:
            raise fetch_ejari.StopForToday("HTTP 503")
        if self.expire_at is not None and len(self.calls) == self.expire_at:
            raise PermissionError("token expired")
        off, flt = int(q["offset"][0]), q["filter"][0]
        start = flt.split("'")[1]
        return {"results": [{"contract_id": f"{start}-{i}", "line_number": 1, "contract_start_date": start,
                             "annual_amount": 50000, "area_name_en": "Al Barsha South Fourth"}
                            for i in range(off, min(off + fetch_ejari.PAGE_SIZE, self.n))]}


class PullTests(unittest.TestCase):
    TODAY = __import__("datetime").date(2026, 11, 15)

    def pull(self, api, max_pages=None):
        with mock.patch.object(fetch_ejari, "http", api.http), mock.patch.object(fetch_ejari, "get_token", api.token), \
             mock.patch.object(fetch_ejari, "MAX_PAGES", max_pages or fetch_ejari.MAX_PAGES), \
             mock.patch.object(fetch_ejari.time, "sleep"), mock.patch("builtins.print"):
            return fetch_ejari.pull_api("k", "s", today=self.TODAY)

    def test_windows_reach_ahead_and_revisit_older_days(self):
        from datetime import timedelta
        (a, b), (c, d) = fetch_ejari.windows(self.TODAY)
        self.assertEqual((a, b), (self.TODAY - timedelta(days=3), self.TODAY + timedelta(days=14)))
        self.assertEqual((d - c).days, 5)
        self.assertTrue(self.TODAY - timedelta(days=60) <= c < self.TODAY)
        slices = {fetch_ejari.windows(self.TODAY + timedelta(days=i))[1][0] - timedelta(days=i) for i in range(10)}
        self.assertEqual(len(slices), 10, "ten different slices over ten days")

    def test_both_windows_are_pulled_completely(self):
        recs, problem = self.pull(FakePulse())
        self.assertIsNone(problem)
        self.assertEqual(len(recs), 5000, "2,500 rows in each of the two windows")

    def test_expired_token_retries_the_same_page(self):
        api = FakePulse(expire_at=2)
        recs, problem = self.pull(api)
        self.assertIsNone(problem)
        self.assertEqual(len(recs), 5000, "no page skipped")
        self.assertEqual(api.calls[1][1], api.calls[2][1], "same offset asked again")
        self.assertEqual(api.calls[2][2], "Bearer t2", "with the new token")

    def test_page_cap_keeps_what_arrived(self):
        recs, problem = self.pull(FakePulse(), max_pages=2)
        self.assertEqual(len(recs), 2000)
        self.assertIn("page cap", problem)

    def test_stop_keeps_what_arrived(self):
        recs, problem = self.pull(FakePulse(fail_at=3))
        self.assertEqual(len(recs), 2000)
        self.assertEqual(problem, "stopped: HTTP 503")


class ResponseShapeTests(unittest.TestCase):
    def test_rows_from_known_shapes(self):
        rows = [{"a": 1}]
        self.assertEqual(fetch_ejari.rows_from(rows), rows)
        self.assertEqual(fetch_ejari.rows_from({"results": rows}), rows)
        self.assertEqual(fetch_ejari.rows_from({"result": {"records": rows}}), rows)
        self.assertEqual(fetch_ejari.rows_from({"unexpected": 1}), [])
        self.assertEqual(fetch_ejari.rows_from(None), [])


if __name__ == "__main__":
    unittest.main()
