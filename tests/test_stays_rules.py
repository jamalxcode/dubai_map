"""Shared rules for places to stay (collector/hotel_prices.py): shared beds aren't holiday homes; ratings to one decimal."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "collector"))
import hotel_prices as hp  # noqa: E402


class StaysRules(unittest.TestCase):
    def test_shared_beds(self):
        for name in ("Dormigo Hostel Mankhool", "Alharaki Capsule - Standard Shared Dormitory, Mixed Dorm, Non Smoking",
                     "JBR Shared Hostel Premium", "Bed in 6-bed dorm near Metro"):
            self.assertTrue(hp.shared_bed(name), name)
        for name in ("Casa Nova", "Luxury Apt - Rooftop Pool - City View", "Vogue | Sterling near Dubai Mall", "Address Dubai Marina", None):
            self.assertFalse(hp.shared_bed(name), name)

    def test_rating_to_one_decimal(self):
        self.assertEqual(hp.rating1(3.2999997), 3.3)
        self.assertEqual(hp.rating1(4.7934427), 4.8)
        self.assertEqual(hp.rating1(4), 4.0)
        self.assertIsNone(hp.rating1(None))
        self.assertIsNone(hp.rating1(""))


if __name__ == "__main__":
    unittest.main()
