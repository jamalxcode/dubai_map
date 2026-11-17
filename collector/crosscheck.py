"""Compare our published medians with the cross-check sources (fetch_crosscheck.py).

The sources measure slightly different things (dred: new contracts only, apartments of any
size; ccp: all contracts by official DLD area and unit size), so this flags large gaps for a
person to look at; it never changes our figures. The result goes into meta.json -> sources,
where the page lists it under "Where the numbers come from".
"""
import csv
import os
import re

import state as st
import store

TOLERANCE = 0.15  # within 15% counts as agreeing
NAMES = {"dred": "Dubai Real Estate Data (dubairealestatedata.com), cross-check",
         "ccp": "Continental Club Property (continentalclub.ae), cross-check"}


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower().replace("'", "")).strip()


def load(key):
    try:
        with open(os.path.join(store.DATA, "crosscheck", key + ".csv"), encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except OSError:
        return []


def small_flats(area):
    """Our figure for studios to 2 bedrooms: the contract-weighted average of those medians. Dubai Data
    labels every bedroom row "apartments", but in villa communities the 3+ bedroom rows are mostly
    villas and townhouses (Al Furjan: 652 four-bedroom rentals, 68 four-bedroom sales), so they are
    left out of a comparison with a flats-only source. None without counted figures."""
    units = [u for u in area.get("by_unit") or []
             if u.get("median") and u.get("n") and re.match(r"(Studios|[12]-bedroom)", u.get("u", ""))]
    n = sum(u["n"] for u in units)
    return round(sum(u["median"] * u["n"] for u in units) / n) if n else None


def pairs_dred(rows, areas):
    """dred names communities much like ours ("Jumeirah Village Circle"): match by name. Its figures
    are for apartments only, so compare with our studio-to-2-bedroom figure, not the all-homes median
    (which includes villas and runs 15-30% higher in villa communities)."""
    areas = [a for a in areas if a.get("source") != "ccp"]  # never compare a source with itself
    by_name = {norm(a["label"]): a for a in areas}
    for r in rows:
        a = by_name.get(norm(r["area"]))
        ours = a and small_flats(a)
        if ours:
            yield a["label"], "studios to 2 beds", ours, int(r["median"])


def pairs_ccp(rows, areas):
    """ccp uses official DLD area names: match an area of ours that lists exactly that DLD
    area, and compare the same unit size."""
    owners = {}
    for a in areas:
        if a.get("source") == "ccp":
            continue
        for d in a.get("dld_areas") or []:
            owners.setdefault(norm(d), []).append(a)
    for r in rows:
        hit = owners.get(norm(r["area"])) or []
        if len(hit) != 1:
            continue  # unknown, or a DLD area split between several of our areas
        a = hit[0]
        u = next((x for x in a.get("by_unit") or [] if x.get("u") == r["unit"] and x.get("median")), None)
        if u:
            yield a["label"], r["unit"], u["median"], int(r["median"])


def compare(areas, state=None):
    """One sources entry per cross-check source: how many matched figures agree."""
    state = state if state is not None else st.load()
    out = []
    for key, pairs in (("dred", pairs_dred), ("ccp", pairs_ccp)):
        block = (state.get("crosscheck") or {}).get(key) or {}
        rows = load(key)
        entry = {"name": NAMES[key], "kind": "cross-check", "through": block.get("through")}
        if not rows:
            kind = block.get("state") or "not_run"
            entry.update(state=kind, status=block.get("status") or st.text(kind))
            out.append(entry)
            continue
        diffs = []
        for label, unit, ours, theirs in pairs(rows, areas):
            pct = (ours - theirs) / theirs
            diffs.append({"area": label, "unit": unit, "ours": ours, "theirs": theirs, "pct": round(pct * 100, 1)})
        agree = sum(1 for d in diffs if abs(d["pct"]) <= TOLERANCE * 100)
        when = f", their data to {block['through']}" if block.get("through") else ""
        if diffs:
            entry.update(state="ok", matched=len(diffs), agree=agree,
                         status=f"ok: {agree} of {len(diffs)} matching figures within {TOLERANCE:.0%} of ours{when}",
                         largest_gaps=sorted(diffs, key=lambda d: -abs(d["pct"]))[:5])
        else:
            entry.update(state="ok", matched=0, agree=0, status=f"ok: no areas to compare yet{when}")
        if block.get("state") == "failed":  # an old file is still compared, but say the refresh failed
            entry["status"] += f" (latest refresh {block.get('status')})"
        out.append(entry)
    return out


SHORT = {"dred": "Dubai Real Estate Data", "ccp": "Continental Club Property"}


def gaps(areas, state=None):
    """Per area, the cross-check figures more than TOLERANCE away from ours:
    {label: [{source, unit, ours, theirs, pct}]}, pct = how far ours is above (+) or below (-) theirs."""
    out = {}
    for key, pairs in (("dred", pairs_dred), ("ccp", pairs_ccp)):
        for label, unit, ours, theirs in pairs(load(key), areas):
            pct = round((ours - theirs) / theirs * 100, 1)
            if abs(pct) > TOLERANCE * 100:
                out.setdefault(label, []).append({"source": SHORT[key], "unit": unit, "ours": ours, "theirs": theirs, "pct": pct})
    return out
