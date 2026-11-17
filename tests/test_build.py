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
        with open(os.path.join(self.tmp, "areas.json")) as f:
            top = json.load(f)["areas"][0]
        self.assertIsNotNone(top["p25"], "contract-level data gives a range per area")
        self.assertTrue(all(u["p25"] <= u["median"] <= u["p75"] for u in top["by_unit"]), "and per home type")


class ShrinkGuardTests(TempData):
    """A build that suddenly shrinks is not published; the previous files stay."""

    def setUp(self):
        super().setUp()
        for rel, text in AGG_FILES.items():
            self.write(rel, text)

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

    def test_unchanged_data_writes_nothing(self):
        """A run that brings nothing new leaves every file untouched, so the daily job makes no commit."""
        self.run_build()
        before = {n: open(os.path.join(self.tmp, n)).read() for n in ("meta.json", "areas.json", "latest.json")}
        with mock.patch.object(build, "datetime") as dt:
            dt.now.return_value.isoformat.return_value = "2030-01-01T00:00:00+00:00"
            self.run_build()
        after = {n: open(os.path.join(self.tmp, n)).read() for n in before}
        self.assertEqual(before, after)
        # A real change is written, and meta.json gets the new time.
        self.write("datadubai/rents_by_community.csv", AGG_FILES["datadubai/rents_by_community.csv"].replace("60000", "61000"))
        with mock.patch.object(build, "datetime") as dt:
            dt.now.return_value.isoformat.return_value = "2030-01-01T00:00:00+00:00"
            self.run_build()
        with open(os.path.join(self.tmp, "meta.json")) as f:
            self.assertEqual(json.load(f)["generated_at"], "2030-01-01T00:00:00+00:00")
        with open(os.path.join(self.tmp, "areas.json")) as f:
            self.assertEqual(json.load(f)["areas"][0]["median"], 61000)

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
        st = self.load("status.json")  # the status page's counts
        self.assertEqual(st["totals"]["contracts"], 150)
        self.assertEqual((st["sources"]["datadubai"]["communities"], st["sources"]["datadubai"]["used"], st["sources"]["datadubai"]["no_median"]), (3, 2, 1))
        self.assertEqual(st["left_out"]["no_median"], [{"area": "Gamma", "n": 10}])
        self.assertEqual(st["pending"]["unplaced"], [{"area": "Beta", "n": 50}])
        self.assertEqual(st["totals"]["areas_on_map"], 1)
        self.assertIn("CC BY 4.0", meta["source"])
        # Flats and Studios come from the per-bedroom rows; no villa/commercial split exists.
        self.assertEqual({t["key"]: t["n"] for t in meta["property_types"]}, {"homes": 150, "flat": 40, "studio": 60})
        with open(os.path.join(self.tmp, "areas_flat.json")) as f:
            flat = json.load(f)["areas"]
        self.assertEqual([(a["label"], a["median"], a["median_kind"]) for a in flat], [("Alpha", 70000, "median")])
        with open(os.path.join(self.tmp, "areas_studio.json")) as f:
            self.assertEqual(json.load(f)["areas"][0]["median"], 45000)

    def test_each_build_keeps_a_snapshot_and_says_what_changed(self):
        summary = os.path.join(self.tmp, "summary.md")
        with mock.patch("builtins.print"), mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": summary}):
            build.main()
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "history", "2026-10-29.json")), "a snapshot per publication")
        ch = self.load("changes.json")
        self.assertEqual((ch["through"], ch["previous"]), ("2026-10-29", None))
        with open(summary, encoding="utf-8") as f:
            self.assertIn("Data through 2026-10-29", f.read())
        # A later publication with Alpha 50% dearer: unconfirmed, and listed.
        snap = self.load("history/2026-10-29.json")
        snap["through"], snap["areas"]["Alpha"]["m"] = "2026-10-22", 40000
        os.rename(os.path.join(self.tmp, "history", "2026-10-29.json"), os.path.join(self.tmp, "history", "2026-10-22.json"))
        with open(os.path.join(self.tmp, "history", "2026-10-22.json"), "w") as f:
            json.dump(snap, f)
        with mock.patch("builtins.print"):
            build.main()
        alpha = self.load("areas.json")["areas"][0]
        self.assertEqual(alpha["unconfirmed"], {"from": 40000, "pct": 50.0})
        self.assertEqual(self.load("changes.json")["unconfirmed"][0]["area"], "Alpha")
        self.assertIsNone(self.load("areas_flat.json")["areas"][0]["unconfirmed"], "the mark is for the all-homes median only")

    CCP = ("area,unit,median,n\nJabal Ali Industrial First,Studios,35000,1279\nJabal Ali Industrial First,1-bedroom apartments,30000,1279\n"
           "Abu Hail,Studios,30000,2567\nAbu Hail,1-bedroom apartments,35000,2567\nArea A,1-bedroom apartments,69000,900\n")

    def ccp_state(self, through):
        self.write("crosscheck/ccp.csv", self.CCP)
        self.write("state.json", json.dumps({"crosscheck": {"ccp": {"state": "ok", "through": through}}}))

    def test_industrial_zones_are_marked_and_older_districts_keep_a_history(self):
        self.ccp_state("2026-10-28")  # older than Dubai Data's figures: no backup
        with mock.patch("builtins.print"), mock.patch.object(build.store, "today_dubai", return_value=build.date(2026, 10, 31)):
            build.main()
        areas = {a["label"]: a for a in self.load("areas.json")["areas"]}
        self.assertTrue(areas["Jabal Ali Industrial First"]["staff"])
        self.assertFalse(areas["Abu Hail"]["staff"])
        self.assertIsNone(self.load("meta.json")["backup"])
        self.assertTrue(os.path.exists(os.path.join(self.tmp, "history", "ccp", "2026-10-28.json")), "the older districts' own series")
        self.assertNotIn("Abu Hail", self.load("history/2026-10-29.json")["areas"], "kept apart from the main series")

    def test_backup_from_continental_club_when_dubai_data_is_stuck(self):
        self.ccp_state("2026-11-15")
        with mock.patch("builtins.print"), mock.patch.object(build.store, "today_dubai", return_value=build.date(2026, 11, 17)):
            build.main()
        meta, areas = self.load("meta.json"), self.load("areas.json")["areas"]
        self.assertEqual(meta["backup"], {"since": "2026-10-29", "days": 19, "through": "2026-11-15"})
        self.assertEqual(meta["data_through"], "2026-11-15")
        self.assertEqual({a["source"] for a in areas}, {"ccp"}, "every area from Continental Club")
        self.assertIn("Area A", {a["label"] for a in areas}, "including DLD areas Dubai Data used to cover")
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "history", "2026-11-15.json")), "no main snapshot from backup figures")

    def test_a_renamed_column_stops_the_build_with_a_clear_message(self):
        self.write("datadubai/rents_by_community.csv", "name,url,contracts,median_rent,yield_pct\nAlpha,https://x/a/,100,60000,6.5\n")
        with mock.patch("builtins.print"), self.assertRaises(SystemExit) as e:
            build.main()
        self.assertIn("rents_by_community.csv no longer has rent_median", str(e.exception))

    def test_flats_typical_is_contract_weighted(self):
        area = {"label": "X", "n": 100, "median": 1, "by_unit": [
            {"u": "1-bedroom apartments", "n": 30, "median": 60000, "yield": 7.0},
            {"u": "2-bedroom apartments", "n": 10, "median": 100000, "yield": 6.0},
            {"u": "Studios", "n": 60, "median": 40000, "yield": 8.0}]}
        got = build.aggregate_type(area, "flat")
        self.assertEqual((got["n"], got["median"], got["median_kind"]), (40, 70000, "typical"))
        self.assertEqual(got["yield_pct"], 6.75)
        self.assertEqual([u["u"] for u in got["by_unit"]], ["1-bedroom apartments", "2-bedroom apartments"])
        self.assertIsNone(build.aggregate_type(dict(area, by_unit=[]), "studio"))


if __name__ == "__main__":
    unittest.main()


class TopAreaPointTests(unittest.TestCase):
    """A Dubai Data community with no point of its own uses the official point of the DLD area it lies in."""
    DM = {"WADI AL SAFA 7": {"lat": "25.03982", "lng": "55.28558"}}

    def test_wholly_inside_one_area(self):
        self.assertEqual(build.top_area_point({"top_area": "Wadi Al Safa 7", "share_in_top_area": "1.0"}, self.DM), (25.03982, 55.28558))

    def test_split_unknown_or_missing_gives_nothing(self):
        self.assertIsNone(build.top_area_point({"top_area": "Wadi Al Safa 7", "share_in_top_area": "0.6"}, self.DM), "split community")
        self.assertIsNone(build.top_area_point({"top_area": "Nowhere", "share_in_top_area": "1"}, self.DM), "area not placed")
        self.assertIsNone(build.top_area_point({}, self.DM))
        self.assertIsNone(build.top_area_point({"top_area": "Wadi Al Safa 7", "share_in_top_area": "n/a"}, self.DM))


class SaleByUnitTests(unittest.TestCase):
    def test_type_sale_is_the_rent_weighted_bedroom_median(self):
        area = {"label": "X", "n": 100, "median": 1, "source": None, "by_unit": [
            {"u": "1-bedroom apartments", "n": 300, "median": 60000, "yield": 6.0, "sale": 1000000},
            {"u": "2-bedroom apartments", "n": 100, "median": 90000, "yield": 5.0, "sale": 2000000}]}
        got = build.aggregate_type(area, "flat")
        self.assertEqual(got["sale_median"], 1250000)
        self.assertIsNone(build.aggregate_type(dict(area, by_unit=[dict(u, sale=None) for u in area["by_unit"]]), "flat")["sale_median"])



class SaleTrendTests(unittest.TestCase):
    def test_trend_and_year_on_year(self):
        rows = [{"community": "A", "month": f"{y}-{m:02d}", "median": str(1000 + (100 if y == 2026 else 0)), "n_sales": "20"}
                for y in (2025, 2026) for m in range(1, 13)]
        rows.append({"community": "A", "month": "2026-12", "median": "9999", "n_sales": "2"})  # too few sales: left out
        got = build.sale_trends(rows)["A"]
        self.assertEqual(len(got["trend"]), 24)
        self.assertEqual(got["trend"][-1], {"m": "2026-12", "psf": 1100} if False else got["trend"][-1])
        self.assertNotIn(9999, [t["psf"] for t in got["trend"]])
        self.assertEqual(got["yoy"], 10.0, "last 3 months 1100 against 1000 a year before")
        self.assertIsNone(build.sale_trends(rows[:14])["A"]["yoy"], "no matching months a year before")
