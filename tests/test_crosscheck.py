"""Cross-check sources: parsing their rent pages and comparing with our medians."""
import os
import unittest
from unittest import mock

from helpers import TempData

import build  # noqa: E402
import crosscheck  # noqa: E402
import fetch_crosscheck as fc  # noqa: E402

# Shapes copied from the live pages on 16 Nov 2026 (trimmed).
DRED = """# Dubai rents — registered Ejari contracts — Dubai Real Estate Data

## Median new-contract apartment rent by area (top 30 by contract count, 12M)

| # | Area | New contracts 12M | Median annual rent |
|---|---|---|---|
| 1 | [Jumeirah Village Circle](https://www.dubairealestatedata.com/areas/jumeirah-village-circle) | 20,610 | AED 66,000 |
| 2 | [Business Bay](https://www.dubairealestatedata.com/areas/business-bay) | 13,727 | AED 88,000 |
| 3 | [Somewhere New](https://x/y) | 100 | AED 50,000 |

- Data through: 16 Nov 2026 · registered transactions only · updated weekly
"""
CCP = """# Dubai rents by area — registered Ejari contracts

> Data through 2026-11-14. Sample: 547,561 contracts in 104 areas.

| Area | Studio | 1 bedroom | 2 bedrooms | 3 bedrooms | Contracts |
|---|---:|---:|---:|---:|---:|
| Al Barsha South Fourth | AED 47,000 | AED 70,000 | AED 95,000 | AED 150,000 | 29,316 |
| Al Ttay | — | AED 35,000 | AED 45,000 | — | 744 |
| Business Bay | AED 60,000 | AED 80,000 | — | — | 15,000 |
"""
AREAS = [
    {"label": "Jumeirah Village Circle", "median": 66000, "dld_areas": ["Al Barsha South Fourth"],
     "by_unit": [{"u": "Studios", "n": 7735, "median": 48000}, {"u": "1-bedroom apartments", "n": 15726, "median": 70000}]},
    {"label": "Business Bay", "median": 110000, "dld_areas": ["Business Bay"],
     "by_unit": [{"u": "1-bedroom apartments", "n": 9000, "median": 95000}]},
    {"label": "Bay Square", "median": 90000, "dld_areas": ["Business Bay"], "by_unit": []},
]


class ParseTests(unittest.TestCase):
    def test_dred(self):
        rows = fc.parse_dred(DRED)
        self.assertEqual(rows[0], {"area": "Jumeirah Village Circle", "unit": "apartments (new contracts)", "median": 66000, "n": 20610})
        self.assertEqual(len(rows), 3)
        self.assertEqual(fc.through_date(DRED), "2026-11-16")

    def test_ccp(self):
        rows = fc.parse_ccp(CCP)
        self.assertIn({"area": "Al Barsha South Fourth", "unit": "1-bedroom apartments", "median": 70000, "n": 29316}, rows)
        self.assertNotIn("Studios", {r["unit"] for r in rows if r["area"] == "Al Ttay"}, "a dash is no figure")
        self.assertEqual(fc.through_date(CCP), "2026-11-14")

    def test_a_changed_page_is_rejected_and_the_old_file_kept(self):
        with self.assertRaises(ValueError):
            with mock.patch.object(fc.net, "request", return_value=b"# moved\nno table here"):
                fc.fetch_one("dred", {})


class CompareTests(TempData):
    def setUp(self):
        super().setUp()
        for key, md in (("dred", DRED), ("ccp", CCP)):
            with mock.patch.object(fc.net, "request", return_value=md.encode()), \
                 mock.patch.dict(fc.SOURCES[key], {"min_rows": 1}):
                fc.fetch_one(key, {})

    def test_matches_and_flags_gaps(self):
        out = {e["name"].split(" (")[0]: e for e in crosscheck.compare(AREAS, state={})}
        dred, ccp = out["Dubai Real Estate Data"], out["Continental Club Property"]
        self.assertEqual((dred["matched"], dred["agree"]), (2, 1), "JVC agrees; Business Bay is 25% above")
        self.assertEqual(dred["largest_gaps"][0]["area"], "Business Bay")
        self.assertTrue(dred["status"].startswith("ok: 1 of 2"))
        # ccp: Al Barsha South Fourth -> JVC (1 bed and studio); "Business Bay" DLD area is split between
        # two of our areas, so it is not compared; Al Ttay is not one of ours.
        self.assertEqual(sorted((g["area"], g["unit"]) for g in ccp["largest_gaps"]),
                         [("Jumeirah Village Circle", "1-bedroom apartments"), ("Jumeirah Village Circle", "Studios")])
        self.assertEqual(ccp["agree"], 2, "1 bed matches exactly; studios 48k vs 47k is within 15% too")

    def test_missing_files_report_the_source_state(self):
        os.remove(os.path.join(self.tmp, "crosscheck", "dred.csv"))
        e = crosscheck.compare(AREAS, state={"crosscheck": {"dred": {"state": "failed", "status": "stopped: HTTP 503"}}})[0]
        self.assertEqual((e["state"], e["status"]), ("failed", "stopped: HTTP 503"))

    def test_once_a_day(self):
        calls = []
        with mock.patch.object(fc, "fetch_one", lambda k, b: calls.append(k) or 30), mock.patch("builtins.print"):
            fc.main()
            fc.main()
        self.assertEqual(calls, ["dred", "ccp"], "the second run the same day reads nothing")


class PublicStateTests(unittest.TestCase):
    def test_run_timestamps_stay_out_of_meta(self):
        s = {"pulse": {"state": "ok", "last_try_at": "x", "last_ok_at": "y", "refresh_date": "2026-11-16"},
             "crosscheck": {"dred": {"last_try_at": "z", "through": "2026-11-16"}}}
        self.assertEqual(build.public_state(s), {"pulse": {"state": "ok", "refresh_date": "2026-11-16"},
                                                 "crosscheck": {"dred": {"through": "2026-11-16"}}})


if __name__ == "__main__":
    unittest.main()
