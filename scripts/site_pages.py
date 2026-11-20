"""Pages written at deploy, beside the area pages (share_pages.py): real HTML, so search engines and link previews
read the figures. All from the published data files; nothing invented.

  stats/                       "Dubai rents this month": the headline figures, busiest rental markets, cheapest and
                               dearest areas for a 1-bedroom, best yields, sale prices per sq ft month by month, the
                               moves since the previous publication, hotel and holiday home nights; questions and
                               answers (also as schema.org FAQPage for search engines).
  areas/                       every area: rent (all homes and 1-bed), sale price, yield, contracts; sortable.
  rents/<home>/                one page per common home size: areas cheapest first.
  rents/1-bedroom-under-<n>/   areas where a 1-bedroom rents for less than n a year.
  yields/                      the best gross rental yields.
  feed.xml                     RSS: each publication's notable moves (5% or more, from 30+ contracts), from our own
                               history snapshots.
Each page links into the map with the matching view, home and budget. The sitemap gets every page.

Usage: python3 scripts/site_pages.py _site   (after share_pages.py, which writes the sitemap first)
"""
import glob
import html
import json
import os
import statistics
import sys
import urllib.parse
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from share_pages import ROOT, SITE, IMAGE, place, slug, aed, nice_date  # noqa: E402

THIN = 10            # as atlas.js: figures from fewer contracts are a rough guide, left out of rankings
MOVE = 0.05          # the feed lists moves of at least this much
MOVE_N = 30          # from at least this many contracts
UNITS = [("Studios", "studio"), ("1-bedroom apartments", "1-bedroom"), ("2-bedroom apartments", "2-bedroom"), ("3-bedroom apartments", "3-bedroom")]
BUDGETS = [50000, 60000, 75000, 100000]
e = html.escape


def load(name, default=None):
    try:
        with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def unit_of(a, u):
    return next((x for x in a.get("by_unit") or [] if x.get("u") == u), {})


def solid(a):
    return a.get("lat") is not None and not a.get("staff") and (a.get("n") or 0) >= THIN


def map_link(prefix, view="median", home=None, area=None, max_=None):
    q = {"view": view}
    if home is not None:
        q["home"] = "homes:" + home
    if max_:
        q["max"] = str(max_)
    if area:
        q["open"] = "a:" + area
    return prefix + "?" + urllib.parse.urlencode(q, safe=":|")


def layout(title, desc, path, depth, body, faq=None):
    up = "../" * depth
    url = SITE + path
    ld = ""
    if faq:
        ld = '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}, ensure_ascii=False).replace("</", "<\\/") + "</script>"
    faq_html = ("<h2>Questions and answers</h2><dl class=faq>" + "".join(f"<dt>{e(q)}</dt><dd>{e(a)}</dd>" for q, a in faq) + "</dl>") if faq else ""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} | Dubai Real Estate Atlas</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(url)}">
<link rel="alternate" type="application/rss+xml" title="Dubai Real Estate Atlas: what changed" href="{e(SITE + 'feed.xml')}">
<meta name="theme-color" content="#521825">
<meta property="og:type" content="website"><meta property="og:site_name" content="Dubai Real Estate Atlas">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}"><meta property="og:image" content="{e(IMAGE)}">
<meta name="twitter:card" content="summary_large_image">
{ld}
<style>
body{{margin:0;background:#F6F1E7;color:#2B2118;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}}
header{{background:#521825;color:#F6F1E7;padding:18px 20px;border-bottom:3px solid #C9A227}}
header a{{color:#F6F1E7;text-decoration:none;font-weight:700}} header nav a{{font-weight:500;margin-inline-start:16px;font-size:15px}}
main{{max-width:880px;margin:0 auto;padding:20px}}
h1{{margin:0 0 6px;font-size:30px;line-height:1.15}} h2{{margin:28px 0 8px;font-size:21px}} .sub{{color:#655B51;margin:0 0 16px}}
.btn{{display:inline-block;background:#521825;color:#F6F1E7;padding:11px 16px;border-radius:8px;text-decoration:none;font-weight:700;margin:6px 0 14px}}
.btn:focus-visible,a:focus-visible,button:focus-visible{{outline:3px solid #735B12;outline-offset:2px}}
.facts{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:14px 0}}
.facts div{{background:#FFFCF5;border:1px solid #D9CFBE;border-inline-start:4px solid #2171B5;border-radius:8px;padding:10px 12px}}
.facts b{{display:block;font-size:24px;line-height:1.1}} .facts span{{color:#655B51;font-size:14px}}
table{{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:15px}}
th,td{{padding:8px 6px;border-bottom:1px solid #D9CFBE;text-align:start}} th{{color:#655B51;font-weight:600}} .r{{text-align:end}}
th button{{all:unset;cursor:pointer;color:#655B51;font-weight:600}} th button:hover{{color:#2B2118}}
td a{{color:#2B2118;text-decoration-color:#C9A227;text-underline-offset:3px}}
ol li,ul li{{margin:4px 0}} .note,footer{{color:#655B51;font-size:14px}}
.faq dt{{font-weight:700;margin-top:12px}} .faq dd{{margin:4px 0 0}}
.links a{{display:inline-block;margin:4px 12px 4px 0;color:#2B2118;text-decoration-color:#C9A227;text-underline-offset:3px}}
svg.chart{{width:100%;max-width:640px;height:auto}}
footer{{max-width:880px;margin:0 auto;padding:0 20px 30px}} footer a{{color:#2B2118}}
@media (max-width:560px){{.opt{{display:none}}}}
</style>
</head><body>
<header><a href="{up}">Dubai Real Estate Atlas</a><nav><a href="{up}stats/">This month</a><a href="{up}areas/">All areas</a><a href="{up}yields/">Yields</a></nav></header>
<main>
{body}
{faq_html}
<p class=links><b>More:</b> {''.join(f'<a href="{up}rents/{s}/">{e(t)} rents</a>' for t, s in [('Studio', 'studio'), ('1-bedroom', '1-bedroom'), ('2-bedroom', '2-bedroom'), ('3-bedroom', '3-bedroom')])}{''.join(f'<a href="{up}rents/1-bedroom-under-{b}/">1-bed under AED {b // 1000}k</a>' for b in BUDGETS)}<a href="{up}feed.xml">What changed (RSS)</a></p>
</main>
<footer><p>Medians from Dubai Data and Continental Club Property (CC BY 4.0), based on Dubai Land Department open data (Ejari rent contracts and registered sales); hotel and holiday home prices from booking sites via Xotelo. Not asking prices, and not the RERA rental index. An independent tool, not an official DLD service. <a href="{up}">See all of Dubai on the map</a>.</p></footer>
</body></html>
"""


def sort_script():
    return """<script>
// Column headers sort the table (click again to reverse); numbers sort as numbers, blanks last.
document.querySelectorAll('table.sortable').forEach(t=>{const hs=[...t.tHead.rows[0].cells];hs.forEach((h,i)=>{const b=document.createElement('button');b.type='button';b.textContent=h.textContent;h.textContent='';h.append(b);
  b.addEventListener('click',()=>{const asc=h.getAttribute('aria-sort')!=='ascending';hs.forEach(x=>x.removeAttribute('aria-sort'));h.setAttribute('aria-sort',asc?'ascending':'descending');
    const rows=[...t.tBodies[0].rows],v=r=>{const c=r.cells[i],d=c.dataset.v;return d!==undefined?(d===''?null:+d):c.textContent.trim().toLowerCase()};
    rows.sort((a,b)=>{const x=v(a),y=v(b);if(x===null)return 1;if(y===null)return -1;return (x>y?1:x<y?-1:0)*(asc?1:-1)});rows.forEach(r=>t.tBodies[0].append(r))})})});
</script>"""


def chart(points, label):
    """A small line chart (SVG) of (month, value) pairs."""
    if len(points) < 3:
        return ""
    w, h, pad = 640, 180, 40
    vs = [v for _, v in points]
    lo, hi = min(vs), max(vs)
    x = lambda i: pad + i * (w - pad - 10) / (len(points) - 1)
    y = lambda v: 10 + (1 - ((v - lo) / (hi - lo) if hi > lo else .5)) * (h - 40)
    d = "".join(("M" if i == 0 else "L") + f"{x(i):.1f},{y(v):.1f}" for i, (_, v) in enumerate(points))
    ticks = [(0, "start"), (len(points) // 2, "middle"), (len(points) - 1, "end")]
    return (f'<svg class="chart" viewBox="0 0 {w} {h}" role="img" aria-label="{e(label)}"><path d="{d}" fill="none" stroke="#735B12" stroke-width="2.5"/>'
            f'<text x="2" y="16" font-size="12" fill="#655B51">{hi:,.0f}</text><text x="2" y="{h - 30}" font-size="12" fill="#655B51">{lo:,.0f}</text>'
            + "".join(f'<text x="{x(i):.1f}" y="{h - 8}" font-size="12" fill="#655B51" text-anchor="{a}">{points[i][0]}</text>' for i, a in ticks) + "</svg>")


def write(out, path, text):
    os.makedirs(os.path.join(out, path), exist_ok=True)
    with open(os.path.join(out, path, "index.html"), "w", encoding="utf-8") as f:
        f.write(text)


def area_link(a, depth):
    return f'<a href="{"../" * depth}a/{slug(a["label"])}/">{e(place(a["label"]))}</a>'


def stats_page(areas, through, ccp_through):
    one = "1-bedroom apartments"
    pool = [a for a in areas if solid(a)]
    ones = [(a, unit_of(a, one)) for a in pool if unit_of(a, one).get("median") and (unit_of(a, one).get("n") or 0) >= THIN]
    total = sum(a.get("n") or 0 for a in areas)
    one_med = statistics.median([u["median"] for _, u in ones]) if ones else None
    yields = sorted([a for a in pool if a.get("yield_pct") is not None and (a.get("n") or 0) >= 200], key=lambda a: -a["yield_pct"])
    sales = [a["sale_median"] for a in pool if a.get("sale_median")]
    busiest = sorted(pool, key=lambda a: -(a.get("n") or 0))[:10]
    cheap = sorted(ones, key=lambda t: t[1]["median"])[:5]
    dear = sorted(ones, key=lambda t: -t[1]["median"])[:5]
    # Sale price per sq ft, month by month: the median across areas with a figure that month.
    months = {}
    for a in pool:
        for p in a.get("sale_trend") or []:
            months.setdefault(p["m"], []).append(p["psf"])
    psf = [(m, statistics.median(v)) for m, v in sorted(months.items()) if len(v) >= 10][-24:]
    ch = load("changes.json", {}) or {}
    moved = [m for m in ch.get("moved") or []][:10]
    hist = (load("stay_history.json", {}) or {}).get("days") or []
    stay = hist[-1] if hist else {}
    when = nice_date(through) or through
    def rows(items, val, depth=1):
        return "".join(f"<li>{area_link(a, depth)}: {val(a, u)}</li>" for a, u in items)
    facts = [(f"{total:,}", "rent contracts in the last 12 months"), (aed(one_med) if one_med else "—", "typical yearly rent, 1-bedroom (median of areas)"),
             (aed(round(statistics.median(sales), -3)) if sales else "—", "typical sale price, all homes (median of areas)"),
             (f"{statistics.median([a['yield_pct'] for a in yields]):.1f}%" if yields else "—", "typical gross rental yield")]
    if stay.get("hotels"):
        facts.append((aed(stay["hotels"]["all"][0]), f"typical hotel night ({stay['hotels']['all'][1]} hotels priced)"))
    body = (f"<h1>Dubai rents this month</h1><p class=sub>From Ejari rent contracts registered with the Dubai Land Department, to {e(when or '')}. Updated three times a day.</p>"
            f'<a class=btn href="../">Open the map</a>'
            "<div class=facts>" + "".join(f"<div><b>{e(v)}</b><span>{e(t)}</span></div>" for v, t in facts) + "</div>"
            "<h2>Busiest rental markets</h2><p class=note>By rent contracts registered in the last 12 months.</p><ol>"
            + "".join(f"<li>{area_link(a, 1)}: {a['n']:,} contracts, typically {aed(a['median'])} a year</li>" for a in busiest if a.get("median")) + "</ol>"
            + "<h2>Cheapest areas for a 1-bedroom</h2><ol>" + rows(cheap, lambda a, u: f"{aed(u['median'])} a year ({u.get('n') or 0:,} contracts)") + "</ol>"
            + "<h2>Dearest areas for a 1-bedroom</h2><ol>" + rows(dear, lambda a, u: f"{aed(u['median'])} a year ({u.get('n') or 0:,} contracts)") + "</ol>"
            + "<h2>Best gross rental yields</h2><ol>" + "".join(f"<li>{area_link(a, 1)}: {a['yield_pct']:.1f}% a year</li>" for a in yields[:5]) + '</ol><p><a href="../yields/">All yields</a></p>'
            + (f"<h2>Sale prices per sq ft</h2><p class=note>Median across areas, month by month (AED per sq ft).</p>{chart(psf, 'Median sale price per sq ft, month by month')}" if psf else "")
            + ("<h2>What moved since the previous publication</h2><ul>" + "".join(
                f"<li>{e(place(m.get('area', '')))}{' · ' + e(m['unit']) if m.get('unit') else ''}: {m.get('pct', 0):+}%</li>" for m in moved) + "</ul>" if moved else "")
            + (f"<h2>A night in Dubai</h2><p>Typical hotel night: <b>{aed(stay['hotels']['all'][0])}</b> across {stay['hotels']['all'][1]} hotels"
               + (f"; holiday homes and serviced apartments: <b>{aed(stay['homes']['all'][0])}</b> across {stay['homes']['all'][1]}" if stay.get("homes") else "")
               + f". The lowest offer on booking sites for two nights two to three weeks ahead, {e(nice_date(stay.get('d')) or '')}.</p>" if stay.get("hotels") else ""))
    faq = []
    if one_med:
        faq.append(("What is the typical rent for a 1-bedroom apartment in Dubai?", f"The median of Dubai's areas is {aed(one_med)} a year, from Ejari rent contracts to {when}. It runs from {aed(cheap[0][1]['median'])} in {place(cheap[0][0]['label'])} to {aed(dear[0][1]['median'])} in {place(dear[0][0]['label'])}."))
    if busiest:
        faq.append(("Which area of Dubai has the most rent contracts?", f"{place(busiest[0]['label'])}, with {busiest[0]['n']:,} rent contracts registered in the last 12 months."))
    if yields:
        faq.append(("Where are the best rental yields in Dubai?", f"{place(yields[0]['label'])} has the highest gross rental yield among busy areas, about {yields[0]['yield_pct']:.1f}% a year (yearly rent divided by the sale price)."))
    faq.append(("Are these asking prices?", "No. They are medians of rents actually registered in Ejari with the Dubai Land Department, not prices from listing sites, and not the RERA rental index."))
    desc = f"Dubai rents to {when}: {total:,} contracts, a 1-bedroom typically {aed(one_med) if one_med else ''} a year, the busiest and cheapest areas and the best yields."
    return layout("Dubai rents this month", desc, "stats/", 1, body, faq)


def areas_page(areas, through):
    one = "1-bedroom apartments"
    rows = []
    for a in sorted(areas, key=lambda a: place(a["label"])):
        u = unit_of(a, one)
        cell = lambda v, f=lambda v: f"{v:,.0f}": f'<td class=r data-v="{v if v is not None else ""}">{f(v) if v is not None else "—"}</td>'
        rows.append(f"<tr><td>{area_link(a, 1)}</td>" + cell(a.get("median") if a.get("median_kind") != "unit" else None) + cell(u.get("median"))
                    + cell(round(a["sale_median"], -3) if a.get("sale_median") else None).replace("<td class=r", "<td class='r opt'")
                    + cell(a.get("yield_pct"), lambda v: f"{v:.1f}%") + cell(a.get("n")) + "</tr>")
    body = (f"<h1>All Dubai areas: rents, sale prices and yields</h1><p class=sub>{len(areas)} areas, from Ejari rent contracts to {e(nice_date(through) or '')}. Tap a column to sort.</p>"
            '<a class=btn href="../">Open the map</a><table class=sortable><thead><tr><th>Area</th><th class=r>Rent, all homes</th><th class=r>Rent, 1-bed</th><th class="r opt">Sale price</th><th class=r>Yield</th><th class=r>Contracts</th></tr></thead><tbody>'
            + "".join(rows) + "</tbody></table><p class=note>Median yearly rent and sale price in AED; gross yield is yearly rent divided by the sale price.</p>" + sort_script())
    return layout("All Dubai areas: rents, sale prices and yields", f"Every Dubai area's median yearly rent, sale price and gross yield, from Ejari contracts to {nice_date(through) or ''}.", "areas/", 1, body)


def unit_page(areas, through, u, s, max_=None):
    items = sorted([(a, unit_of(a, u)) for a in areas if solid(a) and unit_of(a, u).get("median") and (unit_of(a, u).get("n") or 0) >= THIN
                    and (max_ is None or unit_of(a, u)["median"] < max_)], key=lambda t: t[1]["median"])
    what = u.replace(" apartments", "").replace("Studios", "studio")
    title = f"{what.capitalize()} rents in Dubai by area" if max_ is None else f"Dubai areas where a 1-bedroom rents for under AED {max_:,}"
    path = f"rents/{s}/" if max_ is None else f"rents/1-bedroom-under-{max_}/"
    rows = "".join(f"<tr><td>{area_link(a, 2)}</td><td class=r data-v=\"{x['median']}\">{x['median']:,.0f}</td><td class=r data-v=\"{x.get('n') or ''}\">{(x.get('n') or 0):,}</td>"
                   f"<td class='r opt' data-v=\"{x.get('yield') if x.get('yield') is not None else ''}\">{(str(x['yield']) + '%') if x.get('yield') is not None else '—'}</td></tr>" for a, x in items)
    body = (f"<h1>{e(title)}</h1><p class=sub>{len(items)} areas, cheapest first: the median yearly rent from Ejari contracts to {e(nice_date(through) or '')} (areas with {THIN}+ contracts; industrial zones left out).</p>"
            f'<a class=btn href="{e(map_link("../../", "median", u, max_=max_))}">See them on the map</a>'
            "<table class=sortable><thead><tr><th>Area</th><th class=r>AED a year</th><th class=r>Contracts</th><th class='r opt'>Gross yield</th></tr></thead><tbody>" + rows + "</tbody></table>" + sort_script())
    faq = [(f"What is the cheapest area in Dubai for a {what} rent?", f"{place(items[0][0]['label'])}, where the median is {aed(items[0][1]['median'])} a year ({(items[0][1].get('n') or 0):,} contracts)."),
           (f"What is the typical {what} rent in Dubai?", f"The median of these areas is {aed(statistics.median([x['median'] for _, x in items]))} a year.")] if items else []
    return path, layout(title, f"{title}: {len(items)} areas, cheapest first, from Ejari rent contracts.", path, 2, body, faq)


def yields_page(areas, through):
    items = sorted([a for a in areas if solid(a) and a.get("yield_pct") is not None], key=lambda a: -a["yield_pct"])
    rows = "".join(f"<tr><td>{area_link(a, 1)}</td><td class=r data-v=\"{a['yield_pct']}\">{a['yield_pct']:.1f}%</td><td class=r data-v=\"{a.get('median') or ''}\">{(a.get('median') or 0):,.0f}</td>"
                   f"<td class='r opt' data-v=\"{a.get('sale_median') or ''}\">{round(a['sale_median'], -3):,.0f}</td></tr>" for a in items if a.get("sale_median"))
    body = (f"<h1>Best rental yields in Dubai</h1><p class=sub>Gross yield: yearly rent divided by the sale price, all homes, from Ejari contracts and registered sales to {e(nice_date(through) or '')}.</p>"
            f'<a class=btn href="{e(map_link("../", "yield"))}">See yields on the map</a>'
            "<table class=sortable><thead><tr><th>Area</th><th class=r>Gross yield</th><th class=r>Rent, AED a year</th><th class='r opt'>Sale price, AED</th></tr></thead><tbody>" + rows + "</tbody></table>" + sort_script())
    faq = [("Which Dubai area has the best rental yield?", f"{place(items[0]['label'])}, about {items[0]['yield_pct']:.1f}% a year gross.")] if items else []
    return layout("Best rental yields in Dubai", "Dubai areas ranked by gross rental yield, from registered rents and sales.", "yields/", 1, body, faq)


def feed(through):
    """RSS: one item per publication with its notable moves, from our own history snapshots (newest first)."""
    snaps = []
    for p in sorted(glob.glob(os.path.join(ROOT, "data", "history", "*.json")))[-30:]:
        try:
            with open(p, encoding="utf-8") as f:
                snaps.append(json.load(f))
        except (OSError, ValueError):
            pass
    items = []
    for prev, cur in zip(snaps, snaps[1:]):
        moves = []
        for label, c in (cur.get("areas") or {}).items():
            p = (prev.get("areas") or {}).get(label)
            if p and c.get("m") and p.get("m") and (c.get("n") or 0) >= MOVE_N and abs(c["m"] / p["m"] - 1) >= MOVE:
                moves.append((label, c["m"] / p["m"] - 1, c["m"]))
        moves.sort(key=lambda t: -abs(t[1]))
        when = cur.get("through")
        desc = ("Notable moves: " + "; ".join(f"{place(l)} {pc:+.0%} to {aed(m)} a year" for l, pc, m in moves[:8]) + ".") if moves else "No area moved by 5% or more."
        items.append((when, f"Dubai rents to {nice_date(when) or when}", desc))
    items.reverse()
    now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    def rfc(d):
        try:
            return datetime.fromisoformat(d).replace(tzinfo=timezone.utc).strftime("%a, %d %b %Y 00:00:00 +0000")
        except (TypeError, ValueError):
            return now
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>'
            f"<title>Dubai Real Estate Atlas: what changed</title><link>{e(SITE)}</link><description>Each publication of Dubai's rent medians: the areas that moved by 5% or more.</description><lastBuildDate>{now}</lastBuildDate>"
            + "".join(f"<item><title>{e(t)}</title><link>{e(SITE + 'stats/')}</link><guid isPermaLink=\"false\">dubai-rents-{e(w or '')}</guid><pubDate>{rfc(w)}</pubDate><description>{e(d)}</description></item>" for w, t, d in items)
            + "</channel></rss>\n")


def main(out):
    d = load("areas.json", {}) or {}
    areas = [a for a in d.get("areas") or []]
    if not areas:
        print("site pages: no areas.json; nothing written")
        return 0
    through = d.get("to")
    ch = load("changes.json", {}) or {}
    pages = []
    write(out, "stats", stats_page(areas, through, ch.get("through_ccp"))); pages.append("stats/")
    write(out, "areas", areas_page(areas, through)); pages.append("areas/")
    write(out, "yields", yields_page(areas, through)); pages.append("yields/")
    for u, s in UNITS:
        path, text = unit_page(areas, through, u, s)
        write(out, path, text); pages.append(path)
    for b in BUDGETS:
        path, text = unit_page(areas, through, "1-bedroom apartments", None, max_=b)
        write(out, path, text); pages.append(path)
    with open(os.path.join(out, "feed.xml"), "w", encoding="utf-8") as f:
        f.write(feed(through))
    sm = os.path.join(out, "sitemap.xml")
    try:
        with open(sm, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        text = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n'
    text = text.replace("</urlset>", "".join(f"  <url><loc>{e(SITE + p)}</loc></url>\n" for p in pages) + "</urlset>")
    with open(sm, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"site pages: {len(pages)} pages and feed.xml written to {out}/")
    return len(pages)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "_site")
