"""Build the small static JSON files the map loads.

  data/areas.json   per-community stats for the last 12 months
  data/latest.json  individual contracts that started in the last 30 days
  data/meta.json    freshness, counts, unmatched area names
"""
import csv
import json
import os
import re
import statistics
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store  # noqa: E402

LATEST_DAYS = 30
STATS_DAYS = 365
LATEST_CAP = 8000  # newest homes rows in the table (plus a third as many others); keeps latest.json phone-sized
MIN_OWN_CONTRACTS = 1000  # below this, fall back to Dubai Data community aggregates
# Our own contract stats are only shown once they cover enough of the year: a few
# weeks of contracts presented as "last 12 months" would mislead.
MIN_HISTORY_DAYS = 300
# Property types. "homes" (flats, studios, villas) is the default view: shops,
# offices, labour camps and whole-building leases can be worth millions each and
# would skew a homes median. The other types get their own files and filter.
RESIDENTIAL = {"residential", ""}
FLATS = {"flat", "penthouse", "apartment", ""}
STUDIOS = {"studio"}
VILLAS = {"villa", "complex villas", "villa addendum", "arabian house", "townhouse"}
COMMERCIAL_SUB = {"shop", "office", "showroom", "warehouse", "warehouse complex", "complex warehouse", "workshop",
                  "store", "kiosk", "restaurant", "clinic", "mezzanine", "parking", "hotel", "hotel apartment"}
PROPERTY_TYPES = [  # (key, label) in the order the page shows them
    ("homes", "Homes (flats, studios, villas)"), ("flat", "Flats"), ("studio", "Studios"),
    ("villa", "Villas"), ("commercial", "Commercial"), ("all", "Everything"),
]


BULK_AED_PER_SQM = 10000  # far above Dubai's dearest homes (~5k/m²/yr): the row carries a whole bulk lease


def kind(rec):
    """flat | studio | villa | commercial | other"""
    usage, sub = rec.get("usage", "").lower(), rec.get("sub_type", "").lower()
    rooms = rec.get("rooms", "").lower()
    if rec.get("prop_type", "").lower() == "land":
        return "other"
    try:
        if float(rec["annual"]) / float(rec["size_sqm"]) > BULK_AED_PER_SQM:
            return "other"  # e.g. 18 m² "flats" each carrying a 3 million AED staff-housing contract
    except (KeyError, ValueError, ZeroDivisionError):
        pass
    if usage in RESIDENTIAL:
        if sub in STUDIOS or rooms == "studio":
            return "studio"
        if sub in VILLAS:
            return "villa"
        if sub in FLATS:
            return "flat"
    if usage == "commercial" or sub in COMMERCIAL_SUB:
        return "commercial"
    return "other"  # labour camps, staff accommodation, whole buildings, land…


def in_type(k, t):
    return t == "all" or k == t or (t == "homes" and k in ("flat", "studio", "villa"))


def is_home(rec):
    return in_type(kind(rec), "homes")


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


def norm_area(name):
    """Normalise a DLD / Dubai Municipality community name for matching."""
    s = name.upper().replace("IND.", "INDUSTRIAL ").replace("'", "").replace("-", " ").replace(".", " ")
    return re.sub(r"\s+", " ", s).strip()


def load_dm_points():
    """Official Dubai Municipality community points (dm_communities.csv), keyed by normalised
    name, plus the reviewed DLD-spelling aliases (dld_dm_aliases.csv)."""
    try:
        with open(os.path.join(store.DATA, "dm_communities.csv"), encoding="utf-8") as f:
            dm = {norm_area(r["community"]): r for r in csv.DictReader(f)}
    except OSError:
        return {}
    try:
        with open(os.path.join(store.DATA, "dld_dm_aliases.csv"), encoding="utf-8") as f:
            for a in csv.DictReader(f):
                target = dm.get(norm_area(a["dm_community"]))
                if target:
                    dm[norm_area(a["dld_area"])] = target
    except OSError:
        pass
    try:  # last resort: OpenStreetMap points that passed the geocode job's checks
        with open(os.path.join(store.DATA, "osm_area_points.csv"), encoding="utf-8") as f:
            for r in csv.DictReader(f):
                dm.setdefault(norm_area(r["dld_area"]), dict(r, source="openstreetmap"))
    except OSError:
        pass
    return dm


def nice(name):
    return name if any(c.islower() for c in name) else name.title()


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


def locate(rec, exact, fuzzy, dm=None):
    """Hand-checked area rows first, then marketing names, then the official
    Dubai Municipality community the DLD area belongs to."""
    area = rec["area"].lower().strip()
    if area in exact:
        return exact[area]
    text = " | ".join((rec["master_project"], rec["project"], rec["area"])).lower()
    for r in fuzzy:
        if r["match"] in text:
            return r
    p = (dm or {}).get(norm_area(rec["area"]))
    if p:
        return {"label": nice(rec["area"]), "lat": p["lat"], "lng": p["lng"], "geo": p.get("source", "dm")}
    return None


def med(xs):
    return round(statistics.median(xs)) if xs else None


def pct(xs, q):
    if not xs:
        return None
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(q * len(xs)))])


def unit(rec):
    """Readable unit: "2 bed" when DLD records rooms, else the property sub type (Flat, Villa…)."""
    rooms = (rec["rooms"] or "").strip()
    if rooms.isdigit():
        return f"{rooms} bed"
    return rooms or rec["sub_type"] or rec["prop_type"] or "Unknown"


def summarize(groups, places):
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
    return areas


def main():
    exact, fuzzy = load_locations()
    dm = load_dm_points()
    today = store.today_dubai()
    stats_from = (today - timedelta(days=STATS_DAYS)).isoformat()
    latest_from = (today - timedelta(days=LATEST_DAYS)).isoformat()
    to = today.isoformat()

    groups = {t: defaultdict(list) for t, _ in PROPERTY_TYPES}
    places = {}
    unmatched = Counter()
    latest = []
    total = 0
    newest = ""
    earliest = first_reg = ""
    located = {}
    for rec in store.iter_all():
        total += 1
        if rec.get("reg_date"):
            first_reg = min(first_reg, rec["reg_date"]) if first_reg else rec["reg_date"]
        s = rec["start"]
        if s > to or s < stats_from:
            continue
        k = kind(rec)
        key = (rec["area"], rec["master_project"], rec["project"])
        if key not in located:
            located[key] = locate(rec, exact, fuzzy, dm)
        loc = located[key]
        label = loc["label"] if loc else rec["area"]
        if loc:
            places[label] = (float(loc["lat"]), float(loc["lng"]))
        for t, _ in PROPERTY_TYPES:
            if in_type(k, t):
                groups[t][label].append(rec)
        if k in ("flat", "studio", "villa"):
            earliest = min(earliest, s) if earliest else s
            newest = max(newest, s)
            if not loc:
                unmatched[rec["area"]] += 1
        if s >= latest_from:
            latest.append({
                "s": s, "e": rec["end"], "a": int(float(rec["annual"])),
                "sq": float(rec["size_sqm"]) if rec["size_sqm"] else None,
                "u": unit(rec), "t": rec["reg_type"], "ar": rec["area"],
                "c": label, "mp": rec["master_project"], "p": rec["project"],
                "m": 1 if loc else 0, "k": k,
            })

    areas = summarize(groups["homes"], places)
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
    write("areas.json", {"generated_at": now, "from": stats_from, "to": to, "type": "homes", "areas": areas})
    counts = {"homes": in_window}
    for t, _ in PROPERTY_TYPES[1:]:
        extra = summarize(groups[t], places)
        counts[t] = sum(a["n"] for a in extra)
        write(f"areas_{t}.json", {"generated_at": now, "from": stats_from, "to": to, "type": t, "areas": extra})
    # Newest contracts for the table: homes first, then a share for commercial/other.
    homes_rows = [r for r in latest if r["k"] in ("flat", "studio", "villa")][:LATEST_CAP]
    other_rows = [r for r in latest if r["k"] not in ("flat", "studio", "villa")][:LATEST_CAP // 3]
    rows = sorted(homes_rows + other_rows, key=lambda r: r["s"], reverse=True)
    write("latest.json", {"generated_at": now, "from": latest_from, "to": to,
                          "truncated": len(latest) > len(rows), "rows": rows})
    mapped = sum(a["n"] for a in areas if a["lat"] is not None)
    write("meta.json", {
        "mode": "contracts",
        "generated_at": now, "total_contracts_stored": total,
        "contracts_last_12m": in_window, "mapped_last_12m": mapped,
        "newest_start_date": newest or None,
        "property_types": [{"key": t, "label": lbl, "n": counts.get(t, 0)} for t, lbl in PROPERTY_TYPES],
        "unmatched_areas": [{"area": k, "n": v} for k, v in unmatched.most_common(60)],
        "state": state, "sources": source_status(state),
        "source": "Dubai Land Department Ejari rent contracts (DLD open data)",
    })
    print(f"built: {total} stored, {in_window} homes in 12m window, {mapped} mapped, "
          f"{len(areas)} groups, {len(rows)} latest rows, types {counts}")


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
        "property_types": [{"key": "homes", "label": PROPERTY_TYPES[0][1], "n": total}],
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
