"""Nightly prices for the Hotels view, from LiteAPI (Nuitée): data/hotel_prices.json.

Once a day (the pull runs three times a day; this waits 20 hours between fetches), for the places to stay on the map
(data/hotels.json, from OpenStreetMap) that LiteAPI also lists:
  1. LiteAPI's Dubai hotel list (GET /data/hotels), matched to our places by name and position;
  2. the cheapest room for 2 adults, one night, on four sample nights over the next month (POST /hotels/min-rates,
     in AED, batches of 200 hotels: about 20 requests a day);
  3. each hotel's average of those nights, kept when at least 2 nights had a price.
The page shows each hotel's average and each area's typical (median) hotel price.

Needs LITEAPI_KEY (a free LiteAPI account; repository secret). Without it, or when LiteAPI fails, the current file
is kept and the state says why. Prices from a sandbox (test) key are never published. Standard library only.
"""
import argparse
import json
import math
import os
import re
import statistics
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
import state as st  # noqa: E402
from transit import BBOX  # noqa: E402

API = os.environ.get("LITEAPI_URL") or "https://api.liteapi.travel/v3.0"
SOURCE = "LiteAPI (Nuitée): cheapest room for 2 adults, one night, average of sample nights over the next month"
OUT = os.path.join("data", "hotel_prices.json")
HOTELS = os.path.join("data", "hotels.json")
NIGHTS_AHEAD = (10, 16, 23, 31)  # different weekdays, all within about a month
MIN_NIGHTS = 2
MIN_HOTELS = 20  # fewer priced hotels than this looks like a failed run: keep the last prices
BATCH = 200
LOW, HIGH = 50, 60000  # AED a night: anything outside is a data error, not a price
STOP = {"hotel", "hotels", "dubai", "the", "by", "and", "&", "resort", "resorts", "suites", "suite", "apartments",
        "apartment", "hotel-apartments", "a", "an", "of", "at", "in", "llc", "uae"}


def words(name):
    return {w for w in re.findall(r"[a-z0-9]+", (name or "").lower()) if w not in STOP}


def metres(a_lat, a_lng, b_lat, b_lng):
    k = 111320.0
    return math.hypot((a_lat - b_lat) * k, (a_lng - b_lng) * k * math.cos(math.radians((a_lat + b_lat) / 2)))


def same_place(osm, lite):
    """One of ours and one of LiteAPI's are the same hotel: close together and with similar names."""
    d = metres(osm[4], osm[5], lite["lat"], lite["lng"])
    if d > 250:
        return None
    a, b = words(osm[0]), words(lite["name"])
    if not a or not b:
        return None
    j = len(a & b) / len(a | b)
    contained = a <= b or b <= a
    if (d <= 250 and (j >= 0.6 or (contained and min(len(a), len(b)) >= 2))) or (d <= 80 and (j >= 0.34 or contained)):
        return (d, -j)
    return None


def match(ours, theirs):
    """Our place index → LiteAPI hotel, each LiteAPI hotel used once (best pair first)."""
    pairs = []
    for i, o in enumerate(ours):
        for t in theirs:
            if abs(o[4] - t["lat"]) > 0.003 or abs(o[5] - t["lng"]) > 0.003:
                continue
            s = same_place(o, t)
            if s:
                pairs.append((s, i, t["id"]))
    pairs.sort()
    by_id = {t["id"]: t for t in theirs}
    used_i, used_t, out = set(), set(), {}
    for _, i, tid in pairs:
        if i in used_i or tid in used_t:
            continue
        used_i.add(i), used_t.add(tid)
        out[i] = by_id[tid]
    return out


def headers(key):
    return {"X-API-Key": key, "Content-Type": "application/json"}


def fetch_list(key):
    theirs, offset = [], 0
    while True:
        d = net.get_json(f"{API}/data/hotels?countryCode=AE&cityName=Dubai&limit=1000&offset={offset}",
                         headers=headers(key), timeout=90, source="hotel_prices")
        rows = (d or {}).get("data") or []
        for h in rows:
            lat, lng = h.get("latitude"), h.get("longitude")
            if h.get("id") and h.get("name") and isinstance(lat, (int, float)) and isinstance(lng, (int, float)) \
                    and BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lng <= BBOX[3]:
                theirs.append({"id": h["id"], "name": h["name"], "lat": lat, "lng": lng, "stars": h.get("stars")})
        if len(rows) < 1000 or offset >= 20000:
            return theirs
        offset += 1000


def price_of(row):
    """The amount from one min-rates row, whatever the field is called; None when absent."""
    for k in ("price", "minRate", "suggestedSellingPrice", "amount"):
        v = row.get(k)
        if isinstance(v, dict):
            v = v.get("amount")
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
    return None


def fetch_night(key, ids, checkin):
    """Hotel id → cheapest price for one night. Raises Sandbox for test prices."""
    out = {}
    nxt = (date.fromisoformat(checkin) + timedelta(days=1)).isoformat()
    for k in range(0, len(ids), BATCH):
        body = {"hotelIds": ids[k:k + BATCH], "occupancies": [{"adults": 2}], "checkin": checkin, "checkout": nxt,
                "currency": "AED", "guestNationality": "AE", "timeout": 20}
        d = net.get_json(f"{API}/hotels/min-rates", data=json.dumps(body).encode(), method="POST",
                         headers=headers(key), timeout=90, source="hotel_prices") or {}
        if d.get("sandbox") is True:
            raise Sandbox()
        for row in d.get("data") or []:
            hid = row.get("hotelId") or row.get("id")
            cur = (row.get("currency") or "AED").upper()
            p = price_of(row)
            if hid and p and cur == "AED" and LOW <= p <= HIGH:
                out[hid] = p
    return out


class Sandbox(Exception):
    """The key is LiteAPI's sandbox key: its prices are test data."""


def build(ours, matched, nights, today):
    rows = []
    for i, t in sorted(matched.items()):
        got = [n[t["id"]] for n in nights.values() if t["id"] in n]
        if len(got) < MIN_NIGHTS:
            continue
        o = ours[i]
        rows.append([o[0], o[4], o[5], round(statistics.fmean(got)), len(got), round(min(got)), round(max(got))])
    return {"fetched": today.isoformat(), "source": SOURCE, "currency": "AED", "adults": 2,
            "nights": sorted(nights), "matched": len(matched), "hotels": rows}


def main(argv=None, today=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--hotels", default=HOTELS)
    ap.add_argument("--force", action="store_true", help="fetch even if fetched in the last 20 hours")
    a = ap.parse_args(argv)
    today = today or date.today()
    s = st.load()
    b = s.setdefault("hotel_prices", {})
    key = os.environ.get("LITEAPI_KEY")

    def done(kind, detail="", code=0):
        st.set_status(b, kind, detail)
        b["last_run_at"] = st.now_iso()
        st.save(s)
        net.log(b["status"], "hotel_prices")
        return code

    if not key:
        return done("no_key", "")
    if not a.force and not st.due(b, "last_ok_at", min_hours=20):
        net.log("fetched in the last 20 hours; nothing to do", "hotel_prices")
        return 0
    try:
        with open(a.hotels, encoding="utf-8") as f:
            ours = json.load(f)["hotels"]
    except (OSError, ValueError, KeyError):
        return done("standby", "no hotels.json yet (the weekly places job makes it)")
    try:
        theirs = fetch_list(key)
        matched = match(ours, theirs)
        net.log(f"LiteAPI lists {len(theirs)} places in Dubai; {len(matched)} of our {len(ours)} matched", "hotel_prices")
        ids = sorted({t["id"] for t in matched.values()})
        nights = {}
        for ahead in NIGHTS_AHEAD:
            day = (today + timedelta(days=ahead)).isoformat()
            nights[day] = fetch_night(key, ids, day) if ids else {}
    except Sandbox:
        return done("failed", "this is LiteAPI's sandbox (test) key: its prices are not real, so nothing was published. "
                              "Add the live key from the LiteAPI dashboard as LITEAPI_KEY")
    except net.AuthError:
        return done("failed", "LiteAPI rejected the key (HTTP 401): check LITEAPI_KEY")
    except net.StopForToday as e:
        return done("failed", f"LiteAPI: {e}; the last prices stay on the map")
    out = build(ours, matched, nights, today)
    if len(out["hotels"]) < MIN_HOTELS:
        return done("failed", f"only {len(out['hotels'])} hotels had prices; the last prices stay on the map", code=1)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    b["last_ok_at"] = st.now_iso()
    b["hotels"] = len(out["hotels"])
    return done("ok")


if __name__ == "__main__":
    sys.exit(main())
