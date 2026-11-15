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
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store  # noqa: E402

LATEST_DAYS = 30
STATS_DAYS = 365
LATEST_CAP = 15000
MIN_OWN_CONTRACTS = 1000  # below this, fall back to Dubai Data community aggregates
# Our own contract stats are only shown once they cover enough of the year: a few
# weeks of contracts presented as "last 12 months" would mislead.
MIN_HISTORY_DAYS = 300
# The map is about homes. Shops, offices, labour camps and whole buildings are left
# out: one bulk camp or building lease can be worth millions and would skew medians.
RESIDENTIAL = {"residential", ""}
HOMES = {"flat", "studio", "villa", "complex villas", "penthouse", "arabian house", "villa addendum", ""}


def is_home(rec):
    return (rec.get("usage", "").lower() in RESIDENTIAL
            and rec.get("sub_type", "").lower() in HOMES)


def load_locations():
    with open(os.path.join(store.DATA, "area_locations.csv"), encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    exact = {r["match"]: r for r in rows if r["field"] == "area"}
    # Second chance for official DLD area names: Dubai Data's area -> community table,
    # placed at our checked community points. Hand-written rows above win.
    for area, row in datadubai_area_points().items():
        exact.setdefault(area, row)
    fuzzy = sorted((r for r in rows if r["field"] == "any"), key=lambda r: -len(r["match"]))
    return exact, fuzzy


def datadubai_area_points():
    import fetch_datadubai
    d = fetch_datadubai.OUT
    try:
        with open(os.path.join(d, "communities.csv"), encoding="utf-8") as f:
            by_url = {c["url"]: c["name"] for c in csv.DictReader(f)}
        with open(os.path.join(d, "areas.csv"), encoding="utf-8") as f:
            areas = list(csv.DictReader(f))
        with open(os.path.join(store.DATA, "community_locations.csv"), encoding="utf-8") as f:
            pts = {r["community"]: r for r in csv.DictReader(f)}
    except (OSError, KeyError):
        return {}
    out = {}
    for a in areas:
        name = by_url.get(a.get("url", ""))
        if name in pts:
            out[a["name"].lower().strip()] = {"label": name, "lat": pts[name]["lat"], "lng": pts[name]["lng"]}
    return out


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
    earliest = first_reg = ""
    for rec in store.iter_all():
        total += 1
        if rec.get("reg_date"):
            first_reg = min(first_reg, rec["reg_date"]) if first_reg else rec["reg_date"]
        s = rec["start"]
        if s > to or s < stats_from:
            continue
        if not is_home(rec):
            continue
        earliest = min(earliest, s) if earliest else s
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
    in_window = sum(a["n"] for a in areas)
    # How much of the year our own data really covers: by registration date when we
    # have it (start dates of renewals reach back before our history began).
    since = first_reg or earliest
    covered = (today - date.fromisoformat(since)).days if since else 0
    ready = in_window >= MIN_OWN_CONTRACTS and covered >= MIN_HISTORY_DAYS
    if not ready and build_aggregate(now, state, own={"contracts": in_window, "days": covered}):
        return
    write("areas.json", {"generated_at": now, "from": stats_from, "to": to, "areas": areas})
    write("latest.json", {"generated_at": now, "from": latest_from, "to": to,
                          "truncated": len(latest) > LATEST_CAP, "rows": latest[:LATEST_CAP]})
    mapped = sum(a["n"] for a in areas if a["lat"] is not None)
    write("meta.json", {
        "mode": "contracts",
        "generated_at": now, "total_contracts_stored": total,
        "contracts_last_12m": in_window, "mapped_last_12m": mapped,
        "newest_start_date": newest or None,
        "unmatched_areas": [{"area": k, "n": v} for k, v in unmatched.most_common(60)],
        "state": state, "sources": source_status(state),
        "source": "Dubai Land Department Ejari rent contracts (DLD open data); homes only (flats, studios, villas)",
    })
    print(f"built: {total} stored, {in_window} in 12m window, {mapped} mapped, "
          f"{len(areas)} groups, {len(latest)} latest rows")


def _num(s):
    try:
        return float(s) if s not in ("", None) else None
    except ValueError:
        return None


def source_status(state, own=None):
    """One line per source for meta.json, so a failing source is visible."""
    dld = state.get("dld") or {}
    out = [{"name": "DLD open data (main)", "status": dld.get("status", "not run yet"),
            "last_ok_at": dld.get("last_ok_at"), "backfill_complete": dld.get("backfill_complete", False)},
           {"name": "Dubai Pulse API (backup)", "status": state.get("last_api_status", "not run yet")},
           {"name": "Dubai Data community medians (backup)", "status": "in use" if own is not None else "standby"}]
    if own is not None:
        out[0]["history"] = own
    return out


def build_aggregate(now, state, own=None):
    """Community medians from Dubai Data (CC BY 4.0) when we have no own contracts."""
    import fetch_datadubai
    d = fetch_datadubai.OUT
    rents_path = os.path.join(d, "rents_by_community.csv")
    if not os.path.exists(rents_path):
        return False
    read = lambda n: list(csv.DictReader(open(os.path.join(d, n), encoding="utf-8")))  # noqa: E731
    rents = read("rents_by_community.csv")
    comms = {c["name"]: c for c in read("communities.csv")}
    beds = defaultdict(list)
    for b in read("community_bedrooms.csv"):
        if _num(b["rent_median"]):
            beds[b["community"]].append(b)
    dld_areas = defaultdict(list)
    for a in read("areas.csv"):
        dld_areas[a["url"]].append(a["name"])
    proj_pts = defaultdict(list)
    for p in read("projects.csv"):
        if p["lat"] and p["lng"]:
            proj_pts[p["community"]].append((float(p["lat"]), float(p["lng"])))
    with open(os.path.join(store.DATA, "community_locations.csv"), encoding="utf-8") as f:
        pts = {r["community"]: (float(r["lat"]), float(r["lng"])) for r in csv.DictReader(f)}

    areas, table, unplaced = [], [], []
    for r in rents:
        name, n, med_rent = r["name"], int(float(r["contracts"] or 0)), _num(r["rent_median"])
        if not med_rent:
            continue
        c = comms.get(name, {})
        pt = pts.get(name)
        if not pt and len(proj_pts.get(name, [])) >= 3:
            ps = proj_pts[name]
            pt = (statistics.median(x[0] for x in ps), statistics.median(x[1] for x in ps))
        if not pt:
            unplaced.append({"area": name, "n": n})
        by_unit = [{"u": b["label"], "n": int(float(b["n_rents"] or 0)), "median": round(float(b["rent_median"])),
                    "yield": _num(b["yield_pct"])} for b in beds.get(name, [])]
        areas.append({
            "label": name, "lat": pt[0] if pt else None, "lng": pt[1] if pt else None,
            "dld_areas": sorted(set(dld_areas.get(r["url"], []))) or ([c["top_area"]] if c.get("top_area") else []),
            "n": n, "median": round(med_rent), "p25": None, "p75": None, "median_sqm": None,
            "yield_pct": _num(r["yield_pct"]), "sale_median": _num(c.get("price_median")),
            "sale_psf": _num(c.get("psf_median")), "url": r["url"],
            "reg_types": {}, "by_unit": by_unit, "monthly": [], "top_projects": [],
        })
        for u in by_unit or [{"u": "All units", "n": n, "median": round(med_rent), "yield": _num(r["yield_pct"])}]:
            table.append({"c": name, "u": u["u"], "a": u["median"], "n": u["n"], "y": u["yield"],
                          "ar": ", ".join(areas[-1]["dld_areas"]), "url": r["url"], "m": 1 if pt else 0})
    areas.sort(key=lambda a: -a["n"])
    through = fetch_datadubai.data_through()
    write("areas.json", {"generated_at": now, "from": None, "to": through, "areas": areas})
    write("latest.json", {"generated_at": now, "mode": "aggregate", "rows": table})
    total = sum(a["n"] for a in areas)
    write("meta.json", {
        "mode": "aggregate", "generated_at": now,
        "contracts_last_12m": total, "mapped_last_12m": sum(a["n"] for a in areas if a["lat"] is not None),
        "newest_start_date": through, "data_through": through,
        "unmatched_areas": sorted(unplaced, key=lambda x: -x["n"]), "state": state,
        "sources": source_status(state, own or {}),
        "source": "Dubai Data (datadubai.ae), Continental Club Property, based on Dubai Land "
                  "Department open data (Ejari)" + (f", data through {through}" if through else "") +
                  ". CC BY 4.0. Not an official DLD product.",
    })
    print(f"built (aggregate): {len(areas)} communities, {total} contracts in 12m, "
          f"{len(unplaced)} unplaced")
    return True


def write(name, obj):
    with open(os.path.join(store.DATA, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")


if __name__ == "__main__":
    main()
