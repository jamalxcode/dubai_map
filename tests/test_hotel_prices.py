"""collector/hotel_prices.py: LiteAPI nightly prices for our places to stay (LiteAPI faked)."""
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
    {"id": "lp1", "name": "The Palm Hotel Dubai", "latitude": 25.1122, "longitude": 55.1381, "stars": 5},  # same place
    {"id": "lp2", "name": "Creek Suites", "latitude": 25.2503, "longitude": 55.3302, "stars": 4},          # same, shorter name
    {"id": "lp3", "name": "Marina Inn", "latitude": 25.0900, "longitude": 55.1400},                     # same name, 1.1 km away
    {"id": "lp4", "name": "Desert Palace", "latitude": 25.2000, "longitude": 55.2701},                  # nearby, other name
    {"id": "lp5", "name": "Abu Dhabi Hotel", "latitude": 24.45, "longitude": 54.37},                     # outside Dubai
]
PRICES = {"lp1": [900, 1100, 1000, 1200], "lp2": [400, None, 420, 380]}  # per sample night


def fake_api(sandbox=False, currency="AED", calls=None):
    night = {"n": 0}

    def get_json(url, data=None, headers=None, method=None, **kw):
        if calls is not None:
            calls.append(url)
        assert headers["X-API-Key"] == "k"
        if "/data/hotels" in url:
            return {"data": THEIRS if "offset=0" in url else []}
        body = json.loads(data)
        assert body["currency"] == "AED" and body["occupancies"] == [{"adults": 2}]
        i = night["n"]; night["n"] += 1
        rows = [{"hotelId": h, "price": PRICES[h][i], "currency": currency} for h in body["hotelIds"] if h in PRICES and PRICES[h][i]]
        return {"data": rows, "sandbox": sandbox}
    return get_json


class Matching(unittest.TestCase):
    def test_pairs_by_name_and_position(self):
        theirs = [{"id": t["id"], "name": t["name"], "lat": t["latitude"], "lng": t["longitude"]} for t in THEIRS[:4]]
        m = hp.match(OURS, theirs)
        self.assertEqual({i: t["id"] for i, t in m.items()}, {0: "lp1", 1: "lp2"})

    def test_average_needs_two_nights(self):
        matched = {0: {"id": "lp1"}, 1: {"id": "lp2"}}
        nights = {"2026-12-01": {"lp1": 900}, "2026-12-02": {"lp1": 1100, "lp2": 400}}
        out = hp.build(OURS, matched, nights, date(2026, 11, 18))
        self.assertEqual(out["hotels"], [["Palm Hotel", 25.112, 55.138, 1000, 2, 900, 1100]])


class Run(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = os.path.join(self.tmp.name, "data")
        os.makedirs(self.data)
        self.hotels = os.path.join(self.data, "hotels.json")
        json.dump({"hotels": OURS}, open(self.hotels, "w"))
        self.out = os.path.join(self.data, "hotel_prices.json")
        self.patches = [mock.patch.object(store, "DATA", self.data)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def run_it(self, env, api=None, extra=()):
        with mock.patch.dict(os.environ, env, clear=False), mock.patch.object(hp.net, "get_json", api or fake_api()), \
                mock.patch.object(hp, "MIN_HOTELS", 1):
            return hp.main(["--hotels", self.hotels, "--out", self.out, *extra], today=date(2026, 11, 18))

    def state(self):
        with open(os.path.join(self.data, "state.json")) as f:
            return json.load(f)["hotel_prices"]

    def test_without_a_key_nothing_is_fetched(self):
        env = {k: v for k, v in os.environ.items() if k != "LITEAPI_KEY"}
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(hp.net, "get_json", side_effect=AssertionError):
            self.assertEqual(hp.main(["--hotels", self.hotels, "--out", self.out]), 0)
        self.assertEqual(self.state()["state"], "no_key")
        self.assertFalse(os.path.exists(self.out))

    def test_prices_are_saved_once_a_day(self):
        calls = []
        self.assertEqual(self.run_it({"LITEAPI_KEY": "k"}, fake_api(calls=calls)), 0)
        out = json.load(open(self.out))
        self.assertEqual([h[0] for h in out["hotels"]], ["Palm Hotel", "Creek Suites Hotel Apartments"])
        self.assertEqual(out["hotels"][0][3], 1050)       # average of 900, 1100, 1000, 1200
        self.assertEqual(out["hotels"][1][3:5], [400, 3])  # one night had no price
        self.assertEqual(len(out["nights"]), 4)
        self.assertEqual(self.state()["state"], "ok")
        n = len(calls)
        self.assertEqual(self.run_it({"LITEAPI_KEY": "k"}, fake_api(calls=calls)), 0)  # minutes later: no new requests
        self.assertEqual(len(calls), n)

    def test_sandbox_prices_are_never_published(self):
        self.assertEqual(self.run_it({"LITEAPI_KEY": "k"}, fake_api(sandbox=True)), 0)
        self.assertFalse(os.path.exists(self.out))
        self.assertEqual(self.state()["state"], "failed")
        self.assertIn("sandbox", self.state()["status"])

    def test_other_currencies_are_ignored(self):
        self.assertEqual(self.run_it({"LITEAPI_KEY": "k"}, fake_api(currency="USD")), 1)
        self.assertFalse(os.path.exists(self.out))

    def test_a_rejected_key_keeps_the_last_prices(self):
        open(self.out, "w").write('{"keep":1}')
        with mock.patch.dict(os.environ, {"LITEAPI_KEY": "k"}), mock.patch.object(hp.net, "get_json", side_effect=net.AuthError("bad key")):
            self.assertEqual(hp.main(["--hotels", self.hotels, "--out", self.out]), 0)
        self.assertEqual(json.load(open(self.out)), {"keep": 1})
        self.assertIn("401", self.state()["status"])


if __name__ == "__main__":
    unittest.main()
