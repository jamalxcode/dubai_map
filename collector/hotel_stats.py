"""Dubai's official hotel figures (Department of Economy and Tourism, DET), from Dubai Pulse, for the Hotels view.

The dataset "Hotel establishment performance" (dtcm_hotel_establishment_performance-open) is monthly and covers
all of Dubai: average daily rate (the average price of an occupied room for one night, AED), occupancy, revenue
per available room, length of stay, and hotels and rooms by class. There is no area breakdown.

It is read at most once a day with the rent pull (one request, 20-second wait; the file only changes once a month)
from the dataset's CSV download. Without access nothing is saved and state.json's "hotel_stats" says it is waiting
for the Dubai Pulse key (the status page shows it, and "Needs you" asks for that key); with the Dubai Pulse API key
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
import state as st  # noqa: E402

# DET's figures change once a month, so Dubai Pulse is asked at most once a day, with a short wait: it doesn't answer
# from outside the UAE without the key, and each pull used to wait about 4 minutes for that timeout.
MIN_HOURS = 20
TIMEOUT = 20
# An average room rate outside this range (AED a night) is a broken row or a different unit, not a Dubai rate.
ADR_RANGE = (100, 5000)

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
        if m["adr"] is not None and not (ADR_RANGE[0] <= m["adr"] <= ADR_RANGE[1]):
            m["adr"] = None  # not a believable room rate: left out, the rest of the month kept
        if m["occupancy"] is not None and not (0 <= m["occupancy"] <= 100):
            m["occupancy"] = None
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
            payload = net.get_json(url + "?limit=500", headers={"Authorization": "Bearer " + token}, timeout=TIMEOUT, attempts=2, source="hotel_stats")
            rows = fetch_ejari.rows_from(payload)
            if rows:
                return rows
        except net.StopForToday as e:
            last = e
    raise net.StopForToday(f"no rows from the API ({last})")


def fetch_csv():
    return net.request(CSV_URL, timeout=TIMEOUT, attempts=1, source="hotel_stats").decode("utf-8", "replace")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--from-file")
    ap.add_argument("--force", action="store_true", help="ask even if asked in the last 20 hours")
    a = ap.parse_args(argv)
    key, secret = os.environ.get("DUBAI_PULSE_KEY"), os.environ.get("DUBAI_PULSE_SECRET")
    s = st.load()
    b = s.setdefault("hotel_stats", {})

    def done(kind, detail="", code=0):
        st.set_status(b, kind, detail)
        st.save(s)
        net.log(b["status"], "hotel_stats")
        return code

    if not a.from_file and not a.force and os.environ.get("FORCE") != "1" and not st.due(b, "last_try_at", min_hours=MIN_HOURS):
        net.log(f"asked {st.hours_since(b, 'last_try_at'):.1f} h ago; monthly figures, next try after {MIN_HOURS} h", "hotel_stats")
        return 0
    if not a.from_file:
        b["last_try_at"] = st.now_iso()
    rows, text = None, ""
    try:
        if a.from_file:
            text = open(a.from_file, encoding="utf-8").read()
        elif key and secret:
            rows = fetch_api(key, secret)
        else:
            text = fetch_csv()
    except (net.StopForToday, net.AuthError) as e:
        if not (key and secret):
            return done("no_key", f"waiting for Dubai Pulse access (the same key as rent contracts); without it Dubai Pulse doesn't answer ({e})")
        return done("failed", f"Dubai Pulse: {e}; the current figures stay")
    if rows is None and text.lstrip().startswith("<"):
        return done("no_key", "Dubai Pulse answered with a web page, not the figures: permission needed (the Dubai Pulse key)")
    out = build(text, rows=rows)
    if not out["latest"]:
        return done("failed", "no believable months in Dubai Pulse's answer; the current figures stay", code=1)
    net.log(f"{len(out['months'])} months, latest {out['latest']}", "hotel_stats")
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    net.log(f"saved {a.out}", "hotel_stats")
    b["last_ok_at"], b["latest"] = st.now_iso(), out["latest"]["month"]
    return done("ok")


if __name__ == "__main__":
    sys.exit(main())
