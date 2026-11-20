"""scripts/site_pages.py: the stats page, areas directory, landing pages and feed, from small stand-in data."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import site_pages as sp  # noqa: E402


def area(label, n, one, sale=None, yld=None, staff=False):
    return {"label": label, "lat": 25.1, "lng": 55.2, "n": n, "median": one + 10000, "staff": staff, "sale_median": sale, "yield_pct": yld,
            "by_unit": [{"u": "1-bedroom apartments", "n": n // 2, "median": one, "yield": yld}, {"u": "Studios", "n": n // 3, "median": one - 15000}],
            "sale_trend": [{"m": f"2026-{m:02d}", "psf": 1000 + m * 10} for m in range(1, 11)]}


AREAS = [area(f"Area {i}", 100 + i * 50, 40000 + i * 5000, 900000 + i * 1e5, 5 + i / 10) for i in range(12)] + [area("Staff Town Industrial", 50000, 20000, staff=True)]


def dump(obj, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f)


class SitePages(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.d, "data", "history"))
        dump({"to": "2026-11-19", "areas": AREAS}, os.path.join(self.d, "data", "areas.json"))
        dump({"moved": [{"area": "Area 3", "pct": 6.2}]}, os.path.join(self.d, "data", "changes.json"))
        for day, m in (("2026-11-17", 50000), ("2026-11-18", 50000), ("2026-11-19", 54000)):
            dump({"through": day, "areas": {"Area 1": {"m": m, "n": 200}, "Area 2": {"m": 60000, "n": 200}}}, os.path.join(self.d, "data", "history", day + ".json"))
        self.out = os.path.join(self.d, "_site")
        import page_kit
        for target in (sp, page_kit):
            p = mock.patch.object(target, "ROOT", self.d)
            p.start()
            self.addCleanup(p.stop)

    def read(self, path):
        with open(os.path.join(self.out, path), encoding="utf-8") as f:
            return f.read()

    def test_pages_feed_and_sitemap(self):
        self.assertEqual(sp.main(self.out), 3 + len(sp.UNITS) + len(sp.BUDGETS))
        stats = self.read("stats/index.html")
        self.assertIn('"@type": "FAQPage"', stats)
        busiest = stats.split("Busiest rental markets")[1].split("</ol>")[0]
        self.assertNotIn("Staff Town", busiest)  # industrial zones are left out of rankings
        self.assertIn("Area 11", busiest)
        self.assertIn("Area 3", stats.split("What moved")[1])
        under = self.read("rents/1-bedroom-under-60000/index.html")
        self.assertIn(">Area 3<", under)
        self.assertNotIn(">Area 5<", under)  # 65,000 a year: over the budget
        self.assertIn("max=60000", under)  # the map opens with the same budget
        feed = self.read("feed.xml")
        self.assertIn("Area 1 +8% to AED 54,000 a year", feed)
        self.assertIn("No area moved by 5% or more.", feed)
        self.assertIn("stats/", self.read("sitemap.xml"))
        self.assertIn("class=sortable", self.read("areas/index.html"))
        # One Dubai figure: the middle contract (contract-weighted), labelled as such.
        self.assertIn("typical yearly rent for a 1-bedroom, all of Dubai", stats)
        self.assertIn("the middle contract", stats)
        # Rankings need 100+ contracts: Area 0-2 have fewer 1-bedroom contracts, so they are not the cheapest.
        cheapest = stats.split("Cheapest areas for a 1-bedroom")[1].split("</ol>")[0]
        self.assertNotIn(">Area 0<", cheapest)
        self.assertIn(">Area 3<", cheapest)
        # The chart says the change in words, and its scale starts well below the lowest month.
        self.assertIn("Up 8.9% over 9 months, from AED 1,010 to AED 1,100 per sq ft.", stats)
        # Every page also in Arabic, right to left, linked both ways and in the sitemap.
        ar = self.read("ar/stats/index.html")
        self.assertIn('<html lang="ar" dir="rtl">', ar)
        self.assertIn("إيجارات دبي هذا الشهر", ar)
        self.assertIn('href="../../stats/" lang="en">English</a>', ar)
        self.assertIn('href="../ar/stats/" lang="ar">عربي</a>', stats)
        self.assertIn("ar/rents/1-bedroom-under-60000/", self.read("sitemap.xml"))
        self.assertIn("درهم", self.read("ar/rents/studio/index.html"))
        # No four-week history yet (three days of snapshots): no trend section.
        self.assertNotIn("Rent over the past four weeks", stats)

    def test_four_week_trend(self):
        for day, m in (("2026-10-19", 50000), ("2026-11-19", 53000)):
            dump({"through": day, "areas": {"Area 1": {"m": m, "n": 200}, "Area 2": {"m": 60000, "n": 200}}}, os.path.join(self.d, "data", "history", day + ".json"))
        os.remove(os.path.join(self.d, "data", "history", "2026-11-17.json"))
        sp.main(self.out)
        stats = self.read("stats/index.html")
        self.assertIn("Rent over the past four weeks", stats)
        self.assertIn("Area 1: up 6.0%", stats)
        self.assertIn("since 19 Oct 2026", stats)


if __name__ == "__main__":
    unittest.main()
