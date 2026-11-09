"""Fetch community rent aggregates published by Dubai Data (datadubai.ae).

Dubai Data imports the DLD Ejari feed daily and publishes trailing-12-month
medians per community and per bedroom count under CC BY 4.0, mirrored to
GitHub weekly. This is the fallback source while no Dubai Pulse API key is set.

Polite by design: a few small files from GitHub, conditional requests (ETag),
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

BASE = "https://raw.githubusercontent.com/datadubai/dubai-real-estate-dld/main/"
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
        req = urllib.request.Request(BASE + f, headers={"User-Agent": UA})
        if etags.get(f) and os.path.exists(dest):
            req.add_header("If-None-Match", etags[f])
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                body = res.read()
                etags[f] = res.headers.get("ETag", "")
            with open(dest, "wb") as out:
                out.write(body)
            changed += 1
            print(f"updated {f} ({len(body)} bytes)")
        except urllib.error.HTTPError as e:
            if e.code == 304:
                print(f"unchanged {f}")
            else:
                print(f"skip {f}: HTTP {e.code}")
        except urllib.error.URLError as e:
            print(f"skip {f}: {e.reason}")
    with open(ETAGS, "w") as fh:
        json.dump(etags, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(f"datadubai: {changed} file(s) updated")


def data_through():
    try:
        m = re.search(r"Data through:\*\*\s*(\d{4}-\d{2}-\d{2})",
                      open(os.path.join(OUT, "README.md"), encoding="utf-8").read())
        return m.group(1) if m else None
    except OSError:
        return None


if __name__ == "__main__":
    main()
