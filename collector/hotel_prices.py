"""Nightly prices for the Hotels view, from Xotelo (free, no key; rates booking sites show on TripAdvisor):
data/hotel_prices.json.

The owner chose Xotelo on 19 Nov (LiteAPI's live key needs a payment card that bookings could be charged to). On each
pull (three times a day), for the places to stay on the map (data/hotels.json, from OpenStreetMap):
  1. once a day, Xotelo's Dubai hotel list (/api/list, 100 a page, about 30 requests), matched to our places by name
     and position (within 250 m and with similar names; each of theirs used once);
  2. up to BUDGET matched hotels, never asked first and then those asked longest ago, are priced: one room for 2 adults, one
     night, on two sample nights about two weeks ahead (a weekday and a weekend night), 3 requests at a time;
  3. one night's price is the lowest offer among the booking sites, leaving out any offer under 60% of their median
     (a different room or a member rate, not what most guests pay); a hotel's price is the average of its nights.
So every matched hotel is refreshed every couple of days. Prices older than 10 days are dropped, never shown as
current. Xotelo answers in US dollars; AED = USD x 3.6725 (the fixed peg).

If most requests fail, nothing is saved and the state says why. Standard library only.
"""
import argparse
import json
import math
import os
import re
import statistics
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
import state as st  # noqa: E402
from transit import BBOX  # noqa: E402

BASE = os.environ.get("XOTELO_URL") or "https://data.xotelo.com/api"
LOCATION = "g295424"  # Dubai on TripAdvisor (Xotelo's location key)
SOURCE = "Xotelo (booking sites' rates on TripAdvisor): lowest offer for one room, 2 adults, one night; average of sample nights"
OUT = os.path.join("data", "hotel_prices.json")
HOTELS = os.path.join("data", "hotels.json")
NIGHTS_AHEAD = (14, 19)  # two weeks ahead and five days later: a different weekday, so one is often a weekend night
BUDGET = int(os.environ.get("XOTELO_BUDGET") or 100)  # hotels asked per pull: 200 requests at most, about 6 minutes
WORKERS = 3
KEEP_DAYS = 10
LIST_HOURS = 20
MIN_HOTELS = 20  # fewer matched hotels than this, after more before, looks broken: the old file stays
USD_AED = 3.6725
LOW, HIGH = 50, 60000  # AED a night: anything outside is a data error, not a price
STOP = {"hotel", "hotels", "dubai", "the", "by", "and", "&", "resort", "resorts", "suites", "suite", "apartments",
        "apartment", "hotel-apartments", "a", "an", "of", "at", "in", "llc", "uae"}


def words(name):
    return {w for w in re.findall(r"[a-z0-9]+", (name or "").lower()) if w not in STOP}


def metres(a_lat, a_lng, b_lat, b_lng):
    k = 111320.0
    return math.hypot((a_lat - b_lat) * k, (a_lng - b_lng) * k * math.cos(math.radians((a_lat + b_lat) / 2)))


def same_place(osm, lite):
    """One of ours and one of Xotelo's are the same hotel: close together and with similar names."""
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
    """Our place index → Xotelo hotel, each of theirs used once (best pair first)."""
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


def fetch_list(get=None):
    get = get or net.get_json
    theirs, offset = [], 0
    while offset < 6000:
        d = get(f"{BASE}/list?location_key={LOCATION}&limit=100&offset={offset}&sort=popularity", timeout=30, attempts=2, source="hotel_prices") or {}
        if d.get("error"):
            raise net.StopForToday(f"Xotelo: {d['error']}")
        rows = ((d.get("result") or {}).get("list")) or []
        for h in rows:
            g = h.get("geo") or {}
            lat, lng = g.get("latitude"), g.get("longitude")
            if h.get("key") and h.get("name") and isinstance(lat, (int, float)) and isinstance(lng, (int, float)) \
                    and BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lng <= BBOX[3]:
                rs = h.get("review_summary") or {}
                theirs.append({"id": h["key"], "name": h["name"], "lat": lat, "lng": lng, "type": h.get("accommodation_type") or "",
                               "url": h.get("url") or "", "rating": rs.get("rating"), "reviews": rs.get("count")})
        if len(rows) < 100:
            break
        offset += 100
    return theirs


def night_price(rates):
    """AED for one night from Xotelo's offers (USD): the lowest offer not under 60% of the offers' median."""
    vals = sorted(float(r["rate"]) for r in rates or [] if isinstance(r.get("rate"), (int, float)) and r["rate"] > 0)
    if not vals:
        return None
    med = statistics.median(vals)
    ok = [v for v in vals if v >= 0.6 * med]
    p = round(ok[0] * USD_AED)
    return p if LOW <= p <= HIGH else None


def fetch_rates(key, checkin, get=None):
    get = get or net.get_json
    out = (date.fromisoformat(checkin) + timedelta(days=1)).isoformat()
    d = get(f"{BASE}/rates?hotel_key={key}&chk_in={checkin}&chk_out={out}&adults=2&rooms=1&currency=USD",
            timeout=30, attempts=2, source="hotel_prices") or {}
    if d.get("error"):
        return None  # e.g. no availability that night: not a failure of the source
    res = d.get("result") or {}
    if (res.get("currency") or "USD").upper() != "USD":
        return None
    return night_price(res.get("rates"))


def row_key(name, lat, lng):
    return f"{name}|{lat}|{lng}"


def main(argv=None, today=None, get=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--hotels", default=HOTELS)
    ap.add_argument("--budget", type=int, default=BUDGET)
    a = ap.parse_args(argv)
    today = today or date.today()
    s = st.load()
    b = s.setdefault("hotel_prices", {})

    def done(kind, detail="", code=0):
        st.set_status(b, kind, detail)
        b["last_run_at"] = st.now_iso()
        st.save(s)
        net.log(b["status"], "hotel_prices")
        return code

    try:
        with open(a.hotels, encoding="utf-8") as f:
            ours = json.load(f)["hotels"]
    except (OSError, ValueError, KeyError):
        return done("standby", "no hotels.json yet (the weekly places job makes it)")
    try:
        with open(a.out, encoding="utf-8") as f:
            old = json.load(f)
        if "xotelo" not in (old.get("source") or "").lower():
            old = {}
    except (OSError, ValueError):
        old = {}
    keys = old.get("keys") or {}  # our place (name|lat|lng) -> Xotelo hotel key
    info = old.get("info") or {}  # our place -> [Tripadvisor rating, reviews, link], refreshed with the list
    ours_by = {row_key(o[0], o[4], o[5]): o for o in ours}
    try:
        if not keys or st.due(b, "list_at", min_hours=LIST_HOURS):
            theirs = fetch_list(get)
            if len(theirs) < 500:
                return done("failed", f"Xotelo's Dubai list had only {len(theirs)} hotels; the last prices stay")
            matched = match(ours, theirs)
            keys = {row_key(ours[i][0], ours[i][4], ours[i][5]): t["id"] for i, t in matched.items()}
            info = {row_key(ours[i][0], ours[i][4], ours[i][5]): [t.get("rating"), t.get("reviews"), t.get("url") or ""] for i, t in matched.items()}
            b["list_at"], b["listed"], b["matched"] = st.now_iso(), len(theirs), len(keys)
            net.log(f"Xotelo lists {len(theirs)} places in Dubai; {len(keys)} of our {len(ours)} matched", "hotel_prices")
    except (net.StopForToday, net.AuthError) as e:
        return done("failed", f"Xotelo: {e}; the last prices stay")
    keys = {k: v for k, v in keys.items() if k in ours_by}
    info = {k: v for k, v in info.items() if k in keys}
    cutoff = (today - timedelta(days=KEEP_DAYS)).isoformat()
    prev = {row_key(r[0], r[1], r[2]): r for r in old.get("hotels") or [] if len(r) >= 8 and r[7] >= cutoff and row_key(r[0], r[1], r[2]) in keys}
    tried = {k: v for k, v in (old.get("tried") or {}).items() if k in keys}  # when each was last asked, priced or not
    todo = sorted(keys, key=lambda k: tried.get(k, ""))[:max(0, a.budget)]  # never asked first, then the longest ago
    nights = [(today + timedelta(days=n)).isoformat() for n in NIGHTS_AHEAD]
    jobs = [(k, n) for k in todo for n in nights]
    got, errors = {}, 0

    def one(job):
        try:
            return job, fetch_rates(keys[job[0]], job[1], get), None
        except (net.StopForToday, net.AuthError) as e:
            return job, None, e

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for (k, n), p, err in ex.map(one, jobs):
            if err:
                errors += 1
            elif p:
                got.setdefault(k, []).append(p)
    if jobs and errors > len(jobs) / 2:
        return done("failed", f"Xotelo failed on {errors} of {len(jobs)} requests; the last prices stay")
    for k in todo:
        tried[k] = today.isoformat()
    for k, ps in got.items():
        o = ours_by[k]
        prev[k] = [o[0], o[4], o[5], round(statistics.fmean(ps)), len(ps), min(ps), max(ps), today.isoformat()]
    rows = sorted(prev.values(), key=lambda r: (r[1], r[2], r[0]))
    out = {"fetched": today.isoformat(), "source": SOURCE, "currency": "AED", "adults": 2, "nights": nights,
           "matched": len(keys), "keep_days": KEEP_DAYS, "hotels": rows, "keys": keys, "tried": tried, "info": info}
    net.log(f"priced {len(got)} of {len(todo)} hotels asked ({len(jobs)} requests, {errors} failed); {len(rows)} hotels have a price", "hotel_prices")
    if len(keys) < MIN_HOTELS and len(old.get("keys") or {}) >= MIN_HOTELS:  # a broken match, not fewer prices
        return done("failed", f"only {len(keys)} of our places matched Xotelo's list; the last prices stay", code=1)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    b["last_ok_at"], b["priced"], b["hotels"] = st.now_iso(), len(rows), len(rows)
    if len(rows) < MIN_HOTELS:
        return done("partial", f"{len(rows)} hotels priced so far; more each pull")
    return done("ok")


if __name__ == "__main__":
    sys.exit(main())
