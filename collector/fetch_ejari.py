"""Once-a-day, polite pull of Ejari rent contracts from the Dubai Pulse API.

Dubai Pulse publishes this dataset under Dubai's open-data licence, so this is
the legally clean daily source: register for a free key and add it as repo
secrets. It is skipped on days the optional DLD service (fetch_dld.py) ran.

Design rules (be a good citizen, never get blocked):
  * At most ONE pull per Dubai calendar day. A state file records the last
    pull; re-runs the same day exit without touching the API (FORCE=1 overrides).
  * One OAuth token per run, reused for every page.
  * Small windows: contract start dates from 3 days back to 14 days ahead, plus one
    6-day slice of the last 60 days per run (cycling) to catch late registrations.
  * Pause between pages; hard cap on pages per run.
  * On 429 / 503: honour Retry-After once or twice, then STOP and try tomorrow.
    Never hammer, never rotate identities, never touch CAPTCHA-protected pages.
  * Honest User-Agent pointing at the public repo.

Also ingests any manual DLD CSV export dropped into data/inbox/.

Env:
  DUBAI_PULSE_KEY / DUBAI_PULSE_SECRET  API credentials (GitHub Secrets). If
                                        missing, the API step is skipped.
  EJARI_API_URL     dataset endpoint (confirm in your Dubai Pulse account)
  EJARI_FILTER      filter template, {from} and {to} are ISO dates
  WINDOW_DAYS       days back, default 3
  AHEAD_DAYS        days ahead, default 14
  PAGE_SIZE         default 1000
  MAX_PAGES         default 60 (shared by both windows)
  PAUSE_SECONDS     default 4
  FORCE             "1" to pull even if already pulled today
"""
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store  # noqa: E402

TOKEN_URL = os.environ.get("DUBAI_PULSE_TOKEN_URL") or \
    "https://api.dubaipulse.gov.ae/oauth/client_credential/accesstoken?grant_type=client_credentials"
API_URL = os.environ.get("EJARI_API_URL") or "https://api.dubaipulse.gov.ae/open/dld/dld_rent_contracts-open"
FILTER = os.environ.get("EJARI_FILTER") or "contract_start_date>='{from}' AND contract_start_date<='{to}'"
WINDOW_DAYS = int(os.environ.get("WINDOW_DAYS") or 3)    # start dates this many days back...
AHEAD_DAYS = int(os.environ.get("AHEAD_DAYS") or 14)     # ...to this many days ahead (registered before they start)
# Late registrations: contracts are often registered weeks after their start date, so
# each run also re-pulls one 6-day slice of the last 60 days, cycling, so every recent
# day is checked again about every 10 days (same idea as fetch_dld.py).
REFRESH_DAYS, REFRESH_SLICES = 60, 10
PAGE_SIZE = int(os.environ.get("PAGE_SIZE") or 1000)
MAX_PAGES = int(os.environ.get("MAX_PAGES") or 60)
PAUSE = float(os.environ.get("PAUSE_SECONDS") or 4)
UA = "dubai_map-daily/1.0 (+https://github.com/jamalxcode/dubai_map; once per day)"
STATE = os.path.join(store.DATA, "state.json")
INBOX = os.path.join(store.DATA, "inbox")


class StopForToday(Exception):
    """The API asked us to slow down or failed; do not retry until tomorrow."""


class PageCap(Exception):
    """This run's page cap is reached; the rest waits for tomorrow."""


def log(msg):
    print(f"[{datetime.now(timezone.utc):%H:%M:%SZ}] {msg}", flush=True)


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


def http(req, attempts=3):
    """One request with bounded, respectful retries."""
    req.add_header("User-Agent", UA)
    req.add_header("Accept", "application/json")
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.loads(res.read().decode("utf-8") or "null")
        except urllib.error.HTTPError as e:
            body = e.read()[:300].decode("utf-8", "replace")
            if e.code in (429, 502, 503, 504) and attempt < attempts:
                wait = min(int(e.headers.get("Retry-After") or 0) or 30 * attempt, 180)
                log(f"HTTP {e.code}; waiting {wait}s (attempt {attempt}/{attempts})")
                time.sleep(wait)
                continue
            if e.code == 401:
                raise PermissionError(body)
            raise StopForToday(f"HTTP {e.code}: {body}")
        except urllib.error.URLError as e:
            if attempt < attempts:
                time.sleep(30 * attempt)
                continue
            raise StopForToday(f"network: {e.reason}")
    raise StopForToday("retries exhausted")


def get_token(key, secret):
    body = urllib.parse.urlencode({"client_id": key, "client_secret": secret}).encode()
    req = urllib.request.Request(TOKEN_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    data = http(req)
    token = (data or {}).get("access_token")
    if not token:
        raise StopForToday("token response had no access_token")
    return token


def rows_from(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in ("results", "data", "records", "result", "value", "items"):
            v = payload.get(k)
            if isinstance(v, list):
                return v
            if isinstance(v, dict):
                inner = rows_from(v)
                if inner:
                    return inner
    return []


def windows(today):
    """Start-date ranges to pull today: the recent window, then one refresh slice."""
    recent = (today - timedelta(days=WINDOW_DAYS), today + timedelta(days=AHEAD_DAYS))
    k = today.toordinal() % REFRESH_SLICES
    frm = today - timedelta(days=REFRESH_DAYS - 6 * k)
    return [recent, (frm, frm + timedelta(days=5))]


class Session:
    """One token per run (refreshed at most once) and one page budget across all windows."""

    def __init__(self, key, secret, max_pages=None):
        self.key, self.secret, self.max_pages = key, secret, max_pages or MAX_PAGES
        self.token, self.refreshed, self.pages = get_token(key, secret), False, 0
        self.rows = []  # every row fetched so far, kept even if a later page fails

    def window(self, frm, to):
        flt = FILTER.format(**{"from": frm.isoformat(), "to": to.isoformat()})
        log(f"window {frm}..{to}  filter: {flt}")
        got, page = 0, 0
        while True:
            if self.pages >= self.max_pages:
                raise PageCap()
            if self.pages:
                time.sleep(PAUSE)
            self.pages += 1
            q = urllib.parse.urlencode({"filter": flt, "limit": PAGE_SIZE, "offset": page * PAGE_SIZE,
                                        "order_by": "contract_id"})
            req = urllib.request.Request(f"{API_URL}?{q}")
            req.add_header("Authorization", f"Bearer {self.token}")
            try:
                batch = rows_from(http(req))
            except PermissionError:
                if self.refreshed:
                    raise StopForToday("token rejected twice")
                self.token, self.refreshed = get_token(self.key, self.secret), True
                continue  # the same page again with the new token
            self.rows.extend(batch)
            got, page = got + len(batch), page + 1
            log(f"page {page}: {len(batch)} rows (window total {got})")
            if len(batch) < PAGE_SIZE:
                return


def pull_api(key, secret, today=None):
    """Returns (records, problem). Rows already fetched are kept even when the run stops
    early; problem is None, a page-cap note, or why it stopped."""
    today = today or store.today_dubai()
    sess, problem = None, None
    try:
        sess = Session(key, secret)
        for frm, to in windows(today):
            sess.window(frm, to)
    except PageCap:
        problem = f"page cap ({MAX_PAGES}) reached; the rest continues tomorrow"
        log(problem)
    except PermissionError as e:
        problem = f"stopped: credentials rejected ({e})"[:300]
    except StopForToday as e:
        problem = f"stopped: {e}"[:300]
    return [store.normalize(r, "dubai_pulse_api") for r in (sess.rows if sess else [])], problem


def ingest_inbox():
    if not os.path.isdir(INBOX):
        return 0, 0, []
    total_a = total_u = 0
    done = []
    for name in sorted(os.listdir(INBOX)):
        if not name.lower().endswith(".csv"):
            continue
        path = os.path.join(INBOX, name)
        with open(path, encoding="utf-8-sig", newline="") as f:
            recs = [store.normalize(r, f"manual:{name}") for r in csv.DictReader(f)]
        a, u = store.merge(recs)
        log(f"inbox {name}: {len(recs)} rows, {a} new, {u} updated")
        total_a, total_u = total_a + a, total_u + u
        os.remove(path)  # git history keeps the original
        done.append(name)
    return total_a, total_u, done


def main_source_ok(state, today):
    dld = state.get("dld") or {}
    return dld.get("last_run_date") == today and str(dld.get("status", "")).startswith("ok")


def main():
    state = load_state()
    today = store.today_dubai().isoformat()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    a, u, files = ingest_inbox()
    if files:
        state["last_manual_import"] = {"at": now, "files": files, "added": a, "updated": u}

    key, secret = os.environ.get("DUBAI_PULSE_KEY"), os.environ.get("DUBAI_PULSE_SECRET")
    if not (key and secret):
        log("no Dubai Pulse credentials; API pull skipped")
        state["last_api_status"] = "no credentials"
    elif main_source_ok(state, today) and os.environ.get("FORCE") != "1":
        log("the DLD open-data service ran today; Dubai Pulse not needed")
        state["last_api_status"] = "standby (DLD service ran today)"
    elif state.get("last_api_pull_date") == today and os.environ.get("FORCE") != "1":
        log(f"already pulled today ({today}); not contacting the API again")
    else:
        # Record the attempt first: even a failed run counts as today's one try.
        state["last_api_pull_date"] = today
        recs, problem = pull_api(key, secret)
        a, u = store.merge(recs)  # keep whatever arrived, even if the run stopped early
        state.update(last_api_rows=len(recs), last_api_added=a, last_api_updated=u)
        if problem and problem.startswith("stopped"):
            state["last_api_status"] = problem
            log(f"stopping for today: {problem}")
        else:
            state.update(last_api_pull_at=now, last_api_status="ok" + (f" ({problem})" if problem else ""))
        log(f"api: {len(recs)} rows, {a} new, {u} updated")
    save_state(state)


if __name__ == "__main__":
    main()
