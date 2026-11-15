"""OPTIONAL SOURCE (off by default): once-a-day, polite pull of Ejari rent
contracts from the Dubai Land Department's own open-data service
(gateway.dubailand.gov.ae).

OFF UNTIL DLD SAYS YES. This is the service behind DLD's public "Real Estate
Data" page. DLD's website terms (dubailand.gov.ae/en/terms-conditions) allow
its materials only for personal, noncommercial use unless DLD agrees in
writing, and no separate open-data licence covers this service. Republishing
its data on a public site therefore needs DLD's written permission. Once the
owner has it, set the repo variable DLD_ENABLED=1. Until then the licensed
sources are used: Dubai Pulse (Dubai's open-data licence) and Dubai Data
(CC BY 4.0).

It needs no key. It only serves contracts registered from January 2026 onward, so history
is built up here: each run pulls the last few days, and back-fills ONE missing
month per day (newest first) until January 2026 onward is complete.

Being a good citizen (same rules as fetch_ejari.py):
  * At most ONE run per Dubai calendar day (FORCE=1 overrides).
  * Requests are sequential (never parallel), with a pause between pages and a
    hard cap on pages per run.
  * On errors or "slow down", wait briefly at most twice, then stop until
    tomorrow. The backup sources take over for the map in the meantime.
  * Honest User-Agent pointing at this repo. No CAPTCHA pages are touched.

Env:
  DLD_ENABLED      "1" to use this source (only with DLD's written permission)
  DLD_DISABLED     "1" to skip it even if enabled (emergency stop)
  DLD_WINDOW_DAYS  days of registrations to re-pull each run (default 3)
  DLD_MAX_PAGES    page cap per run (default 70, 2,000 rows each)
  DLD_PAUSE        seconds between pages (default 2)
  FORCE            "1" to run even if already run today
"""
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
import state as st  # noqa: E402
import store  # noqa: E402
from net import StopForToday  # noqa: E402,F401  (re-exported for callers and tests)

BASE = os.environ.get("DLD_BASE_URL") or "https://gateway.dubailand.gov.ae/open-data/"
REFERER = "https://dubailand.gov.ae/en/open-data/real-estate-data/"
HISTORY_START = date(2026, 1, 1)  # earliest contracts the service returns
REFRESH_DAYS, REFRESH_SLICES = 60, 10
PAGE = 2000
WINDOW_DAYS = int(os.environ.get("DLD_WINDOW_DAYS") or 3)
MAX_PAGES = int(os.environ.get("DLD_MAX_PAGES") or 70)
PAUSE = float(os.environ.get("DLD_PAUSE") or 2)
SOURCE = "dld"


class PageCap(Exception):
    """Reached this run's page cap; the rest waits for tomorrow."""


def log(msg):
    net.log(msg, SOURCE)


class Client:
    def __init__(self, max_pages=None, pause=PAUSE, sleep=time.sleep):
        self.pages, self.max_pages, self.pause, self.sleep = 0, max_pages or MAX_PAGES, pause, sleep

    def post(self, cmd, payload):
        if self.pages >= self.max_pages:
            raise PageCap()
        if self.pages:
            self.sleep(self.pause)
        self.pages += 1
        data = net.get_json(BASE + cmd, data=json.dumps(payload).encode(), method="POST", timeout=90,
                            max_wait=120, sleep=self.sleep, source=SOURCE,
                            headers={"Content-Type": "application/json", "Referer": REFERER})
        result = ((data or {}).get("response") or {}).get("result")
        if result is None:
            raise StopForToday("unexpected response shape (no response.result)")
        return result


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
    block = dict(state.get("dld") or {})
    block["last_run_date"] = today.isoformat()  # even a failed run counts as today's one try
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
        done = set(block.get("months_done") or [])
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
        block["months_done"] = sorted(done)
        block["backfill_complete"] = not [m for m in todo if m not in done]
        st.set_status(block, "ok")
        block["last_ok_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    except PageCap:
        st.set_status(block, "partial", "page cap reached; rest continues tomorrow")
        block["last_ok_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        log("page cap reached; stopping politely")
    except (StopForToday, net.AuthError) as e:
        st.set_status(block, "failed", str(e))
        log(f"stopping for today: {e}")
    block.update(last_added=added, last_updated=updated, pages=client.pages)
    return block


def main():
    state = st.load()
    today = store.today_dubai()
    if os.environ.get("DLD_ENABLED") != "1" or os.environ.get("DLD_DISABLED") == "1":
        log("off: needs DLD's written permission, then DLD_ENABLED=1 (see README)")
        st.set_status(state.setdefault("dld", {}), "off", "waiting for DLD's permission")
    elif (state.get("dld") or {}).get("last_run_date") == today.isoformat() and os.environ.get("FORCE") != "1":
        log(f"already ran today ({today}); not contacting DLD again")
        return
    else:
        state["dld"] = run(state, today, Client())
    st.save(state)


if __name__ == "__main__":
    main()
