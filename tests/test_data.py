"""Sanity checks on the data files actually committed, so a bad source update can't silently break the map."""
import csv
import json
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
# Generous box around Dubai (Hatta excluded); a point outside it is almost certainly a typo.
LAT, LNG = (24.6, 25.45), (54.85, 55.7)


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def rows(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return list(csv.DictReader(f))


class PublishedDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.meta, cls.areas = load("meta.json"), load("areas.json")["areas"]
        cls.latest = load("latest.json")

    def test_meta_is_complete(self):
        self.assertIn(self.meta["mode"], ("aggregate", "contracts"))
        for k in ("generated_at", "contracts_last_12m", "mapped_last_12m", "source", "state"):
            self.assertIn(k, self.meta)
        self.assertLessEqual(self.meta["mapped_last_12m"], self.meta["contracts_last_12m"])
        through = self.meta.get("data_through") or self.meta.get("newest_start_date")
        self.assertRegex(through or "", r"^\d{4}-\d{2}-\d{2}$", "the page needs this date for the stale-data warning")

    def test_counts_add_up(self):
        self.assertEqual(sum(a["n"] for a in self.areas), self.meta["contracts_last_12m"])
        self.assertEqual(sum(a["n"] for a in self.areas if a["lat"] is not None), self.meta["mapped_last_12m"])

    def test_every_community_is_sane(self):
        labels = [a["label"] for a in self.areas]
        self.assertEqual(len(labels), len(set(labels)), "duplicate community labels")
        for a in self.areas:
            with self.subTest(a["label"]):
                self.assertGreater(a["n"], 0)
                self.assertTrue(5_000 <= a["median"] <= 5_000_000, f"median rent {a['median']} looks wrong")
                if a["lat"] is not None:
                    self.assertTrue(LAT[0] <= a["lat"] <= LAT[1] and LNG[0] <= a["lng"] <= LNG[1],
                                    f"point {a['lat']},{a['lng']} is outside Dubai")
                for u in a["by_unit"]:
                    if u["median"] is not None:
                        self.assertGreater(u["median"], 0)

    def test_table_rows_match_communities(self):
        known = {a["label"] for a in self.areas}
        key = "c"
        for r in self.latest["rows"][:5000]:
            self.assertIn(r[key], known)
            self.assertGreater(r["a"], 0)


class LocationFileTests(unittest.TestCase):
    def check_points(self, name, key):
        seen = set()
        for r in rows(name):
            with self.subTest(r[key]):
                self.assertNotIn(r[key], seen, "duplicate row")
                seen.add(r[key])
                lat, lng = float(r["lat"]), float(r["lng"])
                self.assertTrue(LAT[0] <= lat <= LAT[1] and LNG[0] <= lng <= LNG[1], "outside Dubai")

    def test_community_locations(self):
        self.check_points("community_locations.csv", "community")

    def test_area_locations(self):
        for r in rows("area_locations.csv"):
            self.assertIn(r["field"], ("area", "any"))
            self.assertEqual(r["match"], r["match"].lower().strip(), "match keys are compared in lower case")
        self.check_points("area_locations.csv", "match")


if __name__ == "__main__":
    unittest.main()
