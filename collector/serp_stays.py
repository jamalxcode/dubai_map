"""Hotel and holiday home prices from Google Hotels, through SerpApi's free plan: data/serp_stays.json.

The owner chose SerpApi on 19 Nov as a second free price source beside Xotelo. Its free plan allows 250 searches a
month (50 an hour), so each pull makes at most two searches: one for hotels and one for vacation rentals, both for
one night two weeks ahead, 2 adults, in AED. The place searched for rotates through Dubai's areas (AREAS), so over
the month the searches cover the city rather than repeating "Dubai". Searches are counted per calendar month in
state.json and stop at MONTHLY (240, a margin under 250); a pull at most every 6 hours (duplicate triggers do
nothing).

Each search returns about 20 places with their map points and the lowest nightly rate Google shows (before taxes
and fees where given, to match Xotelo). They are used where Xotelo has no price:
  * hotels: matched to our places (data/hotels.json, OpenStreetMap) by name and position (hotel_prices.match),
    kept only for places Xotelo hasn't priced;
  * vacation rentals: added to the Holiday homes view, unless one of Xotelo's holiday homes is the same place.
Prices older than 10 days are dropped. Without SERPAPI_KEY nothing is fetched and the state says it waits for the
key. Standard library only.

Writes {"fetched", "source", "month", "used", "hotels": [[name, lat, lng, price, 1, price, price, checked, rating,
reviews, stars]], "homes": [[name, lat, lng, price, 1, price, price, checked, rating, reviews, link, token]], "seen": {...}}
"""
import argparse
import json
import os
import sys
import urllib.parse
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hotel_prices as hp  # noqa: E402
import net  # noqa: E402
import state as st  # noqa: E402
from transit import BBOX  # noqa: E402

API = os.environ.get("SERPAPI_URL") or "https://serpapi.com/search.json"
SOURCE = "Google Hotels via SerpApi: lowest nightly rate shown, one night two weeks ahead, 2 adults"
OUT = os.path.join("data", "serp_stays.json")
HOTELS = os.path.join("data", "hotels.json")
HOMES = os.path.join("data", "holiday_homes.json")
HOTEL_PRICES = os.path.join("data", "hotel_prices.json")
MONTHLY = int(os.environ.get("SERPAPI_MONTHLY") or 240)
PER_PULL = 2
MIN_HOURS = 6
AHEAD = 14
KEEP_DAYS = 10
AREAS = ["Dubai", "Dubai Marina", "Downtown Dubai", "Deira, Dubai", "Bur Dubai", "Business Bay, Dubai", "Jumeirah Beach Residence",
         "Palm Jumeirah", "Al Barsha, Dubai", "Jumeirah Village Circle, Dubai", "Jumeirah Lake Towers, Dubai", "Al Karama, Dubai",
         "Dubai Creek Harbour", "Al Qusais, Dubai", "Dubai Silicon Oasis", "Jumeirah, Dubai", "Umm Suqeim, Dubai", "Al Garhoud, Dubai",
         "Dubai Hills Estate", "Al Jaddaf, Dubai", "Dubai Sports City", "Arjan, Dubai", "Al Furjan, Dubai", "International City, Dubai"]


def price_of(p):
    r = p.get("rate_per_night") or {}
    for k in ("extracted_before_taxes_fees", "extracted_lowest"):
        v = r.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return round(v)
    return None


def parse(payload, kind, checked):
    """SerpApi's answer -> rows for one kind ("hotels" or "homes"); places outside Dubai's box or unpriced dropped."""
    rows = []
    for p in (payload or {}).get("properties") or []:
        g = p.get("gps_coordinates") or {}
        lat, lng, price = g.get("latitude"), g.get("longitude"), price_of(p)
        if not (p.get("name") and isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and price):
            continue
        if not (BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lng <= BBOX[3]) or not (hp.LOW <= price <= hp.HIGH):
            continue
        is_rental = (p.get("type") or "").lower() == "vacation rental"
        if (kind == "homes") != is_rental:
            continue
        lat, lng = round(lat, 5), round(lng, 5)
        rows.append({"name": p["name"].strip(), "lat": lat, "lng": lng, "price": price, "checked": checked,
                     "rating": p.get("overall_rating"), "reviews": p.get("reviews"), "stars": p.get("hotel_class"),
                     "link": p.get("link") or "", "token": p.get("property_token") or f"{p['name']}|{lat}|{lng}"})
    return rows


def search(key, q, kind, today, get=None):
    get = get or net.get_json
    ci = today + timedelta(days=AHEAD)
    params = {"engine": "google_hotels", "q": q, "check_in_date": ci.isoformat(), "check_out_date": (ci + timedelta(days=1)).isoformat(),
              "adults": 2, "currency": "AED", "gl": "ae", "hl": "en", "api_key": key}
    if kind == "homes":
        params["vacation_rentals"] = "true"
    # The key travels in the query string (SerpApi's way); net never logs URLs, only status codes.
    d = get(API + "?" + urllib.parse.urlencode(params), timeout=60, attempts=2, source="serp_stays") or {}
    if d.get("error"):
        if "run out" in d["error"].lower() or "limit" in d["error"].lower():
            raise net.StopForToday("SerpApi: monthly searches used up")
        if "invalid api key" in d["error"].lower():
            raise net.AuthError("SerpApi rejected the key")
        return []  # e.g. "Google hasn't returned any results for this query": not a failure of the source
    return parse(d, kind, today.isoformat())


def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def main(argv=None, today=None, get=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--force", action="store_true", help="search even if searched in the last 6 hours")
    a = ap.parse_args(argv)
    today = today or date.today()
    s = st.load()
    b = s.setdefault("serp_stays", {})
    key = os.environ.get("SERPAPI_KEY")

    def done(kind, detail="", code=0):
        st.set_status(b, kind, detail)
        b["last_run_at"] = st.now_iso()
        st.save(s)
        net.log(b["status"], "serp_stays")
        return code

    if not key:
        return done("no_key", "")
    month = today.strftime("%Y-%m")
    if b.get("month") != month:
        b["month"], b["used"] = month, 0
    if not a.force and not st.due(b, "last_try_at", min_hours=MIN_HOURS):
        net.log(f"searched {st.hours_since(b, 'last_try_at'):.1f} h ago; next after {MIN_HOURS} h", "serp_stays")
        return 0
    if b["used"] + PER_PULL > MONTHLY:
        return done("standby", f"this month's {MONTHLY} free searches are used; back on the 1st")
    b["last_try_at"] = st.now_iso()
    rot = b.get("rot", 0) % len(AREAS)
    q = AREAS[rot]
    found = {"hotels": [], "homes": []}
    try:
        for kind in ("hotels", "homes"):
            b["used"] += 1  # counted before asking: a failed search still uses the allowance
            found[kind] = search(key, q, kind, today, get)
    except net.AuthError as e:
        return done("failed", f"{e} (HTTP 401): check the SERPAPI_KEY secret")
    except net.StopForToday as e:
        return done("failed", f"{e}; the last prices stay")
    b["rot"] = rot + 1
    net.log(f"'{q}': {len(found['hotels'])} hotels, {len(found['homes'])} vacation rentals with prices", "serp_stays")

    old = load(a.out, {}) or {}
    cutoff = (today - timedelta(days=KEEP_DAYS)).isoformat()
    seen = {k: v for k, v in (old.get("seen") or {}).items() if v.get("checked", "") >= cutoff}
    for kind in ("hotels", "homes"):
        for r in found[kind]:
            seen[kind[0] + ":" + r["token"]] = dict(r, kind=kind)

    # Hotels: matched to our places, only where Xotelo has no current price.
    ours = (load(HOTELS, {}) or {}).get("hotels") or []
    xp = load(HOTEL_PRICES, {}) or {}
    priced = {hp.row_key(r[0], r[1], r[2]) for r in xp.get("hotels") or [] if len(r) >= 8 and r[7] >= cutoff}
    theirs = [{"id": k, "name": v["name"], "lat": v["lat"], "lng": v["lng"]} for k, v in seen.items() if v["kind"] == "hotels"]
    hotels = []
    for i, t in hp.match(ours, theirs).items():
        o, v = ours[i], seen[t["id"]]
        if hp.row_key(o[0], o[4], o[5]) in priced:
            continue
        hotels.append([o[0], o[4], o[5], v["price"], 1, v["price"], v["price"], v["checked"], v.get("rating"), v.get("reviews"), v.get("stars")])
    # Vacation rentals: their own places, unless one of Xotelo's holiday homes is the same one.
    xh = (load(HOMES, {}) or {}).get("places") or {}
    xo = [[p[0], "", "", None, p[1], p[2]] for p in xh.values()]
    rentals = [{"id": k, "name": v["name"], "lat": v["lat"], "lng": v["lng"]} for k, v in seen.items() if v["kind"] == "homes"]
    dup = {t["id"] for t in hp.match(xo, rentals).values()} if xo and rentals else set()
    homes = [[v["name"], v["lat"], v["lng"], v["price"], 1, v["price"], v["price"], v["checked"], v.get("rating"), v.get("reviews"), v.get("link") or "", k]
             for k, v in seen.items() if v["kind"] == "homes" and k not in dup]

    out = {"fetched": today.isoformat(), "source": SOURCE, "currency": "AED", "adults": 2, "keep_days": KEEP_DAYS,
           "month": month, "used": b["used"], "monthly": MONTHLY, "last_query": q,
           "hotels": sorted(hotels, key=lambda r: (r[1], r[2])), "homes": sorted(homes, key=lambda r: (r[1], r[2])), "seen": seen}
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    b["last_ok_at"], b["hotels"], b["homes"] = st.now_iso(), len(hotels), len(homes)
    return done("ok")


if __name__ == "__main__":
    sys.exit(main())
