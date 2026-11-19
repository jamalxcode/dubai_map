"""Our own hotel and holiday home price history: data/stay_history.json, one snapshot a day, never deleted.

Xotelo only ever gives today's prices, so without this the site can't say whether a night in an area is getting
dearer. After each pull's build, every place with a current price (hotel_prices.json, holiday_homes.json and serp_stays.json:
prices checked in the last 10 days) is put in its area by the same rule as the page (Transit.assign in transit.js: the
official outline that holds it, else the nearest area point within 1.5 km), and each area's median price a night
is saved with how many places it rests on, plus the median for all of Dubai. One entry per day: a later pull the
same day replaces that day's entry. Days are never removed (as with the rent history, it is the only record).

Prices are refreshed on a rolling basis (each place every couple of days), so a day's figure is the median of the
last few days' prices: a smoothed series, not a single night's price. Dubai's hotel prices swing with the seasons
and events, so the page shows the series as it is and only compares like with like (a change is shown against a
day at least four weeks earlier, from at least 3 places on both days).

{"about": "...", "days": [{"d": "YYYY-MM-DD", "hotels": {"all": [median, n], "areas": {label: [median, n]}},
                           "homes": {...}}, ...]}

Usage: python3 collector/stay_history.py   (after collector/build.py, which writes areas.json)
"""
import json
import math
import os
import statistics
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store  # noqa: E402

MAX_M = 1500
KEEP_DAYS = 10
ABOUT = ("Median price a night per area, from the hotel and holiday home prices current on each day "
         "(Xotelo: lowest believable offer on booking sites, one room or unit, 2 adults); [median, places].")


def path(name):
    return os.path.join(store.DATA, name)


def load(name, default=None):
    try:
        with open(path(name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def metres(a, b):
    k = 111320.0
    return math.hypot((a[0] - b[0]) * k, (a[1] - b[1]) * k * math.cos(math.radians((a[0] + b[0]) / 2)))


def in_ring(p, ring):
    """p = (lat, lng); ring = [(lat, lng), ...] (the same test as transit.js inRing)."""
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]
        yj, xj = ring[j]
        if (yi > p[0]) != (yj > p[0]) and p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def assigner(areas, outlines):
    boxed, have = [], {a["label"] for a in areas if a.get("lat") is not None}  # as the page: outlines of placed areas only
    for o in outlines:
        if o.get("label") not in have:
            continue
        rings = [[(y, x) for x, y in r] for r in o.get("rings") or []]
        pts = [p for r in rings for p in r]
        if pts:
            boxed.append((o["label"], rings, min(p[0] for p in pts), max(p[0] for p in pts), min(p[1] for p in pts), max(p[1] for p in pts)))
    placed = [(a["label"], (a["lat"], a["lng"])) for a in areas if a.get("lat") is not None and a.get("lng") is not None]

    def area_of(lat, lng):
        for label, rings, s, n, w, e in boxed:
            if s <= lat <= n and w <= lng <= e and any(len(r) > 2 and in_ring((lat, lng), r) for r in rings):
                return label
        best, bm = None, MAX_M
        for label, pt in placed:
            m = metres((lat, lng), pt)
            if m <= bm:
                best, bm = label, m
        return best
    return area_of


def summarise(rows, area_of, today):
    """rows: [name, lat, lng, price, nights, lo, hi, checked, ...] -> {"all": [m, n], "areas": {label: [m, n]}}."""
    cutoff = (today - timedelta(days=KEEP_DAYS)).isoformat()
    by, every = {}, []
    for r in rows or []:
        if len(r) < 8 or not r[3] or (r[7] and r[7] < cutoff):
            continue
        every.append(r[3])
        a = area_of(r[1], r[2])
        if a:
            by.setdefault(a, []).append(r[3])
    if not every:
        return None
    return {"all": [round(statistics.median(every)), len(every)],
            "areas": {k: [round(statistics.median(v)), len(v)] for k, v in sorted(by.items())}}


def main(today=None):
    today = today or date.today()
    areas = (load("areas.json") or {}).get("areas") or []
    outlines = (load("outlines.json") or {}).get("areas") or []
    if not areas:
        print("stay_history: no areas.json; nothing saved")
        return 0
    area_of = assigner(areas, outlines)
    day = {"d": today.isoformat()}
    serp = load("serp_stays.json") or {}  # Google Hotels via SerpApi: hotels Xotelo hasn't priced, and extra rentals
    for kind, name, key in (("hotels", "hotel_prices.json", "hotels"), ("homes", "holiday_homes.json", "homes")):
        s = summarise(((load(name) or {}).get(key) or []) + (serp.get(key) or []), area_of, today)
        if s:
            day[kind] = s
    if len(day) == 1:
        print("stay_history: no current prices; nothing saved")
        return 0
    hist = load("stay_history.json") or {}
    days = [d for d in hist.get("days") or [] if d.get("d") != day["d"]] + [day]
    days.sort(key=lambda d: d["d"])
    with open(path("stay_history.json"), "w", encoding="utf-8") as f:
        json.dump({"about": ABOUT, "days": days}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"stay_history: {len(days)} days; today: " + ", ".join(f"{k} {v['all'][1]} places, median AED {v['all'][0]}" for k, v in day.items() if k != "d"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
