"""What the pages written at deploy share (share_pages.py, site_pages.py): the look, the header and footer, the
two languages, names, dates and how figures are rounded. Standard library only.

Languages: every page is written twice, in English at its own path and in Arabic under ar/ (right to left, the
same figures, Western digits as on Ejari contracts; area names stay as registered). `t(lang, text, **kw)` gives the
Arabic for an English phrase from AR below; a phrase missing there stops the deploy (tests check every page).

Rounding: figures in sentences, lists and headline boxes keep three significant figures (AED 36,700, AED 279,000,
AED 1,930,000), as the map's labels do (36.7k); tables keep the exact medians, as the map's area card does.
"""
import html
import json
import re
import unicodedata
from datetime import date
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.environ.get("SITE_URL") or "https://jamalxcode.github.io/dubai_map/"
IMAGE = SITE + "assets/share.png"
e = html.escape

ACRONYMS = {"JLT", "JVC", "JVT", "JBR", "DIFC", "DMCC", "MBR", "DSO", "IMPZ", "DIP", "DHCC", "DIC", "DMC", "UAE", "II", "III", "IV", "DXB"}
MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]


def place(name):
    """An area name as shown: all-capitals names in title case, keeping acronyms (same rule as T.place in i18n.js)."""
    if not re.search(r"[A-Z]{2}", name) or re.search(r"[a-z]", name):
        return name
    return re.sub(r"[A-Z][A-Z'’]*", lambda m: m.group(0) if m.group(0) in ACRONYMS else m.group(0)[0] + m.group(0)[1:].lower(), name)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def r3(v):
    """Three significant figures, as a whole number: 36,686 -> 36,700; 279,046 -> 279,000; 835 -> 835."""
    if v is None:
        return None
    v = float(v)
    return int(round(float(f"{v:.3g}"))) if abs(v) >= 100 else int(round(v))


def aed(n, lang="en", exact=False):
    v = round(n) if exact else r3(n)
    return f"{v:,} درهم" if lang == "ar" else f"AED {v:,}"


def nice_date(iso, lang="en"):
    try:
        d = date.fromisoformat(iso)
    except (TypeError, ValueError):
        return None
    return f"{d.day} {MONTHS_AR[d.month - 1]} {d.year}" if lang == "ar" else d.strftime("%-d %b %Y")


def unit_name(u, lang="en"):
    """A home type as shown (the same wording as T.unit in i18n.js)."""
    if lang != "ar":
        return u
    if re.match(r"^Studios?$", u or "", re.I):
        return "استوديوهات"
    m = re.match(r"^(\d+)-bedroom (apartments?|villas?)$", u or "", re.I)
    if not m:
        return AR.get(u, u)
    n, kind = int(m.group(1)), "فلل" if m.group(2).lower().startswith("villa") else "شقق"
    return kind + (" بغرفة نوم" if n == 1 else " بغرفتي نوم" if n == 2 else f" بـ{n} غرف نوم")


def t(lang, text, **kw):
    if lang == "ar":
        if text not in AR:
            raise KeyError(f"page text without Arabic: {text!r}")
        text = AR[text]
    return text.format(**kw) if kw else text


def pct(v, lang="en", sign=False):
    s = f"{v:+.1f}%" if sign else f"{v:.1f}%"
    return s


# English phrase -> Arabic. Placeholders must match (tests/test_site_pages.py checks every page renders in both).
AR = {
    "Dubai Real Estate Atlas": "أطلس دبي العقاري",
    "Market stats": "إحصاءات السوق", "All areas": "كل المناطق", "Best yields": "أفضل العوائد", "Open the map": "افتح الخريطة",
    "English": "English", "عربي": "عربي",
    "See all of Dubai on the map": "شاهد دبي كلها على الخريطة",
    "Questions and answers": "أسئلة وأجوبة", "More": "المزيد", "What changed (RSS)": "ما الذي تغيّر (RSS)",
    "{home} rents": "إيجارات {home}", "1-bed under AED {k}k": "غرفة نوم بأقل من {k} ألف درهم",
    "Studio": "استوديو", "1-bedroom": "غرفة نوم واحدة", "2-bedroom": "غرفتا نوم", "3-bedroom": "3 غرف نوم",
    "Medians from Dubai Data and Continental Club Property (CC BY 4.0), based on Dubai Land Department open data (Ejari rent contracts and registered sales); hotel and holiday home prices from booking sites via Xotelo. Not asking prices, and not the RERA rental index. An independent tool, not an official DLD service.":
        "القيم الوسيطة من بيانات دبي وكونتيننتال كلوب العقارية (CC BY 4.0)، بناءً على البيانات المفتوحة لدائرة الأراضي والأملاك في دبي (عقود الإيجار المسجلة في إيجاري والمبيعات المسجلة)؛ أسعار الفنادق وبيوت العطلات من مواقع الحجز عبر Xotelo. ليست أسعارًا معروضة، وليست مؤشر إيجارات ريرا. أداة مستقلة، وليست خدمة رسمية من دائرة الأراضي والأملاك.",
    # Market stats
    "Dubai rents this month": "إيجارات دبي هذا الشهر",
    "From Ejari rent contracts registered with the Dubai Land Department, to {when}. Updated three times a day.":
        "من عقود الإيجار المسجلة في إيجاري لدى دائرة الأراضي والأملاك في دبي، حتى {when}. تُحدَّث ثلاث مرات يوميًا.",
    "rent contracts in the last 12 months": "عقد إيجار في آخر 12 شهرًا",
    "typical yearly rent for a 1-bedroom, all of Dubai": "الإيجار السنوي المعتاد لشقة بغرفة نوم، دبي كلها",
    "typical sale price, all homes": "سعر البيع المعتاد، كل المساكن",
    "typical gross rental yield": "العائد الإيجاري الإجمالي المعتاد",
    "typical hotel night ({n} hotels priced)": "ليلة فندقية معتادة ({n} فندقًا مسعّرًا)",
    "Typical means the middle contract: half of Dubai's registered contracts are below it and half above (each area's median, weighted by its contracts). The map's big number is the same figure for what is on screen, so it matches when the map shows all of Dubai.":
        "المعتاد يعني العقد الأوسط: نصف عقود دبي المسجلة أقل منه ونصفها أعلى (الوسيط في كل منطقة، مرجَّحًا بعدد عقودها). الرقم الكبير على الخريطة هو الرقم نفسه لما يظهر على الشاشة، فيتطابقان عندما تعرض الخريطة دبي كلها.",
    "Busiest rental markets": "أنشط أسواق الإيجار",
    "By rent contracts registered in the last 12 months, all homes.": "حسب عقود الإيجار المسجلة في آخر 12 شهرًا، كل المساكن.",
    "{n} contracts, typically {v} a year": "{n} عقدًا، {v} سنويًا في المعتاد",
    "Cheapest areas for a 1-bedroom": "أرخص المناطق لشقة بغرفة نوم", "Dearest areas for a 1-bedroom": "أغلى المناطق لشقة بغرفة نوم",
    "Areas with {n}+ 1-bedroom contracts, so one unusual building can't top the list.": "المناطق التي فيها {n} عقدًا أو أكثر لشقق بغرفة نوم، حتى لا يتصدّر القائمةَ مبنى واحد غير معتاد.",
    "{v} a year ({n} contracts)": "{v} سنويًا ({n} عقدًا)",
    "Best gross rental yields": "أفضل العوائد الإيجارية الإجمالية", "{v} a year": "{v} سنويًا",
    "All yields": "كل العوائد",
    "Sale prices per sq ft": "أسعار البيع للقدم المربع",
    "Median across areas, month by month (AED per sq ft).": "الوسيط بين المناطق، شهرًا بشهر (درهم للقدم المربع).",
    "Median sale price per sq ft, month by month": "سعر البيع الوسيط للقدم المربع، شهرًا بشهر",
    "{d} over {n} months, from {a} to {b} per sq ft.": "{d} خلال {n} شهرًا، من {a} إلى {b} للقدم المربع.",
    "What moved since the previous publication": "ما الذي تحرّك منذ النشر السابق",
    "Rent over the past four weeks": "الإيجار خلال الأسابيع الأربعة الماضية",
    "Typical rent, all homes, all of Dubai: {d} since {when}, from our own snapshots of each publication.":
        "الإيجار المعتاد، كل المساكن، دبي كلها: {d} منذ {when}، من لقطاتنا لكل نشر.",
    "Biggest moves since {when} (areas with {n}+ contracts):": "أكبر التحركات منذ {when} (مناطق فيها {n} عقدًا أو أكثر):",
    "A night in Dubai": "ليلة في دبي",
    "Typical hotel night: {v} across {n} hotels": "الليلة الفندقية المعتادة: {v} في {n} فندقًا",
    "; holiday homes and serviced apartments: {v} across {n}": "؛ بيوت العطلات والشقق الفندقية: {v} في {n}",
    ". The lowest offer on booking sites for two nights two to three weeks ahead, {when}.": ". أدنى عرض على مواقع الحجز لليلتين بعد أسبوعين إلى ثلاثة، {when}.",
    "What is the typical rent for a 1-bedroom apartment in Dubai?": "ما الإيجار المعتاد لشقة بغرفة نوم في دبي؟",
    "About {v} a year: half of Dubai's registered 1-bedroom contracts are below it, from Ejari rent contracts to {when}. Busy areas run from {lo} in {lo_area} to {hi} in {hi_area}.":
        "نحو {v} سنويًا: نصف عقود الشقق بغرفة نوم المسجلة في دبي أقل منه، من عقود إيجاري حتى {when}. تتراوح المناطق النشطة من {lo} في {lo_area} إلى {hi} في {hi_area}.",
    "Which area of Dubai has the most rent contracts?": "ما منطقة دبي صاحبة أكثر عقود الإيجار؟",
    "{area}, with {n} rent contracts registered in the last 12 months.": "{area}، بـ{n} عقد إيجار مسجل في آخر 12 شهرًا.",
    "Where are the best rental yields in Dubai?": "أين أفضل العوائد الإيجارية في دبي؟",
    "{area} has the highest gross rental yield among busy areas, about {v} a year (yearly rent divided by the sale price).":
        "{area} صاحبة أعلى عائد إيجاري إجمالي بين المناطق النشطة، نحو {v} سنويًا (الإيجار السنوي مقسومًا على سعر البيع).",
    "Are these asking prices?": "هل هذه أسعار معروضة؟",
    "No. They are medians of rents actually registered in Ejari with the Dubai Land Department, not prices from listing sites, and not the RERA rental index.":
        "لا. إنها قيم وسيطة للإيجارات المسجلة فعلًا في إيجاري لدى دائرة الأراضي والأملاك، وليست أسعارًا من مواقع الإعلانات، وليست مؤشر إيجارات ريرا.",
    "Dubai rents to {when}: {n} contracts, a 1-bedroom typically {v} a year, the busiest and cheapest areas and the best yields.":
        "إيجارات دبي حتى {when}: {n} عقدًا، شقة بغرفة نوم بنحو {v} سنويًا، أنشط المناطق وأرخصها وأفضل العوائد.",
    # Areas directory
    "All Dubai areas: rents, sale prices and yields": "كل مناطق دبي: الإيجارات وأسعار البيع والعوائد",
    "{n} areas, from Ejari rent contracts to {when}. Tap a column to sort.": "{n} منطقة، من عقود إيجاري حتى {when}. اضغط عمودًا للترتيب.",
    "Area": "المنطقة", "Rent, all homes": "الإيجار، كل المساكن", "Rent, 1-bed": "الإيجار، غرفة نوم", "Sale price": "سعر البيع",
    "Yield": "العائد", "Contracts": "العقود",
    "Median yearly rent and sale price in AED; gross yield is yearly rent divided by the sale price.": "الإيجار السنوي الوسيط وسعر البيع بالدرهم؛ العائد الإجمالي هو الإيجار السنوي مقسومًا على سعر البيع.",
    "Every Dubai area's median yearly rent, sale price and gross yield, from Ejari contracts to {when}.": "الإيجار السنوي الوسيط وسعر البيع والعائد الإجمالي لكل مناطق دبي، من عقود إيجاري حتى {when}.",
    # Rent pages
    "{home} rents in Dubai by area": "إيجارات {home} في دبي حسب المنطقة",
    "Dubai areas where a 1-bedroom rents for under {v}": "مناطق دبي التي يقل فيها إيجار شقة بغرفة نوم عن {v}",
    "{n} areas, cheapest first: the median yearly rent from Ejari contracts to {when} (areas with {m}+ contracts; industrial zones left out).":
        "{n} منطقة، الأرخص أولًا: الإيجار السنوي الوسيط من عقود إيجاري حتى {when} (مناطق فيها {m} عقود أو أكثر؛ دون المناطق الصناعية).",
    "See them on the map": "شاهدها على الخريطة", "AED a year": "درهم سنويًا", "Gross yield": "العائد الإجمالي",
    "What is the cheapest area in Dubai for {what}?": "ما أرخص منطقة في دبي ل{what}؟",
    "{area}, where the median is {v} a year ({n} contracts).": "{area}، حيث الوسيط {v} سنويًا ({n} عقدًا).",
    "What is the typical rent for {what} in Dubai?": "ما الإيجار المعتاد ل{what} في دبي؟",
    "About {v} a year: half of these areas' registered contracts are below it.": "نحو {v} سنويًا: نصف العقود المسجلة في هذه المناطق أقل منه.",
    "{title}: {n} areas, cheapest first, from Ejari rent contracts.": "{title}: {n} منطقة، الأرخص أولًا، من عقود إيجاري.",
    "a studio": "استوديو", "a 1-bedroom apartment": "شقة بغرفة نوم", "a 2-bedroom apartment": "شقة بغرفتي نوم", "a 3-bedroom apartment": "شقة بثلاث غرف نوم",
    # Yields
    "Best rental yields in Dubai": "أفضل العوائد الإيجارية في دبي",
    "Gross yield: yearly rent divided by the sale price, all homes, from Ejari contracts and registered sales to {when}. Areas with {n}+ contracts.":
        "العائد الإجمالي: الإيجار السنوي مقسومًا على سعر البيع، كل المساكن، من عقود إيجاري والمبيعات المسجلة حتى {when}. مناطق فيها {n} عقدًا أو أكثر.",
    "See yields on the map": "شاهد العوائد على الخريطة", "Rent, AED a year": "الإيجار، درهم سنويًا", "Sale price, AED": "سعر البيع، درهم",
    "Which Dubai area has the best rental yield?": "ما منطقة دبي صاحبة أفضل عائد إيجاري؟",
    "{area}, about {v} a year gross.": "{area}، نحو {v} سنويًا إجماليًا.",
    "Dubai areas ranked by gross rental yield, from registered rents and sales.": "مناطق دبي مرتبة حسب العائد الإيجاري الإجمالي، من الإيجارات والمبيعات المسجلة.",
    # Area pages
    "{name} rents: {v} a year for {what}": "إيجارات {name}: {v} سنويًا ل{what}", "{name} rents": "إيجارات {name}",
    "Median yearly rent from Ejari contracts registered with the Dubai Land Department": "الإيجار السنوي الوسيط من عقود إيجاري المسجلة لدى دائرة الأراضي والأملاك في دبي",
    ", to {when}": "، حتى {when}", ". Every home type, sale prices and yields, on the map.": ". كل أنواع المساكن وأسعار البيع والعوائد، على الخريطة.",
    "DLD area: {dld}. ": "منطقة دائرة الأراضي: {dld}. ",
    "What tenants actually pay, from registered contracts": "ما يدفعه المستأجرون فعلًا، من العقود المسجلة",
    "{v} median yearly rent, all homes, from {n} contracts in the last 12 months": "{v} الإيجار السنوي الوسيط، كل المساكن، من {n} عقدًا في آخر 12 شهرًا",
    "{n} rent contracts in the last 12 months": "{n} عقد إيجار في آخر 12 شهرًا",
    "{v} median sale price": "{v} سعر البيع الوسيط",
    ", down {p} in a year (per sq ft)": "، بانخفاض {p} خلال عام (للقدم المربع)", ", up {p} in a year (per sq ft)": "، بارتفاع {p} خلال عام (للقدم المربع)",
    ", unchanged on a year ago (per sq ft)": "، دون تغيير عن العام الماضي (للقدم المربع)",
    "{v} gross rental yield": "{v} عائد إيجاري إجمالي",
    "Open {name} on the map": "افتح {name} على الخريطة",
    "Home": "المسكن", "Yearly rent": "الإيجار السنوي", "Sale price ": "سعر البيع ",
    "Median figures in AED. Italic rows rest on fewer than 10 contracts: a rough guide only.": "القيم الوسيطة بالدرهم. الصفوف المائلة تستند إلى أقل من 10 عقود: دليل تقريبي فقط.",
    "Median figures in AED.": "القيم الوسيطة بالدرهم.",
    "What is the rent for {what} in {name}?": "ما إيجار {what} في {name}؟",
    "The median is {v} a year": "الوسيط {v} سنويًا", ", from {n} Ejari contracts": "، من {n} عقدًا في إيجاري",
    "What do homes sell for in {name}?": "بكم تُباع المساكن في {name}؟", "The median sale price is {v}": "سعر البيع الوسيط {v}",
    "What is the rental yield in {name}?": "ما العائد الإيجاري في {name}؟",
    "About {v} a year gross: the yearly rent divided by the sale price.": "نحو {v} سنويًا إجماليًا: الإيجار السنوي مقسومًا على سعر البيع.",
    "How many rent contracts are registered in {name}?": "كم عقد إيجار مسجل في {name}؟", "{n} in the last 12 months.": "{n} في آخر 12 شهرًا.",
    "Dubai Data (datadubai.ae), CC BY 4.0, based on Dubai Land Department open data (Ejari rent contracts, registered sales)":
        "بيانات دبي (datadubai.ae)، CC BY 4.0، بناءً على البيانات المفتوحة لدائرة الأراضي والأملاك في دبي (عقود إيجاري، المبيعات المسجلة)",
    "Continental Club Property (continentalclub.ae), CC BY 4.0, based on Dubai Land Department open data":
        "كونتيننتال كلوب العقارية (continentalclub.ae)، CC BY 4.0، بناءً على البيانات المفتوحة لدائرة الأراضي والأملاك في دبي",
    "Medians from {src}. Not asking prices, and not the RERA rental index. An independent tool, not an official DLD service.":
        "القيم الوسيطة من {src}. ليست أسعارًا معروضة، وليست مؤشر إيجارات ريرا. أداة مستقلة، وليست خدمة رسمية من دائرة الأراضي والأملاك.",
    "Rent for {home}": "إيجار {home}", "{d} since {when}": "{d} منذ {when}",
    "Rent, all homes: {d} since {when} (our own snapshots).": "الإيجار، كل المساكن: {d} منذ {when} (من لقطاتنا).",
}


def change_text(p, lang="en"):
    """+3.1% / -2.0% as words people read at a glance."""
    if lang == "ar":
        return ("ارتفاع " if p > 0 else "انخفاض " if p < 0 else "") + f"{abs(p):.1f}%" if abs(p) >= 0.05 else "دون تغيير"
    return (f"up {abs(p):.1f}%" if p > 0 else f"down {abs(p):.1f}%") if abs(p) >= 0.05 else "unchanged"


def font_css(up):
    faces = [("Barlow", 400, "barlow-latin-400-normal"), ("Barlow", 600, "barlow-latin-600-normal"),
             ("Barlow Condensed", 700, "barlow-condensed-latin-700-normal")]
    return "".join(f'@font-face{{font-family:"{f}";font-weight:{w};font-display:swap;src:url({up}assets/fonts/{n}.woff2) format("woff2")}}' for f, w, n in faces)


STYLE = """
:root{--ox:#521825;--ivory:#F6F1E7;--gold:#C9A227;--gold-ink:#735B12;--text:#2B2118;--muted:#655B51;--line:#D9CFBE;--card:#FFFCF5;--blue:#2171B5;--bg:#F6F1E7;
  --cond:"Barlow Condensed","Arial Narrow",Arial,sans-serif;--sans:Barlow,system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#1E1712;--text:#F6F1E7;--muted:#B3A898;--line:#43372C;--card:#2A211A;--gold-ink:#C9A227;--blue:#6BAED6}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 var(--sans)}
a{color:inherit;text-decoration-color:var(--gold);text-decoration-thickness:2px;text-underline-offset:3px}
a:hover{color:var(--gold-ink)}
a:focus-visible,button:focus-visible{outline:3px solid var(--gold-ink);outline-offset:2px;border-radius:3px}
header{background:var(--ox);color:var(--ivory);border-bottom:3px solid var(--gold)}
.hd{max-width:920px;margin:0 auto;padding:12px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 18px}
.brand{font:700 24px/1 var(--cond);color:var(--ivory);text-decoration:none;letter-spacing:.01em}
header nav{display:flex;flex-wrap:wrap;gap:4px 14px;flex:1 1 auto}
header nav a{color:var(--ivory);font-weight:600;font-size:15px;text-decoration:none;padding:4px 0;border-bottom:2px solid transparent}
header nav a:hover,header nav a[aria-current=page]{color:var(--ivory);border-bottom-color:var(--gold)}
.lang{margin-inline-start:auto;color:var(--ivory);border:2px solid rgba(246,241,231,.8);border-radius:999px;padding:3px 12px;font-weight:600;font-size:14px;text-decoration:none}
main{max-width:920px;margin:0 auto;padding:22px 20px 10px}
h1{margin:0 0 6px;font:700 clamp(34px,6vw,52px)/1 var(--cond);letter-spacing:-.005em}
h2{margin:30px 0 8px;font:700 26px/1.1 var(--cond)}
.sub{color:var(--muted);margin:0 0 16px}
.btn{display:inline-block;background:var(--ox);color:var(--ivory);padding:11px 18px;border-radius:8px;text-decoration:none;font:700 19px/1 var(--cond);letter-spacing:.02em;margin:6px 0 16px}
.btn:hover{color:var(--ivory);background:#3E111B}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:14px 0}
.facts div{background:var(--card);border:1px solid var(--line);border-inline-start:4px solid var(--gold);border-radius:10px;padding:10px 14px}
.facts b{display:block;font:700 30px/1.05 var(--cond);font-variant-numeric:tabular-nums}
.facts span{color:var(--muted);font-size:14px}
ol,ul{padding-inline-start:22px} li{margin:5px 0}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:15px;background:var(--card);border-radius:10px;overflow:hidden}
th,td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:14px} .r{text-align:end;white-space:nowrap}
th button{all:unset;cursor:pointer;color:var(--muted);font-weight:600} th button:hover{color:var(--text)}
th[aria-sort] button{color:var(--text)} th[aria-sort=ascending] button::after{content:" ▲"} th[aria-sort=descending] button::after{content:" ▼"}
tr.thin td{font-style:italic;color:var(--muted)}
.note,footer{color:var(--muted);font-size:14px}
.faq dt{font-weight:600;margin-top:14px} .faq dd{margin:4px 0 0}
.links{display:flex;flex-wrap:wrap;gap:6px 14px;margin:26px 0 8px}
svg.chart{width:100%;max-width:680px;height:auto;display:block}
svg.chart .ln{stroke:var(--gold-ink)} svg.chart text{fill:var(--muted)} svg.chart .ax{stroke:var(--line)}
footer{max-width:920px;margin:0 auto;padding:6px 20px 34px}
[dir=rtl] body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
@media (max-width:560px){.opt{display:none} h2{font-size:23px}}
"""


def nav(lang, up, here=None):
    """The header: the site name, Market stats, All areas, Best yields, the map, and the other language."""
    pre = "ar/" if lang == "ar" else ""
    items = [("stats/", t(lang, "Market stats")), ("areas/", t(lang, "All areas")), ("yields/", t(lang, "Best yields"))]
    links = "".join(f'<a href="{up}{pre}{p}"{" aria-current=page" if p == here else ""}>{e(x)}</a>' for p, x in items)
    links += f'<a href="{up}{"?lang=ar" if lang == "ar" else ""}">{e(t(lang, "Open the map"))}</a>'
    return links


def page(lang, path, title, desc, body, faq=None, extra_head=""):
    """A whole page. `path` is the English path ("stats/", "a/dubai-marina/"); the Arabic copy lives at ar/<path>."""
    depth = path.count("/") + (1 if lang == "ar" else 0)
    up = "../" * depth
    url_en, url_ar = SITE + path, SITE + "ar/" + path
    url = url_ar if lang == "ar" else url_en
    other_href = (up + path) if lang == "ar" else (up + "ar/" + path)
    ld = ""
    if faq:
        ld = '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@type": "FAQPage", "inLanguage": lang, "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}, ensure_ascii=False).replace("</", "<\\/") + "</script>"
    faq_html = (f"<h2>{e(t(lang, 'Questions and answers'))}</h2><dl class=faq>" + "".join(f"<dt>{e(q)}</dt><dd>{e(a)}</dd>" for q, a in faq) + "</dl>") if faq else ""
    site = t(lang, "Dubai Real Estate Atlas")
    pre = "ar/" if lang == "ar" else ""
    homes = [("Studio", "studio"), ("1-bedroom", "1-bedroom"), ("2-bedroom", "2-bedroom"), ("3-bedroom", "3-bedroom")]
    more = ("".join(f'<a href="{up}{pre}rents/{s}/">{e(t(lang, "{home} rents", home=t(lang, h)))}</a>' for h, s in homes)
            + "".join(f'<a href="{up}{pre}rents/1-bedroom-under-{b}/">{e(t(lang, "1-bed under AED {k}k", k=b // 1000))}</a>' for b in (50000, 60000, 75000, 100000))
            + f'<a href="{up}feed.xml">{e(t(lang, "What changed (RSS)"))}</a>')
    here = path if path in ("stats/", "areas/", "yields/") else None
    return f"""<!doctype html>
<html lang="{lang}"{' dir="rtl"' if lang == "ar" else ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} | {e(site)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(url)}">
<link rel="alternate" hreflang="en" href="{e(url_en)}"><link rel="alternate" hreflang="ar" href="{e(url_ar)}"><link rel="alternate" hreflang="x-default" href="{e(url_en)}">
<link rel="alternate" type="application/rss+xml" title="Dubai Real Estate Atlas: what changed" href="{e(SITE + 'feed.xml')}">
<meta name="theme-color" content="#521825">
<meta property="og:type" content="website"><meta property="og:site_name" content="{e(site)}"><meta property="og:locale" content="{'ar_AE' if lang == 'ar' else 'en_GB'}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}"><meta property="og:image" content="{e(IMAGE)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
{ld}{extra_head}
<style>{font_css(up)}{STYLE}</style>
</head><body>
<header><div class=hd><a class=brand href="{up}{'?lang=ar' if lang == 'ar' else ''}">{e(site)}</a><nav aria-label="{e(site)}">{nav(lang, up, here)}</nav>
<a class=lang href="{e(other_href)}" lang="{'en' if lang == 'ar' else 'ar'}">{'English' if lang == 'ar' else 'عربي'}</a></div></header>
<main>
{body}
{faq_html}
<p class=links><b>{e(t(lang, 'More'))}:</b> {more}</p>
</main>
<footer><p>{e(t(lang, "Medians from Dubai Data and Continental Club Property (CC BY 4.0), based on Dubai Land Department open data (Ejari rent contracts and registered sales); hotel and holiday home prices from booking sites via Xotelo. Not asking prices, and not the RERA rental index. An independent tool, not an official DLD service."))}
<a href="{up}{'?lang=ar' if lang == 'ar' else ''}">{e(t(lang, 'See all of Dubai on the map'))}</a>.</p></footer>
</body></html>
"""


def w_median(pairs):
    """The middle contract: the median of (value, contracts) pairs, each value counted once per contract (the map's wMedian)."""
    s = sorted((v, n or 1) for v, n in pairs if v is not None)
    total = sum(n for _, n in s)
    c = 0
    for v, n in s:
        c += n
        if c >= total / 2:
            return v
    return None


HISTORY_DAYS = 28    # a change is shown once a snapshot at least four weeks older than the latest exists
HISTORY_N = 30       # from areas with at least this many contracts in both snapshots


def load_history():
    """Our own rent snapshots (data/history/<date>.json), oldest first."""
    import glob
    out = []
    for p in sorted(glob.glob(os.path.join(ROOT, "data", "history", "*.json"))):
        try:
            with open(p, encoding="utf-8") as f:
                d = json.load(f)
            if d.get("through") and d.get("areas"):
                out.append(d)
        except (OSError, ValueError):
            pass
    return out


def base_snapshot(snaps, days=HISTORY_DAYS):
    """The snapshot to measure change against, by the same rule as collector/history.py baseline() (so a page and
    the map's card quote the same date): about a year back if there is one, else the oldest at least four weeks
    older than the latest. None in the first weeks of history."""
    if len(snaps) < 2:
        return None
    try:
        last = date.fromisoformat(snaps[-1]["through"])
        older = [s for s in snaps[:-1] if (last - date.fromisoformat(s["through"])).days >= days]
    except (TypeError, ValueError):
        return None
    if not older:
        return None
    year = [s for s in older if (last - date.fromisoformat(s["through"])).days >= 330]
    return year[-1] if year else older[0]


def area_change(snaps, label, unit=None):
    """(percent change, base date) of an area's median rent (all homes, or one home type) over at least four weeks."""
    base = base_snapshot(snaps)
    if not base:
        return None
    a, b = (snaps[-1]["areas"].get(label) or {}), (base["areas"].get(label) or {})
    if unit:
        x, y = (a.get("u") or {}).get(unit), (b.get("u") or {}).get(unit)
        if not x or not y or min(x[1] or 0, y[1] or 0) < HISTORY_N or not y[0]:
            return None
        return (x[0] / y[0] - 1) * 100, base["through"]
    if not a.get("m") or not b.get("m") or min(a.get("n") or 0, b.get("n") or 0) < HISTORY_N:
        return None
    return (a["m"] / b["m"] - 1) * 100, base["through"]
