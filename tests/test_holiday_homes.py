"""collector/holiday_homes.py: Xotelo's holiday homes and serviced apartments (Xotelo faked)."""
import json
import os
import sys
import tempfile
import unittest
from datetime import date
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "collector"))
import holiday_homes as hh  # noqa: E402
import net  # noqa: E402
import store  # noqa: E402


def place(i, kind="Condominium", key=None):
    return {"key": key or f"c{i}", "name": f"Residence {i}", "accommodation_type": kind, "url": f"https://www.tripadvisor.com/Hotel_Review-c{i}.html",
            "review_summary": {"rating": 4.5, "count": 10 + i}, "geo": {"latitude": 25.0 + i * 0.0005, "longitude": 55.2}}


LIST = [place(i) for i in range(150)] + [place(0)] + [place(i % 100, "Hotel", f"h{i}") for i in range(400)] + [place(151, "Villa", "v1"), place(152, "Condominium", "taken")]


def fake(calls=None, fail=False):
    def get(url, **kw):
        if calls is not None:
            calls.append(url)
        if fail:
            raise net.StopForToday("HTTP 503")
        if "/list?" in url:
            off = int(url.split("offset=")[1].split("&")[0])
            return {"error": None, "result": {"list": LIST[off:off + 100]}}
        key = url.split("hotel_key=")[1].split("&")[0]
        if key == "c1":
            return {"error": "no rates", "result": None}
        return {"error": None, "result": {"currency": "USD", "rates": [{"rate": 100}, {"rate": 120}]}}
    return get


class HolidayHomes(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.out = os.path.join(self.d, "holiday_homes.json")
        self.hp = os.path.join(self.d, "hotel_prices.json")
        json.dump({"keys": {"Some Hotel|25|55": "taken"}}, open(self.hp, "w"))
        p = mock.patch.object(store, "DATA", self.d)
        p.start()
        self.addCleanup(p.stop)

    def run_it(self, get, budget="5", today=date(2026, 11, 19)):
        return hh.main(["--out", self.out, "--hotel-prices", self.hp, "--budget", budget], today=today, get=get)

    def state(self):
        return json.load(open(os.path.join(self.d, "state.json")))["holiday_homes"]

    def test_keeps_condominiums_and_villas_once_and_not_hotels(self):
        self.assertEqual(self.run_it(fake()), 0)
        out = json.load(open(self.out))
        self.assertEqual(out["listed"], 151)  # 150 condominiums (one listed twice) + 1 villa; "taken" is a hotel already
        self.assertNotIn("taken", out["places"])
        self.assertNotIn("h0", out["places"])
        self.assertIn("v1", out["places"])

    def test_prices_rows_with_rating_and_link(self):
        self.run_it(fake())
        rows = json.load(open(self.out))["homes"]
        self.assertEqual(len(rows), 4)  # 5 asked, c1 had no rooms
        r = rows[0]
        self.assertEqual(r[3:7], [round(100 * 3.6725), 2, round(100 * 3.6725), round(100 * 3.6725)])
        self.assertEqual((r[7], r[8]), ("2026-11-19", 4.5))
        self.assertTrue(r[10].startswith("https://www.tripadvisor.com/"))
        self.assertEqual(self.state()["priced"], 4)

    def test_rotation_keeps_earlier_prices_and_drops_old_ones(self):
        self.run_it(fake())
        calls = []
        self.run_it(fake(calls))
        self.assertFalse(any("/list?" in u for u in calls))
        self.assertEqual(len(json.load(open(self.out))["homes"]), 9)
        with mock.patch.object(hh.st, "due", return_value=False):
            self.run_it(fake(), budget="0", today=date(2026, 12, 10))
        self.assertEqual(json.load(open(self.out))["homes"], [])

    def test_failures_keep_the_file(self):
        self.run_it(fake())
        before = open(self.out).read()
        with mock.patch.object(hh.st, "due", return_value=True):
            self.run_it(fake(fail=True))
        self.assertEqual(open(self.out).read(), before)
        self.assertEqual(self.state()["state"], "failed")

    def test_a_short_list_is_not_trusted(self):
        with mock.patch.object(hh.hp, "fetch_list", return_value=[{"id": "x", "name": "x", "lat": 25, "lng": 55, "type": "Condominium"}] * 600):
            self.run_it(fake())
        self.assertFalse(os.path.exists(self.out))
        self.assertIn("only 1", self.state()["status"])


if __name__ == "__main__":
    unittest.main()
