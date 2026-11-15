"""Building the JSON the map loads: location matching, stats and the Dubai Data fallback."""
import json
import os
import unittest
from unittest import mock

from helpers import TempData

import build  # noqa: E402
import fetch_datadubai  # noqa: E402


class HelperTests(unittest.TestCase):
    def test_median_and_percentiles(self):
        self.assertEqual(build.med([1, 3, 2]), 2)
        self.assertIsNone(build.med([]))
        self.assertEqual(build.pct([10, 20, 30, 40], .25), 20)
        self.assertIsNone(build.pct([], .5))

    def test_locate_prefers_official_area_then_marketing_name(self):
        exact = {"al barsha south fourth": {"label": "JVC"}}
        fuzzy = [{"match": "damac hills 2", "label": "DAMAC Hills 2"}, {"match": "damac", "label": "DAMAC"}]
        rec = {"area": "Al Barsha South Fourth", "master_project": "", "project": ""}
        self.assertEqual(build.locate(rec, exact, fuzzy)["label"], "JVC")
        rec = {"area": "Al Yufrah 2", "master_project": "DAMAC Hills 2", "project": ""}
        self.assertEqual(build.locate(rec, exact, fuzzy)["label"], "DAMAC Hills 2", "longest match wins")
        rec = {"area": "Somewhere", "master_project": "", "project": ""}
        self.assertIsNone(build.locate(rec, exact, fuzzy))


AGG_FILES = {
    "datadubai/rents_by_community.csv":
        "name,url,contracts,rent_median,yield_pct\n"
        "Alpha,https://x/a/,100,60000.0,6.5\n"
        "Beta,https://x/b/,50,90000.0,5.0\n"
        "Gamma,https://x/c/,10,,\n",
    "datadubai/communities.csv":
        "name,top_area,price_median,psf_median\nAlpha,Area A,900000,1200\nBeta,Area B,,\n",
    "datadubai/community_bedrooms.csv":
        "community,label,n_rents,rent_median,yield_pct\nAlpha,Studios,60,45000,7.1\nAlpha,1-bedroom apartments,40,70000,6.0\n",
    "datadubai/areas.csv": "name,url\nArea A,https://x/a/\n",
    "datadubai/projects.csv": "community,lat,lng\n",
    "datadubai/README.md": "- **Data through:** 2026-10-29 (lag)\n",
    "community_locations.csv": "community,lat,lng\nAlpha,25.05,55.20\n",
    "area_locations.csv": "match,label,lat,lng,field\n",
}


class OwnContractsTests(TempData):
    """Our own contracts take over from Dubai Data only once they cover most of a year."""

    def setUp(self):
        super().setUp()
        for rel, text in AGG_FILES.items():
            self.write(rel, text)
        self.write("area_locations.csv", "match,label,lat,lng,field\narea a,Alpha,25.05,55.20,area\n")
        self._out = fetch_datadubai.OUT
        fetch_datadubai.OUT = os.path.join(self.tmp, "datadubai")

    def tearDown(self):
        fetch_datadubai.OUT = self._out
        super().tearDown()

    def add(self, n, reg, start, sub="Flat", usage="Residential", rent=50000):
        import store
        store.merge([store.normalize({"registration_date": f"{reg}T10:{i % 60:02d}:{i // 60 % 60:02d}",
                                      "contract_start_date": start, "annual_amount": rent + i,
                                      "area_name_en": "Area A", "prop_sub_type_en": sub, "property_usage_en": usage},
                                     "test") for i in range(n)])

    def build(self, today):
        import store
        with mock.patch.object(store, "today_dubai", return_value=today), mock.patch("builtins.print"):
            build.main()
        with open(os.path.join(self.tmp, "meta.json")) as f:
            return json.load(f)

    def test_short_history_stays_on_dubai_data(self):
        from datetime import date
        self.add(1200, "2026-10-01", "2026-10-01")
        meta = self.build(date(2026, 11, 15))
        self.assertEqual(meta["mode"], "aggregate")
        self.assertEqual(meta["sources"][0]["history"], {"contracts": 1200, "days": 45})

    def test_full_year_switches_to_own_contracts_homes_only(self):
        from datetime import date
        self.add(1200, "2026-01-05", "2026-01-05")
        self.add(50, "2026-02-01", "2026-02-01", sub="Labor Camps", rent=2000000)
        self.add(50, "2026-02-01", "2026-02-01", sub="Shop", usage="Commercial")
        meta = self.build(date(2026, 11, 15))
        self.assertEqual(meta["mode"], "contracts")
        self.assertEqual(meta["contracts_last_12m"], 1200, "camps and shops are left out")
        self.assertEqual(meta["mapped_last_12m"], 1200, "Area A is placed via area_locations")


class AggregateBuildTests(TempData):
    def setUp(self):
        super().setUp()
        for rel, text in AGG_FILES.items():
            self.write(rel, text)
        self._out = fetch_datadubai.OUT
        fetch_datadubai.OUT = os.path.join(self.tmp, "datadubai")

    def tearDown(self):
        fetch_datadubai.OUT = self._out
        super().tearDown()

    def load(self, name):
        with open(os.path.join(self.tmp, name), encoding="utf-8") as f:
            return json.load(f)

    def test_falls_back_to_community_medians_without_own_contracts(self):
        with mock.patch("builtins.print"):
            build.main()
        meta, areas, table = self.load("meta.json"), self.load("areas.json")["areas"], self.load("latest.json")["rows"]
        self.assertEqual(meta["mode"], "aggregate")
        self.assertEqual(meta["data_through"], "2026-10-29")
        self.assertEqual(meta["contracts_last_12m"], 150, "Gamma has no median and is skipped")
        self.assertEqual(meta["mapped_last_12m"], 100, "only Alpha has a point")
        self.assertEqual(meta["unmatched_areas"], [{"area": "Beta", "n": 50}])
        alpha = areas[0]
        self.assertEqual((alpha["label"], alpha["median"], alpha["lat"]), ("Alpha", 60000, 25.05))
        self.assertEqual([u["u"] for u in alpha["by_unit"]], ["Studios", "1-bedroom apartments"])
        self.assertEqual(alpha["dld_areas"], ["Area A"])
        self.assertEqual(len(table), 3, "Alpha by bedroom (2) + Beta all units (1)")
        self.assertIn("CC BY 4.0", meta["source"])


if __name__ == "__main__":
    unittest.main()
