"""Pages written at deploy, beside the area pages (share_pages.py): real HTML, so search engines and link previews
read the figures. All from the published data files; nothing invented. Every page is written in English and, under
ar/, in Arabic (page_kit.py: look, header, footer, wording, rounding).

  stats/                       "Dubai rents this month": the headline figures, busiest rental markets, cheapest and
                               dearest areas for a 1-bedroom, best yields, sale prices per sq ft month by month, rent
                               over the past four weeks (once our history covers it), the moves since the previous
                               publication, hotel and holiday home nights; questions and answers (also schema.org FAQPage).
  areas/                       every area: rent (all homes and 1-bed), sale price, yield, contracts; sortable.
  rents/<home>/                one page per common home size: areas cheapest first.
  rents/1-bedroom-under-<n>/   areas where a 1-bedroom rents for less than n a year.
  yields/                      the best gross rental yields.
  feed.xml                     RSS: each publication's notable moves (5% or more, from 30+ contracts), from our own
                               history snapshots (English).
"Typical" Dubai figures are the middle contract (each area's median weighted by its contracts), the same figure the
map's dial shows for all of Dubai. Rankings (cheapest, dearest, best yields) take areas with 100+ contracts, so one
unusual building can't top them. Each page links into the map with the matching view, home and budget; the
sitemap gets every page in both languages.

Usage: python3 scripts/site_pages.py _site   (after share_pages.py, which writes the sitemap first)
"""
import glob
import json
import os
import statistics
import sys
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from page_kit import (ROOT, SITE, IMAGE, place, slug, aed, nice_date, unit_name, t, e, page, r3, w_median,  # noqa: E402,F401
                      load_history, base_snapshot, area_change, change_text, HISTORY_N)

THIN = 10            # as atlas.js: figures from fewer contracts are a rough guide, left out of lists
RANK_N = 100         # rankings (cheapest, dearest, best yields) need this many contracts
MOVE = 0.05          # the feed lists moves of at least this much
MOVE_N = 30          # from at least this many contracts
UNITS = [("Studios", "studio"), ("1-bedroom apartments", "1-bedroom"), ("2-bedroom apartments", "2-bedroom"), ("3-bedroom apartments", "3-bedroom")]
WHAT = {"Studios": "a studio", "1-bedroom apartments": "a 1-bedroom apartment", "2-bedroom apartments": "a 2-bedroom apartment", "3-bedroom apartments": "a 3-bedroom apartment"}
BUDGETS = [50000, 60000, 75000, 100000]
TYPICAL = "Typical means the middle contract: half of Dubai's registered contracts are below it and half above (each area's median, weighted by its contracts). The map's big number is the same figure for what is on screen, so it matches when the map shows all of Dubai."
RANK_NOTE = "Areas with {n}+ 1-bedroom contracts, so one unusual building can't top the list."


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


def map_link(prefix, view="median", home=None, area=None, max_=None, lang="en"):
    q = {"lang": "ar"} if lang == "ar" else {}
    q["view"] = view
    if home is not None:
        q["home"] = "homes:" + home
    if max_:
        q["max"] = str(max_)
    if area:
        q["open"] = "a:" + area
    return prefix + "?" + urllib.parse.urlencode(q, safe=":|")


def sort_script():
    return """<script>
// Column headers sort the table (click again to reverse); numbers sort as numbers, blanks last.
document.querySelectorAll('table.sortable').forEach(t=>{const hs=[...t.tHead.rows[0].cells];hs.forEach((h,i)=>{const b=document.createElement('button');b.type='button';b.textContent=h.textContent;h.textContent='';h.append(b);
  b.addEventListener('click',()=>{const asc=h.getAttribute('aria-sort')!=='ascending';hs.forEach(x=>x.removeAttribute('aria-sort'));h.setAttribute('aria-sort',asc?'ascending':'descending');
    const rows=[...t.tBodies[0].rows],v=r=>{const c=r.cells[i],d=c.dataset.v;return d!==undefined?(d===''?null:+d):c.textContent.trim().toLowerCase()};
    rows.sort((a,b)=>{const x=v(a),y=v(b);if(x===null)return 1;if(y===null)return -1;return (x>y?1:x<y?-1:0)*(asc?1:-1)});rows.forEach(r=>t.tBodies[0].append(r))})})});
</script>"""


def chart(points, label):
    """A small line chart (SVG) of (month, value) pairs. The scale starts well below the lowest month (at 70% of it,
    rounded down), so a 10% move looks like 10%, not like a doubling; gridlines at the top, middle and bottom."""
    if len(points) < 3:
        return ""
    w, h, pad = 680, 200, 54
    vs = [v for _, v in points]
    hi = max(vs) * 1.04
    lo = min(vs) * 0.7
    step = 10 ** max(0, len(str(int(hi - lo))) - 1)
    lo, hi = (lo // step) * step, -(-hi // step) * step
    x = lambda i: pad + i * (w - pad - 12) / (len(points) - 1)
    y = lambda v: 12 + (1 - (v - lo) / (hi - lo)) * (h - 44)
    d = "".join(("M" if i == 0 else "L") + f"{x(i):.1f},{y(v):.1f}" for i, (_, v) in enumerate(points))
    grid = "".join(f'<line class=ax x1="{pad}" x2="{w - 12}" y1="{y(g):.1f}" y2="{y(g):.1f}" stroke-width="1"/><text x="{pad - 6}" y="{y(g) + 4:.1f}" font-size="12" text-anchor="end">{r3(g):,}</text>'
                   for g in (lo, (lo + hi) / 2, hi))
    ticks = [(0, "start"), (len(points) // 2, "middle"), (len(points) - 1, "end")]
    return (f'<svg class="chart" viewBox="0 0 {w} {h}" role="img" aria-label="{e(label)}" direction="ltr">{grid}<path class=ln d="{d}" fill="none" stroke-width="2.5"/>'
            + "".join(f'<text x="{x(i):.1f}" y="{h - 10}" font-size="12" text-anchor="{a}">{points[i][0]}</text>' for i, a in ticks) + "</svg>")


def write(out, path, text):
    os.makedirs(os.path.join(out, path), exist_ok=True)
    with open(os.path.join(out, path, "index.html"), "w", encoding="utf-8") as f:
        f.write(text)


def area_link(a, depth, lang="en"):
    up = "../" * (depth + (1 if lang == "ar" else 0))
    return f'<a href="{up}{"ar/" if lang == "ar" else ""}a/{slug(a["label"])}/">{e(place(a["label"]))}</a>'


def dubai_one_bed(areas):
    """Dubai's typical 1-bedroom rent: the middle contract across every area with a figure (as the map's dial)."""
    one = "1-bedroom apartments"
    return w_median([(unit_of(a, one).get("median"), unit_of(a, one).get("n")) for a in areas if solid(a) and unit_of(a, one).get("median")])


def stats_page(areas, through, ccp_through, lang="en", snaps=None):
    one = "1-bedroom apartments"
    pool = [a for a in areas if solid(a)]
    ones = [(a, unit_of(a, one)) for a in pool if unit_of(a, one).get("median") and (unit_of(a, one).get("n") or 0) >= THIN]
    ranked = [(a, u) for a, u in ones if (u.get("n") or 0) >= RANK_N]
    total = sum(a.get("n") or 0 for a in areas)
    one_med = dubai_one_bed(areas)
    yields = sorted([a for a in pool if a.get("yield_pct") is not None and (a.get("n") or 0) >= RANK_N], key=lambda a: -a["yield_pct"])
    sale_med = w_median([(a.get("sale_median"), a.get("n")) for a in pool if a.get("sale_median")])
    yld_med = w_median([(a["yield_pct"], a.get("n")) for a in yields])
    busiest = sorted(pool, key=lambda a: -(a.get("n") or 0))[:10]
    cheap = sorted(ranked, key=lambda t_: t_[1]["median"])[:5]
    dear = sorted(ranked, key=lambda t_: -t_[1]["median"])[:5]
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
    when = nice_date(through, lang) or through or ""
    L = lambda s, **kw: e(t(lang, s, **kw))
    def rows(items, val):
        return "".join(f"<li>{area_link(a, 1, lang)}: {val(a, u)}</li>" for a, u in items)
    facts = [(f"{total:,}", t(lang, "rent contracts in the last 12 months")), (aed(one_med, lang) if one_med else "—", t(lang, "typical yearly rent for a 1-bedroom, all of Dubai")),
             (aed(sale_med, lang) if sale_med else "—", t(lang, "typical sale price, all homes")),
             (f"{yld_med:.1f}%" if yld_med is not None else "—", t(lang, "typical gross rental yield"))]
    if stay.get("hotels"):
        facts.append((aed(stay["hotels"]["all"][0], lang), t(lang, "typical hotel night ({n} hotels priced)", n=stay["hotels"]["all"][1])))
    # Rent over four weeks, from our own snapshots (appears once the history is four weeks deep).
    trend = ""
    base = base_snapshot(snaps or [])
    if base:
        cur = snaps[-1]["areas"]
        all_now = w_median([(x.get("m"), x.get("n")) for x in cur.values() if x.get("m")])
        all_then = w_median([(x.get("m"), x.get("n")) for x in base["areas"].values() if x.get("m")])
        moves = sorted([(lbl, c[0]) for lbl in cur for c in [area_change(snaps, lbl)] if c], key=lambda m: -abs(m[1]))[:6]
        if all_now and all_then:
            trend = (f"<h2>{L('Rent over the past four weeks')}</h2><p>{L('Typical rent, all homes, all of Dubai: {d} since {when}, from our own snapshots of each publication.', d=change_text((all_now / all_then - 1) * 100, lang), when=nice_date(base['through'], lang))}</p>"
                     + (f"<p class=note>{L('Biggest moves since {when} (areas with {n}+ contracts):', when=nice_date(base['through'], lang), n=HISTORY_N)}</p><ul>"
                        + "".join(f"<li>{e(place(lbl))}: {e(change_text(p, lang))}</li>" for lbl, p in moves) + "</ul>" if moves else ""))
    chart_note = ""
    if len(psf) >= 3:
        a0, b0 = psf[0][1], psf[-1][1]
        chart_note = f"<p class=note>{L('{d} over {n} months, from {a} to {b} per sq ft.', d=change_text((b0 / a0 - 1) * 100, lang).capitalize() if lang != 'ar' else change_text((b0 / a0 - 1) * 100, lang), n=len(psf) - 1, a=aed(a0, lang), b=aed(b0, lang))}</p>"
    body = (f"<h1>{L('Dubai rents this month')}</h1><p class=sub>{L('From Ejari rent contracts registered with the Dubai Land Department, to {when}. Updated three times a day.', when=when)}</p>"
            f'<a class=btn href="{e(map_link("../" * (2 if lang == "ar" else 1), lang=lang))}">{L("Open the map")}</a>'
            "<div class=facts>" + "".join(f"<div><b>{e(v)}</b><span>{e(x)}</span></div>" for v, x in facts) + "</div>"
            + "<p class=note>" + L(TYPICAL) + "</p>"
            f"<h2>{L('Busiest rental markets')}</h2><p class=note>{L('By rent contracts registered in the last 12 months, all homes.')}</p><ol>"
            + "".join(f"<li>{area_link(a, 1, lang)}: " + L("{n} contracts, typically {v} a year", n=f"{a['n']:,}", v=aed(a["median"], lang)) + "</li>" for a in busiest if a.get("median")) + "</ol>"
            + trend
            + f"<h2>{L('Cheapest areas for a 1-bedroom')}</h2><p class=note>{L(RANK_NOTE, n=RANK_N)}</p><ol>" + rows(cheap, lambda a, u: L('{v} a year ({n} contracts)', v=aed(u['median'], lang), n=f"{u.get('n') or 0:,}")) + "</ol>"
            + f"<h2>{L('Dearest areas for a 1-bedroom')}</h2><ol>" + rows(dear, lambda a, u: L('{v} a year ({n} contracts)', v=aed(u['median'], lang), n=f"{u.get('n') or 0:,}")) + "</ol>"
            + f"<h2>{L('Best gross rental yields')}</h2><ol>" + "".join(f"<li>{area_link(a, 1, lang)}: {L('{v} a year', v=format(a['yield_pct'], '.1f') + '%')}</li>" for a in yields[:5])
            + f'</ol><p><a href="../yields/">{L("All yields")}</a></p>'
            + (f"<h2>{L('Sale prices per sq ft')}</h2><p class=note>{L('Median across areas, month by month (AED per sq ft).')}</p>{chart(psf, t(lang, 'Median sale price per sq ft, month by month'))}{chart_note}" if psf else "")
            + (f"<h2>{L('What moved since the previous publication')}</h2><ul>" + "".join(
                f"<li>{e(place(m.get('area', '')))}{' · ' + e(unit_name(m['unit'], lang)) if m.get('unit') else ''}: {m.get('pct', 0):+}%</li>" for m in moved) + "</ul>" if moved else "")
            + (f"<h2>{L('A night in Dubai')}</h2><p>" + t(lang, "Typical hotel night: {v} across {n} hotels", v=f"<b>{aed(stay['hotels']['all'][0], lang)}</b>", n=stay['hotels']['all'][1])
               + (t(lang, "; holiday homes and serviced apartments: {v} across {n}", v=f"<b>{aed(stay['homes']['all'][0], lang)}</b>", n=stay['homes']['all'][1]) if stay.get("homes") else "")
               + L(". The lowest offer on booking sites for two nights two to three weeks ahead, {when}.", when=nice_date(stay.get('d'), lang) or '') + "</p>" if stay.get("hotels") else ""))
    faq = []
    if one_med and cheap and dear:
        faq.append((t(lang, "What is the typical rent for a 1-bedroom apartment in Dubai?"), t(lang, "About {v} a year: half of Dubai's registered 1-bedroom contracts are below it, from Ejari rent contracts to {when}. Busy areas run from {lo} in {lo_area} to {hi} in {hi_area}.",
                    v=aed(one_med, lang), when=when, lo=aed(cheap[0][1]['median'], lang), lo_area=place(cheap[0][0]['label']), hi=aed(dear[0][1]['median'], lang), hi_area=place(dear[0][0]['label']))))
    if busiest:
        faq.append((t(lang, "Which area of Dubai has the most rent contracts?"), t(lang, "{area}, with {n} rent contracts registered in the last 12 months.", area=place(busiest[0]['label']), n=f"{busiest[0]['n']:,}")))
    if yields:
        faq.append((t(lang, "Where are the best rental yields in Dubai?"), t(lang, "{area} has the highest gross rental yield among busy areas, about {v} a year (yearly rent divided by the sale price).", area=place(yields[0]['label']), v=f"{yields[0]['yield_pct']:.1f}%")))
    faq.append((t(lang, "Are these asking prices?"), t(lang, "No. They are medians of rents actually registered in Ejari with the Dubai Land Department, not prices from listing sites, and not the RERA rental index.")))
    desc = t(lang, "Dubai rents to {when}: {n} contracts, a 1-bedroom typically {v} a year, the busiest and cheapest areas and the best yields.", when=when, n=f"{total:,}", v=aed(one_med, lang) if one_med else "—")
    return page(lang, "stats/", t(lang, "Dubai rents this month"), desc, body, faq)


def areas_page(areas, through, lang="en"):
    one = "1-bedroom apartments"
    L = lambda s, **kw: e(t(lang, s, **kw))
    rows = []
    for a in sorted(areas, key=lambda a: place(a["label"])):
        u = unit_of(a, one)
        cell = lambda v, f=lambda v: f"{v:,.0f}": f'<td class=r data-v="{v if v is not None else ""}">{f(v) if v is not None else "—"}</td>'
        rows.append(f"<tr><td>{area_link(a, 1, lang)}</td>" + cell(a.get("median") if a.get("median_kind") != "unit" else None) + cell(u.get("median"))
                    + cell(round(a["sale_median"], -3) if a.get("sale_median") else None).replace("<td class=r", "<td class='r opt'")
                    + cell(a.get("yield_pct"), lambda v: f"{v:.1f}%") + cell(a.get("n")).replace("<td class=r", "<td class='r opt'") + "</tr>")
    title = t(lang, "All Dubai areas: rents, sale prices and yields")
    when = nice_date(through, lang) or ""
    body = (f"<h1>{e(title)}</h1><p class=sub>{L('{n} areas, from Ejari rent contracts to {when}. Tap a column to sort.', n=len(areas), when=when)}</p>"
            f'<a class=btn href="{e(map_link("../" * (2 if lang == "ar" else 1), lang=lang))}">{L("Open the map")}</a><table class=sortable><thead><tr><th>{L("Area")}</th><th class=r>{L("Rent, all homes")}</th><th class=r>{L("Rent, 1-bed")}</th><th class="r opt">{L("Sale price")}</th><th class=r>{L("Yield")}</th><th class="r opt">{L("Contracts")}</th></tr></thead><tbody>'
            + "".join(rows) + f"</tbody></table><p class=note>{L('Median yearly rent and sale price in AED; gross yield is yearly rent divided by the sale price.')}</p>" + sort_script())
    return page(lang, "areas/", title, t(lang, "Every Dubai area's median yearly rent, sale price and gross yield, from Ejari contracts to {when}.", when=when), body)


def unit_page(areas, through, u, s, max_=None, lang="en"):
    items = sorted([(a, unit_of(a, u)) for a in areas if solid(a) and unit_of(a, u).get("median") and (unit_of(a, u).get("n") or 0) >= THIN
                    and (max_ is None or unit_of(a, u)["median"] < max_)], key=lambda t_: t_[1]["median"])
    L = lambda x, **kw: e(t(lang, x, **kw))
    home = unit_name(u, lang) if lang == "ar" else u.replace(" apartments", "").replace("Studios", "studio").capitalize()
    title = t(lang, "{home} rents in Dubai by area", home=home) if max_ is None else t(lang, "Dubai areas where a 1-bedroom rents for under {v}", v=aed(max_, lang, exact=True))
    path = f"rents/{s}/" if max_ is None else f"rents/1-bedroom-under-{max_}/"
    when = nice_date(through, lang) or ""
    rows = "".join(f'<tr><td>{area_link(a, 2, lang)}</td><td class=r data-v="{x["median"]}">{x["median"]:,.0f}</td><td class=r data-v="{x.get("n") or ""}">{(x.get("n") or 0):,}</td>'
                   f'<td class="r opt" data-v="{x.get("yield") if x.get("yield") is not None else ""}">{(str(x["yield"]) + "%") if x.get("yield") is not None else "—"}</td></tr>' for a, x in items)
    body = (f"<h1>{e(title)}</h1><p class=sub>{L('{n} areas, cheapest first: the median yearly rent from Ejari contracts to {when} (areas with {m}+ contracts; industrial zones left out).', n=len(items), when=when, m=THIN)}</p>"
            f'<a class=btn href="{e(map_link("../" * (3 if lang == "ar" else 2), "median", u, max_=max_, lang=lang))}">{L("See them on the map")}</a>'
            f"<table class=sortable><thead><tr><th>{L('Area')}</th><th class=r>{L('AED a year')}</th><th class=r>{L('Contracts')}</th><th class='r opt'>{L('Gross yield')}</th></tr></thead><tbody>" + rows + "</tbody></table>" + sort_script())
    what = t(lang, WHAT[u])
    faq = [(t(lang, "What is the cheapest area in Dubai for {what}?", what=what), t(lang, "{area}, where the median is {v} a year ({n} contracts).", area=place(items[0][0]['label']), v=aed(items[0][1]['median'], lang), n=f"{(items[0][1].get('n') or 0):,}")),
           (t(lang, "What is the typical rent for {what} in Dubai?", what=what), t(lang, "About {v} a year: half of these areas' registered contracts are below it.", v=aed(w_median([(x['median'], x.get('n')) for _, x in items]), lang)))] if items else []
    return path, page(lang, path, title, t(lang, "{title}: {n} areas, cheapest first, from Ejari rent contracts.", title=title, n=len(items)), body, faq)


def yields_page(areas, through, lang="en"):
    items = sorted([a for a in areas if solid(a) and a.get("yield_pct") is not None and (a.get("n") or 0) >= RANK_N], key=lambda a: -a["yield_pct"])
    L = lambda x, **kw: e(t(lang, x, **kw))
    rows = "".join(f"<tr><td>{area_link(a, 1, lang)}</td><td class=r data-v=\"{a['yield_pct']}\">{a['yield_pct']:.1f}%</td><td class=r data-v=\"{a.get('median') or ''}\">{(a.get('median') or 0):,.0f}</td>"
                   f"<td class='r opt' data-v=\"{a.get('sale_median') or ''}\">{round(a['sale_median'], -3):,.0f}</td></tr>" for a in items if a.get("sale_median"))
    title = t(lang, "Best rental yields in Dubai")
    body = (f"<h1>{e(title)}</h1><p class=sub>{L('Gross yield: yearly rent divided by the sale price, all homes, from Ejari contracts and registered sales to {when}. Areas with {n}+ contracts.', when=nice_date(through, lang) or '', n=RANK_N)}</p>"
            f'<a class=btn href="{e(map_link("../" * (2 if lang == "ar" else 1), "yield", lang=lang))}">{L("See yields on the map")}</a>'
            f"<table class=sortable><thead><tr><th>{L('Area')}</th><th class=r>{L('Gross yield')}</th><th class=r>{L('Rent, AED a year')}</th><th class='r opt'>{L('Sale price, AED')}</th></tr></thead><tbody>" + rows + "</tbody></table>" + sort_script())
    faq = [(t(lang, "Which Dubai area has the best rental yield?"), t(lang, "{area}, about {v} a year gross.", area=place(items[0]['label']), v=f"{items[0]['yield_pct']:.1f}%"))] if items else []
    return page(lang, "yields/", title, t(lang, "Dubai areas ranked by gross rental yield, from registered rents and sales."), body, faq)


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
    snaps = load_history()
    pages = []
    for lang in ("en", "ar"):
        base = out if lang == "en" else os.path.join(out, "ar")
        here = []
        write(base, "stats", stats_page(areas, through, ch.get("through_ccp"), lang, snaps)); here.append("stats/")
        write(base, "areas", areas_page(areas, through, lang)); here.append("areas/")
        write(base, "yields", yields_page(areas, through, lang)); here.append("yields/")
        for u, s in UNITS:
            path, text = unit_page(areas, through, u, s, lang=lang)
            write(base, path, text); here.append(path)
        for b in BUDGETS:
            path, text = unit_page(areas, through, "1-bedroom apartments", None, max_=b, lang=lang)
            write(base, path, text); here.append(path)
        pages += [("ar/" if lang == "ar" else "") + p for p in here]
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
    print(f"site pages: {len(pages)} pages (English and Arabic) and feed.xml written to {out}/")
    return len(pages) // 2


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "_site")
