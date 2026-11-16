"""Placing DLD areas: official community points, reviewed spellings, and the OpenStreetMap fallback."""
import csv
import json
import os
import unittest
from unittest import mock

from helpers import TempData, ROOT

import build  # noqa: E402
import dm_communities  # noqa: E402
import geocode_missing  # noqa: E402
import places  # noqa: E402

SQUARE = {"type": "FeatureCollection", "features": [
    {"properties": {"CNAME_E": "AL  MURAQQABAT", "COMM_NUM": 128},
     "geometry": {"type": "Polygon", "coordinates": [[[55.32, 25.26], [55.33, 25.26], [55.33, 25.27], [55.32, 25.27], [55.32, 25.26]]]}},
    # An L shape whose centroid falls outside it: the point must still land inside.
    {"properties": {"CNAME_E": "L SHAPE", "COMM_NUM": 999},
     "geometry": {"type": "Polygon", "coordinates": [[[55.0, 25.0], [55.1, 25.0], [55.1, 25.01], [55.01, 25.01],
                                                       [55.01, 25.1], [55.0, 25.1], [55.0, 25.0]]]}},
    {"properties": {"CNAME_E": "NOWHERE", "COMM_NUM": 1},
     "geometry": {"type": "Polygon", "coordinates": [[[10, 10], [10.1, 10], [10.1, 10.1], [10, 10]]]}},
]}


class OfficialPointTests(unittest.TestCase):
    def test_points_land_inside_and_outside_dubai_is_dropped(self):
        rows = dm_communities.build([("t", "geojson", json.dumps(SQUARE))])
        self.assertEqual(set(rows), {"AL MURAQQABAT", "L SHAPE"})
        m = rows["AL MURAQQABAT"]
        self.assertEqual((m["lat"], m["lng"]), ("25.26500", "55.32500"))
        ring = dm_communities.outer_rings(SQUARE["features"][1]["geometry"])[0]
        lpt = rows["L SHAPE"]
        self.assertTrue(dm_communities.inside((float(lpt["lng"]), float(lpt["lat"])), ring))

    def test_first_source_wins_later_ones_fill_gaps(self):
        other = {"type": "FeatureCollection", "features": [dict(SQUARE["features"][0]), {
            "properties": {"CNAME_E": "EXTRA", "COMM_NUM": 5},
            "geometry": {"type": "Polygon", "coordinates": [[[55.2, 25.2], [55.21, 25.2], [55.21, 25.21], [55.2, 25.2]]]}}]}
        rows = dm_communities.build([("a", "geojson", json.dumps(SQUARE)), ("b", "geojson", json.dumps(other))])
        self.assertEqual(rows["AL MURAQQABAT"]["source"], "a")
        self.assertEqual(rows["EXTRA"]["source"], "b")

    def test_kml_reader(self):
        kml = ('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><ExtendedData><SchemaData>'
               '<SimpleData name="CNAME_E">MANKHOOL</SimpleData><SimpleData name="COMM_NUM">318</SimpleData>'
               '</SchemaData></ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>'
               '55.29,25.24 55.30,25.24 55.30,25.25 55.29,25.25 55.29,25.24</coordinates></LinearRing>'
               '</outerBoundaryIs></Polygon></Placemark></Document></kml>')
        rows = dm_communities.build([("k", "kml", kml)])
        self.assertEqual(rows["MANKHOOL"]["comm_num"], 318)


class BuildPlacementTests(TempData):
    def test_dld_spellings_reach_official_points(self):
        self.write("dm_communities.csv", "community,comm_num,lat,lng,area_km2,source\n"
                   "AL MURAQQABAT,128,25.265,55.325,1,x\nAL WARQA'A FIRST,421,25.18,55.40,2,x\n"
                   "AL QOUZ IND.SECOND,368,25.13,55.24,3,x\n")
        self.write("dld_dm_aliases.csv", "dld_area,dm_community,note\nal murqabat,AL MURAQQABAT,spelling\n"
                   "al warqa first,AL WARQA'A FIRST,spelling\nal goze industrial second,AL QOUZ IND.SECOND,s\n")
        dm = build.load_dm_points()
        rec = {"area": "Al Murqabat", "master_project": "", "project": ""}
        self.assertEqual(build.locate(rec, {}, [], dm)["label"], "Al Murqabat")
        self.assertEqual(build.locate(dict(rec, area="Al Warqa First"), {}, [], dm)["lat"], "25.18")
        self.assertEqual(build.locate(dict(rec, area="Al Goze Industrial Second"), {}, [], dm)["lng"], "55.24")
        self.assertEqual(build.locate(dict(rec, area="AL QOUZ IND.SECOND"), {}, [], dm)["label"], "Al Qouz Ind.Second")
        self.assertIsNone(build.locate(dict(rec, area="Unknown Place"), {}, [], dm))
        # Hand-checked rows still win over the official point.
        exact = {"al murqabat": {"label": "Deira (checked)", "lat": "1", "lng": "2"}}
        self.assertEqual(build.locate(rec, exact, [], dm)["label"], "Deira (checked)")

    def test_repo_aliases_cover_the_busy_dld_spellings(self):
        with open(os.path.join(ROOT, "data", "dld_dm_aliases.csv"), encoding="utf-8") as f:
            names = {r["dld_area"] for r in csv.DictReader(f)}
        for busy in ("al murqabat", "al warsan first", "al khairan first", "palm jumeirah", "al qusais"):
            self.assertIn(busy, names)


class OsmFallbackTests(TempData):
    def setUp(self):
        super().setUp()
        self.write("meta.json", json.dumps({"unmatched_areas": [
            {"area": "AL TWAR FIFTH", "n": 2000}, {"area": "Fake Mall", "n": 50}, {"area": "Far Away", "n": 5}]}))

    def fake(self, q):
        if q.startswith("AL TWAR FIFTH"):
            return [{"name": "Al Twar 5", "type": "suburb", "lat": "25.27", "lon": "55.39"}]
        if q.startswith("Fake Mall"):
            return [{"name": "Fake Mall", "type": "mall", "lat": "25.2", "lon": "55.3"}]  # a shop, not a place
        return [{"name": "Far Away", "type": "suburb", "lat": "24.4", "lon": "54.4"}]  # Abu Dhabi

    def test_only_checked_places_are_accepted_and_cached(self):
        with mock.patch("builtins.print"):
            self.assertEqual(geocode_missing.main(search=self.fake, sleep=lambda s: None, today="2026-11-15"), 1)
        with open(geocode_missing.out_path()) as f:
            got = list(csv.DictReader(f))
        placed = [r["dld_area"] for r in got if r["lat"]]
        self.assertEqual(placed, ["AL TWAR FIFTH"])
        self.assertEqual(sorted(r["dld_area"] for r in got if not r["lat"]), ["Fake Mall", "Far Away"],
                         "a look-up with no believable result is recorded too")
        calls = []
        with mock.patch("builtins.print"):
            geocode_missing.main(search=lambda q: calls.append(q) or [], sleep=lambda s: None, today="2026-11-16")
        self.assertEqual(calls, [], "placed areas are never looked up again, failed ones not for a week")
        with mock.patch("builtins.print"):
            geocode_missing.main(search=lambda q: calls.append(q) or [], sleep=lambda s: None, today="2026-11-22")
        self.assertEqual(sorted(calls), ["Fake Mall, Dubai", "Far Away, Dubai"], "retried after a week")
        dm = places.load_dm_points()
        self.assertIn("AL TWAR FIFTH", dm)
        self.assertNotIn("FAKE MALL", dm, "a failed look-up is not a map point")

    def test_name_check(self):
        self.assertTrue(geocode_missing.accept("Al Waha Villas", {"name": "Al Waha", "type": "residential",
                                                                   "lat": "25.0", "lon": "55.3"}))
        self.assertTrue(geocode_missing.accept("Al Twar Fifth", {"name": "Al Twar Fifth", "type": "suburb",
                                                                  "lat": "25.27", "lon": "55.39"}))
        self.assertFalse(geocode_missing.accept("Al Twar Fifth", {"name": "Mirdif", "type": "suburb",
                                                                   "lat": "25.22", "lon": "55.42"}))


if __name__ == "__main__":
    unittest.main()
