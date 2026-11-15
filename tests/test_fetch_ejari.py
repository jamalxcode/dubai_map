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
             mock.patch.object(fetch_ejari, "pull_api", return_value=[]) as pull:
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
             mock.patch.object(fetch_ejari, "pull_api", side_effect=fetch_ejari.StopForToday("HTTP 429")):
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
