"""Writing the files the page loads: never a much smaller catalog than last time,
never a commit just for a new timestamp."""
import json
import os
import sys

import store

# Refuse to publish if the headline counts drop by more than this versus the last
# build in the same mode (a truncated or broken source file). ALLOW_SHRINK=1 overrides.
MAX_DROP = 0.30
# Every area record has these keys in both modes, so the page never guesses.
AREA_DEFAULTS = {
    "label": None, "lat": None, "lng": None, "dld_areas": [], "n": 0, "median": None,
    "p25": None, "p75": None, "median_sqm": None, "reg_types": {}, "by_unit": [], "monthly": [],
    "top_projects": [], "yield_pct": None, "sale_median": None, "sale_psf": None, "url": None,
}


def area(**fields):
    """One area record with every key present. Unknown keys are a bug, not data."""
    extra = set(fields) - set(AREA_DEFAULTS) - {"median_kind"}
    if extra:
        raise ValueError(f"unknown area fields: {sorted(extra)}")
    fresh = {k: (type(v)() if isinstance(v, (list, dict)) else v) for k, v in AREA_DEFAULTS.items()}
    return {**fresh, **fields}


def shrink_problem(old, new):
    """Why the new build looks broken compared with the last one, or None if it is fine.
    Only compares builds in the same mode: switching source legitimately changes the counts."""
    if not old or old.get("mode") != new.get("mode"):
        return None
    for key, what in (("contracts_last_12m", "contracts"), ("mapped_last_12m", "contracts on the map"),
                      ("n_areas", "areas")):
        before, after = old.get(key), new.get(key)
        if isinstance(before, (int, float)) and before > 0 and isinstance(after, (int, float)) \
                and after < before * (1 - MAX_DROP):
            return f"{what} fell from {before:,} to {after:,} (more than {MAX_DROP:.0%})"
    return None


def publish(files):
    """Write the page's files, unless the new data has shrunk suspiciously. Then nothing is
    written, the previous files stay published, and the run fails so someone looks."""
    try:
        with open(os.path.join(store.DATA, "meta.json"), encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        old = None
    problem = shrink_problem(old, files["meta.json"])
    if problem and os.environ.get("ALLOW_SHRINK") != "1":
        sys.exit(f"not publishing: {problem}. The previous files are kept. "
                 "If the drop is real, re-run with ALLOW_SHRINK=1.")
    # Only write what really changed: a run that brings nothing new must leave the files
    # untouched, so the daily job makes no commit and no redeploy just for a new timestamp.
    changed = [name for name, obj in files.items() if not same_data(name, obj)]
    if not changed:
        print("no data changes; nothing written")
        return False
    meta = files.pop("meta.json")
    for name, obj in files.items():
        if name in changed:
            write(name, obj)
    write("meta.json", meta)  # last, so a crash mid-way never pairs new metadata with old files
    return True


def _without_time(obj):
    return {k: v for k, v in obj.items() if k != "generated_at"} if isinstance(obj, dict) else obj


def same_data(name, obj):
    """True if the file on disk holds the same data, ignoring generated_at."""
    try:
        with open(os.path.join(store.DATA, name), encoding="utf-8") as f:
            return _without_time(json.load(f)) == _without_time(obj)
    except (OSError, ValueError):
        return False


def write(name, obj):
    with open(os.path.join(store.DATA, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
