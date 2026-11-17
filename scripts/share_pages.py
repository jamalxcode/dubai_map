"""One page per area: its figures in plain HTML (for search engines and link previews) and a button to the map.

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


def _units(a, e):
    """The breakdown table: one row per home type with rent, contracts, sale price and yield."""
    rows = []
    for u in a.get("by_unit") or []:
        if not u.get("median"):
            continue
        thin = u.get("n") is not None and u["n"] < 10
        rows.append("<tr{cls}><td>{u}</td><td class=r>{r}</td><td class=r>{n}</td><td class=r>{s}</td><td class=r>{y}</td></tr>".format(
            cls=' class="thin"' if thin else "", u=e(u["u"]), r=aed(u["median"]),
            n=f'{u["n"]:,}' if u.get("n") is not None else "—", s=aed(u["sale"]) if u.get("sale") else "—",
            y=f'{u["yield"]}%' if u.get("yield") is not None else "—"))
    if not rows:
        return ""
    return ("<table><thead><tr><th>Home</th><th class=r>Median yearly rent</th><th class=r>Contracts</th>"
            "<th class=r>Median sale price</th><th class=r>Gross yield</th></tr></thead><tbody>" + "".join(rows) + "</tbody></table>"
            + ("<p class=note>Italic rows rest on fewer than 10 contracts: a rough guide only.</p>"
               if any(u.get("n") is not None and u["n"] < 10 for u in a.get("by_unit") or []) else ""))


def page(a, through):
    """A real page per area (figures in the HTML, so search engines and link previews can read them), with a
    button to open the area on the map. No automatic redirect: the page is useful on its own."""
    med, what = headline(a)
    title = f"{a['label']} rents: {aed(med)} a year for a {what}" if med else f"{a['label']} rents"
    when = nice_date(a.get("through") or through)
    desc = ("Median yearly rent from Ejari contracts registered with the Dubai Land Department"
            + (f", to {when}" if when else "") + ". Every home type, sale prices and yields, on the map.")
    target = "../../?area=" + urllib.parse.quote(a["label"])
    e = html.escape
    url = SITE + "a/" + slug(a["label"]) + "/"
    ccp = a.get("source") == "ccp"
    source = ("Continental Club Property (continentalclub.ae), CC BY 4.0, based on Dubai Land Department open data"
              if ccp else "Dubai Data (datadubai.ae), CC BY 4.0, based on Dubai Land Department open data (Ejari rent contracts, registered sales)")
    summary = []
    if a.get("median") and a.get("median_kind") != "unit":
        summary.append(f"<li><b>{aed(a['median'])}</b> median yearly rent, all homes, from {a.get('n', 0):,} contracts in the last 12 months</li>")
    elif a.get("n"):
        summary.append(f"<li>{a['n']:,} rent contracts in the last 12 months</li>")
    if a.get("sale_median"):
        summary.append(f"<li><b>{aed(a['sale_median'])}</b> median sale price"
                       + (f", {a['sale_yoy']:+.1f}% on a year ago (price per sq ft)" if a.get("sale_yoy") is not None else "") + "</li>")
    if a.get("yield_pct") is not None:
        summary.append(f"<li><b>{a['yield_pct']}%</b> gross rental yield</li>")
    dld = ", ".join(e(d) for d in a.get("dld_areas") or [])
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} | Dubai Real Estate Atlas</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(url)}">
<meta name="theme-color" content="#521825">
<meta property="og:type" content="website"><meta property="og:site_name" content="Dubai Real Estate Atlas">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}"><meta property="og:image" content="{e(IMAGE)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Dubai Real Estate Atlas: what tenants actually pay, from Ejari contracts">
<meta name="twitter:card" content="summary_large_image">
<style>
body{{margin:0;background:#F6F1E7;color:#2B2118;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}}
header{{background:#521825;color:#F6F1E7;padding:18px 20px;border-bottom:3px solid #C9A227}}
header a{{color:#F6F1E7;text-decoration:none;font-weight:700}}
main{{max-width:760px;margin:0 auto;padding:20px}}
h1{{margin:0 0 6px;font-size:30px;line-height:1.15}} .sub{{color:#655B51;margin:0 0 16px}}
ul{{padding-inline-start:20px}} li{{margin:4px 0}}
.btn{{display:inline-block;background:#521825;color:#F6F1E7;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700;margin:10px 0 18px}}
.btn:focus-visible{{outline:3px solid #735B12;outline-offset:2px}}
table{{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:15px}}
th,td{{padding:8px 6px;border-bottom:1px solid #D9CFBE;text-align:start}} th{{color:#655B51;font-weight:600}} .r{{text-align:end}}
tr.thin td{{font-style:italic;color:#655B51}} .note,footer{{color:#655B51;font-size:14px}}
footer{{max-width:760px;margin:0 auto;padding:0 20px 30px}} footer a{{color:#2B2118}}
@media (max-width:520px){{th:nth-child(3),td:nth-child(3){{display:none}}}}
</style>
</head><body>
<header><a href="../../">Dubai Real Estate Atlas</a></header>
<main>
<h1>{e(a["label"])}</h1>
<p class=sub>{"DLD area: " + dld + ". " if dld else ""}What tenants actually pay, from registered contracts{", to " + e(when) if when else ""}.</p>
<ul>{"".join(summary)}</ul>
<a class=btn href="{e(target)}">Open {e(a["label"])} on the map</a>
{_units(a, e)}
</main>
<footer><p>Medians from {e(source)}. Not asking prices, and not the RERA rental index. An independent tool, not an official DLD service.
<a href="../../">See all of Dubai on the map</a>.</p></footer>
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
    # A sitemap so search engines find the area pages (submit it once in Search Console).
    with open(os.path.join(out, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                f"  <url><loc>{html.escape(SITE)}</loc></url>\n"
                + "".join(f"  <url><loc>{html.escape(SITE + 'a/' + k + '/')}</loc></url>\n" for k in sorted(seen)) + "</urlset>\n")
    print(f"share pages: {len(seen)} written to {out}/a/")
    return len(seen)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "_site")
