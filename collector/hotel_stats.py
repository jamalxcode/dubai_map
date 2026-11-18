"""Dubai's official hotel figures (Department of Economy and Tourism, DET), from Dubai Pulse, for the Hotels view.

The dataset "Hotel establishment performance" (dtcm_hotel_establishment_performance-open) is monthly and covers
all of Dubai: average daily rate (the average price of an occupied room for one night, AED), occupancy, revenue
per available room, length of stay, and hotels and rooms by class. There is no area breakdown.

It is read three times a day with the rent pull (one request; the file only changes once a month) from the
dataset's CSV download. If Dubai Pulse answers that permission is needed, nothing is saved, the source is marked
"waiting for Dubai Pulse permission" and the status page lists it under "Needs you"; with the Dubai Pulse API key
(DUBAI_PULSE_KEY / _SECRET, the same as for rent contracts) it is fetched through the API instead.

Writes data/hotel_stats.json:
    {"fetched", "source", "months": [{"month": "YYYY-MM", "adr", "occupancy", "revpar", "stay", "hotels", "rooms"}, ...],
     "latest": {...the newest month...}}

Usage: python3 collector/hotel_stats.py [--out data/hotel_stats.json] [--from-file file.csv]
"""
import argparse
import csv
import datetime
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "hotel_stats.json")
CSV_URL = ("https://www.dubaipulse.gov.ae/dataset/5ce622ab-91f2-4207-a694-79ac7eb39165/resource/"
           "b4ea30a4-42ee-4d82-a7ea-98a5a1363ce4/download/hotel_establishment_performance.csv")
SOURCE = "Dubai Department of Economy and Tourism, via Dubai Pulse (Hotel establishment performance)"


def num(v):
    try:
        x = float(str(v).replace(",", "").replace("%", "").strip())
        return x if x == x else None
    except (TypeError, ValueError):
        return None


def pick(row, *names):
    """The first column whose (lower-case) name is one of names, or contains the first name as a word."""
    low = {k.strip().lower(): v for k, v in row.items() if k}
    for n in names:
        if n in low:
            return low[n]
    return None


def build(text, today=None, rows=None):
    """From the CSV text, or from the API's rows (dicts with the same column names)."""
    rows = rows if rows is not None else list(csv.DictReader(io.StringIO(text.lstrip("\ufeff"))))
    months = {}
    for r in rows:
        d = (pick(r, "report_date", "date", "month") or "").strip()[:7]
        if len(d) != 7 or d[4] != "-":
            continue
        m = {"month": d, "adr": num(pick(r, "adr", "average_daily_rate")), "occupancy": num(pick(r, "room_occupancy", "occupancy")),
             "revpar": num(pick(r, "revpar", "rev_par")), "stay": num(pick(r, "length_of_stay", "guest_length_of_stay")),
             "hotels": num(pick(r, "total_hotels")), "rooms": num(pick(r, "total_rooms_available", "total_rooms"))}
        if m["adr"] is None and m["occupancy"] is None:
            continue
        months[d] = {k: (round(v, 1) if isinstance(v, float) else v) for k, v in m.items()}
    ordered = [months[k] for k in sorted(months)]
    return {"fetched": today or datetime.date.today().isoformat(), "source": SOURCE, "months": ordered[-36:],
            "latest": ordered[-1] if ordered else None}


API_PATHS = [os.environ["HOTEL_STATS_API_URL"]] if os.environ.get("HOTEL_STATS_API_URL") else [
    "https://apis.data.dubai/open/dtcm/dtcm_hotel_establishment_performance-open-api",
    "https://api.dubaipulse.gov.ae/open/dtcm/dtcm_hotel_establishment_performance-open",
]


def fetch_api(key, secret):
    """With the Dubai Pulse key (the same as for rent contracts): the dataset's rows through the API."""
    import fetch_ejari  # token endpoints and row unwrapping shared with the rent-contract collector
    token = fetch_ejari.get_token(key, secret)
    last = None
    for url in API_PATHS:
        try:
            payload = net.get_json(url + "?limit=500", headers={"Authorization": "Bearer " + token}, source="hotel_stats")
            rows = fetch_ejari.rows_from(payload)
            if rows:
                return rows
        except net.StopForToday as e:
            last = e
    raise net.StopForToday(f"no rows from the API ({last})")


def fetch_csv():
    return net.request(CSV_URL, timeout=60, source="hotel_stats").decode("utf-8", "replace")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--from-file")
    a = ap.parse_args(argv)
    key, secret = os.environ.get("DUBAI_PULSE_KEY"), os.environ.get("DUBAI_PULSE_SECRET")
    rows, text = None, ""
    try:
        if a.from_file:
            text = open(a.from_file, encoding="utf-8").read()
        elif key and secret:
            rows = fetch_api(key, secret)
        else:
            text = fetch_csv()
    except net.StopForToday as e:
        net.log(f"Dubai Pulse not available ({e}); keeping the current file. Needs Dubai Pulse access "
                "(the same API key as rent contracts): the CSV download is refused from outside the UAE.", "hotel_stats")
        return 0
    if rows is None and text.lstrip().startswith("<"):
        net.log("Dubai Pulse answered with a web page, not the CSV (permission needed); keeping the current file", "hotel_stats")
        return 0
    out = build(text, rows=rows)
    if not out["latest"]:
        net.log("no months found in the CSV; keeping the current file", "hotel_stats")
        return 1
    net.log(f"{len(out['months'])} months, latest {out['latest']}", "hotel_stats")
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    net.log(f"saved {a.out}", "hotel_stats")
    return 0


if __name__ == "__main__":
    sys.exit(main())
