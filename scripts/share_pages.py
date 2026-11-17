"""One small page per area, so a shared link shows a real preview (WhatsApp, X, iMessage…).

Run by .github/workflows/pages.yml after the site is assembled:
    python3 scripts/share_pages.py _site
Writes _site/a/<slug>/index.html for every area in data/areas*.json. Each page carries the
area's figure in its title and preview tags, then forwards the visitor to the map with the
area checked (../../?area=…, keeping a ?unit=… from the shared link). The slug rule is the
same as `slug()` in assets/app/companion.js; a collision stops the deploy rather than
sending one area's link to another.
"""
import glob
import html
import json
import os
import re
import sys
import unicodedata
import urllib.parse
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.environ.get("SITE_URL") or "https://jamalxcode.github.io/dubai_map/"
IMAGE = SITE + "assets/share.png"


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def aed(n):
    return f"AED {round(n):,}"


def nice_date(iso):
    try:
        return date.fromisoformat(iso).strftime("%-d %b %Y")
    except (TypeError, ValueError):
        return None


def headline(a):
    """The figure a preview leads with: 1-bedroom where known (what most people compare), else the area's own."""
    one = next((u for u in a.get("by_unit") or [] if u.get("u") == "1-bedroom apartments" and u.get("median")), None)
    if one:
        return one["median"], "1-bedroom apartment"
    if a.get("median"):
        unit = a.get("median_unit") if a.get("median_kind") == "unit" else None
        return a["median"], (unit or "home").lower().rstrip("s").replace("studio", "studio flat")
    return None, None


def page(a, through):
    med, what = headline(a)
    title = f"{a['label']} rents: {aed(med)} a year for a {what}" if med else f"{a['label']} rents"
    when = nice_date(a.get("through") or through)
    desc = ("Median yearly rent from Ejari contracts registered with the Dubai Land Department"
            + (f", to {when}" if when else "") + ". See every home type, nearby areas and how your rent compares.")
    target = "../../?area=" + urllib.parse.quote(a["label"])
    e = html.escape
    url = SITE + "a/" + slug(a["label"]) + "/"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} | Dubai Real Estate Atlas</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Dubai Real Estate Atlas">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}"><meta property="og:image" content="{e(IMAGE)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Dubai Real Estate Atlas: what tenants actually pay, from Ejari contracts">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url={e(target)}">
<script>(function(){{var u=new URLSearchParams(location.search).get('unit');
location.replace({json.dumps(target)}+(u?'&unit='+encodeURIComponent(u):''))}})();</script>
</head><body style="font-family:system-ui,sans-serif;padding:24px">
<p><a href="{e(target)}">{e(title)}: open the Dubai Real Estate Atlas</a></p>
</body></html>
"""


def main(out):
    areas, through = {}, None
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "areas*.json"))):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        through = through or d.get("to")
        for a in d.get("areas") or []:
            areas.setdefault(a["label"], a)  # areas.json (all homes) first: it has every home type
    seen = {}
    for label, a in areas.items():
        s = slug(label)
        if not s or s in seen:
            raise SystemExit(f"share pages: '{label}' and '{seen.get(s)}' would share the link a/{s}/")
        seen[s] = label
        os.makedirs(os.path.join(out, "a", s), exist_ok=True)
        with open(os.path.join(out, "a", s, "index.html"), "w", encoding="utf-8") as f:
            f.write(page(a, through))
    print(f"share pages: {len(seen)} written to {out}/a/")
    return len(seen)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "_site")
