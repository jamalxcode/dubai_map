"""collector/transit.py: Overpass routes and stations become lines and stations; bad results are refused."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "collector"))
import transit  # noqa: E402


def way(ref, pts, role=""):
    return {"type": "way", "ref": ref, "role": role, "geometry": [{"lat": a, "lon": b} for a, b in pts]}


RAW = {"elements": [
    {"type": "relation", "id": 1, "tags": {"route": "subway", "name": "Red1 Line: Centrepoint → Expo City Dubai", "colour": "#CC0000"},
     "members": [way(10, [(25.20, 55.27), (25.21, 55.28), (25.22, 55.29)]), {"type": "node", "ref": 5, "role": "stop", "lat": 25.21, "lon": 55.28}]},
    {"type": "relation", "id": 2, "tags": {"route": "subway", "name": "Red2 Line: UAE Exchange → Centrepoint", "colour": "#CC0000"},
     "members": [way(10, [(25.20, 55.27), (25.21, 55.28), (25.22, 55.29)]), way(11, [(25.22, 55.29), (25.23, 55.30)])]},
    {"type": "relation", "id": 3, "tags": {"route": "tram", "name": "Dubai Tram", "name:ar": "ترام دبي"},
     "members": [way(20, [(25.08, 55.14), (25.09, 55.15)])]},
    {"type": "relation", "id": 4, "tags": {"route": "tram", "name": "Dubai Trolley (Westward)"}, "members": [way(30, [(25.19, 55.27), (25.20, 55.28)])]},
    {"type": "node", "id": 5, "lat": 25.21, "lon": 55.28, "tags": {"railway": "station", "station": "subway", "name": "BurJuman", "name:ar": "برجمان"}},
    {"type": "node", "id": 6, "lat": 25.2101, "lon": 55.2801, "tags": {"public_transport": "station", "subway": "yes", "name": "Bur Juman"}},
    {"type": "node", "id": 7, "lat": 25.085, "lon": 55.145, "tags": {"railway": "tram_stop", "name": "Dubai Marina"}},
    {"type": "node", "id": 8, "lat": 25.25, "lon": 55.35, "tags": {"railway": "station", "station": "subway", "name": "Blue Line Future"}},
    {"type": "node", "id": 9, "lat": 25.10, "lon": 55.20, "tags": {"public_transport": "station", "bus": "yes", "name": "Bus Station"}},
]}


class TransitTests(unittest.TestCase):
    def test_lines_merge_directions_and_services_and_skip_the_trolley(self):
        out = transit.build(RAW, today="2026-11-18")
        self.assertEqual([(l["id"], l["kind"]) for l in out["lines"]], [("red-line", "metro"), ("dubai-tram", "tram")])
        red = out["lines"][0]
        self.assertEqual(len(red["paths"]), 2)  # way 10 once, way 11 once
        self.assertEqual(out["lines"][1]["name_ar"], "ترام دبي")

    def test_stations_one_per_name_on_a_running_line_only(self):
        out = transit.build(RAW, today="2026-11-18")
        names = [(s["name"], s["kind"], s["lines"]) for s in out["stations"]]
        self.assertIn(("BurJuman", "metro", ["red-line"]), names)
        self.assertIn(("Dubai Marina", "tram", ["dubai-tram"]), names)
        self.assertEqual(sum(1 for n in names if n[0].replace(" ", "") == "BurJuman"), 1)
        self.assertFalse(any(n[0] in ("Blue Line Future", "Bus Station") for n in names))

    def test_a_thin_result_is_refused(self):
        bad = transit.check(transit.build(RAW))
        self.assertTrue(any("metro stations" in b for b in bad))

    def test_simplify_keeps_ends_and_drops_straight_points(self):
        pts = [(25.0, 55.0), (25.0005, 55.0005), (25.001, 55.001)]
        self.assertEqual(transit.simplify(pts), [pts[0], pts[-1]])


if __name__ == "__main__":
    unittest.main()
