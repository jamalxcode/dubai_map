"""collector/serp_stays.py: Google Hotels prices through SerpApi's free plan (SerpApi faked)."""
import json
import os
import sys
import tempfile
import unittest
from datetime import date
from unittest import mock
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "collector"))
import net  # noqa: E402
import serp_stays as ss  # noqa: E402
import store  # noqa: E402

OURS = [["Palm Hotel", "", "hotel", 5, 25.11200, 55.13800], ["Creek Inn", "", "hotel", 3, 25.25000, 55.33000]]


def prop(name, lat, lng, price, rental=False, token=None):
    return {"type": "vacation rental" if rental else "hotel", "name": name, "gps_coordinates": {"latitude": lat, "longitude": lng},
            "rate_per_night": {"extracted_lowest": price + 40, "extracted_before_taxes_fees": price}, "overall_rating": 4.4, "reviews": 120,
            "hotel_class": 4, "link": "https://example.com/" + name, "property_token": token or name}


HOTEL_PAGE = {"properties": [prop("The Palm Hotel Dubai", 25.1122, 55.1381, 900), prop("Creek Inn", 25.2502, 55.3301, 300),
                             prop("Sea Rental", 25.08, 55.14, 700, rental=True), prop("Abu Dhabi Hotel", 24.45, 54.37, 500)]}
HOME_PAGE = {"properties": [prop("Marina Loft", 25.0801, 55.1401, 650, rental=True), prop("Known Residence", 25.20, 55.27, 800, rental=True)]}


def fake(calls=None, error=None, status=None):
    def get(url, **kw):
        if calls is not None:
            calls.append(parse_qs(urlparse(url).query))
        if status == 401:
            raise net.AuthError("bad key")
        if error:
            return {"error": error}
        return HOME_PAGE if "vacation_rentals=true" in url else HOTEL_PAGE
    return get


class SerpStays(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        for name, obj in (("hotels.json", {"hotels": OURS}),
                          ("hotel_prices.json", {"hotels": [["Creek Inn", 25.25, 55.33, 333, 2, 300, 366, "2026-11-19"]]}),
                          ("holiday_homes.json", {"places": {"x9": ["Known Residence", 25.2001, 55.2701, 4.5, 50, ""]}})):
            json.dump(obj, open(os.path.join(self.d, name), "w"))
        self.out = os.path.join(self.d, "serp_stays.json")
        for p in (mock.patch.object(store, "DATA", self.d), mock.patch.object(ss, "HOTELS", os.path.join(self.d, "hotels.json")),
                  mock.patch.object(ss, "HOTEL_PRICES", os.path.join(self.d, "hotel_prices.json")),
                  mock.patch.object(ss, "HOMES", os.path.join(self.d, "holiday_homes.json"))):
            p.start()
            self.addCleanup(p.stop)

    def run_it(self, get, env=None, today=date(2026, 11, 19), force=True):
        with mock.patch.dict(os.environ, env if env is not None else {"SERPAPI_KEY": "k"}, clear=False):
            if env == {}:
                os.environ.pop("SERPAPI_KEY", None)
            return ss.main(["--out", self.out] + (["--force"] if force else []), today=today, get=get)

    def state(self):
        return json.load(open(os.path.join(self.d, "state.json")))["serp_stays"]

    def test_without_a_key_nothing_is_fetched(self):
        calls = []
        with mock.patch.dict(os.environ, {}, clear=True):
            ss.main(["--out", self.out], today=date(2026, 11, 19), get=fake(calls))
        self.assertEqual(calls, [])
        self.assertEqual(self.state()["state"], "no_key")

    def test_two_searches_a_pull_in_aed_two_weeks_ahead(self):
        calls = []
        self.assertEqual(self.run_it(fake(calls)), 0)
        self.assertEqual(len(calls), 2)
        self.assertEqual({c["currency"][0] for c in calls}, {"AED"})
        self.assertEqual(calls[0]["check_in_date"][0], "2026-12-03")
        self.assertEqual(calls[1].get("vacation_rentals"), ["true"])
        self.assertEqual(self.state()["used"], 2)

    def test_hotels_only_where_xotelo_has_no_price_and_rentals_not_twice(self):
        self.run_it(fake())
        out = json.load(open(self.out))
        self.assertEqual([r[:4] for r in out["hotels"]], [["Palm Hotel", 25.112, 55.138, 900]])  # Creek Inn is Xotelo's; Abu Dhabi dropped
        self.assertEqual([r[0] for r in out["homes"]], ["Marina Loft"])  # "Known Residence" is Xotelo's holiday home
        self.assertTrue(all(r[3] in (900, 650) for r in out["hotels"] + out["homes"]))  # before taxes, as Xotelo

    def test_monthly_cap_and_rotation(self):
        calls = []
        with mock.patch.object(ss, "MONTHLY", 4):
            self.run_it(fake(calls))
            self.run_it(fake(calls))
            self.run_it(fake(calls))  # 4 used: no more this month
        self.assertEqual(len(calls), 4)
        self.assertEqual([c["q"][0] for c in calls[::2]], ss.AREAS[:2])
        self.assertEqual(self.state()["state"], "standby")
        with mock.patch.object(ss, "MONTHLY", 4):
            self.run_it(fake(calls), today=date(2026, 12, 1))  # a new month starts again
        self.assertEqual(len(calls), 6)

    def test_six_hours_between_pulls(self):
        calls = []
        self.run_it(fake(calls), force=False)
        self.run_it(fake(calls), force=False)
        self.assertEqual(len(calls), 2)

    def test_a_rejected_key_keeps_the_file(self):
        self.run_it(fake())
        before = open(self.out).read()
        self.run_it(fake(status=401))
        self.assertEqual(open(self.out).read(), before)
        self.assertEqual(self.state()["state"], "failed")
        self.assertIn("SERPAPI_KEY", self.state()["status"])


if __name__ == "__main__":
    unittest.main()
