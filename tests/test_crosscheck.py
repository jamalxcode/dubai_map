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
     "by_unit": [{"u": "1-bedroom apartments", "n": 9000, "median": 110000},
                 {"u": "4-bedroom apartments", "n": 3000, "median": 400000}]},
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
        self.assertEqual(dred["largest_gaps"][0]["ours"], 110000, "compared on studios to 2 beds, not 4-bed villas")
        self.assertEqual(dred["largest_gaps"][0]["unit"], "studios to 2 beds")
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


class OlderDistrictTests(TempData):
    """Continental Club fills in DLD areas Dubai Data doesn't publish, and only those."""

    def setUp(self):
        super().setUp()
        self.write("crosscheck/ccp.csv", "area,unit,median,n\n"
                   "Al Barsha South Fourth,1-bedroom apartments,70000,29316\n"   # covered by JVC: skipped
                   "Al Karama,Studios,44000,12391\nAl Karama,1-bedroom apartments,57330,12391\n"
                   "Al Karama,2-bedroom apartments,70999,12391\n"
                   "Al Ttay,2-bedroom apartments,45000,744\n"                  # no 1-bed or studio
                   "Nowhere Land,1-bedroom apartments,40000,50\n")             # no map point
        import ccp_areas
        self.ccp = ccp_areas

    def test_adds_uncovered_areas_with_honest_figures(self):
        dm = {"AL KARAMA": {"lat": "25.245", "lng": "55.305"}, "AL TTAY": {"lat": "25.2", "lng": "55.6"}}
        areas, unplaced, table = self.ccp.older_districts(AREAS, dm, "2026-11-14")
        by = {a["label"]: a for a in areas}
        self.assertEqual(set(by), {"Al Karama", "Al Ttay", "Nowhere Land"}, "Al Barsha South Fourth is already JVC")
        k = by["Al Karama"]
        self.assertEqual((k["median"], k["median_kind"], k["median_unit"]), (57330, "unit", "1-bedroom apartments"))
        self.assertEqual([u["u"] for u in k["by_unit"]], ["1-bedroom apartments", "Studios", "2-bedroom apartments"])
        self.assertTrue(all(u["n"] is None for u in k["by_unit"]), "no count per home type is invented")
        self.assertEqual((k["n"], k["lat"], k["source"], k["through"]), (12391, 25.245, "ccp", "2026-11-14"))
        self.assertEqual(by["Al Ttay"]["median_unit"], "2-bedroom apartments", "falls back to the next size")
        self.assertEqual(unplaced, [{"area": "Nowhere Land", "n": 50}])
        self.assertEqual(len(table), 5)

    def test_never_compared_with_itself(self):
        areas, _, _ = self.ccp.older_districts(AREAS, {"AL KARAMA": {"lat": "25.2", "lng": "55.3"}})
        out = crosscheck.compare(AREAS + areas, state={})
        ccp = [e for e in out if e["name"].startswith("Continental")][0]
        self.assertNotIn("Al Karama", [g["area"] for g in ccp.get("largest_gaps", [])])

    def test_no_file_no_extra_areas(self):
        os.remove(os.path.join(self.tmp, "crosscheck", "ccp.csv"))
        self.assertEqual(self.ccp.older_districts(AREAS, {}), ([], [], []))
