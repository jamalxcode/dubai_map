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


def build(raw, today=None):
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
        raw = json.load(open(a.from_file, encoding="utf-8")) if a.from_file else fetch()
    except net.StopForToday as e:
        net.log(f"Overpass not reachable ({e}); keeping the current file", "hotels")
        return 0
    if a.save_raw:
        with open(a.save_raw, "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False)
    out = build(raw)
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
