"""Placing DLD areas on the map, first match wins:

  1. data/area_locations.csv: hand-checked points (exact DLD area name, or a marketing
     name anywhere in the project);
  2. Dubai Data's area -> community table, at the checked points in community_locations.csv;
  3. official Dubai Municipality community points (dm_communities.csv) via the
     reviewed DLD spellings in dld_dm_aliases.csv;
  4. OpenStreetMap points that passed geocode_missing.py's checks (osm_area_points.csv).
"""
import csv
import os
import re

import fetch_datadubai
import store


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
    d = fetch_datadubai.out_dir()
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
