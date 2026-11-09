"""Build the small static JSON files the map loads.

  data/areas.json   per-community stats for the last 12 months
  data/latest.json  individual contracts that started in the last 30 days
  data/meta.json    freshness, counts, unmatched area names
"""
import csv
import json
import os
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store  # noqa: E402

LATEST_DAYS = 30
STATS_DAYS = 365
LATEST_CAP = 15000


def load_locations():
    with open(os.path.join(store.DATA, "area_locations.csv"), encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    exact = {r["match"]: r for r in rows if r["field"] == "area"}
    fuzzy = sorted((r for r in rows if r["field"] == "any"), key=lambda r: -len(r["match"]))
    return exact, fuzzy


def locate(rec, exact, fuzzy):
    area = rec["area"].lower().strip()
    if area in exact:
        return exact[area]
    text = " | ".join((rec["master_project"], rec["project"], rec["area"])).lower()
    for r in fuzzy:
        if r["match"] in text:
            return r
    return None


def med(xs):
    return round(statistics.median(xs)) if xs else None


def pct(xs, q):
    if not xs:
        return None
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(q * len(xs)))])


def unit(rec):
    return rec["rooms"] or rec["sub_type"] or rec["prop_type"] or "Unknown"


def main():
    exact, fuzzy = load_locations()
    today = store.today_dubai()
    stats_from = (today - timedelta(days=STATS_DAYS)).isoformat()
    latest_from = (today - timedelta(days=LATEST_DAYS)).isoformat()
    to = today.isoformat()

    groups = defaultdict(list)
    places = {}
    unmatched = Counter()
    latest = []
    total = 0
    newest = ""
    for rec in store.iter_all():
        total += 1
        s = rec["start"]
        if s > to or s < stats_from:
            continue
        newest = max(newest, s)
        loc = locate(rec, exact, fuzzy)
        label = loc["label"] if loc else rec["area"]
        if loc:
            places[label] = (float(loc["lat"]), float(loc["lng"]))
        else:
            unmatched[rec["area"]] += 1
        groups[label].append(rec)
        if s >= latest_from:
            latest.append({
                "s": s, "e": rec["end"], "a": int(float(rec["annual"])),
                "sq": float(rec["size_sqm"]) if rec["size_sqm"] else None,
                "u": unit(rec), "t": rec["reg_type"], "ar": rec["area"],
                "c": label, "mp": rec["master_project"], "p": rec["project"],
                "m": 1 if loc else 0,
            })

    areas = []
    for label, recs in groups.items():
        annual = [float(r["annual"]) for r in recs]
        per_sqm = [float(r["annual"]) / float(r["size_sqm"]) for r in recs
                   if r["size_sqm"] and float(r["size_sqm"]) >= 10]
        by_unit = defaultdict(list)
        by_month = defaultdict(list)
        by_proj = defaultdict(list)
        types = Counter()
        for r in recs:
            by_unit[unit(r)].append(float(r["annual"]))
            by_month[r["start"][:7]].append(float(r["annual"]))
            by_proj[r["project"] or r["master_project"] or "—"].append(float(r["annual"]))
            types[r["reg_type"] or "Unknown"] += 1
        lat, lng = places.get(label, (None, None))
        areas.append({
            "label": label, "lat": lat, "lng": lng,
            "dld_areas": sorted({r["area"] for r in recs}),
            "n": len(recs), "median": med(annual),
            "p25": pct(annual, .25), "p75": pct(annual, .75),
            "median_sqm": med(per_sqm),
            "reg_types": dict(types.most_common()),
            "by_unit": sorted(({"u": k, "n": len(v), "median": med(v)} for k, v in by_unit.items()),
                              key=lambda x: -x["n"])[:12],
            "monthly": [{"m": k, "n": len(v), "median": med(v)} for k, v in sorted(by_month.items())],
            "top_projects": sorted(({"p": k, "n": len(v), "median": med(v)} for k, v in by_proj.items()),
                                   key=lambda x: -x["n"])[:15],
        })
    areas.sort(key=lambda a: -a["n"])
    latest.sort(key=lambda r: r["s"], reverse=True)

    try:
        with open(os.path.join(store.DATA, "state.json")) as f:
            state = json.load(f)
    except (OSError, ValueError):
        state = {}

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    write("areas.json", {"generated_at": now, "from": stats_from, "to": to, "areas": areas})
    write("latest.json", {"generated_at": now, "from": latest_from, "to": to,
                          "truncated": len(latest) > LATEST_CAP, "rows": latest[:LATEST_CAP]})
    in_window = sum(a["n"] for a in areas)
    mapped = sum(a["n"] for a in areas if a["lat"] is not None)
    write("meta.json", {
        "generated_at": now, "total_contracts_stored": total,
        "contracts_last_12m": in_window, "mapped_last_12m": mapped,
        "newest_start_date": newest or None,
        "unmatched_areas": [{"area": k, "n": v} for k, v in unmatched.most_common(60)],
        "state": state,
        "source": "Dubai Land Department Ejari rent contracts via Dubai Pulse open data",
    })
    print(f"built: {total} stored, {in_window} in 12m window, {mapped} mapped, "
          f"{len(areas)} groups, {len(latest)} latest rows")


def write(name, obj):
    with open(os.path.join(store.DATA, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")


if __name__ == "__main__":
    main()
