"""Suggest map points for communities that have none, using OpenStreetMap Nominatim.

Run manually (Actions -> Geocode missing communities). Follows the Nominatim
usage policy: identifying User-Agent, max 1 request per second, results limited
to Dubai. Prints candidates for human review; it does not edit any file.
"""
import json
import time
import urllib.parse
import urllib.request

UA = "dubai_map-geocode/1.0 (+https://github.com/jamalxcode/dubai_map)"
DUBAI = "54.89,25.36,55.65,24.79"  # viewbox lon/lat: west,north,east,south

QUERIES = {
    "The Valley": ["The Valley, Dubai", "Al Yufrah 1, Dubai"],
    "Wasl 1": ["Wasl 1, Dubai", "Al Kifaf, Dubai"],
    "Site A": ["Al Sufouh 2, Dubai", "Al Safouh Second, Dubai"],
    "800 Villas": ["Wadi Al Safa 7, Dubai"],
    "Wasl Gate": ["Wasl Gate, Dubai"],
    "Badra": ["Badrah, Dubai", "Hessyan, Dubai"],
    "Madinat Badr": ["Madinat Badr, Dubai", "Al Muhaisnah 1, Dubai"],
    "Garden View": ["Garden View Villas, Jebel Ali", "Jebel Ali Village, Dubai"],
    "JABEL ALI HILLS": ["Jebel Ali Hills, Dubai", "Saih Shuaib 1, Dubai"],
    "JABAL ALI INDUSTRIAL DEVELOPMENT": ["Jebel Ali Industrial Area 1, Dubai"],
    "Jabal Ali Village": ["Jebel Ali Village, Dubai"],
}


def search(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "jsonv2", "limit": 3, "viewbox": DUBAI, "bounded": 1})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


for community, qs in QUERIES.items():
    for q in qs:
        try:
            hits = search(q)
        except Exception as e:  # noqa: BLE001
            hits = []
            print(f"ERR {community} | {q} | {e}")
        for h in hits:
            print(f"HIT {community} | {q} | {float(h['lat']):.4f},{float(h['lon']):.4f} | "
                  f"{h.get('type')} | {h.get('display_name', '')[:110]}")
        if not hits:
            print(f"NONE {community} | {q}")
        time.sleep(1.2)
