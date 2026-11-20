"""What's near each area, from OpenStreetMap, for the map's "Near" filter and the area cards: data/lifestyle.json.

Weekly, with the places and Metro jobs (one Overpass request): beaches, golf courses, named parks, malls and schools
inside Dubai's box. For each area (its reference point in areas.json) the distance to the nearest beach, golf course,
park and mall, and how many schools are within 2 km. Distances are straight-line metres from the area's reference
point, so they say "close to a beach", not a walking time. Not saved when the answer is much smaller than usual.

Writes {"fetched", "source", "areas": {label: {"beach": m, "golf": m, "park": m, "mall": m, "schools": n}}}.
Usage: python3 collector/lifestyle.py [--from-file overpass.json] [--out data/lifestyle.json]
"""
import argparse
import json
import math
import os
import sys
import urllib.parse
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
import store  # noqa: E402
from transit import BBOX, OVERPASS  # noqa: E402

QUERY = """[out:json][timeout:180];
(
  nwr["natural"="beach"]({bbox});
  nwr["leisure"="golf_course"]({bbox});
  nwr["leisure"="park"]["name"]({bbox});
  nwr["shop"="mall"]({bbox});
  nwr["amenity"="school"]({bbox});
);
out center tags;
"""
KINDS = {"beach": lambda t: t.get("natural") == "beach", "golf": lambda t: t.get("leisure") == "golf_course",
         "park": lambda t: t.get("leisure") == "park", "mall": lambda t: t.get("shop") == "mall", "school": lambda t: t.get("amenity") == "school"}
SCHOOL_M = 2000
MIN_PLACES = 200   # Dubai has hundreds of schools alone: a smaller answer is a broken one
SOURCE = "OpenStreetMap contributors (ODbL), via the Overpass API"


def metres(a, b):
    k = 111320.0
    return math.hypot((a[0] - b[0]) * k, (a[1] - b[1]) * k * math.cos(math.radians((a[0] + b[0]) / 2)))


def places(raw):
    """Overpass elements -> {kind: [(lat, lng), ...]}."""
    out = {k: [] for k in KINDS}
    for el in (raw or {}).get("elements") or []:
        t = el.get("tags") or {}
        lat = el.get("lat", (el.get("center") or {}).get("lat"))
        lng = el.get("lon", (el.get("center") or {}).get("lon"))
        if lat is None or lng is None:
            continue
        for k, test in KINDS.items():
            if test(t):
                out[k].append((lat, lng))
    return out


def build(raw, areas, today=None):
    p = places(raw)
    res = {}
    for a in areas:
        if a.get("lat") is None:
            continue
        pt = (a["lat"], a["lng"])
        x = {k: (round(min(metres(pt, q) for q in p[k]), -1) if p[k] else None) for k in ("beach", "golf", "park", "mall")}
        x["schools"] = sum(1 for q in p["school"] if metres(pt, q) <= SCHOOL_M)
        res[a["label"]] = x
    return {"fetched": (today or date.today()).isoformat(), "source": SOURCE, "counts": {k: len(v) for k, v in p.items()}, "areas": res}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-file")
    ap.add_argument("--out", default=os.path.join(store.DATA, "lifestyle.json"))
    a = ap.parse_args(argv)
    try:
        with open(os.path.join(store.DATA, "areas.json"), encoding="utf-8") as f:
            areas = json.load(f).get("areas") or []
    except (OSError, ValueError):
        net.log("no areas.json; nothing to measure", "lifestyle")
        return 0
    if a.from_file:
        with open(a.from_file, encoding="utf-8") as f:
            raw = json.load(f)
    else:
        q = QUERY.format(bbox=",".join(str(v) for v in BBOX))
        try:
            raw = net.get_json(OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(), method="POST", timeout=200, source="lifestyle")
        except net.StopForToday as e:
            net.log(f"Overpass: {e}; the current file stays", "lifestyle")
            return 0
    out = build(raw, areas)
    if sum(out["counts"].values()) < MIN_PLACES:
        net.log(f"only {sum(out['counts'].values())} places came back; the current file stays", "lifestyle")
        return 1
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    net.log(f"{len(out['areas'])} areas measured; places: {out['counts']}", "lifestyle")
    return 0


if __name__ == "__main__":
    sys.exit(main())
