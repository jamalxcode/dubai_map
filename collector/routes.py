"""Dubai bus routes and marine transport (abra, water bus, water taxi, ferry) for the map's Bus and Boats layers, from
the Roads and Transport Authority's GTFS timetable feed (published as open data on Dubai Pulse; downloaded from the
Mobility Database's copy, as Dubai Pulse answers only from the UAE). The Metro and Tram come from transit.py.

Weekly (geocode.yml, "Place unplaced areas"). From the feed: every bus route (route_type 3) and marine route (4), each
drawn with its most-run shape (one direction), simplified to about 12 m and stored as an encoded polyline; the stops a
route's most-run trips serve (both directions), with English and Arabic names. Written to data/routes.json as

    {"fetched", "source", "feed": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"},
     "bus":    {"routes": [{"ref", "name", "line": "<encoded polyline>"}], "stops": [[lat, lng, "name", "name_ar", ["ref", ...]]]},
     "marine": {"routes": [{"ref", "name", "kind", "line"}],               "stations": [[lat, lng, "name", "name_ar", ["ref", ...]]]}}

The result is checked before it replaces the current file (at least 100 bus routes, 1,500 bus stops, 5 marine routes,
all inside Dubai's box); otherwise the current file stays. The feed's own dates go with it, so the page can say how
current the timetable is.

Usage: python3 collector/routes.py [--out data/routes.json] [--from-file gtfs.zip]
"""
import argparse
import collections
import csv
import datetime
import io
import json
import os
import sys
import tempfile
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
from transit import BBOX, simplify  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "routes.json")
FEED_URL = os.environ.get("RTA_GTFS_URL") or "https://files.mobilitydatabase.org/mdb-3359/latest.zip"
SOURCE = "Roads and Transport Authority (RTA), GTFS timetable feed (Dubai Pulse open data), via the Mobility Database"
MIN = {"bus_routes": 100, "bus_stops": 1500, "marine_routes": 5}
TOL_M = 12
KINDS = {"3": "bus", "4": "marine"}


def encode(points):
    """Google's encoded polyline (five decimals): about a third of the size of a list of coordinates."""
    out, plat, plng = [], 0, 0
    for lat, lng in points:
        ilat, ilng = round(lat * 1e5), round(lng * 1e5)
        for d in (ilat - plat, ilng - plng):
            v = ~(d << 1) if d < 0 else d << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1f)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        plat, plng = ilat, ilng
    return "".join(out)


def decode(s):
    pts, i, lat, lng = [], 0, 0, 0
    while i < len(s):
        for k in (0, 1):
            shift = res = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                res |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(res >> 1) if res & 1 else res >> 1
            if k == 0:
                lat += d
            else:
                lng += d
        pts.append((lat / 1e5, lng / 1e5))
    return pts


def marine_kind(ref, name):
    s = f"{ref} {name}".lower()
    if ref.upper().startswith("CR") or "abra" in s:
        return "abra"
    if ref.upper().startswith("FR") or "ferry" in s:
        return "ferry"
    if "taxi" in s:
        return "water taxi"
    return "water bus"


def rows(z, name):
    if name not in z.namelist():
        return
    with z.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, "utf-8-sig"))


def iso(d):
    return f"{d[:4]}-{d[4:6]}-{d[6:]}" if d and len(d) == 8 else None


def build(z, today=None):
    routes = {r["route_id"]: r for r in rows(z, "routes.txt") if r.get("route_type") in KINDS}
    # The most-run shape per route (and, for the stops, the most-run trip per route and direction).
    shape_n, trip_pick = collections.Counter(), {}
    per_dir = collections.defaultdict(collections.Counter)
    trips_of = collections.defaultdict(list)
    for t in rows(z, "trips.txt"):
        rid = t.get("route_id")
        if rid not in routes:
            continue
        if t.get("shape_id"):
            shape_n[(rid, t["shape_id"])] += 1
            per_dir[(rid, t.get("direction_id", ""))][t["shape_id"]] += 1
            trips_of[(rid, t.get("direction_id", ""), t["shape_id"])].append(t["trip_id"])
    best_shape = {}
    for (rid, sid), n in shape_n.items():
        if n > best_shape.get(rid, ("", 0))[1]:
            best_shape[rid] = (sid, n)
    for (rid, d), counts in per_dir.items():
        sid = counts.most_common(1)[0][0]
        trip_pick[trips_of[(rid, d, sid)][0]] = rid
    want = {sid for sid, _ in best_shape.values()}
    pts = collections.defaultdict(list)
    for r in rows(z, "shapes.txt"):
        if r["shape_id"] in want:
            pts[r["shape_id"]].append((int(r["shape_pt_sequence"]), float(r["shape_pt_lat"]), float(r["shape_pt_lon"])))
    served = collections.defaultdict(set)
    for r in rows(z, "stop_times.txt"):
        rid = trip_pick.get(r["trip_id"])
        if rid:
            served[r["stop_id"]].add(rid)
    ar = {}
    for r in rows(z, "translations.txt"):
        if r.get("table_name") == "stops" and r.get("field_name") == "stop_name" and (r.get("language") or "").lower().startswith("ar"):
            ar[r.get("record_id") or r.get("field_value")] = r["translation"]
    stops = {s["stop_id"]: s for s in rows(z, "stops.txt") if s["stop_id"] in served}
    cal = list(rows(z, "calendar.txt"))
    out = {"fetched": (today or datetime.date.today()).isoformat(), "source": SOURCE,
           "feed": {"from": iso(min((c["start_date"] for c in cal), default="")), "to": iso(max((c["end_date"] for c in cal), default=""))},
           "bus": {"routes": [], "stops": []}, "marine": {"routes": [], "stations": []}}
    order = lambda ref: (len(ref), ref)
    for rid, r in sorted(routes.items(), key=lambda kv: order(kv[1].get("route_short_name") or kv[0])):
        sid = best_shape.get(rid, (None,))[0]
        line = [(la, lo) for _, la, lo in sorted(pts.get(sid, []))]
        if len(line) < 2:
            continue
        ref = (r.get("route_short_name") or rid).strip()
        item = {"ref": ref, "name": (r.get("route_long_name") or "").strip(), "line": encode(simplify(line, TOL_M))}
        if KINDS[r["route_type"]] == "marine":
            item["kind"] = marine_kind(ref, item["name"])
            out["marine"]["routes"].append(item)
        else:
            out["bus"]["routes"].append(item)
    for sid, s in stops.items():
        kinds = {KINDS[routes[rid]["route_type"]] for rid in served[sid]}
        refs = sorted({(routes[rid].get("route_short_name") or rid).strip() for rid in served[sid]}, key=order)
        row = [round(float(s["stop_lat"]), 5), round(float(s["stop_lon"]), 5), s["stop_name"].strip(), ar.get(sid, ""), refs]
        if "marine" in kinds:
            out["marine"]["stations"].append(row)
        if "bus" in kinds:
            out["bus"]["stops"].append(row)
    for k in ("stops",):
        out["bus"][k].sort(key=lambda x: (x[0], x[1]))
    out["marine"]["stations"].sort(key=lambda x: (x[0], x[1]))
    return out


def check(out):
    bad = []
    if len(out["bus"]["routes"]) < MIN["bus_routes"]:
        bad.append(f"only {len(out['bus']['routes'])} bus routes (at least {MIN['bus_routes']})")
    if len(out["bus"]["stops"]) < MIN["bus_stops"]:
        bad.append(f"only {len(out['bus']['stops'])} bus stops (at least {MIN['bus_stops']})")
    if len(out["marine"]["routes"]) < MIN["marine_routes"]:
        bad.append(f"only {len(out['marine']['routes'])} marine routes (at least {MIN['marine_routes']})")
    for g in ("bus", "marine"):
        for r in out[g]["routes"]:
            if any(not (BBOX[0] - 0.3 <= la <= BBOX[2] + 0.3 and BBOX[1] - 0.3 <= lo <= BBOX[3] + 0.3) for la, lo in decode(r["line"])):
                bad.append(f"{g} route {r['ref']} leaves the Dubai area")
    return bad


def download(path):
    req = urllib.request.Request(FEED_URL, headers={"User-Agent": net.UA if hasattr(net, "UA") else "dubai-map-atlas"})
    with urllib.request.urlopen(req, timeout=180) as resp, open(path, "wb") as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)


def main(argv=None, today=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--from-file", help="a GTFS zip saved earlier (tests, offline runs)")
    a = ap.parse_args(argv)
    path = a.from_file
    try:
        if not path:
            path = os.path.join(tempfile.mkdtemp(), "gtfs.zip")
            download(path)
        z = zipfile.ZipFile(path)
    except Exception as e:  # noqa: BLE001 - any failure keeps the current file
        net.log(f"RTA's feed not reachable ({e}); keeping the current file", "routes")
        return 0
    out = build(z, today)
    bad = check(out)
    net.log(f"feed {out['feed']['from']} to {out['feed']['to']}; bus: {len(out['bus']['routes'])} routes, {len(out['bus']['stops'])} stops; "
            f"marine: {len(out['marine']['routes'])} routes, {len(out['marine']['stations'])} stations", "routes")
    if bad:
        net.log("not saved: " + "; ".join(bad[:5]), "routes")
        return 1
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    net.log(f"saved {a.out} ({os.path.getsize(a.out) // 1024} KB)", "routes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
