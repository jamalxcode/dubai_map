"""Last-resort map points for DLD areas that are still unplaced, from OpenStreetMap.

Most DLD areas are placed from Dubai Municipality's official community
boundaries (dm_communities.csv + dld_dm_aliases.csv). Whatever is left in
data/meta.json -> unmatched_areas (usually brand-new areas DM hasn't published
yet) is looked up here with OpenStreetMap Nominatim.

A result is only accepted automatically when all checks pass:
  * it is inside Dubai;
  * it is a place or boundary (suburb, neighbourhood, quarter, village,
    administrative area, residential), not a shop, road or building;
  * its name closely matches the DLD area name.
Accepted points go to data/osm_area_points.csv (the map marks them as
approximate). Everything else is printed for a person to review.

Follows the Nominatim usage policy: identifying User-Agent, at most 1 request
per second, at most GEOCODE_TOP (default 40) lookups per run, results cached
in the CSV so an area is never looked up twice.
"""
import csv
import difflib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "osm_area_points.csv")
UA = "dubai_map-geocode/1.0 (+https://github.com/jamalxcode/dubai_map)"
VIEWBOX = "54.89,25.36,55.65,24.79"  # west,north,east,south
LAT, LNG = (24.6, 25.45), (54.85, 55.7)
PLACE_TYPES = {"suburb", "neighbourhood", "quarter", "village", "hamlet", "administrative",
               "residential", "city_district", "district", "locality", "island"}
FIELDS = ["dld_area", "lat", "lng", "osm_name", "osm_type", "score", "checked_at"]


ORDINALS = {"first": "1", "second": "2", "third": "3", "fourth": "4", "fifth": "5", "sixth": "6"}


def simplify(s):
    s = s.lower().replace("'", "").replace("-", " ")
    s = " ".join(ORDINALS.get(w, w) for w in s.split())
    s = re.sub(r"\b(dubai|united arab emirates|al)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def score(area, hit):
    name = hit.get("name") or hit.get("display_name", "").split(",")[0]
    return difflib.SequenceMatcher(None, simplify(area), simplify(name)).ratio()


def accept(area, hit):
    """True when an OSM hit is a believable place point for this DLD area."""
    lat, lng = float(hit["lat"]), float(hit["lon"])
    if not (LAT[0] <= lat <= LAT[1] and LNG[0] <= lng <= LNG[1]):
        return False
    if hit.get("type") not in PLACE_TYPES and hit.get("addresstype") not in PLACE_TYPES:
        return False
    return score(area, hit) >= 0.75


def search(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "jsonv2", "limit": 5, "viewbox": VIEWBOX, "bounded": 1})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main(search=search, sleep=time.sleep, today=None):
    try:
        with open(os.path.join(DATA, "meta.json"), encoding="utf-8") as f:
            unmatched = json.load(f).get("unmatched_areas", [])
    except (OSError, ValueError):
        unmatched = []
    try:
        with open(OUT, encoding="utf-8") as f:
            have = {r["dld_area"]: r for r in csv.DictReader(f)}
    except OSError:
        have = {}
    todo = [u["area"] for u in unmatched if u["area"] not in have][:int(os.environ.get("GEOCODE_TOP") or 40)]
    added = 0
    for i, area in enumerate(todo):
        if i:
            sleep(1.2)
        try:
            hits = search(f"{area}, Dubai")
        except Exception as e:  # noqa: BLE001
            print(f"ERR  {area}: {e}")
            continue
        good = [h for h in hits if accept(area, h)]
        if good:
            h = max(good, key=lambda h: score(area, h))
            have[area] = {"dld_area": area, "lat": f"{float(h['lat']):.5f}", "lng": f"{float(h['lon']):.5f}",
                          "osm_name": h.get("name", ""), "osm_type": h.get("type", ""),
                          "score": f"{score(area, h):.2f}", "checked_at": today or time.strftime("%Y-%m-%d")}
            added += 1
            print(f"OK   {area} -> {h.get('name')} ({h.get('type')}) {h['lat']},{h['lon']}")
        else:
            for h in hits[:3]:
                print(f"REVIEW {area} | {h.get('name')} | {h.get('type')} | {h['lat']},{h['lon']} | "
                      f"score {score(area, h):.2f}")
            if not hits:
                print(f"NONE {area}")
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, FIELDS, lineterminator="\n")
        w.writeheader()
        for k in sorted(have):
            w.writerow(have[k])
    print(f"{added} new OSM points accepted, {len(have)} in total")
    return added


if __name__ == "__main__":
    sys.exit(0 if main() is not None else 1)
