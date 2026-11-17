"""Share pages (scripts/share_pages.py): one preview page per area."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import share_pages as sp  # noqa: E402

JVC = {"label": "Jumeirah Village Circle", "n": 30000, "median": 66000, "through": None,
       "by_unit": [{"u": "Studios", "n": 9000, "median": 48000}, {"u": "1-bedroom apartments", "n": 15000, "median": 70000}]}
KARAMA = {"label": "Al Karama", "n": 12391, "median": 44000, "median_kind": "unit", "median_unit": "Studios",
          "by_unit": [{"u": "Studios", "n": None, "median": 44000}], "through": "2026-11-14"}


class SharePageTests(unittest.TestCase):
    def test_slug(self):
        self.assertEqual(sp.slug("Jumeirah Village Circle"), "jumeirah-village-circle")
        self.assertEqual(sp.slug("DMCC-EZ2"), "dmcc-ez2")
        self.assertEqual(sp.slug("Al Ma'aisem First"), "al-ma-aisem-first")
        self.assertEqual(sp.slug("Côte d'Azur (Phase 2)"), "cote-d-azur-phase-2")

    def test_page_leads_with_one_bedroom_and_forwards_to_the_map(self):
        html = sp.page(JVC, "2026-11-13")
        self.assertIn("<title>Jumeirah Village Circle rents: AED 70,000 a year for a 1-bedroom apartment | Dubai Real Estate Atlas</title>", html)
        self.assertIn('property="og:image" content="https://jamalxcode.github.io/dubai_map/assets/share.png"', html)
        self.assertIn("to 13 Nov 2026", html)
        self.assertIn('url=../../?area=Jumeirah%20Village%20Circle"', html)
        self.assertIn("unit=", html, "a shared unit is carried over")
        self.assertIn("for a studio flat", sp.page(KARAMA, None))

    def test_writes_every_area_and_refuses_a_shared_link(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as out:
            os.makedirs(os.path.join(root, "data"))
            with open(os.path.join(root, "data", "areas.json"), "w") as f:
                json.dump({"to": "2026-11-13", "areas": [JVC, KARAMA]}, f)
            with mock.patch.object(sp, "ROOT", root), mock.patch("builtins.print"):
                self.assertEqual(sp.main(out), 2)
                self.assertTrue(os.path.exists(os.path.join(out, "a", "al-karama", "index.html")))
                with open(os.path.join(root, "data", "areas_flat.json"), "w") as f:
                    json.dump({"areas": [dict(JVC, label="Jumeirah-Village Circle")]}, f)
                with self.assertRaises(SystemExit):
                    sp.main(out)


if __name__ == "__main__":
    unittest.main()
