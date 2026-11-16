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


def pairs_dred(rows, areas):
    """dred names communities much like ours ("Jumeirah Village Circle"): match by name, compare
    with our all-homes median."""
    by_name = {norm(a["label"]): a for a in areas}
    for r in rows:
        a = by_name.get(norm(r["area"]))
        if a and a.get("median"):
            yield a["label"], "all homes", a["median"], int(r["median"])


def pairs_ccp(rows, areas):
    """ccp uses official DLD area names: match an area of ours that lists exactly that DLD
    area, and compare the same unit size."""
    owners = {}
    for a in areas:
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
