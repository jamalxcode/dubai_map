"""collector/stay_history.py: daily snapshots of each area's median hotel and holiday home price."""
import json
import os
import sys
import tempfile
import unittest
from datetime import date
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "collector"))
import stay_history as sh  # noqa: E402
import store  # noqa: E402

AREAS = {"areas": [{"label": "Marina", "lat": 25.08, "lng": 55.14}, {"label": "Deira", "lat": 25.27, "lng": 55.31},
                   {"label": "Unplaced", "lat": None, "lng": None}]}
# Marina's outline: a box around it ([lng, lat] rings, as in outlines.json); "Unplaced" has an outline but no point.
OUTLINES = {"areas": [{"label": "Marina", "rings": [[[55.12, 25.06], [55.16, 25.06], [55.16, 25.10], [55.12, 25.10]]]},
                      {"label": "Unplaced", "rings": [[[55.30, 25.26], [55.32, 25.26], [55.32, 25.28], [55.30, 25.28]]]}]}


def row(lat, lng, price, checked="2026-11-19"):
    return ["x", lat, lng, price, 2, price, price, checked]


class StayHistory(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        p = mock.patch.object(store, "DATA", self.d)
        p.start()
        self.addCleanup(p.stop)
        self.write("areas.json", AREAS)
        self.write("outlines.json", OUTLINES)
        self.write("hotel_prices.json", {"hotels": [row(25.07, 55.13, 400), row(25.09, 55.15, 600), row(25.271, 55.311, 300),
                                                    row(25.5, 55.9, 999), row(25.08, 55.14, 50000, "2026-11-01")]})
        self.write("holiday_homes.json", {"homes": [row(25.08, 55.14, 500)]})

    def write(self, name, obj):
        json.dump(obj, open(os.path.join(self.d, name), "w"))

    def hist(self):
        return json.load(open(os.path.join(self.d, "stay_history.json")))

    def test_areas_get_medians_by_the_page_rule(self):
        sh.main(today=date(2026, 11, 19))
        day = self.hist()["days"][0]
        self.assertEqual(day["d"], "2026-11-19")
        # Marina by its outline (400, 600); Deira by its point (inside "Unplaced"'s outline, which the page ignores);
        # the far one is in no area but counts for Dubai; the 18-day-old price is left out.
        self.assertEqual(day["hotels"]["areas"], {"Marina": [500, 2], "Deira": [300, 1]})
        self.assertEqual(day["hotels"]["all"], [500, 4])  # 300, 400, 600, 999
        self.assertEqual(day["homes"]["areas"], {"Marina": [500, 1]})

    def test_one_entry_a_day_and_days_are_kept(self):
        sh.main(today=date(2026, 11, 19))
        sh.main(today=date(2026, 11, 19))
        sh.main(today=date(2026, 11, 20))
        self.assertEqual([d["d"] for d in self.hist()["days"]], ["2026-11-19", "2026-11-20"])
        os.remove(os.path.join(self.d, "hotel_prices.json"))
        os.remove(os.path.join(self.d, "holiday_homes.json"))
        sh.main(today=date(2026, 11, 21))  # nothing priced: nothing saved, earlier days untouched
        self.assertEqual(len(self.hist()["days"]), 2)


if __name__ == "__main__":
    unittest.main()
