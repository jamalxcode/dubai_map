"""Shared plumbing: polite HTTP (net.py), source state (state.py) and the area record (output.py)."""
import io
import json
import os
import unittest
import urllib.error
from unittest import mock

from helpers import ROOT, TempData

import build  # noqa: E402
import fetch_ejari  # noqa: E402
import net  # noqa: E402
import output  # noqa: E402
import state  # noqa: E402


def http_error(code, retry_after=None):
    headers = {"Retry-After": str(retry_after)} if retry_after else {}
    return urllib.error.HTTPError("https://x", code, "err", headers, io.BytesIO(b"nope"))


class Ok:
    def __init__(self, body=b'{"a": 1}', headers=None):
        self.body, self.headers = body, headers or {}

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class NetTests(unittest.TestCase):
    def call(self, effects, **kw):
        waits = []
        with mock.patch.object(net.urllib.request, "urlopen", side_effect=effects) as op, mock.patch("builtins.print"):
            try:
                return net.get_json("https://x", sleep=waits.append, **kw), waits, op
            except Exception as e:  # noqa: BLE001
                return e, waits, op

    def test_slow_down_is_honoured_then_succeeds(self):
        got, waits, op = self.call([http_error(429, retry_after=7), Ok()])
        self.assertEqual(got, {"a": 1})
        self.assertEqual(waits, [7])

    def test_gives_up_after_bounded_tries(self):
        got, waits, op = self.call([http_error(503)] * 3)
        self.assertIsInstance(got, net.StopForToday)
        self.assertEqual(op.call_count, 3, "never more than three tries")
        self.assertEqual(waits, [20, 40])

    def test_waits_are_capped(self):
        _, waits, _ = self.call([http_error(429, retry_after=9999), Ok()], max_wait=120)
        self.assertEqual(waits, [120])

    def test_rejected_key_and_not_modified_are_distinct(self):
        got, _, op = self.call([http_error(401)])
        self.assertIsInstance(got, net.AuthError)
        self.assertEqual(op.call_count, 1, "a rejected key is not retried here")
        got, _, _ = self.call([http_error(304)])
        self.assertIsInstance(got, net.NotModified)
        got, _, _ = self.call([http_error(404)])
        self.assertIsInstance(got, net.StopForToday)

    def test_honest_user_agent(self):
        _, _, op = self.call([Ok()])
        self.assertIn("github.com/jamalxcode/dubai_map", op.call_args[0][0].get_header("User-agent"))

    def test_bad_json_stops(self):
        got, _, _ = self.call([Ok(b"<html>")])
        self.assertIsInstance(got, net.StopForToday)


class StateTests(TempData):
    def test_round_trip_and_status_text(self):
        s = {}
        state.set_status(s.setdefault("pulse", {}), "partial", "page cap reached")
        state.save(s)
        self.assertEqual(state.load()["pulse"], {"state": "partial", "status": "ok (page cap reached)"})
        self.assertEqual(state.text("no_key"), "no credentials")
        with self.assertRaises(AssertionError):
            state.set_status({}, "fine")

    def test_reads_old_state_files(self):
        self.write("state.json", json.dumps({
            "last_api_status": "stopped: HTTP 429", "last_api_pull_date": "2026-11-14", "last_api_rows": 5,
            "last_manual_import": {"added": 1}, "dld": {"status": "off (waiting for DLD's permission)"}}))
        s = state.load()
        self.assertEqual(s["pulse"], {"status": "stopped: HTTP 429", "state": "failed",
                                      "last_pull_date": "2026-11-14", "rows": 5})
        self.assertEqual(s["dld"]["state"], "off")
        self.assertEqual(s["inbox"], {"added": 1})
        self.assertFalse([k for k in s if k.startswith("last_api_")])

    def test_source_status_is_structured(self):
        s = {"pulse": state.set_status({}, "failed", "HTTP 503"), "dld": state.set_status({}, "off", "no permission")}
        out = build.source_status(s, own={"contracts": 0, "weeks": 0})
        self.assertEqual([x["state"] for x in out], ["off", "failed", "ok"])
        self.assertEqual(out[1]["status"], "stopped: HTTP 503")
        self.assertEqual(build.source_status({})[0]["state"], "not_run")

    def test_tests_never_touch_the_real_data_folder(self):
        real = os.path.join(ROOT, "data", "state.json")
        before = open(real).read() if os.path.exists(real) else None
        with mock.patch.dict(os.environ, {"DUBAI_PULSE_KEY": ""}), mock.patch("builtins.print"):
            fetch_ejari.main()
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "state.json")))
        self.assertEqual(open(real).read() if os.path.exists(real) else None, before)


class AreaRecordTests(unittest.TestCase):
    def test_every_key_present_and_unknown_keys_rejected(self):
        a = output.area(label="X", n=3, median=50000)
        self.assertEqual(set(a), set(output.AREA_DEFAULTS))
        self.assertIsNone(a["p25"])
        with self.assertRaises(ValueError):
            output.area(label="X", medain=1)

    def test_defaults_are_not_shared(self):
        a, b = output.area(), output.area()
        a["by_unit"].append(1)
        self.assertEqual(b["by_unit"], [])


if __name__ == "__main__":
    unittest.main()


class PullGapTests(unittest.TestCase):
    def test_due_after_the_minimum_gap(self):
        from datetime import datetime, timezone
        now = datetime(2026, 11, 16, 12, 0, tzinfo=timezone.utc)
        self.assertTrue(state.due({}, "last_try_at", 6, now), "never tried")
        self.assertTrue(state.due({"last_try_at": "garbage"}, "last_try_at", 6, now), "unreadable: allowed")
        self.assertFalse(state.due({"last_try_at": "2026-11-16T08:00:00+00:00"}, "last_try_at", 6, now))
        self.assertTrue(state.due({"last_try_at": "2026-11-16T05:59:00+00:00"}, "last_try_at", 6, now))
        self.assertAlmostEqual(state.hours_since({"t": "2026-11-16T09:00:00+00:00"}, "t", now), 3)
        self.assertEqual(state.MIN_HOURS, 6)
