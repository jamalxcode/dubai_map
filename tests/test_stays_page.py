"""scripts/stays_page.py: the map's one small file for places-to-stay prices."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import stays_page  # noqa: E402


class StaysPageTests(unittest.TestCase):
    def write(self, d, name, obj):
        with open(os.path.join(d, name), "w", encoding="utf-8") as f:
            json.dump(obj, f)

    def test_keeps_what_the_map_reads_and_drops_the_collectors_notes(self):
        with tempfile.TemporaryDirectory() as d:
            self.write(d, "hotels.json", {"hotels": [["A", "", "hotel", 4, 25.1, 55.2]]})
            self.write(d, "hotel_prices.json", {"fetched": "2026-11-29", "source": "X", "keep_days": 10, "hotels": [["A", 25.1, 55.2, 500, 2, 450, 550, "2026-11-28"]],
                                                "keys": {"A|25.1|55.2": "k"}, "tried": {"A|25.1|55.2": "2026-11-28"},
                                                "info": {"A|25.1|55.2": [4.5, 100, "https://www.tripadvisor.com/x"], "Gone|1|1": [3, 1, ""]}})
            self.write(d, "serp_stays.json", {"fetched": "2026-11-29", "keep_days": 10, "hotels": [], "homes": [["H", 25, 55, 300]], "seen": {"t": 1}, "used": 5})
            self.write(d, "holiday_homes.json", {"fetched": "2026-11-29", "keep_days": 10, "homes": [["B", 25, 55, 400]], "places": {"x": 1}, "tried": {"x": 1}, "listed": 9})
            out = stays_page.main(d)
            with open(os.path.join(d, "stays.json"), encoding="utf-8") as f:
                self.assertEqual(json.load(f), out)
            self.assertEqual(out["hotel_prices"]["hotels"][0][3], 500)
            self.assertEqual(list(out["hotel_prices"]["info"]), ["A|25.1|55.2"], "only hotels on the map keep their rating and link")
            self.assertNotIn("keys", out["hotel_prices"]); self.assertNotIn("tried", out["hotel_prices"])
            self.assertNotIn("seen", out["serp"]); self.assertNotIn("used", out["serp"])
            self.assertEqual(out["serp"]["homes"][0][0], "H")
            self.assertNotIn("places", out["homes"]); self.assertNotIn("tried", out["homes"])
            self.assertEqual(out["homes"]["keep_days"], 10)

    def test_missing_sources_are_left_out(self):
        with tempfile.TemporaryDirectory() as d:
            self.write(d, "holiday_homes.json", {"homes": [["B", 25, 55, 400]]})
            self.assertEqual(list(stays_page.main(d)), ["homes"])


if __name__ == "__main__":
    unittest.main()
