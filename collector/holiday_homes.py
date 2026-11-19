"""Holiday homes and serviced apartments for the map's Holiday homes view, from Xotelo: data/holiday_homes.json.

Xotelo's Dubai list (the rates booking sites show on TripAdvisor) has about 340 places it files as condominiums,
villas or cottages: holiday homes and serviced apartments, which OpenStreetMap mostly doesn't map as hotels. The
owner asked for them as their own view on 19 Nov. On each pull (three times a day):
  1. once a day, Xotelo's Dubai list (the same request as hotel_prices.py), keeping those kinds with a map point
     inside Dubai, each once, and leaving out any already priced as a hotel (hotel_prices.json's keys), so nothing
     shows in both views;
  2. up to BUDGET of them, never asked first and then those asked longest ago, are priced exactly as hotels are
     (hotel_prices.fetch_rates: one unit, 2 adults, two nights 14 and 19 days ahead, the lowest believable offer);
  3. prices older than 10 days are dropped.
Only priced places are written (a home without a price has nothing to show). If most requests fail, nothing is saved
and the state says why. Standard library only.

Writes {"fetched", "source", "currency", "keep_days", "nights", "listed",
        "homes": [[name, lat, lng, average, nights, lowest, highest, checked, rating, reviews, url, xotelo key], ...],
        "places": {xotelo key: [name, lat, lng, rating, reviews, url]}, "tried": {xotelo key: date}}.
"""
import argparse
import json
import os
import statistics
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hotel_prices as hp  # noqa: E402
import net  # noqa: E402
import state as st  # noqa: E402

KINDS = {"Condominium", "Villa", "Cottage"}
SOURCE = "Xotelo (booking sites' rates on TripAdvisor): lowest offer for one unit, 2 adults, one night; average of sample nights"
OUT = os.path.join("data", "holiday_homes.json")
HOTEL_PRICES = os.path.join("data", "hotel_prices.json")
BUDGET = int(os.environ.get("HOMES_BUDGET") or 50)  # places asked per pull: 100 requests at most, about 3 minutes
MIN_PLACES = 100  # Xotelo's list normally has about 300 of these: fewer means the list is broken


def main(argv=None, today=None, get=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--hotel-prices", default=HOTEL_PRICES)
    ap.add_argument("--budget", type=int, default=BUDGET)
    a = ap.parse_args(argv)
    today = today or date.today()
    s = st.load()
    b = s.setdefault("holiday_homes", {})

    def done(kind, detail="", code=0):
        st.set_status(b, kind, detail)
        b["last_run_at"] = st.now_iso()
        st.save(s)
        net.log(b["status"], "holiday_homes")
        return code

    try:
        with open(a.out, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        old = {}
    places = old.get("places") or {}
    try:
        if not places or st.due(b, "list_at", min_hours=hp.LIST_HOURS):
            theirs = hp.fetch_list(get)
            if len(theirs) < 500:
                return done("failed", f"Xotelo's Dubai list had only {len(theirs)} places; the last prices stay")
            try:
                with open(a.hotel_prices, encoding="utf-8") as f:
                    hotels = set((json.load(f).get("keys") or {}).values())
            except (OSError, ValueError):
                hotels = set()
            places = {}
            for t in theirs:
                if t.get("type") in KINDS and t["id"] not in hotels and t["id"] not in places:
                    places[t["id"]] = [t["name"], round(t["lat"], 5), round(t["lng"], 5), t.get("rating"), t.get("reviews"), t.get("url") or ""]
            if len(places) < MIN_PLACES:
                return done("failed", f"only {len(places)} holiday homes in Xotelo's list (usually about 300); the last prices stay")
            b["list_at"], b["listed"] = st.now_iso(), len(places)
            net.log(f"{len(places)} holiday homes and serviced apartments in Xotelo's Dubai list (not priced as hotels)", "holiday_homes")
    except (net.StopForToday, net.AuthError) as e:
        return done("failed", f"Xotelo: {e}; the last prices stay")
    cutoff = (today - timedelta(days=hp.KEEP_DAYS)).isoformat()
    rows = {r[11]: r for r in old.get("homes") or [] if len(r) >= 12 and r[7] >= cutoff and r[11] in places}
    tried = {k: v for k, v in (old.get("tried") or {}).items() if k in places}
    todo = sorted(places, key=lambda k: tried.get(k, ""))[:max(0, a.budget)]
    nights = [(today + timedelta(days=n)).isoformat() for n in hp.NIGHTS_AHEAD]
    jobs = [(k, n) for k in todo for n in nights]
    got, errors = {}, 0

    def one(job):
        try:
            return job, hp.fetch_rates(job[0], job[1], get), None
        except (net.StopForToday, net.AuthError) as e:
            return job, None, e

    with ThreadPoolExecutor(max_workers=hp.WORKERS) as ex:
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
        name, lat, lng, rating, reviews, url = places[k]
        rows[k] = [name, lat, lng, round(statistics.fmean(ps)), len(ps), min(ps), max(ps), today.isoformat(), rating, reviews, url, k]
    out = {"fetched": today.isoformat(), "source": SOURCE, "currency": "AED", "adults": 2, "keep_days": hp.KEEP_DAYS,
           "nights": nights, "listed": len(places), "homes": sorted(rows.values(), key=lambda r: (r[1], r[2], r[0])),
           "places": places, "tried": tried}
    net.log(f"priced {len(got)} of {len(todo)} asked ({len(jobs)} requests, {errors} failed); {len(rows)} have a price", "holiday_homes")
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    b["last_ok_at"], b["priced"] = st.now_iso(), len(rows)
    return done("ok")


if __name__ == "__main__":
    sys.exit(main())
