"""collector/hotel_prices.py: Xotelo nightly prices for our places to stay (Xotelo faked)."""
import json
import os
import sys
import tempfile
import unittest
from datetime import date
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "collector"))
import hotel_prices as hp  # noqa: E402
import net  # noqa: E402
import store  # noqa: E402

OURS = [  # name, name_ar, kind, stars, lat, lng (as in data/hotels.json)
    ["Palm Hotel", "", "hotel", 5, 25.11200, 55.13800],
    ["Creek Suites Hotel Apartments", "", "apartments", 4, 25.25000, 55.33000],
    ["Marina Inn", "", "hotel", 3, 25.08000, 55.14000],
    ["Lonely Hostel", "", "hostel", None, 25.20000, 55.27000],
]
THEIRS = [
    {"key": "x1", "name": "The Palm Hotel Dubai", "geo": {"latitude": 25.1122, "longitude": 55.1381}, "review_summary": {"rating": 4.5, "count": 120}},  # same place
    {"key": "x2", "name": "Creek Suites", "geo": {"latitude": 25.2503, "longitude": 55.3302}},          # same, shorter name
    {"key": "x3", "name": "Marina Inn", "geo": {"latitude": 25.0900, "longitude": 55.1400}},           # same name, 1.1 km away
    {"key": "x4", "name": "Desert Palace", "geo": {"latitude": 25.2000, "longitude": 55.2701}},        # nearby, other name
    {"key": "x5", "name": "Abu Dhabi Hotel", "geo": {"latitude": 24.45, "longitude": 54.37}},           # outside Dubai
] + [{"key": f"f{i}", "name": f"Filler {i}", "geo": {"latitude": 24.95 + i * 0.0002, "longitude": 55.05}} for i in range(600)]
# USD offers per hotel per sample night (Xotelo answers in USD); x2 has one member rate far under the others.
RATES = {"x1": [[250, 260, 300], [280]], "x2": [[40, 110, 120], []]}


def fake_xotelo(calls=None, fail=False, list_error=None):
    seen = {}

    def get(url, **kw):
        if calls is not None:
            calls.append(url)
        if fail:
            raise net.StopForToday("HTTP 503")
        if "/list?" in url:
            if list_error:
                return {"error": list_error, "result": None}
            off = int(url.split("offset=")[1].split("&")[0])
            return {"error": None, "result": {"total_count": len(THEIRS), "list": THEIRS[off:off + 100]}}
        key = url.split("hotel_key=")[1].split("&")[0]
        n = seen[key] = seen.get(key, -1) + 1
        offers = (RATES.get(key) or [[], []])[n % 2]
        if not offers:
            return {"error": "no rates", "result": None}
        return {"error": None, "result": {"currency": "USD", "rates": [{"code": "c", "name": "Site", "rate": r} for r in offers]}}
    return get


class Matching(unittest.TestCase):
    def test_pairs_by_name_and_position(self):
        theirs = [{"id": t["key"], "name": t["name"], "lat": t["geo"]["latitude"], "lng": t["geo"]["longitude"]} for t in THEIRS[:5]]
        m = hp.match(OURS, theirs)
        self.assertEqual({i: t["id"] for i, t in m.items()}, {0: "x1", 1: "x2"})

    def test_night_price_is_the_lowest_believable_offer_in_aed(self):
        self.assertEqual(hp.night_price([{"rate": 250}, {"rate": 260}, {"rate": 300}]), round(250 * 3.6725))
        self.assertEqual(hp.night_price([{"rate": 40}, {"rate": 110}, {"rate": 120}]), round(110 * 3.6725))  # 40 is under 60% of the median
        self.assertIsNone(hp.night_price([]))
        self.assertIsNone(hp.night_price([{"rate": 5}]))  # AED 18: not a price


class Collector(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.hotels = os.path.join(self.d, "hotels.json")
        self.out = os.path.join(self.d, "hotel_prices.json")
        json.dump({"hotels": OURS}, open(self.hotels, "w"))
        self.p = mock.patch.object(store, "DATA", self.d)
        self.p.start()
        self.addCleanup(self.p.stop)

    def run_it(self, get, today=date(2026, 11, 19), budget="100"):
        with mock.patch.object(hp, "MIN_HOTELS", 1):
            return hp.main(["--hotels", self.hotels, "--out", self.out, "--budget", budget], today=today, get=get)

    def state(self):
        return json.load(open(os.path.join(self.d, "state.json")))["hotel_prices"]

    def test_prices_are_saved_with_their_range_and_date(self):
        self.assertEqual(self.run_it(fake_xotelo()), 0)
        out = json.load(open(self.out))
        rows = {r[0]: r for r in out["hotels"]}
        self.assertEqual(set(rows), {"Palm Hotel", "Creek Suites Hotel Apartments"})
        a, b = round(250 * 3.6725), round(280 * 3.6725)
        self.assertEqual(rows["Palm Hotel"][3:], [round((a + b) / 2), 2, a, b, "2026-11-19"])
        self.assertEqual(rows["Creek Suites Hotel Apartments"][4], 1)  # one night had rooms
        self.assertEqual(out["currency"], "AED")
        self.assertEqual(self.state()["state"], "ok")
        self.assertEqual(self.state()["matched"], 2)
        self.assertEqual(out["info"]["Palm Hotel|25.112|55.138"][0], 4.5)  # Tripadvisor rating kept for the card

    def test_the_list_is_fetched_once_a_day_and_prices_rotate(self):
        calls = []
        self.run_it(fake_xotelo(calls), budget="1")
        self.assertTrue(any("/list?" in u for u in calls))
        first = [u for u in calls if "/rates?" in u]
        self.assertEqual(len({u.split("hotel_key=")[1].split("&")[0] for u in first}), 1)
        calls.clear()
        self.run_it(fake_xotelo(calls), budget="1")
        self.assertFalse(any("/list?" in u for u in calls))  # matched keys are kept in the file
        second = {u.split("hotel_key=")[1].split("&")[0] for u in calls if "/rates?" in u}
        self.assertNotEqual(second, {u.split("hotel_key=")[1].split("&")[0] for u in first})  # the other hotel's turn
        self.assertEqual(len(json.load(open(self.out))["hotels"]), 2)  # the first hotel's price is kept

    def test_old_prices_are_dropped(self):
        self.run_it(fake_xotelo())
        self.run_it(fake_xotelo(), today=date(2026, 12, 5), budget="0")
        self.assertEqual(json.load(open(self.out))["hotels"], [])

    def test_a_failing_xotelo_keeps_the_last_prices(self):
        self.run_it(fake_xotelo())
        before = open(self.out).read()
        with mock.patch.object(hp.st, "due", return_value=True):
            self.assertEqual(self.run_it(fake_xotelo(fail=True)), 0)
        self.assertEqual(open(self.out).read(), before)
        self.assertEqual(self.state()["state"], "failed")

    def test_a_short_list_is_not_trusted(self):
        with mock.patch.object(hp, "fetch_list", return_value=[]):
            self.run_it(fake_xotelo())
        self.assertFalse(os.path.exists(self.out))
        self.assertIn("only 0", self.state()["status"])

    def test_without_hotels_json_it_waits(self):
        os.remove(self.hotels)
        self.run_it(fake_xotelo())
        self.assertEqual(self.state()["state"], "standby")


if __name__ == "__main__":
    unittest.main()
