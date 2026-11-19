"""One line per pull in data/runs.jsonl (the last 300), saved with the data: when it ran, how long it
took, what each source did and how far the data runs. Also writes, to the run's summary on GitHub,
when Dubai Data's recent publications were first seen (to time the pulls to them).

Run by daily-ejari.yml just before the data is saved; RUN_STARTED (epoch seconds) is set by its first step.
Standard library only.
"""
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "collector"))
import store  # noqa: E402

KEEP = 300
KUWAIT = timezone(timedelta(hours=3))


def entry(state, meta, now=None, started=None, event="", run_id=""):
    now = now or time.time()
    sources = {}
    for k, v in (state or {}).items():
        if k == "crosscheck":
            for kk, vv in (v or {}).items():
                sources["crosscheck:" + kk] = (vv or {}).get("state")
        elif isinstance(v, dict) and "state" in v:
            sources[k] = v.get("state")
    return {"at": datetime.fromtimestamp(now, timezone.utc).isoformat(timespec="seconds"),
            "seconds": round(now - started) if started else None, "event": event, "run": run_id,
            "through": (meta or {}).get("data_through"), "backup": bool((meta or {}).get("backup")),
            "areas": (meta or {}).get("n_areas"), "sources": sources, "pulled": pulled(state)}


def pulled(state):
    """What this pull read from each source (the collectors record it in state.json)."""
    st = state or {}
    dd = (st.get("datadubai") or {}).get("last_pull") or {}
    cc = st.get("crosscheck") or {}
    p = st.get("pulse") or {}
    hs, hp, hh, sp = st.get("hotel_stats") or {}, st.get("hotel_prices") or {}, st.get("holiday_homes") or {}, st.get("serp_stays") or {}
    return {"datadubai": {k: dd.get(k) for k in ("live", "pages", "export_files_updated", "through") if dd.get(k) is not None},
            **{"crosscheck:" + k: {"rows": (v or {}).get("rows"), "through": (v or {}).get("through")} for k, v in cc.items()},
            "pulse": {k: p.get(k) for k in ("rows", "added", "updated") if p.get(k) is not None},
            "hotel_stats": {k: hs.get(k) for k in ("latest", "last_ok_at") if hs.get(k)},
            "hotel_prices": {k: hp.get(k) for k in ("priced", "hotels", "last_ok_at") if hp.get(k) is not None},
            "holiday_homes": {k: hh.get(k) for k in ("priced", "listed", "last_ok_at") if hh.get(k) is not None},
            "serp_stays": {k: sp.get(k) for k in ("hotels", "homes", "used", "month") if sp.get(k) is not None}}


def append(path, line, keep=KEEP):
    try:
        with open(path, encoding="utf-8") as f:
            lines = [x for x in f.read().splitlines() if x.strip()]
    except OSError:
        lines = []
    lines.append(json.dumps(line, sort_keys=True))
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines[-keep:]) + "\n")


def publication_hours(state):
    """Kuwait hours at which Dubai Data's publications were first seen, most common first."""
    seen = ((state or {}).get("datadubai") or {}).get("published_seen") or []
    hours = Counter()
    for s in seen:
        try:
            hours[datetime.fromisoformat(s["seen_at"]).astimezone(KUWAIT).strftime("%H:00")] += 1
        except (KeyError, ValueError):
            continue
    return hours.most_common()


def main():
    def load(name):
        try:
            with open(os.path.join(store.DATA, name), encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}
    state, meta = load("state.json"), load("meta.json")
    started = os.environ.get("RUN_STARTED")
    line = entry(state, meta, started=float(started) if started else None,
                 event=os.environ.get("GITHUB_EVENT_NAME", ""), run_id=os.environ.get("GITHUB_RUN_ID", ""))
    append(os.path.join(store.DATA, "runs.jsonl"), line)
    print(f"run log: {line}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        hours = publication_hours(state)
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n### Dubai Data publications first seen (Kuwait time)\n\n" +
                    (", ".join(f"{h} ({n}×)" for h, n in hours) if hours else "None logged yet.") + "\n")


if __name__ == "__main__":
    main()
