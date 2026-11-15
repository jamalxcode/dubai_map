"""MAIN SOURCE: once-a-day, polite pull of Ejari rent contracts from the
Dubai Land Department's own open-data service (gateway.dubailand.gov.ae).

This is the service behind DLD's public "Real Estate Data" page. It needs no
key. It only serves contracts registered from January 2026 onward, so history
is built up here: each run pulls the last few days, and back-fills ONE missing
month per day (newest first) until January 2026 onward is complete.

Being a good citizen (same rules as fetch_ejari.py):
  * At most ONE run per Dubai calendar day (FORCE=1 overrides).
  * Requests are sequential (never parallel), with a pause between pages and a
    hard cap on pages per run.
  * On errors or "slow down", wait briefly at most twice, then stop until
    tomorrow. The backup sources take over for the map in the meantime.
  * Honest User-Agent pointing at this repo. No CAPTCHA pages are touched.

Note: DLD documents this service only through its website, not as a public
API with written terms. If DLD asks us to stop, set DLD_DISABLED=1 (repo
variable) and the backups carry on.

Env:
  DLD_DISABLED     "1" to skip this source entirely
  DLD_WINDOW_DAYS  days of registrations to re-pull each run (default 3)
  DLD_MAX_PAGES    page cap per run (default 70, 2,000 rows each)
  DLD_PAUSE        seconds between pages (default 2)
  FORCE            "1" to run even if already run today
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store  # noqa: E402

BASE = os.environ.get("DLD_BASE_URL") or "https://gateway.dubailand.gov.ae/open-data/"
UA = "dubai_map-daily/1.0 (+https://github.com/jamalxcode/dubai_map; once per day)"
REFERER = "https://dubailand.gov.ae/en/open-data/real-estate-data/"
HISTORY_START = date(2026, 1, 1)  # earliest contracts the service returns
REFRESH_DAYS, REFRESH_SLICES = 60, 10
PAGE = 2000
WINDOW_DAYS = int(os.environ.get("DLD_WINDOW_DAYS") or 3)
MAX_PAGES = int(os.environ.get("DLD_MAX_PAGES") or 70)
PAUSE = float(os.environ.get("DLD_PAUSE") or 2)
STATE = os.path.join(store.DATA, "state.json")


class StopForToday(Exception):
    """The service failed or asked us to slow down; try again tomorrow."""


class PageCap(Exception):
    """Reached this run's page cap; the rest waits for tomorrow."""


def log(msg):
    print(f"[{datetime.now(timezone.utc):%H:%M:%SZ}] dld: {msg}", flush=True)


def load_state():
    try:
        with open(STATE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(state):
    with open(STATE, "w") as f:
        json.dump(state, f, indent=2, sort_keys=True)
        f.write("\n")


class Client:
    def __init__(self, max_pages=MAX_PAGES, pause=PAUSE, sleep=time.sleep):
        self.pages, self.max_pages, self.pause, self.sleep = 0, max_pages, pause, sleep

    def post(self, cmd, payload, attempts=3):
        if self.pages >= self.max_pages:
            raise PageCap()
        if self.pages:
            self.sleep(self.pause)
        self.pages += 1
        body = json.dumps(payload).encode()
        for attempt in range(1, attempts + 1):
            req = urllib.request.Request(BASE + cmd, data=body, method="POST", headers={
                "Content-Type": "application/json", "Accept": "application/json",
                "User-Agent": UA, "Referer": REFERER})
            try:
                with urllib.request.urlopen(req, timeout=90) as res:
                    data = json.loads(res.read().decode("utf-8") or "null")
                result = ((data or {}).get("response") or {}).get("result")
                if result is None:
                    raise StopForToday("unexpected response shape (no response.result)")
                return result
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < attempts:
                    wait = min(int(e.headers.get("Retry-After") or 0) or 20 * attempt, 120)
                    log(f"HTTP {e.code}; waiting {wait}s ({attempt}/{attempts})")
                    self.sleep(wait)
                    continue
                raise StopForToday(f"HTTP {e.code}")
            except (urllib.error.URLError, TimeoutError, ValueError) as e:
                if attempt < attempts:
                    self.sleep(20 * attempt)
                    continue
                raise StopForToday(f"network: {getattr(e, 'reason', e)}")
        raise StopForToday("retries exhausted")


def payload(frm, to, take, skip):
    """Rents for a date range (P_DATE_TYPE 1, the type DLD's own page uses). Dates are MM/DD/YYYY.
    Which contract date type 1 filters on isn't documented; the refresh slices in run()
    make the result complete either way."""
    return {"P_FROM_DATE": frm.strftime("%m/%d/%Y"), "P_TO_DATE": to.strftime("%m/%d/%Y"),
            "P_DATE_TYPE": "1", "P_IS_FREE_HOLD": "", "P_VERSION": "", "P_AREA_ID": "",
            "P_USAGE_ID": "", "P_PROP_TYPE_ID": "", "P_TAKE": str(take), "P_SKIP": str(skip), "P_SORT": ""}


def pull_window(client, frm, to):
    """All contracts the service returns for frm..to (inclusive)."""
    first = client.post("rents", payload(frm, to, PAGE, 0))
    total = int(first[0].get("TOTAL") or len(first)) if first else 0
    rows = list(first)
    for skip in range(PAGE, total, PAGE):
        rows.extend(client.post("rents", payload(frm, to, PAGE, skip)))
    log(f"{frm}..{to}: {len(rows)} of {total} rows")
    return rows


def windows(month_start):
    """Split a month into ~6-day windows: deep paging on this service can drift."""
    nxt = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    out, d = [], month_start
    while d < nxt:
        end = min(d + timedelta(days=5), nxt - timedelta(days=1))
        out.append((d, end))
        d = end + timedelta(days=1)
    return out


def months_since(start, today):
    m = start
    while m <= today:
        yield m
        m = (m.replace(day=28) + timedelta(days=4)).replace(day=1)


def merge(rows):
    recs = [store.normalize(r, "dld_open_data") for r in rows]
    return store.merge(recs)


def run(state, today, client):
    """One day's work. Returns the updated 'dld' state block."""
    st = dict(state.get("dld") or {})
    st["last_run_date"] = today.isoformat()  # even a failed run counts as today's one try
    added = updated = 0
    try:
        # 1. Recent registrations (overlapping window catches late entries and corrections).
        rows = pull_window(client, today - timedelta(days=WINDOW_DAYS), today)
        a, u = merge(rows)
        added, updated = added + a, updated + u
        # 1b. Late registrations: re-pull one 6-day slice of the last 60 days per run,
        #     cycling, so every recent day is checked again about every 10 days.
        #     (Cheap: one slice is a few pages. Catches contracts registered weeks
        #     after their start date, whichever date the service filters on.)
        k = today.toordinal() % REFRESH_SLICES
        frm = today - timedelta(days=REFRESH_DAYS - 6 * k)
        rows = pull_window(client, frm, frm + timedelta(days=5))
        a, u = merge(rows)
        added, updated = added + a, updated + u
        # 2. Back-fill: at most one missing month per day, newest first (the current
        #    month too, so its earlier days arrive straight away). After that the daily
        #    window keeps every month current.
        done = set(st.get("months_done") or [])
        todo = [m.isoformat()[:7] for m in months_since(HISTORY_START, today)
                if m.isoformat()[:7] not in done][::-1]
        if todo:
            month = todo[0]
            got = 0
            for frm, to in windows(date.fromisoformat(month + "-01")):
                rows = pull_window(client, frm, to)
                got += len(rows)
                a, u = merge(rows)
                added, updated = added + a, updated + u
            done.add(month)
            log(f"back-filled {month}: {got} rows")
        st["months_done"] = sorted(done)
        st["backfill_complete"] = not [m for m in todo if m not in done]
        st["status"] = "ok"
        st["last_ok_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    except PageCap:
        st["status"] = "ok (page cap reached; rest continues tomorrow)"
        st["last_ok_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        log("page cap reached; stopping politely")
    except StopForToday as e:
        st["status"] = f"stopped: {e}"[:200]
        log(f"stopping for today: {e}")
    st.update(last_added=added, last_updated=updated, pages=client.pages)
    return st


def main():
    state = load_state()
    today = store.today_dubai()
    if os.environ.get("DLD_DISABLED") == "1":
        log("disabled by DLD_DISABLED=1")
        state.setdefault("dld", {})["status"] = "disabled"
    elif (state.get("dld") or {}).get("last_run_date") == today.isoformat() and os.environ.get("FORCE") != "1":
        log(f"already ran today ({today}); not contacting DLD again")
        return
    else:
        state["dld"] = run(state, today, Client())
    save_state(state)


if __name__ == "__main__":
    main()
