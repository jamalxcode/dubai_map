"""Polite HTTP for every collector: one User-Agent, bounded retries, a clear stop.

The rules every source follows (see README, "won't get us blocked"):
  * an honest User-Agent pointing at this repo;
  * on "slow down" or a server error, wait as asked (capped) at most twice, then
    stop until tomorrow instead of hammering;
  * a rejected key raises AuthError so the caller can refresh it once.
Standard library only.
"""
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

UA = "dubai_map/1.0 (+https://github.com/jamalxcode/dubai_map; once per day)"
RETRY_CODES = (429, 500, 502, 503, 504)


class StopForToday(Exception):
    """The source failed or asked us to slow down; try again tomorrow."""


class AuthError(Exception):
    """The source rejected our credentials (HTTP 401)."""


class NotModified(Exception):
    """HTTP 304: the copy we have is current."""


def log(msg, source=""):
    print(f"[{datetime.now(timezone.utc):%H:%M:%SZ}] {source + ': ' if source else ''}{msg}", flush=True)


def request(url, data=None, headers=None, method=None, attempts=3, timeout=60, max_wait=180,
            sleep=time.sleep, source="", with_headers=False):
    """One request with bounded, respectful retries. Returns the body as bytes, or
    (body, response headers) with with_headers=True."""
    for attempt in range(1, attempts + 1):
        req = urllib.request.Request(url, data=data, method=method, headers={"User-Agent": UA, **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                body = res.read()
                return (body, res.headers) if with_headers else body
        except urllib.error.HTTPError as e:
            if e.code == 304:
                raise NotModified() from None
            if e.code == 401:
                raise AuthError(e.read()[:300].decode("utf-8", "replace")) from None
            if e.code in RETRY_CODES and attempt < attempts:
                wait = min(int(e.headers.get("Retry-After") or 0) or 20 * attempt, max_wait)
                log(f"HTTP {e.code}; waiting {wait}s (attempt {attempt}/{attempts})", source)
                sleep(wait)
                continue
            raise StopForToday(f"HTTP {e.code}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < attempts:
                sleep(20 * attempt)
                continue
            raise StopForToday(f"network: {getattr(e, 'reason', e)}") from None
    raise StopForToday("retries exhausted")


def get_json(url, data=None, headers=None, method=None, **kw):
    """request() for JSON APIs. A body that isn't JSON stops the run for today."""
    body = request(url, data=data, method=method, headers={"Accept": "application/json", **(headers or {})}, **kw)
    try:
        return json.loads(body.decode("utf-8") or "null")
    except ValueError:
        raise StopForToday("response was not JSON") from None
