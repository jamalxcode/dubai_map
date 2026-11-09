"""Once-a-day, polite pull of Ejari rent contracts from the Dubai Pulse API.

Design rules (be a good citizen, never get blocked):
  * At most ONE pull per Dubai calendar day. A state file records the last
    pull; re-runs the same day exit without touching the API (FORCE=1 overrides).
  * One OAuth token per run, reused for every page.
  * Small fixed window (default: the last 2 days of contract start dates).
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
  WINDOW_DAYS       default 2
  PAGE_SIZE         default 1000
  MAX_PAGES         default 30
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
WINDOW_DAYS = int(os.environ.get("WINDOW_DAYS") or 2)
PAGE_SIZE = int(os.environ.get("PAGE_SIZE") or 1000)
MAX_PAGES = int(os.environ.get("MAX_PAGES") or 30)
PAUSE = float(os.environ.get("PAUSE_SECONDS") or 4)
UA = "dubai_map-daily/1.0 (+https://github.com/jamalxcode/dubai_map; once per day)"
STATE = os.path.join(store.DATA, "state.json")
INBOX = os.path.join(store.DATA, "inbox")


class StopForToday(Exception):
    """The API asked us to slow down or failed; do not retry until tomorrow."""


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


def pull_api(key, secret):
    today = store.today_dubai()
    frm = (today - timedelta(days=WINDOW_DAYS)).isoformat()
    flt = FILTER.format(**{"from": frm, "to": today.isoformat()})
    log(f"window {frm}..{today}  filter: {flt}")
    token = get_token(key, secret)
    out, refreshed = [], False
    for page in range(MAX_PAGES):
        q = urllib.parse.urlencode({
            "filter": flt, "limit": PAGE_SIZE, "offset": page * PAGE_SIZE,
            "order_by": "contract_id",
        })
        req = urllib.request.Request(f"{API_URL}?{q}")
        req.add_header("Authorization", f"Bearer {token}")
        try:
            batch = rows_from(http(req))
        except PermissionError:
            if refreshed:
                raise StopForToday("token rejected twice")
            token, refreshed = get_token(key, secret), True
            continue
        out.extend(batch)
        log(f"page {page + 1}: {len(batch)} rows (total {len(out)})")
        if len(batch) < PAGE_SIZE:
            break
        time.sleep(PAUSE)
    else:
        log(f"stopped at MAX_PAGES={MAX_PAGES}; remaining rows wait for tomorrow")
    return [store.normalize(r, "dubai_pulse_api") for r in out]


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
    elif state.get("last_api_pull_date") == today and os.environ.get("FORCE") != "1":
        log(f"already pulled today ({today}); not contacting the API again")
    else:
        # Record the attempt first: even a failed run counts as today's one try.
        state["last_api_pull_date"] = today
        try:
            recs = pull_api(key, secret)
            a, u = store.merge(recs)
            state.update(last_api_pull_at=now, last_api_status="ok",
                         last_api_rows=len(recs), last_api_added=a, last_api_updated=u)
            log(f"api: {len(recs)} rows, {a} new, {u} updated")
        except (StopForToday, PermissionError) as e:
            state.update(last_api_status=f"stopped: {e}"[:300])
            log(f"stopping for today: {e}")
    save_state(state)


if __name__ == "__main__":
    main()
