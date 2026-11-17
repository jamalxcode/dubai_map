"""Freshness check: fails (so GitHub emails the owner) when something has quietly broken.

Run by .github/workflows/freshness.yml every 6 hours, after loading the data branch.
  * the published data is too old (Dubai Data lags DLD by a few days; 10 days means stuck);
  * the pull hasn't completed successfully recently (it runs three times a day);
  * the live site doesn't show the latest saved data (a failed deploy) or is down;
  * a source that should be working reports a failure;
  * a cross-check source suddenly disagrees with our figures (a broken import or page);
  * a busy area can't be placed on the map.
Standard library only. `problems()` is pure, so the rules are unit-tested.
"""
import json
import os
import sys
import urllib.request
from datetime import date, datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.environ.get("SITE_URL") or "https://jamalxcode.github.io/dubai_map/"
REPO = os.environ.get("GITHUB_REPOSITORY") or "jamalxcode/dubai_map"
MAX_DATA_DAYS = 10
MAX_PULL_HOURS = 14          # three pulls a day, plus slack for GitHub's delays
MAX_SITE_LAG_HOURS = 2       # saved data not yet on the site
CROSSCHECK_FLOOR = {"Dubai Real Estate Data": 0.5, "Continental Club Property": 0.7}
MIN_MATCHED = 5
MAX_UNPLACED = 1000          # contracts in an area the map can't place


def _when(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def problems(meta, site_meta, last_run, now):
    """Everything that looks broken, as plain sentences. Empty list: all fine.
    meta: data/meta.json from the data branch. site_meta: the live site's copy, or an error
    string. last_run: the newest completed pull run ({conclusion, created_at}) or None."""
    out = []
    through = meta.get("data_through") or meta.get("newest_start_date")
    try:
        age = (now.date() - date.fromisoformat(through)).days
        if age > MAX_DATA_DAYS:
            out.append(f"Data is {age} days old (runs to {through}); the sources have stopped updating or the pull is stuck.")
    except (TypeError, ValueError):
        out.append(f"meta.json has no readable data date ({through!r}).")

    if not last_run:
        out.append("No completed run of the pull workflow found.")
    else:
        started = _when(last_run.get("created_at"))
        hours = (now - started).total_seconds() / 3600 if started else None
        if last_run.get("conclusion") != "success":
            out.append(f"The latest pull ended with '{last_run.get('conclusion')}': {last_run.get('html_url', '')}")
        if hours is None or hours > MAX_PULL_HOURS:
            out.append(f"The latest pull started {hours:.0f} h ago (expected every 8 h): is cron-job.org still running and its token valid?"
                       if hours is not None else "The latest pull has no start time.")

    if isinstance(site_meta, str):
        out.append(f"The live site's data could not be read: {site_meta}")
    else:
        saved, live = _when(meta.get("generated_at")), _when(site_meta.get("generated_at"))
        if saved and live and (saved - live).total_seconds() / 3600 > MAX_SITE_LAG_HOURS:
            out.append(f"The live site shows data built {live:%d %b %H:%M}, the saved data is from {saved:%d %b %H:%M} UTC: a deploy failed.")

    for u in meta.get("unmatched_areas") or []:
        if (u.get("n") or 0) >= MAX_UNPLACED:
            out.append(f"{u.get('area')} ({u['n']:,} contracts) is not on the map: the daily OpenStreetMap look-up found "
                       "no believable point. Add it to data/area_locations.csv or data/dld_dm_aliases.csv.")

    for s in meta.get("sources") or []:
        name, state = s.get("name", ""), s.get("state")
        if s.get("kind") == "cross-check":
            floor = next((v for k, v in CROSSCHECK_FLOOR.items() if name.startswith(k)), None)
            matched, agree = s.get("matched") or 0, s.get("agree") or 0
            if floor and matched >= MIN_MATCHED and agree / matched < floor:
                out.append(f"Cross-check {name}: only {agree} of {matched} figures agree within 15% (floor {floor:.0%}). "
                           "Check our import and that source's page.")
            if state == "failed":
                out.append(f"Cross-check {name} failed: {s.get('status')}")
        elif state == "failed":
            out.append(f"Source {name} is failing: {s.get('status')}")
    return out


def fetch_json(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": "dubai_map freshness check", **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    with open(os.path.join(ROOT, "data", "meta.json"), encoding="utf-8") as f:
        meta = json.load(f)
    try:
        site_meta = fetch_json(SITE.rstrip("/") + "/data/meta.json")
    except Exception as e:  # noqa: BLE001
        site_meta = str(e)
    last_run = None
    try:
        token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
        runs = fetch_json(f"https://api.github.com/repos/{REPO}/actions/workflows/daily-ejari.yml/runs?status=completed&per_page=1",
                          {"Accept": "application/vnd.github+json", **({"Authorization": f"Bearer {token}"} if token else {})})
        last_run = (runs.get("workflow_runs") or [None])[0]
    except Exception as e:  # noqa: BLE001
        print(f"(could not read workflow runs: {e})")
    found = problems(meta, site_meta, last_run, datetime.now(timezone.utc))
    report = "\n".join(f"- {p}" for p in found) or "- All fine: data fresh, pulls running, site current, sources agree."
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("## Dubai Real Estate Atlas freshness\n\n" + report + "\n")
    sys.exit(1 if found else 0)


if __name__ == "__main__":
    main()
