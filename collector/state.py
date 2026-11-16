"""data/state.json: what each source did on its last run.

Every source has one block with a machine-readable `state` and a human `status`:

  state     meaning                                  status text (shown on the page)
  ok        ran and finished                         "ok"
  partial   ran, stopped at its page cap             "ok (page cap reached; ...)"
  failed    stopped early (error, slow down, key)    "stopped: <reason>"
  off       switched off on purpose                  "off (<why>)"
  no_key    no credentials configured                "no credentials"
  standby   not needed today                         "standby (<why>)"
  not_run   never ran                                "not run yet"

Code compares `state`, never the wording of `status`.
"""
import json
import os
from datetime import datetime, timezone

import store

STATES = ("ok", "partial", "failed", "off", "no_key", "standby", "not_run")
GOOD = ("ok", "partial")


def path():
    return os.path.join(store.DATA, "state.json")


def load():
    try:
        with open(path(), encoding="utf-8") as f:
            return migrate(json.load(f))
    except (OSError, ValueError):
        return {}


def save(state):
    with open(path(), "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, sort_keys=True)
        f.write("\n")


# The site pulls three times a day (cron-job.org, with GitHub's schedule as a backup). Each
# source waits at least this long between pulls, so a duplicate trigger minutes later is a no-op.
MIN_HOURS = float(os.environ.get("MIN_HOURS_BETWEEN_PULLS") or 6)


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def hours_since(block, key, now=None):
    """Hours since the timestamp block[key], or None if there isn't a readable one."""
    try:
        then = datetime.fromisoformat(str(block.get(key)))
    except (TypeError, ValueError):
        return None
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    return ((now or datetime.now(timezone.utc)) - then).total_seconds() / 3600


def due(block, key, min_hours=None, now=None):
    """True when the source may be contacted again: never tried, or tried long enough ago."""
    h = hours_since(block, key, now)
    return h is None or h >= (MIN_HOURS if min_hours is None else min_hours)


def text(kind, detail=""):
    """The status line for a state, worded as the page expects."""
    return {"ok": "ok", "partial": f"ok ({detail})" if detail else "ok",
            "failed": f"stopped: {detail}" if detail else "stopped",
            "off": f"off ({detail})" if detail else "off", "no_key": "no credentials",
            "standby": f"standby ({detail})" if detail else "standby", "not_run": "not run yet"}[kind]


def set_status(block, kind, detail=""):
    assert kind in STATES, kind
    block["state"], block["status"] = kind, text(kind, detail)[:300]
    return block


def migrate(state):
    """Read state files written before states were structured (flat last_api_* keys,
    status text only)."""
    if any(k.startswith("last_api_") for k in state) and "pulse" not in state:
        p = state.setdefault("pulse", {})
        for old, new in (("last_api_pull_date", "last_pull_date"), ("last_api_pull_at", "last_ok_at"),
                         ("last_api_rows", "rows"), ("last_api_added", "added"), ("last_api_updated", "updated")):
            if old in state:
                p[new] = state[old]
        if "last_api_status" in state:
            p["status"] = state["last_api_status"]
    for k in [k for k in state if k.startswith("last_api_")]:
        del state[k]
    if "last_manual_import" in state:
        state["inbox"] = state.pop("last_manual_import")
    for block in (state.get("pulse"), state.get("dld")):
        if block and "state" not in block and block.get("status"):
            block["state"] = infer(block["status"])
    return state


def infer(status):
    s = status.lower()
    for prefix, kind in (("ok (", "partial"), ("ok", "ok"), ("stopped", "failed"), ("off", "off"),
                         ("no credentials", "no_key"), ("standby", "standby"), ("not run", "not_run")):
        if s.startswith(prefix):
            return kind
    return "failed"
