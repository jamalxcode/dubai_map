"""Once-a-day, polite pull of Ejari rent contracts from the Dubai Pulse API.

Dubai Pulse publishes this dataset under Dubai's open-data licence, so this is
the legally clean daily source: register for a free key and add it as repo
secrets. It is skipped on days the optional DLD service (fetch_dld.py) ran.

Design rules (be a good citizen, never get blocked):
  * At most one pull every 6 hours (three a day: cron-job.org, GitHub's schedule as a
    backup). A state file records the last try; an earlier re-run exits without
    touching the API (FORCE=1 overrides). Only the first pull of a Dubai day also
    re-checks an older slice for late registrations; the later two fetch recent days only.
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
  MIN_HOURS_BETWEEN_PULLS  default 6
  FORCE             "1" to pull even if pulled less than 6 hours ago
"""
import csv
import os
import sys
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
import state as st  # noqa: E402
import store  # noqa: E402
from net import AuthError, StopForToday  # noqa: E402,F401  (re-exported for callers and tests)

# Dubai Pulse's open-data gateway now also answers at apis.data.dubai (same service,
# "SDG-DDADS-OpenAPI"; both hosts returned 401 without a key on 16 Nov 2026). The first that
# answers is used for the whole run; a repo variable (EJARI_API_URL / DUBAI_PULSE_TOKEN_URL)
# pins one instead.
TOKEN_URLS = [os.environ["DUBAI_PULSE_TOKEN_URL"]] if os.environ.get("DUBAI_PULSE_TOKEN_URL") else [
    "https://api.dubaipulse.gov.ae/oauth/client_credential/accesstoken?grant_type=client_credentials",
    "https://apis.data.dubai/oauth/client_credential/accesstoken?grant_type=client_credentials",
]
API_URLS = [os.environ["EJARI_API_URL"]] if os.environ.get("EJARI_API_URL") else [
    "https://apis.data.dubai/open/dld/dld_rent_contracts-open-api",
    "https://api.dubaipulse.gov.ae/open/dld/dld_rent_contracts-open",
]
API_URL = API_URLS[0]  # kept for callers that read it


def _unreachable(e):
    """A host that isn't there (DNS, timeout) or doesn't serve this path: try the next one.
    A refusal (401, 429, 5xx) is an answer and is handled as before."""
    return str(e).startswith(("network", "HTTP 404"))
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
SOURCE = "pulse"


class PageCap(Exception):
    """This run's page cap is reached; the rest waits for tomorrow."""


def log(msg):
    net.log(msg, SOURCE)


def inbox_dir():
    return os.path.join(store.DATA, "inbox")


def get_token(key, secret):
    body = urllib.parse.urlencode({"client_id": key, "client_secret": secret}).encode()
    for i, url in enumerate(TOKEN_URLS):
        try:
            data = net.get_json(url, data=body, method="POST", source=SOURCE,
                                headers={"Content-Type": "application/x-www-form-urlencoded"})
            break
        except StopForToday as e:
            if not _unreachable(e) or i == len(TOKEN_URLS) - 1:
                raise
            log(f"token endpoint {url.split('/')[2]} unreachable ({e}); trying the next")
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


def windows(today, refresh=True):
    """Start-date ranges to pull: the recent window, then (once a day) one refresh slice."""
    recent = (today - timedelta(days=WINDOW_DAYS), today + timedelta(days=AHEAD_DAYS))
    if not refresh:
        return [recent]
    k = today.toordinal() % REFRESH_SLICES
    frm = today - timedelta(days=REFRESH_DAYS - 6 * k)
    return [recent, (frm, frm + timedelta(days=5))]


class Session:
    """One token per run (refreshed at most once) and one page budget across all windows."""

    def __init__(self, key, secret, max_pages=None):
        self.key, self.secret, self.max_pages = key, secret, max_pages or MAX_PAGES
        self.token, self.refreshed, self.pages = get_token(key, secret), False, 0
        self.rows = []  # every row fetched so far, kept even if a later page fails
        self.api_url = None  # the data host that answered first; used for the rest of the run

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
            try:
                batch = rows_from(self._get(q))
            except AuthError:
                if self.refreshed:
                    raise StopForToday("token rejected twice")
                self.token, self.refreshed = get_token(self.key, self.secret), True
                continue  # the same page again with the new token
            self.rows.extend(batch)
            got, page = got + len(batch), page + 1
            log(f"page {page}: {len(batch)} rows (window total {got})")
            if len(batch) < PAGE_SIZE:
                return


    def _get(self, q):
        hosts = [self.api_url] if self.api_url else API_URLS
        for i, url in enumerate(hosts):
            try:
                data = net.get_json(f"{url}?{q}", source=SOURCE, headers={"Authorization": f"Bearer {self.token}"})
                self.api_url = url
                return data
            except StopForToday as e:
                if self.api_url or not _unreachable(e) or i == len(hosts) - 1:
                    raise
                log(f"data host {url.split('/')[2]} unreachable ({e}); trying the next")


def pull_api(key, secret, today=None, refresh=True):
    """Returns (records, state, detail): state is ok, partial (page cap) or failed. Rows
    already fetched are kept even when the run stops early."""
    today = today or store.today_dubai()
    sess, kind, detail = None, "ok", ""
    try:
        sess = Session(key, secret)
        for frm, to in windows(today, refresh):
            sess.window(frm, to)
    except PageCap:
        kind, detail = "partial", f"page cap ({MAX_PAGES}) reached; the rest continues tomorrow"
        log(detail)
    except AuthError as e:
        kind, detail = "failed", f"credentials rejected ({e})"
    except StopForToday as e:
        kind, detail = "failed", str(e)
    return [store.normalize(r, "dubai_pulse_api") for r in (sess.rows if sess else [])], kind, detail


def ingest_inbox():
    inbox = inbox_dir()
    if not os.path.isdir(inbox):
        return 0, 0, []
    total_a = total_u = 0
    done = []
    for name in sorted(os.listdir(inbox)):
        if not name.lower().endswith(".csv"):
            continue
        path = os.path.join(inbox, name)
        with open(path, encoding="utf-8-sig", newline="") as f:
            recs = [store.normalize(r, f"manual:{name}") for r in csv.DictReader(f)]
        a, u = store.merge(recs)
        log(f"inbox {name}: {len(recs)} rows, {a} new, {u} updated")
        total_a, total_u = total_a + a, total_u + u
        os.remove(path)  # git history keeps the original
        done.append(name)
    return total_a, total_u, done


def main_source_ok(state):
    """The DLD service (when enabled) ran fine within the last pull interval."""
    dld = state.get("dld") or {}
    return dld.get("state") in st.GOOD and not st.due(dld, "last_run_at")


def main():
    state = st.load()
    today = store.today_dubai().isoformat()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    force = os.environ.get("FORCE") == "1"

    a, u, files = ingest_inbox()
    if files:
        state["inbox"] = {"at": now, "files": files, "added": a, "updated": u}

    p = state.setdefault("pulse", {})
    key, secret = os.environ.get("DUBAI_PULSE_KEY"), os.environ.get("DUBAI_PULSE_SECRET")
    if not (key and secret):
        log("no Dubai Pulse credentials; API pull skipped")
        st.set_status(p, "no_key")
    elif main_source_ok(state) and not force:
        log("the DLD open-data service just ran; Dubai Pulse not needed")
        st.set_status(p, "standby", "DLD service ran")
    elif not st.due(p, "last_try_at") and not force:
        log(f"pulled {st.hours_since(p, 'last_try_at'):.1f} h ago; next pull after {st.MIN_HOURS:g} h")
    else:
        p["last_try_at"] = now  # recorded first: even a failed try counts, so a failure isn't retried at once
        refresh = p.get("refresh_date") != today  # the late-registration slice: first pull of the day only
        recs, kind, detail = pull_api(key, secret, refresh=refresh)
        if refresh and kind in st.GOOD:
            p["refresh_date"] = today
        a, u = store.merge(recs)  # keep whatever arrived, even if the run stopped early
        p.update(rows=len(recs), added=a, updated=u)
        st.set_status(p, kind, detail)
        if kind in st.GOOD:
            p["last_ok_at"] = now
        else:
            log(f"stopping for today: {detail}")
        log(f"api: {len(recs)} rows, {a} new, {u} updated")
    st.save(state)


if __name__ == "__main__":
    main()
