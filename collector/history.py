"""Our own rent history: a small snapshot of every area's medians for each publication.

Dubai Data replaces its medians with each publication, so without this the site only ever knows the
latest figures. After every build, the figures are saved as data/history/<data-through date>.json
(one file per publication, about 30 KB; a later build for the same date overwrites it). From these:

  * change over time: each area (and each home size) gets its change against the snapshot about a year
    earlier, or, until there is a year of history, the oldest one at least four weeks earlier;
  * unconfirmed jumps: a median that moved more than 40% since the previous publication (from at least
    30 contracts) is published but marked, until the next publication confirms it. Confirmation needs no
    state: next time, the previous publication is the jumped figure itself, so the mark goes away when
    the new figure stays close to it;
  * what changed: the moves since the previous publication, for the run's summary and changes.json.

Older districts (Continental Club) are left out: their figures run to their own dates.
"""
import json
import os
from datetime import date

import store

MIN_DAYS = 28          # a change is shown against a snapshot at least this old
YEAR_DAYS = 330        # "about a year ago": the newest snapshot at least this old
JUMP = 0.40            # more than this since the previous publication: unconfirmed
MIN_N = 30             # only figures from at least this many contracts are judged
MOVED = 0.05           # changes.json lists moves of at least this much
MAX_MOVED = 40


def folder():
    return os.path.join(store.DATA, "history")


def snapshot(areas, through):
    """The medians to keep: per area, the headline median and count, and each home size's."""
    out = {}
    for a in areas:
        if a.get("source") == "ccp" or not a.get("median"):
            continue
        out[a["label"]] = {"m": a["median"], "n": a.get("n") or 0,
                           "u": {u["u"]: [u["median"], u.get("n")] for u in a.get("by_unit") or [] if u.get("median")}}
    return {"through": through, "areas": out}


def save(snap):
    if not snap.get("through"):
        return None
    os.makedirs(folder(), exist_ok=True)
    path = os.path.join(folder(), snap["through"] + ".json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        f.write("\n")
    return path


def load_all():
    """Every snapshot, oldest first."""
    try:
        names = sorted(n for n in os.listdir(folder()) if n.endswith(".json"))
    except OSError:
        return []
    out = []
    for n in names:
        try:
            with open(os.path.join(folder(), n), encoding="utf-8") as f:
                out.append(json.load(f))
        except (OSError, ValueError):
            continue
    return [s for s in out if s.get("through")]


def _days(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def _pct(new, old):
    return round((new - old) / old * 100, 1) if old else None


def baseline(snaps, through):
    """The snapshot to measure change against: about a year back if there is one, else the oldest
    that is at least MIN_DAYS old. None until there is enough history."""
    older = [s for s in snaps if s["through"] < through and _days(s["through"], through) >= MIN_DAYS]
    if not older:
        return None
    year = [s for s in older if _days(s["through"], through) >= YEAR_DAYS]
    return year[-1] if year else older[0]


def previous(snaps, through):
    """The last publication before this one."""
    before = [s for s in snaps if s["through"] < through]
    return before[-1] if before else None


def annotate(areas, snaps, through):
    """Add rent_change and unconfirmed to areas (and chg / unconfirmed to their home sizes), in place."""
    if not through:
        return
    base, prev = baseline(snaps, through), previous(snaps, through)
    for a in areas:
        if a.get("source") == "ccp":
            continue
        b = base and base["areas"].get(a["label"])
        p = prev and prev["areas"].get(a["label"])
        if b and a.get("median"):
            a["rent_change"] = {"since": base["through"], "pct": _pct(a["median"], b["m"])}
        if p and a.get("median") and (a.get("n") or 0) >= MIN_N and p["m"] and abs(a["median"] - p["m"]) / p["m"] > JUMP:
            a["unconfirmed"] = {"from": p["m"], "pct": _pct(a["median"], p["m"])}
        for u in a.get("by_unit") or []:
            if not u.get("median"):
                continue
            bu = b and b["u"].get(u["u"])
            pu = p and p["u"].get(u["u"])
            if bu and bu[0]:
                u["chg"] = {"since": base["through"], "pct": _pct(u["median"], bu[0])}
            if pu and pu[0] and (u.get("n") or 0) >= MIN_N and abs(u["median"] - pu[0]) / pu[0] > JUMP:
                u["unconfirmed"] = {"from": pu[0], "pct": _pct(u["median"], pu[0])}


def changes(areas, snaps, through):
    """What changed since the previous publication: the biggest moves (from MIN_N contracts), the
    unconfirmed jumps, and areas that appeared or disappeared."""
    prev = previous(snaps, through) if through else None
    out = {"through": through, "previous": prev and prev["through"], "moved": [], "unconfirmed": [], "new_areas": [], "gone_areas": []}
    if not prev:
        return out
    now = {a["label"]: a for a in areas if a.get("source") != "ccp" and a.get("median")}
    for label, a in now.items():
        p = prev["areas"].get(label)
        if not p:
            out["new_areas"].append(label)
            continue
        figs = [("", a["median"], a.get("n") or 0, p["m"])] + [
            (u["u"], u["median"], u.get("n") or 0, p["u"].get(u["u"], [None])[0]) for u in a.get("by_unit") or [] if u.get("median")]
        for unit, m, n, old in figs:
            if not old or n < MIN_N or m == old:
                continue
            pct = _pct(m, old)
            row = {"area": label, "unit": unit, "from": old, "to": m, "pct": pct}
            if abs(pct) > JUMP * 100:
                out["unconfirmed"].append(row)
            elif abs(pct) >= MOVED * 100:
                out["moved"].append(row)
    out["gone_areas"] = sorted(set(prev["areas"]) - set(now))
    out["moved"].sort(key=lambda r: -abs(r["pct"]))
    out["moved"] = out["moved"][:MAX_MOVED]
    out["new_areas"].sort()
    out["up"] = sum(1 for r in out["moved"] if r["pct"] > 0 and not r["unit"])
    out["down"] = sum(1 for r in out["moved"] if r["pct"] < 0 and not r["unit"])
    return out


def summary_markdown(ch, gaps=None):
    """The run's summary on GitHub (the job page): what changed, what's unconfirmed, where sources differ."""
    lines = [f"### Data through {ch.get('through') or '—'}"]
    if not ch.get("previous"):
        lines.append("No earlier publication in the history yet, so nothing to compare.")
    else:
        lines.append(f"Compared with the publication to {ch['previous']}: {len(ch['moved'])} figures moved 5% or more "
                     f"({ch.get('up', 0)} areas up, {ch.get('down', 0)} down overall), {len(ch['unconfirmed'])} unconfirmed jumps, "
                     f"{len(ch['new_areas'])} new areas, {len(ch['gone_areas'])} gone.")
        for title, rows in (("Unconfirmed (moved more than 40%)", ch["unconfirmed"]), ("Biggest moves", ch["moved"][:10])):
            if rows:
                lines += ["", f"**{title}**", "", "| Area | Home | From | To | Change |", "|---|---|--:|--:|--:|"]
                lines += [f"| {r['area']} | {r['unit'] or 'all homes'} | {r['from']:,} | {r['to']:,} | {r['pct']:+.1f}% |" for r in rows]
    if gaps:
        lines += ["", f"**Sources differ by more than 15%** ({sum(len(v) for v in gaps.values())} figures)", ""]
        lines += [f"- {label}: " + "; ".join(f"{g['source']} {g['unit']} AED {g['theirs']:,} ({g['pct']:+.1f}%)" for g in v)
                  for label, v in sorted(gaps.items())[:15]]
    return "\n".join(lines) + "\n"
