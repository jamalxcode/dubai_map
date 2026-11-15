"""Shared storage for Ejari rent contracts.

Contracts are kept as small daily gzip CSV files under data/contracts/YYYY-MM/DD.csv.gz,
keyed by contract start date, deduplicated on a stable key. Daily files keep each
day's git commit small: only the days that actually changed are rewritten.
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
    "metro", "mall", "landmark", "tenant_type", "is_free_hold", "reg_date", "source",
    "alias",  # hash key of the id-less copy of this contract from another source, if one was seen
]

# Header aliases: Dubai Pulse API / CSV names, DLD website export names and the
# DLD open-data API (gateway.dubailand.gov.ae) field names.
ALIASES = {
    "contract_id": ["contract_id", "contract_number"],
    "line_number": ["line_number"],
    "reg_type": ["contract_reg_type_en", "version", "registration type", "version_en"],
    "start": ["contract_start_date", "start date"],
    "end": ["contract_end_date", "end date"],
    "annual": ["annual_amount", "annual amount"],
    "contract_amount": ["contract_amount", "contract amount"],
    "size_sqm": ["actual_area", "property size (sq.m)", "property size"],
    "prop_type": ["ejari_property_type_en", "property type", "prop_type_en"],
    "sub_type": ["ejari_property_sub_type_en", "property sub type", "prop_sub_type_en"],
    "usage": ["property_usage_en", "usage", "usage_en"],
    "rooms": ["number of rooms", "rooms"],
    "area_id": ["area_id"],
    "area": ["area_name_en", "area", "area_en"],
    "master_project": ["master_project_en", "master project"],
    "project": ["project_name_en", "project", "project_en"],
    "metro": ["nearest_metro_en", "nearest metro"],
    "mall": ["nearest_mall_en", "nearest mall"],
    "landmark": ["nearest_landmark_en", "nearest landmark"],
    "tenant_type": ["tenant_type_en"],
    "is_free_hold": ["is_free_hold", "is free hold?"],
    "reg_date": ["registration_date", "registration date", "contract_reg_date"],
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
    reg_raw = rec["reg_date"]  # full timestamp when the source has one; helps tell twin contracts apart
    rec["reg_date"] = parse_date(rec["reg_date"])
    rec["start"] = parse_date(rec["start"])
    rec["end"] = parse_date(rec["end"])
    for f in ("annual", "contract_amount", "size_sqm"):
        n = parse_number(rec[f])
        rec[f] = f"{n:.0f}" if f != "size_sqm" else (f"{n:.2f}" if n else "")
    rec["source"] = source
    if rec["contract_id"]:
        rec["key"] = f"{rec['contract_id']}#{rec['line_number'] or '1'}"
    else:
        # Website exports and the DLD open-data API carry no contract id: hash the descriptive fields.
        basis = "|".join([rec[f] for f in ("start", "end", "annual", "area", "project",
                                           "sub_type", "size_sqm", "reg_type", "rooms")] + [reg_raw])
        rec["key"] = "h:" + hashlib.sha1(basis.encode()).hexdigest()[:16]
    return rec


def valid(rec):
    return bool(rec["start"] and rec["area"] and float(rec["annual"] or 0) > 0)


def _partition(rec):
    return os.path.join(CONTRACTS, rec["start"][:7], rec["start"][8:10] + ".csv.gz")


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


def fingerprint(rec):
    """Fields every source carries, used to recognise one contract arriving from two
    sources under different keys (an id from Dubai Pulse, a hash from the DLD service
    or a website export)."""
    return "|".join((rec.get("start", ""), rec.get("end", ""), rec.get("annual", ""),
                     rec.get("area", "").lower().strip(), rec.get("size_sqm", "")))


def is_hash(key):
    return key.startswith("h:")


def merge(records):
    """Merge canonical records into partitions. Returns (added, updated).

    Contracts with an id and id-less (hashed) contracts are paired one to one by
    fingerprint, so the same contract from two sources is stored once: the id row
    wins and remembers the hash key it replaced in `alias`. Twin contracts (same
    building, rent and dates) stay separate because each pairs at most once."""
    by_part = {}
    for r in records:
        if valid(r):
            by_part.setdefault(_partition(r), []).append(r)
    added = updated = 0
    for path, recs in by_part.items():
        rows = read_partition(path)
        aliases = {row.get("alias"): k for k, row in rows.items() if row.get("alias")}
        by_fp = {}
        for k, row in rows.items():
            by_fp.setdefault(fingerprint(row), []).append(k)
        changed = False
        for r in recs:
            key, fp = r["key"], fingerprint(r)
            old = rows.get(key)
            if old is not None:
                r["alias"] = old.get("alias", "")
                if not any(old.get(f, "") != r[f] for f in FIELDS if f not in ("source", "alias")):
                    continue
                updated += 1
            elif is_hash(key):
                if key in aliases:
                    continue  # this id-less copy is already stored under its contract id
                twin = next((k for k in by_fp.get(fp, []) if not is_hash(k) and not rows[k].get("alias")), None)
                if twin:  # first time we see the id-less copy of a stored contract: pair, don't add
                    rows[twin]["alias"] = key
                    aliases[key] = twin
                    changed = True
                    continue
                added += 1
            else:
                h = next((k for k in by_fp.get(fp, []) if is_hash(k)), None)
                if h:  # the id-carrying copy of a stored id-less contract: replace it
                    del rows[h]
                    by_fp[fp].remove(h)
                    r["alias"] = h
                    aliases[h] = key
                    updated += 1
                else:
                    added += 1
            rows[key] = r
            if key not in by_fp.setdefault(fp, []):
                by_fp[fp].append(key)
            changed = True
        if changed:
            write_partition(path, rows)
    return added, updated


def iter_all():
    if not os.path.isdir(CONTRACTS):
        return
    for root, dirs, files in os.walk(CONTRACTS):
        dirs.sort()
        for name in sorted(files):
            if name.endswith(".csv.gz"):
                yield from read_partition(os.path.join(root, name)).values()


def today_dubai():
    from datetime import timedelta, timezone
    return datetime.now(timezone(timedelta(hours=4))).date()
