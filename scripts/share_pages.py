"""One page per area: its figures in plain HTML (for search engines and link previews) and a button to the map.

Run by .github/workflows/pages.yml after the site is assembled:
    python3 scripts/share_pages.py _site
Writes _site/a/<slug>/index.html for every area in data/areas*.json, and the same page in Arabic at
_site/ar/a/<slug>/index.html. Each page carries the area's figure in its title and preview tags and a button that
opens the area's card on the map (../../?open=a:…). The slug rule is the same as `slug()` in
assets/app/companion.js; a collision stops the deploy rather than sending one area's link to another.
Look, header, footer, wording in both languages and rounding come from page_kit.py.
"""
import glob
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from page_kit import (ROOT, SITE, IMAGE, ACRONYMS, place, slug, aed, nice_date, unit_name, t, e, page as layout,  # noqa: E402,F401
                      load_history, area_change, change_text)


def headline(a):
    """The figure a preview leads with: 1-bedroom where known (what most people compare), else the area's own."""
    one = next((u for u in a.get("by_unit") or [] if u.get("u") == "1-bedroom apartments" and u.get("median")), None)
    if one:
        return one["median"], "1-bedroom apartment"
    if a.get("median"):
        unit = a.get("median_unit") if a.get("median_kind") == "unit" else None
        return a["median"], (unit or "home").lower().rstrip("s").replace("studio", "studio flat")
    return None, None


WHAT = {"1-bedroom apartment": "a 1-bedroom apartment", "studio flat": "a studio", "home": "a 1-bedroom apartment"}


def _units(a, lang="en"):
    """The breakdown table: one row per home type with rent, contracts, sale price and yield (exact medians, in AED)."""
    rows = []
    for u in a.get("by_unit") or []:
        if not u.get("median"):
            continue
        thin = u.get("n") is not None and u["n"] < 10
        rows.append("<tr{cls}><td>{u}</td><td class=r>{r}</td><td class='r opt'>{n}</td><td class=r>{s}</td><td class=r>{y}</td></tr>".format(
            cls=' class="thin"' if thin else "", u=e(unit_name(u["u"], lang)), r=f'{round(u["median"]):,}',
            n=f'{u["n"]:,}' if u.get("n") is not None else "—", s=f'{round(u["sale"]):,}' if u.get("sale") else "—",
            y=f'{u["yield"]:.1f}%' if u.get("yield") is not None else "—"))
    if not rows:
        return ""
    thin = any(u.get("n") is not None and u["n"] < 10 for u in a.get("by_unit") or [])
    return (f"<table><thead><tr><th>{e(t(lang, 'Home'))}</th><th class=r>{e(t(lang, 'Yearly rent'))}</th><th class='r opt'>{e(t(lang, 'Contracts'))}</th>"
            f"<th class=r>{e(t(lang, 'Sale price'))}</th><th class=r>{e(t(lang, 'Gross yield'))}</th></tr></thead><tbody>" + "".join(rows) + "</tbody></table>"
            + f"<p class=note>{e(t(lang, 'Median figures in AED. Italic rows rest on fewer than 10 contracts: a rough guide only.' if thin else 'Median figures in AED.'))}</p>")


def yoy(a, lang):
    v = a.get("sale_yoy")
    if v is None:
        return ""
    if abs(v) < 0.05:
        return t(lang, ", unchanged on a year ago (per sq ft)")
    return t(lang, ", down {p} in a year (per sq ft)" if v < 0 else ", up {p} in a year (per sq ft)", p=f"{abs(v):.1f}%")


def faqs(a, name, when, lang="en"):
    """Questions people search for, answered from this area's own figures (nothing else)."""
    out, by = [], {u.get("u"): u for u in a.get("by_unit") or []}
    for u, what in (("1-bedroom apartments", "a 1-bedroom apartment"), ("Studios", "a studio"), ("2-bedroom apartments", "a 2-bedroom apartment")):
        x = by.get(u)
        if x and x.get("median"):
            out.append((t(lang, "What is the rent for {what} in {name}?", what=t(lang, what), name=name),
                        t(lang, "The median is {v} a year", v=aed(x["median"], lang)) + (t(lang, ", from {n} Ejari contracts", n=f"{x['n']:,}") if x.get("n") else "")
                        + (t(lang, ", to {when}", when=when) if when else "") + "."))
    if a.get("sale_median"):
        out.append((t(lang, "What do homes sell for in {name}?", name=name), t(lang, "The median sale price is {v}", v=aed(a["sale_median"], lang)) + yoy(a, lang) + "."))
    if a.get("yield_pct") is not None:
        out.append((t(lang, "What is the rental yield in {name}?", name=name), t(lang, "About {v} a year gross: the yearly rent divided by the sale price.", v=f"{a['yield_pct']:.1f}%")))
    if a.get("n"):
        out.append((t(lang, "How many rent contracts are registered in {name}?", name=name), t(lang, "{n} in the last 12 months.", n=f"{a['n']:,}")))
    return out


def page(a, through, lang="en", snaps=None):
    """A real page per area (figures in the HTML, so search engines and link previews can read them), with a
    button to open the area on the map. No automatic redirect: the page is useful on its own."""
    med, what = headline(a)
    name = place(a["label"])
    title = t(lang, "{name} rents: {v} a year for {what}", name=name, v=aed(med, lang), what=t(lang, WHAT.get(what, "a 1-bedroom apartment"))) if med else t(lang, "{name} rents", name=name)
    when = nice_date(a.get("through") or through, lang)
    desc = t(lang, "Median yearly rent from Ejari contracts registered with the Dubai Land Department") + (t(lang, ", to {when}", when=when) if when else "") + t(lang, ". Every home type, sale prices and yields, on the map.")
    up = "../../../" if lang == "ar" else "../../"
    target = up + "?" + ("lang=ar&" if lang == "ar" else "") + "open=a:" + urllib.parse.quote(a["label"])  # opens the area's card on the map
    ccp = a.get("source") == "ccp"
    source = t(lang, "Continental Club Property (continentalclub.ae), CC BY 4.0, based on Dubai Land Department open data" if ccp
               else "Dubai Data (datadubai.ae), CC BY 4.0, based on Dubai Land Department open data (Ejari rent contracts, registered sales)")
    summary = []
    if a.get("median") and a.get("median_kind") != "unit":
        summary.append("<li>" + t(lang, "{v} median yearly rent, all homes, from {n} contracts in the last 12 months", v=f"<b>{aed(a['median'], lang)}</b>", n=f"{a.get('n', 0):,}") + "</li>")
    elif a.get("n"):
        summary.append("<li>" + t(lang, "{n} rent contracts in the last 12 months", n=f"{a['n']:,}") + "</li>")
    rc = a.get("rent_change") or {}
    ch = (rc["pct"], rc["since"]) if rc.get("pct") is not None and rc.get("since") else area_change(snaps or [], a["label"])
    if ch:
        summary.append("<li>" + e(t(lang, "Rent, all homes: {d} since {when} (our own snapshots).", d=change_text(ch[0], lang), when=nice_date(ch[1], lang))) + "</li>")
    if a.get("sale_median"):
        summary.append("<li>" + t(lang, "{v} median sale price", v=f"<b>{aed(a['sale_median'], lang)}</b>") + e(yoy(a, lang)) + "</li>")
    if a.get("yield_pct") is not None:
        summary.append("<li>" + t(lang, "{v} gross rental yield", v=f"<b>{a['yield_pct']:.1f}%</b>") + "</li>")
    dld = ", ".join(a.get("dld_areas") or [])
    faq = faqs(a, name, when, lang)
    body = (f"<h1>{e(name)}</h1>"
            f"<p class=sub>{e(t(lang, 'DLD area: {dld}. ', dld=dld)) if dld else ''}{e(t(lang, 'What tenants actually pay, from registered contracts'))}{e(t(lang, ', to {when}', when=when)) if when else ''}.</p>"
            f"<ul>{''.join(summary)}</ul>"
            f'<a class=btn href="{e(target)}">{e(t(lang, "Open {name} on the map", name=name))}</a>'
            f"{_units(a, lang)}"
            f"<p class=note>{e(t(lang, 'Medians from {src}. Not asking prices, and not the RERA rental index. An independent tool, not an official DLD service.', src=source))}</p>")
    return layout(lang, "a/" + slug(a["label"]) + "/", title, desc, body, faq)


def main(out):
    areas, through = {}, None
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "areas*.json"))):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        through = through or d.get("to")
        for a in d.get("areas") or []:
            areas.setdefault(a["label"], a)  # areas.json (all homes) first: it has every home type
    snaps = load_history()
    seen = {}
    for label, a in areas.items():
        s = slug(label)
        if not s or s in seen:
            raise SystemExit(f"share pages: '{label}' and '{seen.get(s)}' would share the link a/{s}/")
        seen[s] = label
        for lang, base in (("en", out), ("ar", os.path.join(out, "ar"))):
            os.makedirs(os.path.join(base, "a", s), exist_ok=True)
            with open(os.path.join(base, "a", s, "index.html"), "w", encoding="utf-8") as f:
                f.write(page(a, through, lang, snaps))
    # A sitemap so search engines find the area pages, in both languages (submit it once in Search Console).
    with open(os.path.join(out, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                f"  <url><loc>{e(SITE)}</loc></url>\n"
                + "".join(f"  <url><loc>{e(SITE + p + 'a/' + k + '/')}</loc></url>\n" for k in sorted(seen) for p in ("", "ar/")) + "</urlset>\n")
    print(f"share pages: {len(seen)} areas written to {out}/a/ and {out}/ar/a/")
    return len(seen)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "_site")
