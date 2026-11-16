"""Build the small static JSON files the map loads.

  data/areas.json   per-community stats for the last 12 months
  data/latest.json  individual contracts that started in the last 30 days
  data/meta.json    freshness, counts, unmatched area names
"""
import csv
import os
import statistics
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crosscheck  # noqa: E402
import fetch_datadubai  # noqa: E402
import state as st  # noqa: E402
import store  # noqa: E402
from kinds import HOME_KINDS, PROPERTY_TYPES, in_type, is_home, kind, unit  # noqa: E402,F401
import output  # noqa: E402
from output import MAX_DROP, publish, same_data, shrink_problem, write  # noqa: E402,F401
from places import load_dm_points, load_locations, locate, nice, norm_area  # noqa: E402,F401

LATEST_DAYS = 30
STATS_DAYS = 365
LATEST_CAP = 8000  # newest homes rows in the table (plus a third as many others); keeps latest.json phone-sized
MIN_OWN_CONTRACTS = 1000  # below this, fall back to Dubai Data community aggregates
# Our own contract stats are only shown once they cover enough of the year: a few
# weeks of contracts presented as "last 12 months" would mislead. Coverage is the
# number of distinct weeks in the last 52 that hold contracts (not the span from the
# oldest record, which one old import would stretch). 43 weeks is about 300 days.
MIN_HISTORY_WEEKS = 43
def med(xs):
    return round(statistics.median(xs)) if xs else None


def pct(xs, q):
    if not xs:
        return None
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(q * len(xs)))])


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
        areas.append(output.area(
            label=label, lat=lat, lng=lng,
            dld_areas=sorted({r["area"] for r in recs}),
            n=len(recs), median=med(annual),
            p25=pct(annual, .25), p75=pct(annual, .75),
            median_sqm=med(per_sqm),
            reg_types=dict(types.most_common()),
            by_unit=sorted(({"u": k, "n": len(v), "median": med(v)} for k, v in by_unit.items()),
                           key=lambda x: -x["n"])[:12],
            monthly=[{"m": k, "n": len(v), "median": med(v)} for k, v in sorted(by_month.items())],
            top_projects=sorted(({"p": k, "n": len(v), "median": med(v)} for k, v in by_proj.items()),
                                key=lambda x: -x["n"])[:15],
        ))
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
    weeks = set()  # (year, week) pairs in the last 12 months that hold at least one contract
    located = {}
    for rec in store.iter_all():
        total += 1
        # Registration date when we have it: renewals' start dates reach back before our history began.
        d = rec.get("reg_date") or rec["start"]
        if stats_from <= d <= to:
            weeks.add(date.fromisoformat(d).isocalendar()[:2])
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
        if k in HOME_KINDS:
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

    state = st.load()

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    in_window = sum(a["n"] for a in areas)
    ready = in_window >= MIN_OWN_CONTRACTS and len(weeks) >= MIN_HISTORY_WEEKS
    if not ready and build_aggregate(now, state, own={"contracts": in_window, "weeks": len(weeks)}):
        return
    files = {"areas.json": {"generated_at": now, "from": stats_from, "to": to, "type": "homes", "areas": areas}}
    counts = {"homes": in_window}
    for t, _ in PROPERTY_TYPES[1:]:
        extra = summarize(groups[t], places)
        counts[t] = sum(a["n"] for a in extra)
        files[f"areas_{t}.json"] = {"generated_at": now, "from": stats_from, "to": to, "type": t, "areas": extra}
    # Newest contracts for the table: homes first, then a share for commercial/other.
    homes_rows = [r for r in latest if r["k"] in HOME_KINDS][:LATEST_CAP]
    other_rows = [r for r in latest if r["k"] not in HOME_KINDS][:LATEST_CAP // 3]
    rows = sorted(homes_rows + other_rows, key=lambda r: r["s"], reverse=True)
    files["latest.json"] = {"generated_at": now, "from": latest_from, "to": to,
                            "truncated": len(latest) > len(rows), "rows": rows}
    mapped = sum(a["n"] for a in areas if a["lat"] is not None)
    files["meta.json"] = {
        "mode": "contracts",
        "generated_at": now, "total_contracts_stored": total,
        "contracts_last_12m": in_window, "mapped_last_12m": mapped, "n_areas": len(areas),
        "weeks_covered": len(weeks),
        "newest_start_date": newest or None,
        "property_types": [{"key": t, "label": lbl, "n": counts.get(t, 0)} for t, lbl in PROPERTY_TYPES],
        "unmatched_areas": [{"area": k, "n": v} for k, v in unmatched.most_common(60)],
        "state": public_state(state), "sources": source_status(state) + crosscheck.compare(areas, state),
        "source": "Dubai Land Department Ejari rent contracts (open data)",
    }
    publish(files)
    print(f"built: {total} stored, {in_window} homes in 12m window, {mapped} mapped, "
          f"{len(areas)} groups, {len(rows)} latest rows, types {counts}")


def _num(s):
    try:
        return float(s) if s not in ("", None) else None
    except ValueError:
        return None


def public_state(state):
    """Source state for meta.json without run timestamps (*_at): those change on every run
    (three a day) and would otherwise make unchanged rents look like new data."""
    if isinstance(state, dict):
        return {k: public_state(v) for k, v in state.items() if not k.endswith("_at")}
    return state


def source_status(state, own=None):
    """One line per source for meta.json, so a failing source is visible. `state` is
    machine-readable (see state.py); `status` is the wording the page shows."""
    def entry(name, block, **extra):
        block = block or {}
        kind = block.get("state") or "not_run"
        return {"name": name, "state": kind, "status": block.get("status") or st.text(kind), **extra}
    dld = state.get("dld") or {}
    out = [entry("DLD open-data service", dld, last_ok_at=dld.get("last_ok_at"),
                 backfill_complete=dld.get("backfill_complete", False)),
           entry("Dubai Pulse API", state.get("pulse"), last_ok_at=(state.get("pulse") or {}).get("last_ok_at")),
           {"name": "Dubai Data community medians (CC BY 4.0)",
            "state": "ok" if own is not None else "standby", "status": "in use" if own is not None else "standby"}]
    if own is not None:
        out[0]["history"] = own
    return out


def build_aggregate(now, state, own=None):
    """Community medians from Dubai Data (CC BY 4.0) when we have no own contracts."""
    d = fetch_datadubai.out_dir()
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
        areas.append(output.area(
            label=name, lat=pt[0] if pt else None, lng=pt[1] if pt else None,
            dld_areas=sorted(set(dld_areas.get(r["url"], []))) or ([c["top_area"]] if c.get("top_area") else []),
            n=n, median=round(med_rent),
            yield_pct=_num(r["yield_pct"]), sale_median=_num(c.get("price_median")),
            sale_psf=_num(c.get("psf_median")), url=r["url"], by_unit=by_unit,
        ))
        for u in by_unit or [{"u": "All units", "n": n, "median": round(med_rent), "yield": _num(r["yield_pct"])}]:
            table.append({"c": name, "u": u["u"], "a": u["median"], "n": u["n"], "y": u["yield"],
                          "ar": ", ".join(areas[-1]["dld_areas"]), "url": r["url"], "m": 1 if pt else 0})
    areas.sort(key=lambda a: -a["n"])
    through = fetch_datadubai.data_through()
    total = sum(a["n"] for a in areas)
    files = {"areas.json": {"generated_at": now, "from": None, "to": through, "type": "homes", "areas": areas},
             "latest.json": {"generated_at": now, "mode": "aggregate", "rows": table}}
    # Flats and Studios from Dubai Data's per-bedroom figures. Dubai Data has no villa
    # or commercial split, so those types are only offered once our own contracts are in use.
    counts = {"homes": total}
    for t in ("flat", "studio"):
        sub = [x for x in (aggregate_type(a, t) for a in areas) if x]
        sub.sort(key=lambda a: -a["n"])
        counts[t] = sum(a["n"] for a in sub)
        files[f"areas_{t}.json"] = {"generated_at": now, "from": None, "to": through, "type": t, "areas": sub}
    files["meta.json"] = {
        "mode": "aggregate", "generated_at": now,
        "contracts_last_12m": total, "mapped_last_12m": sum(a["n"] for a in areas if a["lat"] is not None),
        "n_areas": len(areas),
        "newest_start_date": through, "data_through": through,
        "unmatched_areas": sorted(unplaced, key=lambda x: -x["n"]), "state": public_state(state),
        "sources": source_status(state, own or {}) + crosscheck.compare(areas, state),
        "property_types": [{"key": t, "label": lbl, "n": counts[t]} for t, lbl in PROPERTY_TYPES if t in counts],
        "source": "Dubai Data (datadubai.ae), Continental Club Property, based on Dubai Land "
                  "Department open data (Ejari)" + (f", data through {through}" if through else "") +
                  ". CC BY 4.0. Not an official DLD product.",
    }
    publish(files)
    print(f"built (aggregate): {len(areas)} communities, {total} contracts in 12m, "
          f"{len(unplaced)} unplaced")
    return True


def agg_kind(label):
    """Dubai Data unit label -> our type: "Studios" -> studio, "2-bedroom apartments" -> flat."""
    lab = label.lower()
    return "studio" if lab.startswith("studio") else "flat" if "apartment" in lab else None


def aggregate_type(area, t):
    """One area's Dubai Data figures for flats or studios. Dubai Data publishes a median
    per bedroom count, not one for all flats together, so the Flats figure is the
    contract-weighted average of those medians and is labelled "typical", not "median"."""
    units = [u for u in area["by_unit"] if agg_kind(u["u"]) == t and u["n"] and u["median"]]
    if not units:
        return None
    n = sum(u["n"] for u in units)
    if len(units) == 1:
        value, kind = units[0]["median"], "median"
    else:
        value, kind = round(sum(u["median"] * u["n"] for u in units) / n / 500) * 500, "typical"
    ys = [(u["yield"], u["n"]) for u in units if u.get("yield") is not None]
    return dict(area, n=n, median=value, median_kind=kind, by_unit=units,
                yield_pct=round(sum(y * k for y, k in ys) / sum(k for _, k in ys), 2) if ys else None)


if __name__ == "__main__":
    main()
