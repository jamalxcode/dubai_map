"""Hotels in Dubai from OpenStreetMap (ODbL), for the map's Hotels view.

One Overpass API request a week (geocode.yml, "Place unplaced areas", with the Metro and Tram): every place
OpenStreetMap tags as a hotel, hotel apartment, hostel, guest house or motel inside Dubai, with its name
(English and Arabic), star rating where tagged, and position (a building's centre). Written to data/hotels.json:

    {"fetched": "YYYY-MM-DD", "source": "...", "hotels": [[name, name_ar, kind, stars or null, lat, lng], ...]}

Kinds: "hotel", "apartments" (hotel apartments), "hostel", "guest" (guest houses and motels). The page counts
hotels per area from the official community outlines. No prices: OpenStreetMap has none, and booking sites'
prices are not ours to copy (docs/DECISIONS.md, the hotels pass). The result is checked before it replaces the
current file: at least 300 places, all inside Dubai; otherwise the current file stays.

Usage: python3 collector/hotels.py [--out data/hotels.json] [--from-file overpass.json] [--save-raw raw.json]
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
from transit import BBOX, OVERPASS  # noqa: E402  (same Dubai box and Overpass endpoint)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "hotels.json")
SOURCE = "OpenStreetMap contributors (ODbL), via the Overpass API"
MIN_PLACES = 300
KINDS = {"hotel": "hotel", "apartment": "apartments", "hostel": "hostel", "guest_house": "guest", "motel": "guest"}

QUERY = """[out:json][timeout:180];
(
  nwr["tourism"~"^(hotel|apartment|hostel|guest_house|motel)$"]["name"]({bbox});
);
out center tags;
"""


def fetch():
    q = QUERY.format(bbox=",".join(str(v) for v in BBOX))
    return net.get_json(OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(), method="POST",
                        timeout=200, source="hotels")


def stars_of(tags):
    """'5', '4S', '3.5' → a number from 1 to 7; anything else → None."""
    m = re.match(r"^\s*(\d+(?:\.\d)?)", tags.get("stars") or "")
    if not m:
        return None
    v = float(m.group(1))
    return (int(v) if v == int(v) else v) if 1 <= v <= 7 else None


# Kept only inside Dubai: within Dubai Municipality's official community outlines (data/dm_outlines.json), or
# within EDGE_M of one (a hotel on a pier, an island or a coast the simplified outline cuts). The search box alone
# reaches Sharjah and Ajman.
EDGE_M = 300
# OpenStreetMap's "apartment" tag (meant for holiday flats) is often put on residential towers and staff housing.
# Such names are left out unless the place shows a sign of taking guests: a star rating, or "hotel", "suites",
# "holiday" or "stay" in its name. Staff housing and camps are left out whatever their tag.
STAFF = re.compile(r"\b(crew|staff|labou?r|camp|workers?)\b", re.I)          # staff housing, camps: never
ACCOM = re.compile(r"\baccom+[a-z]*d[a-z]*tion\b", re.I)                       # "... Accommodation" (any spelling)
TRAVELLERS = re.compile(r"\b(backpackers?|hostel|guest)\b", re.I)               # ... unless it is for travellers
RESIDENTIAL = re.compile(r"\b(tower|towers|building|bldg|residences?|complex|villa|villas|block)\b", re.I)
GUEST_SIGN = re.compile(r"\b(hotel|hotels|suites?|holiday|stay|inn|hostel|resort)\b", re.I)


def load_outlines(path=None):
    """Dubai Municipality community outlines as [(south, west, north, east, rings of (lat, lng))], or None."""
    path = path or os.path.join("data", "dm_outlines.json")
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, ValueError):
        return None
    out = []
    for rings in raw.values():
        rr = [[(y, x) for x, y in r] for r in rings if len(r) > 2]
        if rr:
            pts = [p for r in rr for p in r]
            out.append((min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts), rr))
    return out or None


def _in_ring(lat, lng, ring):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]
        yj, xj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _to_segment_m(lat, lng, a, b):
    k = 111320.0
    c = math.cos(math.radians(lat))
    px, py = 0.0, 0.0
    ax, ay = (a[1] - lng) * k * c, (a[0] - lat) * k
    bx, by = (b[1] - lng) * k * c, (b[0] - lat) * k
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) if dx or dy else 0.0
    return math.hypot(ax + t * dx - px, ay + t * dy - py)


def in_dubai(lat, lng, outlines, edge_m=EDGE_M):
    """Inside an official community outline, or within edge_m of one."""
    pad = edge_m / 111320.0 * 1.5
    for s_, w, n, e, rings in outlines:
        if not (s_ - pad <= lat <= n + pad and w - pad <= lng <= e + pad):
            continue
        for r in rings:
            if _in_ring(lat, lng, r):
                return True
        for r in rings:
            for i in range(len(r)):
                if _to_segment_m(lat, lng, r[i - 1], r[i]) <= edge_m:
                    return True
    return False


def takes_guests(name, kind, stars):
    """False for staff housing and camps, and for "apartments" that look like residential buildings."""
    if STAFF.search(name) or (ACCOM.search(name) and not TRAVELLERS.search(name)):
        return False
    if kind == "apartments" and not stars and RESIDENTIAL.search(name) and not GUEST_SIGN.search(name):
        return False
    return True


def build(raw, today=None, outlines=None):
    seen, out = set(), []
    for e in (raw or {}).get("elements") or []:
        t = e.get("tags") or {}
        kind = KINDS.get(t.get("tourism"))
        name = (t.get("name:en") or t.get("name") or "").strip()
        lat = e.get("lat", (e.get("center") or {}).get("lat"))
        lng = e.get("lon", (e.get("center") or {}).get("lon"))
        if not kind or not name or lat is None:
            continue
        if not (BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lng <= BBOX[3]):
            continue
        if t.get("disused:tourism") or t.get("abandoned") == "yes" or t.get("demolished") == "yes":
            continue
        if outlines and not in_dubai(lat, lng, outlines):
            continue  # Sharjah, Ajman: inside the search box, outside Dubai
        if not takes_guests(name, kind, stars_of(t)):
            continue
        # One place mapped twice (a building and a point inside it): same name within about 150 m.
        key = (re.sub(r"[^a-z0-9]+", "", name.lower()), round(lat, 3), round(lng, 3))
        if key in seen:
            continue
        seen.add(key)
        out.append([name, (t.get("name:ar") or "").strip(), kind, stars_of(t), round(lat, 5), round(lng, 5)])
    out.sort(key=lambda h: (h[2], h[0]))
    return {"fetched": today or datetime.date.today().isoformat(), "source": SOURCE, "hotels": out}


def check(result):
    n = len(result["hotels"])
    return [] if n >= MIN_PLACES else [f"only {n} places"]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--from-file")
    ap.add_argument("--save-raw")
    a = ap.parse_args(argv)
    try:
        if a.from_file:
            with open(a.from_file, encoding="utf-8") as f:
                raw = json.load(f)
        else:
            raw = fetch()
    except net.StopForToday as e:
        net.log(f"Overpass not reachable ({e}); keeping the current file", "hotels")
        return 0
    if a.save_raw:
        with open(a.save_raw, "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False)
    out = build(raw, outlines=load_outlines())
    bad = check(out)
    by = {}
    for h in out["hotels"]:
        by[h[2]] = by.get(h[2], 0) + 1
    net.log(f"{len(out['hotels'])} places: {by}; with stars: {sum(1 for h in out['hotels'] if h[3])}", "hotels")
    if bad:
        net.log("not saved: " + "; ".join(bad), "hotels")
        return 1
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    net.log(f"saved {a.out}", "hotels")
    return 0


if __name__ == "__main__":
    sys.exit(main())
