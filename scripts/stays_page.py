"""The map's copy of the places-to-stay prices: one small file instead of three (deploy, after the data is copied).

    python3 scripts/stays_page.py _site/data

Reads hotel_prices.json (Xotelo), serp_stays.json (Google Hotels via SerpApi) and holiday_homes.json from that folder
and writes stays.json with only what the map reads: each source's fetched date, source line, keep_days and price rows,
and Xotelo's rating, reviews and Tripadvisor link (info) for hotels on the map. The collectors' own notes (Xotelo's
lookup keys and retry lists, SerpApi's list of places already seen, the holiday homes asked so far) stay in the full
files, which the status page still reads. A missing source is left out; the map falls back to the full files when
stays.json itself is missing (local runs).
"""
import json
import os
import sys

KEEP = ("fetched", "source", "currency", "keep_days")


def pick(d, rows):
    if not isinstance(d, dict):
        return None
    out = {k: d[k] for k in KEEP if k in d}
    for r in rows:
        out[r] = d.get(r) or []
    return out


def build(folder):
    def load(name):
        try:
            with open(os.path.join(folder, name), encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None
    hp, sp, hh, places = load("hotel_prices.json"), load("serp_stays.json"), load("holiday_homes.json"), load("hotels.json")
    out = {}
    if hp:
        out["hotel_prices"] = pick(hp, ("hotels",))
        on_map = {f"{h[0]}|{h[4]}|{h[5]}" for h in (places or {}).get("hotels") or []}
        info = hp.get("info") or {}
        out["hotel_prices"]["info"] = {k: v for k, v in info.items() if not on_map or k in on_map}
    if sp:
        out["serp"] = pick(sp, ("hotels", "homes"))
    if hh:
        out["homes"] = pick(hh, ("homes",))
    return out


def main(folder):
    out = build(folder)
    path = os.path.join(folder, "stays.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"stays page file: {', '.join(out) or 'nothing'} → {path} ({os.path.getsize(path) // 1024} KB)")
    return out


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "_site/data")
