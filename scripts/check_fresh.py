"""Freshness check: fails (so GitHub emails the owner) when something has quietly broken.

Run by .github/workflows/freshness.yml every 6 hours, after loading the data branch.
  * the published data is too old (Dubai Data lags DLD by a few days; 10 days means stuck);
  * the pull hasn't completed successfully recently (it runs three times a day);
  * the live site doesn't show the latest saved data (a failed deploy) or is down;
  * a source that should be working reports a failure;
  * a cross-check source suddenly disagrees with our figures (a broken import or page);
  * fewer than 80% of the last week's pulls succeeded;
  * the backup source is in use (Dubai Data stuck);
  * (listed, not failing) a busy area can't be placed on the map.
Each problem also gets its own GitHub issue (label "data-alert"), opened when it first appears and
closed with a note when it is no longer seen, so outages leave a record (sync_issues).
Standard library only. `problems()` is pure, so the rules are unit-tested.
"""
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.environ.get("SITE_URL") or "https://jamalxcode.github.io/dubai_map/"
REPO = os.environ.get("GITHUB_REPOSITORY") or "jamalxcode/dubai_map"
MAX_DATA_DAYS = 10
MAX_PULL_HOURS = 14          # three pulls a day, plus slack for GitHub's delays
MAX_SITE_LAG_HOURS = 2       # saved data not yet on the site
CROSSCHECK_FLOOR = {"Dubai Real Estate Data": 0.5, "Continental Club Property": 0.7}
MIN_MATCHED = 5
MAX_UNPLACED = 1000          # contracts in an area the map can't place
MIN_WEEK_SUCCESS = 0.8       # share of the last 7 days' pulls that must succeed
ALERT_LABEL = "data-alert"


def _when(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def problems(meta, site_meta, last_run, now, week_runs=None):
    """Everything that looks broken, as plain sentences. Empty list: all fine.
    meta: data/meta.json from the data branch. site_meta: the live site's copy, or an error
    string. last_run: the newest completed pull run ({conclusion, created_at}) or None.
    week_runs: the last 7 days' completed pull runs, if known."""
    out = []
    if meta.get("backup"):
        b = meta["backup"]
        out.append(f"Backup source in use: Dubai Data has not updated since {b.get('since')} ({b.get('days')} days), "
                   "so the map is built from Continental Club alone. Check datadubai.ae and its export.")
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

    if week_runs:
        ok = sum(1 for r in week_runs if r.get("conclusion") == "success")
        if ok / len(week_runs) < MIN_WEEK_SUCCESS:
            out.append(f"Only {ok} of {len(week_runs)} pulls in the last 7 days succeeded: see the pull's run history.")

    if isinstance(site_meta, str):
        out.append(f"The live site's data could not be read: {site_meta}")
    else:
        saved, live = _when(meta.get("generated_at")), _when(site_meta.get("generated_at"))
        if saved and live and (saved - live).total_seconds() / 3600 > MAX_SITE_LAG_HOURS:
            out.append(f"The live site shows data built {live:%d %b %H:%M}, the saved data is from {saved:%d %b %H:%M} UTC: a deploy failed.")

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


def warnings(meta):
    """Known, slow-moving issues: listed in the run summary, but they don't fail the check (no email every
    6 hours about something only a person can fix). Today: busy areas the map can't place."""
    return [f"{u.get('area')} ({u['n']:,} contracts) is not on the map yet: add a reviewed point to "
            "data/area_locations.csv or an alias to data/dld_dm_aliases.csv."
            for u in meta.get("unmatched_areas") or [] if (u.get("n") or 0) >= MAX_UNPLACED]


def fetch_json(url, headers=None, data=None, method=None):
    req = urllib.request.Request(url, headers={"User-Agent": "dubai_map freshness check", **(headers or {})},
                                 data=json.dumps(data).encode() if data is not None else None, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8")
        return json.loads(body) if body else {}


def alert_key(text):
    """A stable name for a problem, so the same problem keeps one issue while its numbers change:
    the sentence without numbers, dates and links, first eight words."""
    t = re.sub(r"https?://\S+|\([^)]*\)|[\d,.:%]+", " ", text.lower())
    return " ".join(re.findall(r"[a-z']+", t)[:8])


def sync_issues(found, api, run_url=""):
    """One open issue per current problem; issues for problems no longer seen are closed with a note.
    api(method, path, body=None) calls the GitHub API for this repository. Returns (opened, closed)."""
    open_issues = api("GET", f"issues?state=open&labels={ALERT_LABEL}&per_page=100") or []
    by_key = {}
    for i in open_issues:
        m = re.search(r"<!-- alert:(.+?) -->", i.get("body") or "")
        if m:
            by_key[m.group(1)] = i
    now_keys, opened, closed = set(), [], []
    for text in found:
        k = alert_key(text)
        now_keys.add(k)
        if k in by_key:
            continue
        title = "Data alert: " + (text if len(text) <= 90 else text[:87].rsplit(" ", 1)[0] + "…")
        api("POST", "issues", {"title": title, "labels": [ALERT_LABEL],
                               "body": f"{text}\n\nFirst seen by the freshness check{': ' + run_url if run_url else ''}. "
                                       f"This issue closes itself when the problem is no longer seen.\n\n<!-- alert:{k} -->"})
        opened.append(k)
    for k, i in by_key.items():
        if k not in now_keys:
            api("POST", f"issues/{i['number']}/comments", {"body": f"No longer seen by the freshness check{': ' + run_url if run_url else ''}. Closing."})
            api("PATCH", f"issues/{i['number']}", {"state": "closed", "state_reason": "completed"})
            closed.append(k)
    return opened, closed


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
        since = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
        week = fetch_json(f"https://api.github.com/repos/{REPO}/actions/workflows/daily-ejari.yml/runs?status=completed&per_page=100&created=%3E{since}",
                          {"Accept": "application/vnd.github+json", **({"Authorization": f"Bearer {token}"} if token else {})})
        week_runs = week.get("workflow_runs") or []
    except Exception as e:  # noqa: BLE001
        print(f"(could not read workflow runs: {e})")
        week_runs = None
    found = problems(meta, site_meta, last_run, datetime.now(timezone.utc), week_runs)
    if os.environ.get("ALERT_ISSUES") == "1" and token:
        def api(method, path, body=None):
            return fetch_json(f"https://api.github.com/repos/{REPO}/{path}", {"Accept": "application/vnd.github+json",
                              "Authorization": f"Bearer {token}"}, data=body, method=method)
        try:
            try:
                api("POST", "labels", {"name": ALERT_LABEL, "color": "9A3B00", "description": "Opened and closed by the freshness check"})
            except Exception:  # noqa: BLE001  (already there)
                pass
            run = os.environ.get("GITHUB_RUN_ID")
            opened, closed = sync_issues(found, api, f"https://github.com/{REPO}/actions/runs/{run}" if run else "")
            print(f"issues: {len(opened)} opened, {len(closed)} closed")
        except Exception as e:  # noqa: BLE001  (issues are a convenience; the check's result stands)
            print(f"(could not update issues: {e})")
    report = "\n".join(f"- {p}" for p in found) or "- All fine: data fresh, pulls running, site current, sources agree."
    notes = warnings(meta)
    if notes:
        report += "\n\nKnown issues (not failing the check):\n" + "\n".join(f"- {w}" for w in notes)
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("## Dubai Real Estate Atlas freshness\n\n" + report + "\n")
    sys.exit(1 if found else 0)


if __name__ == "__main__":
    main()
