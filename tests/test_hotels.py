"""collector/hotels.py and hotel_stats.py: OpenStreetMap hotels and DET's official monthly figures."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "collector"))
import hotels  # noqa: E402
import hotel_stats  # noqa: E402


def node(i, tourism, name, lat, lon, **tags):
    return {"type": "node", "id": i, "lat": lat, "lon": lon, "tags": dict(tourism=tourism, name=name, **tags)}


RAW = {"elements": [
    node(1, "hotel", "Palm Hotel", 25.112, 55.138, stars="5", **{"name:ar": "فندق النخلة"}),
    {"type": "way", "id": 2, "center": {"lat": 25.1121, "lon": 55.1381}, "tags": {"tourism": "hotel", "name": "Palm Hotel"}},  # same place twice
    node(3, "apartment", "Creek Suites", 25.25, 55.33, stars="4S"),
    node(4, "hostel", "Backpackers", 25.26, 55.30),
    node(5, "guest_house", "Old Town House", 25.26, 55.29),
    node(6, "hotel", "", 25.2, 55.3),                              # no name
    node(7, "hotel", "Abu Dhabi Inn", 24.45, 54.37),               # outside Dubai
    node(8, "hotel", "Closed Hotel", 25.2, 55.3, **{"disused:tourism": "hotel"}),
    node(9, "attraction", "Museum", 25.2, 55.3),                   # not a place to stay
]}

CSV = "﻿report_date,adr,room_occupancy,revpar,length_of_stay,total_hotels,total_rooms_available\n" \
      "2026-08-01,410.5,70.2,288.2,3.8,820,150000\n2026-09-01,520,76,395.2,3.9,822,151000\nbad,1,2,3,4,5,6\n"


class Hotels(unittest.TestCase):
    def test_build_keeps_named_places_in_dubai_once(self):
        out = hotels.build(RAW, today="2026-11-18")
        names = [h[0] for h in out["hotels"]]
        self.assertEqual(sorted(names), ["Backpackers", "Creek Suites", "Old Town House", "Palm Hotel"])
        palm = next(h for h in out["hotels"] if h[0] == "Palm Hotel")
        self.assertEqual(palm[1:4], ["فندق النخلة", "hotel", 5])
        kinds = {h[0]: h[2] for h in out["hotels"]}
        self.assertEqual(kinds["Creek Suites"], "apartments")
        self.assertEqual(kinds["Old Town House"], "guest")
        self.assertEqual(out["fetched"], "2026-11-18")

    def test_stars(self):
        self.assertEqual(hotels.stars_of({"stars": "4S"}), 4)
        self.assertEqual(hotels.stars_of({"stars": "3.5"}), 3.5)
        self.assertIsNone(hotels.stars_of({"stars": "luxury"}))
        self.assertIsNone(hotels.stars_of({"stars": "12"}))
        self.assertIsNone(hotels.stars_of({}))

    def test_a_short_answer_is_not_saved(self):
        with tempfile.TemporaryDirectory() as d:
            src, out = os.path.join(d, "raw.json"), os.path.join(d, "hotels.json")
            json.dump(RAW, open(src, "w"))
            self.assertEqual(hotels.main(["--from-file", src, "--out", out]), 1)
            self.assertFalse(os.path.exists(out))
            with mock.patch.object(hotels, "MIN_PLACES", 3):
                self.assertEqual(hotels.main(["--from-file", src, "--out", out]), 0)
            self.assertEqual(len(json.load(open(out))["hotels"]), 4)


class HotelStats(unittest.TestCase):
    def test_build_reads_months_in_order(self):
        out = hotel_stats.build(CSV, today="2026-11-18")
        self.assertEqual([m["month"] for m in out["months"]], ["2026-08", "2026-09"])
        self.assertEqual(out["latest"]["adr"], 520)
        self.assertEqual(out["latest"]["occupancy"], 76)
        self.assertEqual(out["months"][0]["revpar"], 288.2)

    def test_build_from_api_rows(self):
        out = hotel_stats.build("", rows=[{"report_date": "2026-10-01T00:00:00", "adr": "480", "room_occupancy": "80"}])
        self.assertEqual(out["latest"]["month"], "2026-10")

    def test_a_refused_download_keeps_the_current_file(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "hotel_stats.json")
            open(out, "w").write('{"keep":1}')
            env = {k: v for k, v in os.environ.items() if not k.startswith("DUBAI_PULSE")}
            with mock.patch.dict(os.environ, env, clear=True), \
                    mock.patch.object(hotel_stats, "fetch_csv", side_effect=hotel_stats.net.StopForToday("HTTP 000")):
                self.assertEqual(hotel_stats.main(["--out", out]), 0)
            with mock.patch.dict(os.environ, env, clear=True), \
                    mock.patch.object(hotel_stats, "fetch_csv", return_value="<html>sign in</html>"):
                self.assertEqual(hotel_stats.main(["--out", out]), 0)
            self.assertEqual(json.load(open(out)), {"keep": 1})


if __name__ == "__main__":
    unittest.main()
