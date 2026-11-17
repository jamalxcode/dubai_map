"""BACKUP SOURCE: community rent aggregates published by Dubai Data (datadubai.ae).

Dubai Data imports the DLD Ejari feed daily and publishes trailing-12-month
medians per community and per bedroom count under CC BY 4.0, exported weekly
to Hugging Face and mirrored to GitHub. The map uses these until our own
contract history (Dubai Pulse API, or the DLD service if enabled) covers most of a year. The area -> community
table is also used to place DLD areas on the map.

Freshest first. Dubai Data rebuilds its website daily (data a few days behind
DLD), but its CSV export is only weekly and can stall. So, at most every 6 hours:

  1. Live: datadubai.ae/rents.json lists every community's median rent; if its
     "through" date is newer than ours, each community's own JSON page
     (datadubai.ae/communities/<slug>.json, bedroom breakdown and DLD areas) is
     read and the same four CSV files the build uses are written from them.
     Static JSON the site publishes for reuse ("free static JSON for every page,
     no key"); its robots.txt allows these paths. One request a second, at most
     once a day, honest User-Agent. All-or-nothing: if any page fails, the
     previous files are kept and the weekly export is used instead. The index is
     one small request; the community pages are read only when its date moves on.
  2. Weekly export: Hugging Face, then the GitHub mirror if Hugging Face fails.
     Skipped (except projects.csv, which only the export has) when step 1 is current.

Polite by design: a few small files, conditional requests (ETag),
so an unchanged file costs a 304 and nothing more. The DLD/Ejari systems are
never contacted by this script.
"""
import csv
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
import state as source_state  # noqa: E402
import store  # noqa: E402

LIVE = "https://datadubai.ae"
LIVE_PAUSE = 1.0          # seconds between page requests
LIVE_RETRY_PAUSE = 30.0   # before one more try at pages that failed (never after a "slow down" or "forbidden")
MIN_COMMUNITIES = 50      # fewer than this in rents.json means something is wrong upstream

MIRRORS = [
    ("huggingface", "https://huggingface.co/datasets/datadubai/dubai-real-estate-dld/resolve/main/"),
    ("github", "https://raw.githubusercontent.com/datadubai/dubai-real-estate-dld/main/"),
]
FILES = ["README.md", "data/rents_by_community.csv", "data/community_bedrooms.csv",
         "data/communities.csv", "data/areas.csv", "data/projects.csv", "data/community_monthly.csv"]
EXPORT_ONLY = ("projects.csv", "community_monthly.csv")  # not on the live pages: always from the export


def out_dir():
    return os.path.join(store.DATA, "datadubai")


def etags_path():
    return os.path.join(out_dir(), "etags.json")


def main(sleep=time.sleep):
    out = out_dir()
    os.makedirs(out, exist_ok=True)
    st = source_state.load()
    block = st.setdefault("datadubai", {})
    live_ok = False
    if os.environ.get("DATADUBAI_LIVE", "1") != "0":
        try:
            result = fetch_live(block, sleep=sleep)
            live_ok = True
            source_state.set_status(block, "ok")
            block["last_ok_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            print(f"datadubai live: {result} (data through {data_through()})")
        except (net.StopForToday, net.AuthError, ValueError, KeyError, TypeError) as e:
            source_state.set_status(block, "failed", f"live pages: {e}")
            print(f"datadubai live failed ({e}); using the weekly export")
        source_state.save(st)
    try:
        with open(etags_path()) as fh:
            etags = json.load(fh)
    except (OSError, ValueError):
        etags = {}
    changed = 0
    # With fresh live files, only projects.csv (not on the live pages) comes from the export:
    # the export's older CSVs and README must not overwrite the newer live ones.
    files = [f for f in FILES if f.endswith(EXPORT_ONLY)] if live_ok else FILES
    for f in files:
        dest = os.path.join(out, os.path.basename(f))
        for name, base in MIRRORS:
            result = fetch(base + f, dest, etags, f"{name}:{f}")
            if result in ("updated", "unchanged"):
                changed += result == "updated"
                print(f"{result} {f} ({name})")
                break
            print(f"{name} failed for {f}: {result}; trying next copy")
        else:
            print(f"skip {f}: every copy failed, keeping the previous file")
    with open(etags_path(), "w") as fh:
        json.dump(etags, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(f"datadubai: {changed} file(s) updated")


def fetch_live(block, sleep=time.sleep):
    """Rebuild the four CSVs the build reads from datadubai.ae's JSON pages.
    Returns 'updated' or 'current'. Raises on any failure; nothing is written then."""
    if not source_state.due(block, "live_checked_at") and os.environ.get("FORCE") != "1":
        return f"current (checked {source_state.hours_since(block, 'live_checked_at'):.1f} h ago)"
    index = net.get_json(LIVE + "/rents.json", attempts=2, source="datadubai")
    through = index.get("through", "")
    comms = index.get("communities") or []
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", through) or len(comms) < MIN_COMMUNITIES:
        raise ValueError(f"rents.json looks wrong (through={through!r}, {len(comms)} communities)")
    if through <= (data_through() or ""):
        block["live_checked_at"] = source_state.now_iso()
        return "current"
    # Every community page, politely; pages that fail get one more try after a pause, so one hiccup
    # doesn't throw away a fresh publication. Still all-or-nothing: a page failing twice raises.
    pages, failed = {}, []
    for i, c in enumerate(comms):
        rel = c["url"]
        if not rel.startswith("/communities/"):
            raise ValueError(f"unexpected community url {rel!r}")
        if i:
            sleep(LIVE_PAUSE)
        try:
            pages[rel] = net.get_json(LIVE + rel.rstrip("/") + ".json", attempts=2, source="datadubai")
        except net.StopForToday as e:
            if re.search(r"\b(429|403)\b", str(e)):
                raise
            failed.append(rel)
    if failed:
        print(f"datadubai live: {len(failed)} page(s) failed; one more try in {LIVE_RETRY_PAUSE:.0f} s")
        sleep(LIVE_RETRY_PAUSE)
        for rel in failed:
            pages[rel] = net.get_json(LIVE + rel.rstrip("/") + ".json", attempts=2, source="datadubai")
            sleep(LIVE_PAUSE)
    rents, beds, info, areas = [], [], [], {}
    for c in comms:
        rel = c["url"]
        url = LIVE + rel
        page = pages[rel]
        slug = rel.strip("/").split("/")[-1]
        rents.append({"name": c["name"], "url": url, "contracts": c.get("contracts") or 0,
                      "rent_median": c.get("rent_median") or "", "yield_pct": _blank(c.get("yield_pct"))})
        for b in page.get("bedrooms") or []:
            beds.append({"community": c["name"], "community_slug": slug, "code": b.get("code", ""),
                         "label": b.get("label", ""), "slug": b.get("slug", ""), "n": _blank(b.get("n")),
                         "quality": b.get("quality", ""), "price_median": _blank(b.get("price_median")),
                         "psf_median": _blank(b.get("psf_median")), "sqft_median": _blank(b.get("sqft_median")),
                         "rent_median": _blank(b.get("rent_median")), "n_rents": _blank(b.get("n_rents")),
                         "yield_pct": _blank(b.get("yield_pct")), "url": LIVE + b["url"] if b.get("url") else ""})
        parts = sorted(page.get("breakdown") or [], key=lambda x: -(x.get("n") or 0))
        summ = page.get("summary") or {}
        info.append({"name": c["name"], "slug": slug, "url": url, "n": _blank(summ.get("n")),
                     "quality": summ.get("quality", ""), "price_median": _blank(summ.get("price_median")),
                     "psf_median": _blank(summ.get("psf_median")), "yield_pct": _blank(page.get("gross_yield_pct")),
                     "rent_median": c.get("rent_median") or "", "n_rents": c.get("contracts") or 0,
                     "top_area": parts[0]["name"] if parts else "",
                     # Share of the community's transactions in its top DLD area, as in the weekly export:
                     # build.py places a community without its own point at that area's point when it's 90%+.
                     "share_in_top_area": round((parts[0].get("n") or 0) / total, 3) if parts and (total := sum(p.get("n") or 0 for p in parts)) else ""})
        for p in parts:  # DLD area -> the community holding most of its transactions
            if p.get("name") and (p["name"] not in areas or (p.get("n") or 0) > areas[p["name"]][1]):
                areas[p["name"]] = (url, p.get("n") or 0)
    out = out_dir()
    _write_csv(os.path.join(out, "rents_by_community.csv"), ["name", "url", "contracts", "rent_median", "yield_pct"], rents)
    _write_csv(os.path.join(out, "community_bedrooms.csv"),
               ["community", "community_slug", "code", "label", "slug", "n", "quality", "price_median", "psf_median",
                "sqft_median", "rent_median", "n_rents", "yield_pct", "url"], beds)
    _write_csv(os.path.join(out, "communities.csv"),
               ["name", "slug", "url", "n", "quality", "price_median", "psf_median", "yield_pct", "rent_median",
                "n_rents", "top_area", "share_in_top_area"], info)
    _merge_areas(os.path.join(out, "areas.csv"), areas)
    _set_readme_through(os.path.join(out, "README.md"), through)
    block["live_checked_at"] = source_state.now_iso()
    block["through"] = through
    # When each new publication was first seen (last 30), to learn when Dubai Data publishes.
    log = block.setdefault("published_seen", [])
    if not log or log[-1].get("through") != through:
        log.append({"through": through, "seen_at": source_state.now_iso()})
        del log[:-30]
    return "updated"


def _blank(v):
    return "" if v is None else v


def _write_csv(path, fields, rows):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fields, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, path)


def _merge_areas(path, live):
    """Keep the export's areas.csv rows and add or re-point areas seen on the live pages."""
    try:
        with open(path, encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
            fields = list(rows[0].keys()) if rows else ["name", "url"]
    except OSError:
        rows, fields = [], ["name", "url"]
    by_name = {r["name"]: r for r in rows}
    for name, (url, _) in live.items():
        by_name.setdefault(name, {k: "" for k in fields}).update(name=name, url=url)
    _write_csv(path, fields, list(by_name.values()))


def _set_readme_through(path, through):
    line = f"- **Data through:** {through} (from datadubai.ae's daily pages)"
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        text = ""
    if re.search(r"^- \*\*Data through:\*\*.*$", text, flags=re.M):
        text = re.sub(r"^- \*\*Data through:\*\*.*$", line, text, count=1, flags=re.M)
    else:
        text = text + ("\n" if text and not text.endswith("\n") else "") + line + "\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def fetch(url, dest, etags, key):
    """Conditional GET, one try (the other mirror is the retry). Returns 'updated',
    'unchanged' or an error string."""
    headers = {"If-None-Match": etags[key]} if etags.get(key) and os.path.exists(dest) else {}
    try:
        body, res_headers = net.request(url, headers=headers, attempts=1, with_headers=True, source="datadubai")
    except net.NotModified:
        return "unchanged"
    except (net.StopForToday, net.AuthError) as e:
        return str(e) or "unauthorised"
    if not body.strip():
        return "empty file"
    with open(dest, "wb") as out:
        out.write(body)
    etags[key] = res_headers.get("ETag", "")
    return "updated"


def data_through():
    try:
        m = re.search(r"Data through:\*\*\s*(\d{4}-\d{2}-\d{2})",
                      open(os.path.join(out_dir(), "README.md"), encoding="utf-8").read())
        return m.group(1) if m else None
    except OSError:
        return None


if __name__ == "__main__":
    main()
