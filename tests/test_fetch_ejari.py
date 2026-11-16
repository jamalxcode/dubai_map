"""The daily pull: once-per-day guard, missing keys, response shapes and inbox import."""
import json
import os
import unittest
from unittest import mock

from helpers import TempData, store

import fetch_ejari  # noqa: E402


class PullGuardTests(TempData):
    def state(self):
        with open(os.path.join(self.tmp, "state.json")) as f:
            return json.load(f)

    def run_main(self, env):
        with mock.patch.dict(os.environ, env, clear=False), \
             mock.patch.object(fetch_ejari, "pull_api", return_value=([], "ok", "")) as pull:
            fetch_ejari.main()
        return pull

    def test_no_credentials_skips_the_api(self):
        pull = self.run_main({"DUBAI_PULSE_KEY": "", "DUBAI_PULSE_SECRET": ""})
        pull.assert_not_called()
        self.assertEqual(self.state()["pulse"]["state"], "no_key")
        self.assertEqual(self.state()["pulse"]["status"], "no credentials", "wording the page shows")

    def test_at_most_every_six_hours_and_daily_extras_once(self):
        keys = {"DUBAI_PULSE_KEY": "k", "DUBAI_PULSE_SECRET": "s", "FORCE": "0"}
        first = self.run_main(keys)
        self.assertEqual(first.call_count, 1)
        self.assertTrue(first.call_args.kwargs["refresh"], "first pull of the day re-checks an older slice")
        self.assertEqual(self.state()["pulse"]["refresh_date"], store.today_dubai().isoformat())
        self.assertEqual(self.run_main(keys).call_count, 0, "a duplicate start minutes later must not call the API")
        self.later(5)
        self.assertEqual(self.run_main(keys).call_count, 0, "5 hours is too soon")
        self.later(2)
        second = self.run_main(keys)
        self.assertEqual(second.call_count, 1, "7 hours later: the next of three daily pulls")
        self.assertFalse(second.call_args.kwargs["refresh"], "later pulls the same day fetch recent days only")
        self.assertEqual(self.run_main({**keys, "FORCE": "1"}).call_count, 1, "FORCE=1 overrides")

    def test_recent_window_only_when_not_refreshing(self):
        from datetime import date
        self.assertEqual(len(fetch_ejari.windows(date(2026, 11, 16))), 2)
        self.assertEqual(len(fetch_ejari.windows(date(2026, 11, 16), refresh=False)), 1)

    def test_a_failed_pull_still_counts_as_todays_try(self):
        keys = {"DUBAI_PULSE_KEY": "k", "DUBAI_PULSE_SECRET": "s", "FORCE": "0"}
        with mock.patch.dict(os.environ, keys), \
             mock.patch.object(fetch_ejari, "pull_api", return_value=([], "failed", "HTTP 429")):
            fetch_ejari.main()
        self.assertEqual(self.state()["pulse"]["state"], "failed")
        self.assertEqual(self.run_main(keys).call_count, 0)

    def test_inbox_csv_is_imported_and_removed(self):
        self.write("inbox/rents.csv",
                   "Start Date,End Date,Annual Amount,Area,Project\n"
                   "05-11-2026,04-11-2027,65000,Al Barsha South Fourth,Bloom Towers\n")
        self.run_main({"DUBAI_PULSE_KEY": ""})
        self.assertEqual(os.listdir(fetch_ejari.inbox_dir()), [])
        self.assertEqual(self.state()["inbox"]["added"], 1)
        self.assertEqual(len(list(store.iter_all())), 1)


class FakePulse:
    """Answers like the Dubai Pulse API: pages of a start-date window, 401 when the token is stale."""

    def __init__(self, n_per_window=2500, expire_at=None, fail_at=None):
        self.n, self.expire_at, self.fail_at, self.calls, self.tokens = n_per_window, expire_at, fail_at, [], 0

    def token(self, key, secret):
        self.tokens += 1
        return f"t{self.tokens}"

    def get_json(self, url, headers=None, **kw):
        from urllib.parse import parse_qs, urlparse
        q = parse_qs(urlparse(url).query)
        self.calls.append((q["filter"][0], int(q["offset"][0]), (headers or {}).get("Authorization")))
        if self.fail_at is not None and len(self.calls) == self.fail_at:
            raise fetch_ejari.StopForToday("HTTP 503")
        if self.expire_at is not None and len(self.calls) == self.expire_at:
            raise fetch_ejari.AuthError("token expired")
        off, flt = int(q["offset"][0]), q["filter"][0]
        start = flt.split("'")[1]
        return {"results": [{"contract_id": f"{start}-{i}", "line_number": 1, "contract_start_date": start,
                             "annual_amount": 50000, "area_name_en": "Al Barsha South Fourth"}
                            for i in range(off, min(off + fetch_ejari.PAGE_SIZE, self.n))]}


class PullTests(unittest.TestCase):
    TODAY = __import__("datetime").date(2026, 11, 15)

    def pull(self, api, max_pages=None):
        with mock.patch.object(fetch_ejari.net, "get_json", api.get_json), mock.patch.object(fetch_ejari, "get_token", api.token), \
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
        recs, kind, _ = self.pull(FakePulse())
        self.assertEqual(kind, "ok")
        self.assertEqual(len(recs), 5000, "2,500 rows in each of the two windows")

    def test_expired_token_retries_the_same_page(self):
        api = FakePulse(expire_at=2)
        recs, kind, _ = self.pull(api)
        self.assertEqual(kind, "ok")
        self.assertEqual(len(recs), 5000, "no page skipped")
        self.assertEqual(api.calls[1][1], api.calls[2][1], "same offset asked again")
        self.assertEqual(api.calls[2][2], "Bearer t2", "with the new token")

    def test_page_cap_keeps_what_arrived(self):
        recs, kind, detail = self.pull(FakePulse(), max_pages=2)
        self.assertEqual(len(recs), 2000)
        self.assertEqual(kind, "partial")
        self.assertIn("page cap", detail)

    def test_stop_keeps_what_arrived(self):
        recs, kind, detail = self.pull(FakePulse(fail_at=3))
        self.assertEqual(len(recs), 2000)
        self.assertEqual((kind, detail), ("failed", "HTTP 503"))


class HostFallbackTests(unittest.TestCase):
    """apis.data.dubai first, api.dubaipulse.gov.ae if the new host is unreachable; never on a refusal."""

    def run_pull(self, behaviour):
        seen = []

        def fake(url, headers=None, **kw):
            host = url.split('/')[2]
            seen.append(host)
            err = behaviour.get(host)
            if err:
                raise err
            return {"results": [{"contract_id": "C1", "contract_start_date": "2026-11-15", "annual_amount": 50000,
                                 "area_name_en": "Al Barsha South Fourth"}]}
        with mock.patch.object(fetch_ejari.net, "get_json", fake), mock.patch.object(fetch_ejari, "get_token", lambda k, s: "t"), \
             mock.patch.object(fetch_ejari.time, "sleep"), mock.patch("builtins.print"):
            recs, kind, detail = fetch_ejari.pull_api("k", "s", today=__import__("datetime").date(2026, 11, 16))
        return seen, recs, kind, detail

    def test_new_host_first(self):
        seen, recs, kind, _ = self.run_pull({})
        self.assertEqual(seen[0], "apis.data.dubai")
        self.assertEqual(set(seen), {"apis.data.dubai"}, "the host that answered is kept for the run")
        self.assertEqual(kind, "ok")

    def test_falls_back_when_new_host_unreachable(self):
        seen, recs, kind, _ = self.run_pull({"apis.data.dubai": fetch_ejari.StopForToday("network: timed out")})
        self.assertEqual(seen[:2], ["apis.data.dubai", "api.dubaipulse.gov.ae"])
        self.assertEqual(set(seen[2:]), {"api.dubaipulse.gov.ae"})
        self.assertEqual(kind, "ok")

    def test_a_refusal_is_not_a_reason_to_try_elsewhere(self):
        seen, _, kind, detail = self.run_pull({"apis.data.dubai": fetch_ejari.StopForToday("HTTP 429")})
        self.assertEqual(seen, ["apis.data.dubai"])
        self.assertEqual((kind, detail), ("failed", "HTTP 429"))


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
