"""Dubai bus routes and marine transport (abra, water bus, water taxi, ferry), from OpenStreetMap (ODbL), for the map's
Bus and Boats layers. The Metro and Tram are in transit.py.

One Overpass API request a week (geocode.yml, "Place unplaced areas"): the bus and ferry route relations inside Dubai
with their geometry and stop members, and the ferry terminals. Written to data/routes.json as

    {"fetched": "YYYY-MM-DD", "source": "...",
     "bus":    {"routes": [{"ref", "name", "from", "to", "path": [[lat, lng], ...]}],
                "stops":  [[lat, lng, "name", ["ref", ...]], ...]},
     "marine": {"routes": [{"ref", "name", "kind": "abra"|"water bus"|"water taxi"|"ferry", "path": [[lat, lng], ...]}],
                "stations": [[lat, lng, "name", ["ref", ...]], ...]}}

A route number is mapped once per direction (and sometimes per variant): the variant with the most stops is drawn,
its ways chained into one line and simplified to about 12 m; the stops of every variant count. Coordinates keep five
decimals (about a metre). The result is checked before it replaces the current file (at least 30 bus routes and 300
bus stops); otherwise the current file stays. Marine routes are fewer and optional.

Usage: python3 collector/routes.py [--out data/routes.json] [--from-file overpass.json] [--save-raw overpass.json]
"""
import argparse
import datetime
import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
from transit import BBOX, OVERPASS, SOURCE, metres, simplify  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "routes.json")
MIN = {"bus_routes": 30, "bus_stops": 300}
TOL_M = 12
STOP_ROLES = {"stop", "platform", "stop_entry_only", "stop_exit_only", "platform_entry_only", "platform_exit_only", ""}

QUERY = """[out:json][timeout:240];
relation["route"~"^(bus|ferry)$"]({bbox})->.r;
.r out geom;
node(r.r)->.n;
.n out;
(
  node["amenity"="ferry_terminal"]({bbox});
  way["amenity"="ferry_terminal"]({bbox});
);
out center tags;
"""


def fetch():
    q = QUERY.format(bbox=",".join(str(v) for v in BBOX))
    return net.get_json(OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(), method="POST",
                        timeout=260, source="routes")


def r5(p):
    return [round(p[0], 5), round(p[1], 5)]


def chain(ways):
    """Ways (lists of points) in relation order -> one line, each way turned to continue from the last."""
    line = []
    for w in ways:
        if len(w) < 2:
            continue
        if not line:
            line = list(w)
            continue
        end = line[-1]
        if metres(end, w[-1]) < metres(end, w[0]):
            w = w[::-1]
        if not line or metres(end, w[0]) > 0.5:
            line.append(w[0])
        line.extend(w[1:])
    return line


def marine_kind(tags):
    s = " ".join(tags.get(k, "") for k in ("name", "name:en", "ref", "network", "operator", "description")).lower()
    if "abra" in s:
        return "abra"
    if "water bus" in s or "waterbus" in s:
        return "water bus"
    if "water taxi" in s or "watertaxi" in s:
        return "water taxi"
    return "ferry"


def clean(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def route_name(tags):
    return clean(tags.get("name:en") or tags.get("name") or "")


def build(raw, today=None):
    rels = [e for e in (raw or {}).get("elements") or [] if e.get("type") == "relation"]
    out = {"fetched": (today or datetime.date.today()).isoformat(), "source": SOURCE,
           "bus": {"routes": [], "stops": []}, "marine": {"routes": [], "stations": []}}
    for kind in ("bus", "ferry"):
        groups = {}
        for r in rels:
            t = r.get("tags") or {}
            if t.get("route") != kind:
                continue
            ref = clean(t.get("ref") or route_name(t))
            if not ref:
                continue
            groups.setdefault(ref, []).append(r)
        routes, stops = [], {}
        for ref, variants in sorted(groups.items(), key=lambda kv: (len(kv[0]), kv[0])):
            def stop_members(r):
                return [m for m in r.get("members") or [] if m.get("type") == "node" and m.get("role", "") in STOP_ROLES and m.get("lat") is not None]
            best = max(variants, key=lambda r: (len(stop_members(r)), len(r.get("members") or [])))
            ways = [[(p["lat"], p["lon"]) for p in m.get("geometry") or []] for m in best.get("members") or []
                    if m.get("type") == "way" and m.get("role", "") in ("", "forward", "backward") and m.get("geometry")]
            path = [r5(p) for p in simplify(chain(ways), TOL_M)] if ways else []
            t = best.get("tags") or {}
            if len(path) >= 2:
                item = {"ref": ref, "name": route_name(t), "path": path}
                if kind == "bus":
                    item["from"], item["to"] = clean(t.get("from")), clean(t.get("to"))
                else:
                    item["kind"] = marine_kind(t)
                routes.append(item)
            # Stops: every variant's stop nodes, merged by position (about 15 m) and name.
            for r in variants:
                for m in stop_members(r):
                    key = (round(m["lat"], 4), round(m["lon"], 4))
                    s = stops.setdefault(key, {"lat": m["lat"], "lng": m["lon"], "name": "", "refs": set()})
                    s["refs"].add(ref)
        names = {}
        for e in (raw or {}).get("elements") or []:
            if e.get("type") == "node" and e.get("tags"):
                names[(round(e["lat"], 4), round(e["lon"], 4))] = route_name(e["tags"])
        # Stop names come from the stop nodes' own tags when Overpass returned them (geometry members carry none).
        for key, s in stops.items():
            s["name"] = names.get(key, "")
        lst = sorted(([round(s["lat"], 5), round(s["lng"], 5), s["name"], sorted(s["refs"], key=lambda x: (len(x), x))] for s in stops.values()),
                     key=lambda x: (x[0], x[1]))
        if kind == "bus":
            out["bus"] = {"routes": routes, "stops": lst}
        else:
            # Terminals mapped on their own (no route relation) still show as stations, with no routes listed.
            for e in (raw or {}).get("elements") or []:
                t = e.get("tags") or {}
                if t.get("amenity") != "ferry_terminal":
                    continue
                lat = e.get("lat", (e.get("center") or {}).get("lat"))
                lng = e.get("lon", (e.get("center") or {}).get("lon"))
                if lat is None or lng is None:
                    continue
                if any(metres((lat, lng), (x[0], x[1])) < 120 for x in lst):
                    for x in lst:
                        if metres((lat, lng), (x[0], x[1])) < 120 and not x[2]:
                            x[2] = route_name(t)
                    continue
                lst.append([round(lat, 5), round(lng, 5), route_name(t), []])
            out["marine"] = {"routes": routes, "stations": lst}
    return out


def check(out):
    bad = []
    if len(out["bus"]["routes"]) < MIN["bus_routes"]:
        bad.append(f"only {len(out['bus']['routes'])} bus routes (at least {MIN['bus_routes']})")
    if len(out["bus"]["stops"]) < MIN["bus_stops"]:
        bad.append(f"only {len(out['bus']['stops'])} bus stops (at least {MIN['bus_stops']})")
    for group in ("bus", "marine"):
        for r in out[group]["routes"]:
            for lat, lng in r["path"]:
                if not (BBOX[0] - 0.2 <= lat <= BBOX[2] + 0.2 and BBOX[1] - 0.2 <= lng <= BBOX[3] + 0.2):
                    bad.append(f"{group} route {r['ref']} leaves Dubai")
                    break
    return bad


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--from-file", help="an Overpass JSON response saved earlier (tests, offline runs)")
    ap.add_argument("--save-raw", help="also save the Overpass response here (to check a change)")
    a = ap.parse_args(argv)
    try:
        raw = json.load(open(a.from_file, encoding="utf-8")) if a.from_file else fetch()
        if a.save_raw:
            with open(a.save_raw, "w", encoding="utf-8") as f:
                json.dump(raw, f, ensure_ascii=False)
    except net.StopForToday as e:
        net.log(f"Overpass not reachable ({e}); keeping the current file", "routes")
        return 0
    out = build(raw)
    bad = check(out)
    net.log(f"bus: {len(out['bus']['routes'])} routes, {len(out['bus']['stops'])} stops; marine: "
            f"{len(out['marine']['routes'])} routes ({', '.join(sorted({r['kind'] for r in out['marine']['routes']}))}), "
            f"{len(out['marine']['stations'])} stations", "routes")
    if bad:
        net.log("not saved: " + "; ".join(bad[:5]), "routes")
        return 1
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    net.log(f"saved {a.out} ({os.path.getsize(a.out) // 1024} KB)", "routes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
