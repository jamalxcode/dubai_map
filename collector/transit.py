"""Dubai Metro and Dubai Tram lines and stations, from OpenStreetMap (ODbL), for the map's transit layer.

One Overpass API request a week (geocode.yml, "Place unplaced areas"): the route relations for metro,
tram and light rail inside Dubai with their geometry, and the station nodes. Written to
data/transit.json as

    {"fetched": "YYYY-MM-DD", "source": "...",
     "lines":    [{"id", "name", "name_ar", "kind": "metro"|"tram", "colour", "paths": [[[lat, lng], ...], ...]}],
     "stations": [{"name", "name_ar", "kind", "lines": [line ids], "lat", "lng"}]}

Both directions of a line, and branches drawn in the same colour (the Red Line's Route 2020 to Expo
City), become one line. Paths are simplified to about 5 m. The result is checked before it replaces
the current file: at least two metro lines and 40 metro stations, one tram line and 8 tram stops, all
inside Dubai; otherwise the current file stays. Lines under construction (the Blue Line) are not
route relations yet, so they appear when OpenStreetMap maps them as running.

Usage: python3 collector/transit.py [--out data/transit.json] [--from-file overpass.json]
"""
import argparse
import datetime
import json
import math
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "transit.json")
OVERPASS = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
BBOX = (24.75, 54.85, 25.40, 55.65)  # south, west, north, east: Dubai emirate's built-up area
SOURCE = "OpenStreetMap contributors (ODbL), via the Overpass API"
MIN = {"metro_lines": 2, "metro_stations": 40, "tram_lines": 1, "tram_stations": 8}
NEAR_LINE_M = 150  # a station this close to a line's track is on that line

QUERY = """[out:json][timeout:180];
relation["route"~"^(subway|tram|light_rail)$"]({bbox})->.r;
.r out geom tags;
(
  node["railway"="station"]({bbox});
  way["railway"="station"]({bbox});
  node["railway"="tram_stop"]({bbox});
  node["public_transport"="station"]({bbox});
  way["public_transport"="station"]({bbox});
)->.s;
.s out center tags;
"""


def fetch():
    q = QUERY.format(bbox=",".join(str(v) for v in BBOX))
    return net.get_json(OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(), method="POST",
                        timeout=200, source="transit")


def metres(a, b):
    """Distance in metres between (lat, lng) points (equirectangular; fine at city scale)."""
    k = math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((a[0] - b[0]) * 111_320, (a[1] - b[1]) * 111_320 * k)


def to_segment(p, a, b):
    """Metres from p to the segment a-b."""
    k = math.cos(math.radians(p[0]))
    ax, ay, bx, by, px, py = a[1] * k, a[0], b[1] * k, b[0], p[1] * k, p[0]
    dx, dy = bx - ax, by - ay
    t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111_320


def simplify(pts, tol_m=5):
    """Ramer-Douglas-Peucker on (lat, lng) points, tolerance in metres."""
    if len(pts) < 3:
        return pts
    far, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = to_segment(pts[i], pts[0], pts[-1])
        if d > far:
            far, idx = d, i
    if far <= tol_m:
        return [pts[0], pts[-1]]
    return simplify(pts[:idx + 1], tol_m)[:-1] + simplify(pts[idx:], tol_m)


def kind_of_route(tags):
    return "tram" if tags.get("route") == "tram" else "metro"


def clean_name(name):
    """'Dubai Metro Red Line: Centrepoint => Expo 2020' -> 'Red Line'; 'Dubai Tram: Al Sufouh => Jumeirah Lakes Towers' -> 'Dubai Tram'."""
    name = re.split(r"\s*[:(]\s*", name or "", maxsplit=1)[0].strip()
    name = re.sub(r"^Dubai Metro\s+", "", name, flags=re.I)
    return name or "Line"


def station_kind(tags):
    st = (tags.get("station") or "").lower()
    if tags.get("railway") == "tram_stop" or st == "tram" or tags.get("tram") == "yes":
        return "tram"
    if st in ("subway", "light_rail") or tags.get("subway") == "yes" or tags.get("light_rail") == "yes":
        return "metro"
    return None  # a bus, train or other station: not ours


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).replace(" station", "").replace(" metro", "").replace(" tram stop", "").strip()


def build(raw, today=None):
    elements = (raw or {}).get("elements") or []
    # Lines: group route relations by kind and colour (both directions and same-colour branches are one line).
    groups = {}
    for e in elements:
        if e.get("type") != "relation":
            continue
        t = e.get("tags") or {}
        kind = kind_of_route(t)
        colour = (t.get("colour") or "").upper() or ("#E21836" if kind == "metro" else "#F7A800")
        key = (kind, colour)
        g = groups.setdefault(key, {"kind": kind, "colour": colour, "names": [], "names_ar": [], "ways": {}, "stops": set()})
        g["names"].append(clean_name(t.get("name:en") or t.get("name")))
        if t.get("name:ar"):
            g["names_ar"].append(clean_name(t["name:ar"]))
        for m in e.get("members") or []:
            if m.get("type") == "way" and m.get("geometry") and not (m.get("role") or "").startswith("platform"):
                g["ways"].setdefault(m["ref"], [(p["lat"], p["lon"]) for p in m["geometry"] if p])
            elif m.get("type") == "node" and (m.get("role") or "").startswith("stop") and m.get("lat") is not None:
                g["stops"].add((round(m["lat"], 5), round(m["lon"], 5)))
    lines = []
    for (kind, colour), g in sorted(groups.items(), key=lambda kv: (kv[0][0] != "metro", kv[0][1])):
        if not g["ways"]:
            continue
        name = max(set(g["names"]), key=g["names"].count)
        lid = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or kind
        if any(l["id"] == lid for l in lines):
            lid += "-" + colour.strip("#").lower()
        paths = [[[round(a, 5), round(b, 5)] for a, b in simplify(w)] for w in g["ways"].values() if len(w) >= 2]
        lines.append({"id": lid, "name": name, "name_ar": (max(set(g["names_ar"]), key=g["names_ar"].count) if g["names_ar"] else ""),
                      "kind": kind, "colour": colour, "paths": paths, "_stops": g["stops"], "_raw": list(g["ways"].values())})

    # Stations: named station nodes (or station areas' centres), one per name and kind.
    found = {}
    for e in elements:
        if e.get("type") not in ("node", "way"):
            continue
        t = e.get("tags") or {}
        kind = station_kind(t)
        name = t.get("name:en") or t.get("name")
        lat = e.get("lat", (e.get("center") or {}).get("lat"))
        lng = e.get("lon", (e.get("center") or {}).get("lon"))
        if not kind or not name or lat is None:
            continue
        if not (BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lng <= BBOX[3]):
            continue
        key = (kind, norm(name))
        # A station building or area beats a stop position; otherwise the first one wins.
        rank = 0 if t.get("railway") == "station" else 1
        if key not in found or rank < found[key]["_rank"]:
            found[key] = {"name": name.strip(), "name_ar": (t.get("name:ar") or "").strip(), "kind": kind,
                          "lat": round(lat, 5), "lng": round(lng, 5), "_rank": rank}
    # Same name a few hundred metres apart (two stop positions of one tram stop): keep one.
    stations = []
    for s in sorted(found.values(), key=lambda s: (s["kind"], s["name"])):
        on = []
        for l in lines:
            if l["kind"] != s["kind"]:
                continue
            near = any(metres((s["lat"], s["lng"]), stop) <= NEAR_LINE_M * 2 for stop in l["_stops"]) or any(
                to_segment((s["lat"], s["lng"]), w[i], w[i + 1]) <= NEAR_LINE_M for w in l["_raw"] for i in range(len(w) - 1))
            if near:
                on.append(l["id"])
        if not on:
            continue  # a station of a line that isn't running (or isn't ours)
        s.pop("_rank")
        s["lines"] = on
        stations.append(s)
    for l in lines:
        l.pop("_stops"), l.pop("_raw")
    return {"fetched": today or datetime.date.today().isoformat(), "source": SOURCE, "lines": lines, "stations": stations}


def check(out):
    """Reasons the result can't replace the current file (empty list = fine)."""
    n = lambda what, kind: sum(1 for x in out[what] if x["kind"] == kind)
    bad = []
    if n("lines", "metro") < MIN["metro_lines"]:
        bad.append(f"only {n('lines', 'metro')} metro lines")
    if n("stations", "metro") < MIN["metro_stations"]:
        bad.append(f"only {n('stations', 'metro')} metro stations")
    if n("lines", "tram") < MIN["tram_lines"]:
        bad.append("no tram line")
    if n("stations", "tram") < MIN["tram_stations"]:
        bad.append(f"only {n('stations', 'tram')} tram stops")
    return bad


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--from-file", help="an Overpass JSON response saved earlier (tests, offline runs)")
    ap.add_argument("--save-raw", help="also save the Overpass response here (to check a change)")
    a = ap.parse_args(argv)
    try:
        raw = json.load(open(a.from_file, encoding="utf-8")) if a.from_file else fetch()
        if a.save_raw:
            with open(a.save_raw, "w", encoding="utf-8") as f:
                json.dump(raw, f, ensure_ascii=False)
    except net.StopForToday as e:
        net.log(f"Overpass not reachable ({e}); keeping the current file", "transit")
        return 0
    out = build(raw)
    bad = check(out)
    for l in out["lines"]:
        net.log(f"{l['kind']:5} {l['name']} {l['colour']}: {len(l['paths'])} tracks, "
                f"{sum(1 for s in out['stations'] if l['id'] in s['lines'])} stations", "transit")
    if bad:
        net.log("not saved: " + "; ".join(bad), "transit")
        return 1
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    net.log(f"saved {a.out}: {len(out['lines'])} lines, {len(out['stations'])} stations", "transit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
