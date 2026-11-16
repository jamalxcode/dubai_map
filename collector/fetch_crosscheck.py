"""CROSS-CHECK SOURCES: other public summaries of the same Ejari register, used to check our
figures, never shown on the map in their place.

  dred  dubairealestatedata.com/rents.md  median NEW-contract apartment rent, top 30 areas.
        Built independently from Dubai Pulse's bulk data. CC BY 4.0, reuse "including
        commercially" with credit (its terms, 19 Oct 2026). robots.txt allows /rents.md.
  ccp   continentalclub.ae/rents.md       median rent by unit size for ~100 official DLD areas.
        Same publisher as Dubai Data (our current source), so it checks our import, not the
        underlying numbers. Its data pages are CC BY 4.0 "including commercially" (data centre
        FAQ); robots.txt: "Crawl it, quote it, cite it — CC BY 4.0 with attribution".

Both are small markdown pages, read at most once a day (they update daily or weekly), one
request each, honest User-Agent. A page that fails or looks wrong keeps the previous file.
Writes data/crosscheck/<source>.csv; build.py compares them with our medians.
"""
import csv
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import net  # noqa: E402
import state as st  # noqa: E402
import store  # noqa: E402

SOURCES = {
    "dred": {"name": "Dubai Real Estate Data (dubairealestatedata.com)",
             "url": "https://www.dubairealestatedata.com/rents.md", "min_rows": 15},
    "ccp": {"name": "Continental Club Property (continentalclub.ae)",
            "url": "https://continentalclub.ae/rents.md", "min_rows": 40},
}
MIN_HOURS = 24


def out_dir():
    return os.path.join(store.DATA, "crosscheck")


def aed(s):
    m = re.search(r"AED\s*([\d,]+)", s or "")
    return int(m.group(1).replace(",", "")) if m else None


def count(s):
    s = re.sub(r"[^\d]", "", s or "")
    return int(s) if s else None


def table_rows(md):
    """Rows of the first markdown table whose header has an 'Area' column, as dicts."""
    lines = [l.strip() for l in md.splitlines()]
    for i, line in enumerate(lines):
        if line.startswith("|") and re.search(r"\|\s*Area\s*\|", line) and i + 1 < len(lines) and set(lines[i + 1]) <= set("|-: "):
            head = [c.strip() for c in line.strip("|").split("|")]
            rows = []
            for row in lines[i + 2:]:
                if not row.startswith("|"):
                    break
                cells = [c.strip() for c in row.strip("|").split("|")]
                rows.append(dict(zip(head, cells)))
            return rows
    return []


def through_date(md):
    m = re.search(r"(?:Data through|through|to)[:\s]+(\d{1,2} \w{3} \d{4}|\d{4}-\d{2}-\d{2})", md)
    if not m:
        return None
    s = m.group(1)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    from datetime import datetime
    try:
        return datetime.strptime(s, "%d %b %Y").date().isoformat()
    except ValueError:
        return None


def parse_dred(md):
    out = []
    for r in table_rows(md):
        area = re.sub(r"^\[(.*?)\]\(.*\)$", r"\1", r.get("Area", "")).strip()
        rent, n = aed(r.get("Median annual rent")), count(r.get("New contracts 12M"))
        if area and rent:
            out.append({"area": area, "unit": "apartments (new contracts)", "median": rent, "n": n or ""})
    return out


CCP_UNITS = {"Studio": "Studios", "1 bedroom": "1-bedroom apartments", "2 bedrooms": "2-bedroom apartments",
             "3 bedrooms": "3-bedroom apartments"}


def parse_ccp(md):
    out = []
    for r in table_rows(md):
        area, n = r.get("Area", "").strip(), count(r.get("Contracts"))
        for col, unit in CCP_UNITS.items():
            rent = aed(r.get(col))
            if area and rent:
                out.append({"area": area, "unit": unit, "median": rent, "n": n or ""})
    return out


PARSERS = {"dred": parse_dred, "ccp": parse_ccp}


def fetch_one(key, block):
    src = SOURCES[key]
    md = net.request(src["url"], attempts=2, timeout=30, source="crosscheck").decode("utf-8", "replace")
    rows = PARSERS[key](md)
    areas = {r["area"] for r in rows}
    if len(areas) < src["min_rows"]:
        raise ValueError(f"only {len(areas)} areas parsed; page format changed?")
    os.makedirs(out_dir(), exist_ok=True)
    with open(os.path.join(out_dir(), key + ".csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, ["area", "unit", "median", "n"], lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    block["through"] = through_date(md)
    return len(areas)


def main():
    state = st.load()
    cc = state.setdefault("crosscheck", {})
    for key, src in SOURCES.items():
        block = cc.setdefault(key, {})
        if not st.due(block, "last_try_at", MIN_HOURS) and os.environ.get("FORCE") != "1":
            print(f"crosscheck {key}: checked {st.hours_since(block, 'last_try_at'):.1f} h ago")
            continue
        block["last_try_at"] = st.now_iso()
        try:
            n = fetch_one(key, block)
            st.set_status(block, "ok")
            block["last_ok_at"] = st.now_iso()
            print(f"crosscheck {key}: {n} areas, data through {block.get('through')}")
        except (net.StopForToday, net.AuthError, net.NotModified, ValueError) as e:
            st.set_status(block, "failed", str(e))
            print(f"crosscheck {key}: failed ({e}); keeping the previous file")
    st.save(state)


if __name__ == "__main__":
    main()
