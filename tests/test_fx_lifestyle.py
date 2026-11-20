"""collector/fx.py (exchange rates) and collector/lifestyle.py (what's near each area), sources faked."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "collector"))
import fx  # noqa: E402
import lifestyle  # noqa: E402
import net  # noqa: E402
import store  # noqa: E402


class Rates(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        p = mock.patch.object(store, "DATA", self.d)
        p.start()
        self.addCleanup(p.stop)

    def test_rates_per_dirham_from_the_usd_peg(self):
        fx.main(get=lambda url, **k: {"date": "2026-11-19", "rates": {"EUR": 0.91, "GBP": 0.76}})
        with open(os.path.join(self.d, "fx.json")) as f:
            out = json.load(f)["per_aed"]
        self.assertAlmostEqual(out["USD"], 1 / 3.6725, 5)
        self.assertAlmostEqual(out["EUR"], 0.91 / 3.6725, 5)

    def test_a_bad_answer_keeps_the_file(self):
        fx.main(get=lambda url, **k: {"rates": {"EUR": 99}})
        self.assertFalse(os.path.exists(os.path.join(self.d, "fx.json")))
        def boom(url, **k):
            raise net.StopForToday("HTTP 503")
        with mock.patch.object(fx.st, "due", return_value=True):
            fx.main(get=boom)
        with open(os.path.join(self.d, "state.json")) as f:
            self.assertEqual(json.load(f)["fx"]["state"], "failed")


class Lifestyle(unittest.TestCase):
    def test_distances_and_school_counts(self):
        raw = {"elements": [{"type": "node", "lat": 25.080, "lon": 55.135, "tags": {"natural": "beach"}},
                            {"type": "way", "center": {"lat": 25.10, "lon": 55.20}, "tags": {"leisure": "golf_course"}}]
               + [{"type": "node", "lat": 25.081 + i * 0.001, "lon": 55.14, "tags": {"amenity": "school"}} for i in range(12)]
               + [{"type": "node", "lat": 25.30, "lon": 55.40, "tags": {"amenity": "school"}}]}
        out = lifestyle.build(raw, [{"label": "Marina", "lat": 25.08, "lng": 55.14}, {"label": "Nowhere", "lat": None, "lng": None}])
        m = out["areas"]["Marina"]
        self.assertLess(m["beach"], 600)
        self.assertGreater(m["golf"], 2000)
        self.assertIsNone(m["park"])
        self.assertEqual(m["schools"], 12)  # the far one is not within 2 km
        self.assertNotIn("Nowhere", out["areas"])


if __name__ == "__main__":
    unittest.main()
