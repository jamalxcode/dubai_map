"""Shared storage for Ejari rent contracts.

Contracts are kept as monthly gzip CSV partitions under data/contracts/,
keyed by contract start month, deduplicated on a stable key.
Standard library only.
"""
import csv
import gzip
import hashlib
import io
import os
import re
from datetime import date, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CONTRACTS = os.path.join(DATA, "contracts")

FIELDS = [
    "key", "contract_id", "line_number", "reg_type", "start", "end",
    "annual", "contract_amount", "size_sqm", "prop_type", "sub_type",
    "usage", "rooms", "area_id", "area", "master_project", "project",
    "metro", "mall", "landmark", "tenant_type", "is_free_hold", "source",
]

# Header aliases: Dubai Pulse API / CSV names and DLD website export names.
ALIASES = {
    "contract_id": ["contract_id"],
    "line_number": ["line_number"],
    "reg_type": ["contract_reg_type_en", "version", "registration type"],
    "start": ["contract_start_date", "start date"],
    "end": ["contract_end_date", "end date"],
    "annual": ["annual_amount", "annual amount"],
    "contract_amount": ["contract_amount", "contract amount"],
    "size_sqm": ["actual_area", "property size (sq.m)", "property size"],
    "prop_type": ["ejari_property_type_en", "property type"],
    "sub_type": ["ejari_property_sub_type_en", "property sub type"],
    "usage": ["property_usage_en", "usage"],
    "rooms": ["number of rooms", "rooms"],
    "area_id": ["area_id"],
    "area": ["area_name_en", "area"],
    "master_project": ["master_project_en", "master project"],
    "project": ["project_name_en", "project"],
    "metro": ["nearest_metro_en", "nearest metro"],
    "mall": ["nearest_mall_en", "nearest mall"],
    "landmark": ["nearest_landmark_en", "nearest landmark"],
    "tenant_type": ["tenant_type_en"],
    "is_free_hold": ["is_free_hold", "is free hold?"],
}


def _canon(name):
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


_ALIAS_LOOKUP = {_canon(a): field for field, names in ALIASES.items() for a in names}


def parse_date(value):
    """Return ISO yyyy-mm-dd or '' for the date formats DLD uses."""
    s = str(value or "").strip()
    if not s:
        return ""
    m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})", s)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return "-".join(m.groups())
    for fmt in ("%d %b %Y", "%d %B %Y", "%m/%d/%Y %I:%M:%S %p"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return ""


def parse_number(value):
    s = re.sub(r"[,\sA-Za-z]", "", str(value or ""))
    try:
        return float(s) if s else 0.0
    except ValueError:
        return 0.0


def normalize(raw, source):
    """Map one raw record (any known header set) to canonical fields."""
    rec = {f: "" for f in FIELDS}
    for k, v in raw.items():
        field = _ALIAS_LOOKUP.get(_canon(k))
        if field and v is not None and str(v).strip() and not rec[field]:
            rec[field] = str(v).strip()
    rec["start"] = parse_date(rec["start"])
    rec["end"] = parse_date(rec["end"])
    for f in ("annual", "contract_amount", "size_sqm"):
        n = parse_number(rec[f])
        rec[f] = f"{n:.0f}" if f != "size_sqm" else (f"{n:.2f}" if n else "")
    rec["source"] = source
    if rec["contract_id"]:
        rec["key"] = f"{rec['contract_id']}#{rec['line_number'] or '1'}"
    else:
        # Website exports carry no contract id: hash the descriptive fields.
        basis = "|".join(rec[f] for f in ("start", "end", "annual", "area", "project",
                                          "sub_type", "size_sqm", "reg_type", "rooms"))
        rec["key"] = "h:" + hashlib.sha1(basis.encode()).hexdigest()[:16]
    return rec


def valid(rec):
    return bool(rec["start"] and rec["area"] and float(rec["annual"] or 0) > 0)


def _partition(rec):
    return os.path.join(CONTRACTS, rec["start"][:7] + ".csv.gz")


def read_partition(path):
    if not os.path.exists(path):
        return {}
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        return {r["key"]: r for r in csv.DictReader(f)}


def write_partition(path, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=FIELDS, lineterminator="\n")
    w.writeheader()
    for key in sorted(rows):
        w.writerow({f: rows[key].get(f, "") for f in FIELDS})
    # mtime=0 keeps the gzip bytes stable so unchanged data makes no git diff.
    with open(path, "wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as gz:
            gz.write(buf.getvalue().encode("utf-8"))


def merge(records):
    """Merge canonical records into partitions. Returns (added, updated)."""
    by_part = {}
    for r in records:
        if valid(r):
            by_part.setdefault(_partition(r), []).append(r)
    added = updated = 0
    for path, recs in by_part.items():
        rows = read_partition(path)
        changed = False
        for r in recs:
            old = rows.get(r["key"])
            if old is None:
                added += 1
            elif any(old.get(f, "") != r[f] for f in FIELDS if f != "source"):
                updated += 1
            else:
                continue
            rows[r["key"]] = r
            changed = True
        if changed:
            write_partition(path, rows)
    return added, updated


def iter_all():
    if not os.path.isdir(CONTRACTS):
        return
    for name in sorted(os.listdir(CONTRACTS)):
        if name.endswith(".csv.gz"):
            yield from read_partition(os.path.join(CONTRACTS, name)).values()


def today_dubai():
    from datetime import timedelta, timezone
    return datetime.now(timezone(timedelta(hours=4))).date()
