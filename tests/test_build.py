"""Building the JSON the map loads: location matching, stats and the Dubai Data fallback."""
import json
import os
import unittest
from unittest import mock

from helpers import TempData

import build  # noqa: E402
import fetch_datadubai  # noqa: E402


class HelperTests(unittest.TestCase):
    def test_property_kinds(self):
        k = lambda **r: build.kind({"usage": "Residential", "sub_type": "", "rooms": "", **r})  # noqa: E731
        self.assertEqual(k(sub_type="Flat"), "flat")
        self.assertEqual(k(sub_type="Studio"), "studio")
        self.assertEqual(k(sub_type="Flat", rooms="Studio"), "studio")
        self.assertEqual(k(sub_type="Complex Villas"), "villa")
        self.assertEqual(k(sub_type="Labor Camps"), "other")
        self.assertEqual(k(sub_type="Building"), "other")
        self.assertEqual(k(sub_type="Shop"), "commercial")
        self.assertEqual(k(usage="Commercial", sub_type="Flat"), "commercial")
        self.assertEqual(k(sub_type="", prop_type="Land", annual="352000"), "other")
        # Missing fields are not evidence of a home.
        self.assertEqual(k(usage="", sub_type=""), "other", "no usage, no sub type")
        self.assertEqual(k(sub_type=""), "other", "residential but no sub type")
        self.assertEqual(k(sub_type="", rooms="Studio"), "studio", "rooms say studio")
        self.assertEqual(k(usage="", sub_type="Flat"), "flat", "usage missing, sub type says flat")
        self.assertEqual(k(usage="", sub_type="Villa"), "villa")
        self.assertEqual(k(usage="", sub_type="Shop"), "commercial")
        self.assertEqual(k(sub_type="Flat", annual="3084480", size_sqm="18"), "other", "bulk lease on a tiny unit")
        self.assertEqual(k(sub_type="Flat", annual="300000", size_sqm="110"), "flat", "luxury, but believable")
        self.assertTrue(build.in_type("villa", "homes") and not build.in_type("commercial", "homes"))
        self.assertTrue(build.in_type("other", "all"))

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
        self.assertEqual(meta["sources"][0]["history"], {"contracts": 1200, "weeks": 1})

    def test_one_old_record_does_not_count_as_a_full_year(self):
        """The span from the oldest record is not coverage: an old import plus three weeks stays on Dubai Data."""
        from datetime import date
        self.add(1, "2025-11-20", "2025-11-20")
        for day in ("2026-10-26", "2026-11-02", "2026-11-09"):
            self.add(400, day, day)
        meta = self.build(date(2026, 11, 15))
        self.assertEqual(meta["mode"], "aggregate")
        self.assertEqual(meta["sources"][0]["history"], {"contracts": 1201, "weeks": 4})

    def add_weeks(self, weeks, per_week, first="2026-01-05"):
        from datetime import date, timedelta
        for w in range(weeks):
            d = (date.fromisoformat(first) + timedelta(weeks=w)).isoformat()
            self.add(per_week, d, d)

    def test_full_year_switches_to_own_contracts_homes_only(self):
        from datetime import date
        self.add_weeks(44, 30)  # 1,320 home contracts spread over 44 weeks
        self.add(50, "2026-02-01", "2026-02-01", sub="Labor Camps", rent=2000000)
        self.add(50, "2026-02-01", "2026-02-01", sub="Shop", usage="Commercial")
        meta = self.build(date(2026, 11, 15))
        self.assertEqual(meta["mode"], "contracts")
        self.assertEqual(meta["contracts_last_12m"], 1320, "camps and shops are left out")
        self.assertEqual(meta["mapped_last_12m"], 1320, "Area A is placed via area_locations")
        self.assertEqual(meta["weeks_covered"], 44)
        types = {t["key"]: t["n"] for t in meta["property_types"]}
        self.assertEqual(types, {"homes": 1320, "flat": 1320, "studio": 0, "villa": 0, "commercial": 50, "all": 1420})
        with open(os.path.join(self.tmp, "areas_commercial.json")) as f:
            self.assertEqual(json.load(f)["areas"][0]["n"], 50)
        with open(os.path.join(self.tmp, "latest.json")) as f:
            kinds = {r["k"] for r in json.load(f)["rows"]}
        self.assertTrue(kinds <= {"flat", "commercial", "other"})


class ShrinkGuardTests(TempData):
    """A build that suddenly shrinks is not published; the previous files stay."""

    def setUp(self):
        super().setUp()
        for rel, text in AGG_FILES.items():
            self.write(rel, text)
        self._out = fetch_datadubai.OUT
        fetch_datadubai.OUT = os.path.join(self.tmp, "datadubai")

    def tearDown(self):
        fetch_datadubai.OUT = self._out
        super().tearDown()

    def previous(self, **over):
        meta = {"mode": "aggregate", "contracts_last_12m": 150, "mapped_last_12m": 100, "n_areas": 2, **over}
        self.write("meta.json", json.dumps(meta))
        self.write("areas.json", '{"old": true}')
        return meta

    def run_build(self, env=None):
        with mock.patch.dict(os.environ, {"ALLOW_SHRINK": "", **(env or {})}), mock.patch("builtins.print"):
            build.main()

    def test_rule(self):
        old = {"mode": "aggregate", "contracts_last_12m": 1000, "mapped_last_12m": 900, "n_areas": 100}
        self.assertIsNone(build.shrink_problem(old, dict(old, contracts_last_12m=750)), "25% drop is fine")
        self.assertIn("contracts fell", build.shrink_problem(old, dict(old, contracts_last_12m=600)))
        self.assertIn("areas fell", build.shrink_problem(old, dict(old, n_areas=60)))
        self.assertIsNone(build.shrink_problem(old, dict(old, mode="contracts", contracts_last_12m=10)),
                          "a change of source is not a shrink")
        self.assertIsNone(build.shrink_problem(None, old), "first build")
        self.assertIsNone(build.shrink_problem({"mode": "aggregate"}, old), "old meta without counts")

    def test_normal_build_publishes(self):
        self.previous()
        self.run_build()
        with open(os.path.join(self.tmp, "areas.json")) as f:
            self.assertIn("areas", json.load(f))

    def test_big_drop_is_refused_and_old_files_kept(self):
        self.previous(contracts_last_12m=1000)
        with self.assertRaises(SystemExit) as cm:
            self.run_build()
        self.assertIn("not publishing", str(cm.exception))
        with open(os.path.join(self.tmp, "areas.json")) as f:
            self.assertEqual(json.load(f), {"old": True})
        with open(os.path.join(self.tmp, "meta.json")) as f:
            self.assertEqual(json.load(f)["contracts_last_12m"], 1000)

    def test_override_publishes_a_real_drop(self):
        self.previous(contracts_last_12m=1000)
        self.run_build({"ALLOW_SHRINK": "1"})
        with open(os.path.join(self.tmp, "meta.json")) as f:
            self.assertEqual(json.load(f)["contracts_last_12m"], 150)


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
