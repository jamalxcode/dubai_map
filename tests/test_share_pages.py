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
          "by_unit": [{"u": "Studios", "n": None, "median": 44000}], "through": "2026-11-14", "source": "ccp"}


class SharePageTests(unittest.TestCase):
    def test_slug(self):
        self.assertEqual(sp.slug("Jumeirah Village Circle"), "jumeirah-village-circle")
        self.assertEqual(sp.slug("DMCC-EZ2"), "dmcc-ez2")
        self.assertEqual(sp.slug("Al Ma'aisem First"), "al-ma-aisem-first")
        self.assertEqual(sp.slug("Côte d'Azur (Phase 2)"), "cote-d-azur-phase-2")

    def test_page_is_real_content_with_a_way_to_the_map(self):
        html = sp.page(JVC, "2026-11-13")
        self.assertIn("<title>Jumeirah Village Circle rents: AED 70,000 a year for a 1-bedroom apartment | Dubai Real Estate Atlas</title>", html)
        self.assertIn('property="og:image" content="https://jamalxcode.github.io/dubai_map/assets/share.png"', html)
        self.assertIn("to 13 Nov 2026", html)
        self.assertIn('href="../../?open=a:Jumeirah%20Village%20Circle"', html)  # opens the area's card
        self.assertIn('"@type": "FAQPage"', html)
        self.assertIn('What is the rent for a 1-bedroom apartment in Jumeirah Village Circle?', html)
        self.assertNotIn("http-equiv=\"refresh\"", html, "no automatic redirect: the page stands on its own")
        self.assertIn("<td>1-bedroom apartments</td><td class=r>70,000</td><td class='r opt'>15,000</td>", html)  # AED in the heading
        self.assertIn("Median figures in AED.", html)
        self.assertIn('href="../../stats/">Market stats</a>', html)  # the header leads to the market pages
        self.assertIn('hreflang="ar" href="https://jamalxcode.github.io/dubai_map/ar/a/jumeirah-village-circle/"', html)
        self.assertIn("Continental Club Property", sp.page(KARAMA, None))
        self.assertIn("for a studio", sp.page(KARAMA, None))

    def test_arabic_page(self):
        html = sp.page(dict(JVC, sale_median=1108000, sale_yoy=-6.6), "2026-11-13", "ar")
        self.assertIn('<html lang="ar" dir="rtl">', html)
        self.assertIn("إيجارات Jumeirah Village Circle: 70,000 درهم سنويًا لشقة بغرفة نوم", html)  # area names stay in English
        self.assertIn("13 نوفمبر 2026", html)
        self.assertIn('href="../../../?lang=ar&amp;open=a:Jumeirah%20Village%20Circle"', html)
        self.assertIn("<td>شقق بغرفة نوم</td>", html)
        self.assertIn("بانخفاض 6.6% خلال عام", html)
        self.assertIn('href="../../../a/jumeirah-village-circle/" lang="en">English</a>', html)

    def test_sale_change_in_words(self):
        html = sp.page(dict(JVC, sale_median=1108000, sale_yoy=-6.6), "2026-11-13")
        self.assertIn("AED 1,110,000</b> median sale price, down 6.6% in a year (per sq ft)", html)  # three significant figures

    def test_writes_every_area_and_refuses_a_shared_link(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as out:
            os.makedirs(os.path.join(root, "data"))
            with open(os.path.join(root, "data", "areas.json"), "w") as f:
                json.dump({"to": "2026-11-13", "areas": [JVC, KARAMA]}, f)
            with mock.patch.object(sp, "ROOT", root), mock.patch("builtins.print"):
                self.assertEqual(sp.main(out), 2)
                self.assertTrue(os.path.exists(os.path.join(out, "a", "al-karama", "index.html")))
                self.assertTrue(os.path.exists(os.path.join(out, "ar", "a", "al-karama", "index.html")))
                with open(os.path.join(out, "sitemap.xml")) as f:
                    sm = f.read()
                    self.assertIn("/a/al-karama/</loc>", sm)
                    self.assertIn("/ar/a/al-karama/</loc>", sm)
                with open(os.path.join(root, "data", "areas_flat.json"), "w") as f:
                    json.dump({"areas": [dict(JVC, label="Jumeirah-Village Circle")]}, f)
                with self.assertRaises(SystemExit):
                    sp.main(out)


if __name__ == "__main__":
    unittest.main()
