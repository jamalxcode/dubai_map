"""Build data/dm_communities.csv: one reference point per official Dubai Municipality community.

DLD's area names (e.g. "Al Murqabat", "Mankhool") are Dubai Municipality
communities. DM publishes their boundaries as open data (dm_community-open on
Dubai Pulse, Community.kml). This script turns the polygons into one point per
community that is guaranteed to lie inside it, so build.py can place every DLD
area on the map.

Sources, tried in order (the first one that loads wins; later ones fill in
communities the first lacks, e.g. ones renamed between releases):
  1. Dubai Pulse, official KML (may be unreachable from some networks)
  2. GitHub copy of DM's boundaries, April 2026 (martaferreirahuspy/dubai-realestate-gis)
  3. GitHub copy of DM's boundaries, March 2024 (Krishna99008594/MapFiles)

Run by hand or from the geocode workflow, not daily: boundaries rarely change.
Standard library only. Attribution: Dubai Municipality open data.
"""
import csv
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
import store  # noqa: E402


def out_path():
    return os.path.join(store.DATA, "dm_communities.csv")


SOURCES = [
    ("dubai_pulse_2025", "kml", "https://www.dubaipulse.gov.ae/dataset/86178b92-7d7a-4d2f-b13e-b16aedf53721/"
                                "resource/d22b4dd2-dded-4666-bc0b-97bd11e8e0a5/download/community.kml"),
    ("dm_copy_2026", "geojson", "https://raw.githubusercontent.com/martaferreirahuspy/dubai-realestate-gis/main/"
                                "dubai_communities.geojson"),
    ("dm_copy_2024", "geojson", "https://raw.githubusercontent.com/Krishna99008594/MapFiles/main/Community.geojson"),
]
DUBAI = (24.6, 25.45, 54.85, 55.7)  # lat min, lat max, lng min, lng max
HATTA = (24.7, 24.95, 56.0, 56.3)    # Dubai's Hatta exclave


def in_dubai(lat, lng):
    return any(b[0] <= lat <= b[1] and b[2] <= lng <= b[3] for b in (DUBAI, HATTA))


def ring_area_centroid(ring):
    """Signed area and centroid of a lon/lat ring (planar; fine at community scale)."""
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    a /= 2
    if abs(a) < 1e-14:
        xs, ys = zip(*ring)
        return 0.0, (sum(xs) / len(xs), sum(ys) / len(ys))
    return a, (cx / (6 * a), cy / (6 * a))


def inside(pt, ring):
    x, y = pt
    hit = False
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            hit = not hit
    return hit


def point_in_polygon(polygons):
    """A point inside the largest outer ring: its centroid if that lies inside,
    else the middle of the widest inside stretch on the centroid's latitude."""
    ring = max(polygons, key=lambda r: abs(ring_area_centroid(r)[0]))
    _, c = ring_area_centroid(ring)
    if inside(c, ring):
        return c
    y = c[1]
    xs = sorted(x0 + (y - y0) * (x1 - x0) / (y1 - y0)
                for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]) if (y0 > y) != (y1 > y))
    spans = [(xs[i], xs[i + 1]) for i in range(0, len(xs) - 1, 2)]
    if spans:
        a, b = max(spans, key=lambda s: s[1] - s[0])
        return ((a + b) / 2, y)
    return c


def outer_rings(geom):
    t, co = geom["type"], geom["coordinates"]
    rings = [co[0]] if t == "Polygon" else [p[0] for p in co] if t == "MultiPolygon" else []
    return [[(float(x), float(y)) for x, y, *_ in r][:-1] if r[0] == r[-1] else
            [(float(x), float(y)) for x, y, *_ in r] for r in rings if len(r) >= 3]


def from_geojson(text):
    for f in json.loads(text)["features"]:
        p = f["properties"]
        yield p.get("CNAME_E") or "", p.get("COMM_NUM"), outer_rings(f["geometry"])


def from_kml(text):
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    root = ET.fromstring(text)
    for pm in root.iter("{http://www.opengis.net/kml/2.2}Placemark"):
        data = {d.get("name"): (d.text or "") for d in pm.iter("{http://www.opengis.net/kml/2.2}SimpleData")}
        rings = []
        for ob in pm.iterfind(".//k:outerBoundaryIs/k:LinearRing/k:coordinates", ns):
            pts = [tuple(map(float, c.split(",")[:2])) for c in ob.text.split()]
            if len(pts) >= 3:
                rings.append(pts[:-1] if pts[0] == pts[-1] else pts)
        yield data.get("CNAME_E", ""), data.get("COMM_NUM"), rings


def load(kind, text):
    return list(from_kml(text) if kind == "kml" else from_geojson(text))


def fetch(url):
    return net.request(url, timeout=120, attempts=2, source="dm").decode("utf-8")


def build(sources):
    """sources: list of (name, kind, text). Returns rows keyed by community name."""
    rows = {}
    for name, kind, text in sources:
        for cname, num, rings in load(kind, text):
            key = re.sub(r"\s+", " ", cname.upper()).strip()
            if not key or not rings or key in rows:
                continue
            lng, lat = point_in_polygon(rings)
            if not in_dubai(lat, lng):
                continue  # outside Dubai: bad geometry, skip rather than mislead
            area_km2 = sum(abs(ring_area_centroid(r)[0]) for r in rings) * (111.32 ** 2) * math.cos(math.radians(lat))
            rows[key] = {"community": key, "comm_num": int(float(num)) if num not in (None, "") else "",
                         "lat": f"{lat:.5f}", "lng": f"{lng:.5f}", "area_km2": f"{area_km2:.2f}", "source": name}
    return rows


def write(rows, path=None):
    path = path or out_path()
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, ["community", "comm_num", "lat", "lng", "area_km2", "source"], lineterminator="\n")
        w.writeheader()
        for k in sorted(rows):
            w.writerow(rows[k])


def main(local_files=None):
    got = []
    if local_files:  # (name, kind, path) for offline runs
        got = [(n, k, open(p, encoding="utf-8").read()) for n, k, p in local_files]
    else:
        for name, kind, url in SOURCES:
            try:
                got.append((name, kind, fetch(url)))
                print(f"loaded {name}")
            except Exception as e:  # noqa: BLE001
                print(f"skip {name}: {e}")
    rows = build(got)
    if len(rows) < 150:
        sys.exit(f"only {len(rows)} communities loaded; not overwriting {out_path()}")
    write(rows)
    print(f"wrote {len(rows)} communities to {out_path()}")


if __name__ == "__main__":
    main()
