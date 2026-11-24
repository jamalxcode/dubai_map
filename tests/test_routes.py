"""collector/routes.py: bus and marine routes from RTA's GTFS feed (a small stand-in feed)."""
import io
import json
import os
import sys
import tempfile
import unittest
import zipfile
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "collector"))
import routes as rt  # noqa: E402


def feed(n_bus=3):
    files = {
        "routes.txt": "route_id,route_short_name,route_long_name,route_type,route_color\n"
                      + "".join(f"b{i},{10 + i},Gold Souq Bus Stn - Al Quoz Bus Stn {i},3,6F2E90\n" for i in range(n_bus))
                      + "m1,CR3,Baniyas MTS - Dubai Old Souq MTS,4,C5B1D3\nm2,FR5,Al Ghubaiba MTS - Sharjah Aquarium Marine Stn,4,C5B1D3\nt1,T1,,0,F47922\n",
        "trips.txt": "route_id,service_id,trip_id,direction_id,shape_id\n"
                     + "".join(f"b{i},s,tb{i}a,0,shb{i}\nb{i},s,tb{i}b,0,shb{i}\nb{i},s,tb{i}c,1,shb{i}x\n" for i in range(n_bus))
                     + "m1,s,tm1,0,shm1\nm2,s,tm2,0,shm2\nt1,s,tt1,0,sht1\n",
        "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n"
                      + "".join(f"shb{i},25.2{i},55.27,1\nshb{i},25.2{i}5,55.28,2\nshb{i},25.2{i}9,55.30,3\nshb{i}x,25.2{i}9,55.30,1\nshb{i}x,25.2{i},55.27,2\n" for i in range(n_bus))
                      + "shm1,25.268,55.300,1\nshm1,25.264,55.297,2\nshm2,25.265,55.290,1\nshm2,25.330,55.380,2\nsht1,25.08,55.14,1\nsht1,25.09,55.15,2\n",
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\nA,Gold Souq Bus Station,25.2701,55.2989\nB,Al Quoz Bus Station,25.1500,55.2300\nC,Baniyas MTS,25.2680,55.3000\nD,Dubai Old Souq MTS,25.2640,55.2970\nE,Unused stop,25.0,55.0\n",
        "stop_times.txt": "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n"
                          + "".join(f"tb{i}a,08:00:00,08:00:00,A,1\ntb{i}a,08:30:00,08:30:00,B,2\ntb{i}c,09:00:00,09:00:00,B,1\n" for i in range(n_bus))
                          + "tm1,08:00:00,08:00:00,C,1\ntm1,08:05:00,08:05:00,D,2\n",
        "translations.txt": "table_name,field_name,language,translation,record_id\nstops,stop_name,ar,محطة حافلات سوق الذهب,A\n",
        "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,1,1,20250829,20251231\n",
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for k, v in files.items():
            z.writestr(k, v)
    buf.seek(0)
    return zipfile.ZipFile(buf)


class Routes(unittest.TestCase):
    def test_polyline_round_trip(self):
        pts = [(25.2048, 55.2708), (25.19742, 55.27432), (24.9, 54.95)]
        self.assertEqual(rt.decode(rt.encode(pts)), [(round(a, 5), round(b, 5)) for a, b in pts])
        self.assertEqual(rt.encode([(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]), "_p~iF~ps|U_ulLnnqC_mqNvxq`@")  # Google's example

    def test_build(self):
        out = rt.build(feed(), today=date(2026, 11, 24))
        self.assertEqual(out["feed"], {"from": "2025-08-29", "to": "2025-12-31"})
        self.assertEqual([r["ref"] for r in out["bus"]["routes"]], ["10", "11", "12"])
        self.assertEqual(rt.decode(out["bus"]["routes"][0]["line"])[0], (25.20, 55.27))  # the most-run shape, in order
        self.assertEqual({r["ref"]: r["kind"] for r in out["marine"]["routes"]}, {"CR3": "abra", "FR5": "ferry"})
        stops = {s[2]: s for s in out["bus"]["stops"]}
        self.assertEqual(stops["Gold Souq Bus Station"][3], "محطة حافلات سوق الذهب")
        self.assertEqual(stops["Al Quoz Bus Station"][4], ["10", "11", "12"])  # both directions' stops count
        self.assertNotIn("Unused stop", stops)
        self.assertEqual([s[2] for s in out["marine"]["stations"]], ["Dubai Old Souq MTS", "Baniyas MTS"])
        self.assertNotIn("T1", json.dumps(out))  # the Tram stays with transit.py

    def test_check_keeps_the_file_on_a_thin_feed(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "gtfs.zip")
            z = feed()
            with zipfile.ZipFile(p, "w") as w:
                for n in z.namelist():
                    w.writestr(n, z.read(n))
            outp = os.path.join(d, "routes.json")
            self.assertEqual(rt.main(["--from-file", p, "--out", outp]), 1)  # 3 routes: far below the minimum
            self.assertFalse(os.path.exists(outp))
            rt.MIN.update(bus_routes=1, bus_stops=1, marine_routes=1)
            try:
                self.assertEqual(rt.main(["--from-file", p, "--out", outp]), 0)
                self.assertTrue(os.path.exists(outp))
            finally:
                rt.MIN.update(bus_routes=100, bus_stops=1500, marine_routes=5)


if __name__ == "__main__":
    unittest.main()
