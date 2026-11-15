"""BACKUP SOURCE: community rent aggregates published by Dubai Data (datadubai.ae).

Dubai Data imports the DLD Ejari feed daily and publishes trailing-12-month
medians per community and per bedroom count under CC BY 4.0, exported weekly
to Hugging Face and mirrored to GitHub. The map uses these until our own
contract history (Dubai Pulse API, or the DLD service if enabled) covers most of a year. The area -> community
table is also used to place DLD areas on the map.

Two copies are tried in order: Hugging Face (where the export is published
first), then the GitHub mirror if Hugging Face fails.

Polite by design: a few small files, conditional requests (ETag),
so an unchanged file costs a 304 and nothing more. The DLD/Ejari systems are
never contacted by this script.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import store  # noqa: E402

MIRRORS = [
    ("huggingface", "https://huggingface.co/datasets/datadubai/dubai-real-estate-dld/resolve/main/"),
    ("github", "https://raw.githubusercontent.com/datadubai/dubai-real-estate-dld/main/"),
]
FILES = ["README.md", "data/rents_by_community.csv", "data/community_bedrooms.csv",
         "data/communities.csv", "data/areas.csv", "data/projects.csv"]
OUT = os.path.join(store.DATA, "datadubai")
ETAGS = os.path.join(OUT, "etags.json")
UA = "dubai_map-daily/1.0 (+https://github.com/jamalxcode/dubai_map)"


def main():
    os.makedirs(OUT, exist_ok=True)
    try:
        etags = json.load(open(ETAGS))
    except (OSError, ValueError):
        etags = {}
    changed = 0
    for f in FILES:
        dest = os.path.join(OUT, os.path.basename(f))
        for name, base in MIRRORS:
            result = fetch(base + f, dest, etags, f"{name}:{f}")
            if result in ("updated", "unchanged"):
                changed += result == "updated"
                print(f"{result} {f} ({name})")
                break
            print(f"{name} failed for {f}: {result}; trying next copy")
        else:
            print(f"skip {f}: every copy failed, keeping the previous file")
    with open(ETAGS, "w") as fh:
        json.dump(etags, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(f"datadubai: {changed} file(s) updated")


def fetch(url, dest, etags, key):
    """Conditional GET. Returns 'updated', 'unchanged' or an error string."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    if etags.get(key) and os.path.exists(dest):
        req.add_header("If-None-Match", etags[key])
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            body = res.read()
            etag = res.headers.get("ETag", "")
    except urllib.error.HTTPError as e:
        return "unchanged" if e.code == 304 else f"HTTP {e.code}"
    except (urllib.error.URLError, TimeoutError) as e:
        return str(getattr(e, "reason", e))
    if not body.strip():
        return "empty file"
    with open(dest, "wb") as out:
        out.write(body)
    etags[key] = etag
    return "updated"


def data_through():
    try:
        m = re.search(r"Data through:\*\*\s*(\d{4}-\d{2}-\d{2})",
                      open(os.path.join(OUT, "README.md"), encoding="utf-8").read())
        return m.group(1) if m else None
    except OSError:
        return None


if __name__ == "__main__":
    main()
