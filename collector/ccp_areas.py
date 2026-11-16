"""Older districts from Continental Club Property (continentalclub.ae/rents.md).

Dubai Data (our main source until Dubai Pulse is switched on) publishes master-planned
communities only, so Deira, Bur Dubai, Karama, Al Qusais and the like were missing. Continental
Club publishes median rent by unit size for ~100 official DLD areas under CC BY 4.0 (commercial
reuse allowed with credit). Here, the DLD areas no area of ours already covers are added, each
placed at its official Dubai Municipality community point.

What the source gives, and what that means on the page:
  * a median per unit size (studio, 1, 2, 3 bedrooms) and one contract count for the whole area,
    with no all-homes median and no count per unit size. The headline (map label) is the
    1-bedroom median (studio if there is none), marked median_kind "unit" so the page says so.
    Checked on JVC, where both exist: all-homes median 66k, 1-bedroom 70k, while an average of
    the unit medians would be 91k. Unit counts are left empty, not invented.
  * the same publisher as Dubai Data, so these figures are not compared with the cross-check of
    the same source (crosscheck.py skips them).
fetch_crosscheck.py downloads the page once a day into data/crosscheck/ccp.csv.
"""
import csv
import os
from collections import defaultdict

import output
import store
from places import nice, norm_area

NAME = "Continental Club Property (continentalclub.ae)"
URL = "https://continentalclub.ae/rents.md"
UNIT_ORDER = ["1-bedroom apartments", "Studios", "2-bedroom apartments", "3-bedroom apartments"]


def load_rows():
    try:
        with open(os.path.join(store.DATA, "crosscheck", "ccp.csv"), encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except OSError:
        return []


def older_districts(existing, dm, through=None):
    """Area records for DLD areas `existing` doesn't cover. Returns (areas, unplaced, table rows)."""
    covered = {norm_area(d) for a in existing for d in a.get("dld_areas") or []}
    labels = {a["label"].lower() for a in existing}
    by_area = defaultdict(list)
    for r in load_rows():
        by_area[r["area"]].append(r)
    areas, unplaced, table = [], [], []
    for name, rows in by_area.items():
        key = norm_area(name)
        label = nice(name)
        if key in covered or label.lower() in labels:
            continue
        units = sorted(({"u": r["unit"], "n": None, "median": int(r["median"]), "yield": None} for r in rows if r.get("median")),
                       key=lambda u: UNIT_ORDER.index(u["u"]) if u["u"] in UNIT_ORDER else 9)
        if not units:
            continue
        n = int(rows[0].get("n") or 0)
        head = units[0]  # 1-bedroom first (UNIT_ORDER), else studio, else the next size
        pt = dm.get(key)
        if not pt:
            unplaced.append({"area": label, "n": n})
        areas.append(output.area(
            label=label, lat=float(pt["lat"]) if pt else None, lng=float(pt["lng"]) if pt else None,
            dld_areas=[name], n=n, median=head["median"], median_kind="unit", median_unit=head["u"], by_unit=units,
            source="ccp", through=through,
        ))
        for u in units:
            table.append({"c": label, "u": u["u"], "a": u["median"], "n": None, "y": None,
                          "ar": name, "url": URL, "m": 1 if pt else 0})
    return areas, unplaced, table
