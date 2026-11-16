/* Rent check logic: pure functions, no DOM. Used by companion.js in the page and by
   tests/insights.test.mjs in Node. Works on the area records in data/areas.json. */
(function (root) {
  'use strict';

  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  // Common short names people type for areas whose official label is long.
  const NICKNAMES = {
    jvc: 'jumeirah village circle', jvt: 'jumeirah village triangle', jlt: 'jumeirah lake towers',
    jbr: 'jumeirah beach residence', difc: 'difc', dso: 'silicon oasis', dsc: 'dubai sports city',
    marina: 'dubai marina', downtown: 'downtown dubai', impz: 'international media production zone',
    'intl city': 'international city', mbr: 'mohammed bin rashid',
  };

  function edits(a, b) { // Levenshtein distance, small strings only
    if (Math.abs(a.length - b.length) > 3) return 9;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }

  /** Areas matching what was typed, best first. Each result: {area, how} where how is
   *  exact | starts | contains | building | close (a "did you mean" suggestion). */
  function searchAreas(areas, query, limit = 8) {
    let q = norm(query);
    if (!q) return [];
    if (NICKNAMES[q]) q = NICKNAMES[q];
    const scored = [];
    for (const a of areas) {
      const label = norm(a.label), others = (a.dld_areas || []).map(norm);
      const buildings = (a.top_projects || []).map(p => norm(p.p));
      let score = null, how = null;
      if (label === q || others.includes(q)) { score = 0; how = 'exact'; }
      else if (label.startsWith(q) || others.some(o => o.startsWith(q))) { score = 1; how = 'starts'; }
      else if (label.includes(q) || others.some(o => o.includes(q))) { score = 2; how = 'contains'; }
      else if (q.length >= 3 && buildings.some(b => b.includes(q))) { score = 3; how = 'building'; }
      else {
        // Typos: compare with each word run of the label of the same length.
        const words = label.split(' '), qn = q.split(' ').length;
        let best = 9;
        for (let i = 0; i + qn <= words.length; i++) best = Math.min(best, edits(q, words.slice(i, i + qn).join(' ')));
        best = Math.min(best, ...others.map(o => edits(q, o)));
        if (q.length >= 4 && best <= (q.length > 7 ? 2 : 1)) { score = 4 + best; how = 'close'; }
      }
      if (score != null) scored.push({ area: a, how, score });
    }
    scored.sort((x, y) => x.score - y.score || y.area.n - x.area.n);
    return scored.slice(0, limit).map(({ area, how }) => ({ area, how }));
  }

  /** A short name for a unit, for menus and chips: "1-bedroom apartments" -> "1 bed". */
  function unitShort(u) {
    return String(u || 'All homes').replace(/^(\d)-bedroom (apartments?|villas?)$/i, (m, n, k) => n + ' bed' + (/villa/i.test(k) ? ' villa' : ''))
      .replace(/^Studios$/i, 'Studio');
  }

  /** The units an area has figures for, busiest first. */
  function unitOptions(area) {
    return (area && area.by_unit || []).filter(u => u.median && u.n).slice().sort((a, b) => b.n - a.n);
  }

  function unitFigure(area, unit) {
    if (!area) return null;
    if (!unit) return area.median ? { u: 'All homes', n: area.n, median: area.median, yield: area.yield_pct } : null;
    return unitOptions(area).find(u => u.u === unit) || null;
  }

  /** How a rent compares with a median. Within ±5% counts as "about the median". */
  function verdict(rent, median) {
    if (!(rent > 0) || !(median > 0)) return null;
    const pct = Math.round((rent - median) / median * 100);
    return { pct, diff: Math.round(rent - median), word: Math.abs(pct) <= 5 ? 'about' : pct < 0 ? 'below' : 'above' };
  }

  function km(a, b) {
    const R = 6371, rad = d => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Nearby areas where the same unit rents for less: the most useful discovery for someone
   *  checking a rent. Closer and cheaper first; only areas with enough contracts to trust. */
  function cheaperNearby(areas, area, unit, { k = 3, maxKm = 12, minContracts = 30 } = {}) {
    const here = unitFigure(area, unit);
    if (!here || area.lat == null) return [];
    const out = [];
    for (const a of areas) {
      if (a === area || a.lat == null) continue;
      const f = unitFigure(a, unit);
      if (!f || f.n < minContracts || f.median >= here.median * 0.97) continue;
      const d = km(area, a);
      if (d > maxKm) continue;
      out.push({ area: a, median: f.median, n: f.n, km: Math.round(d * 10) / 10, saving: here.median - f.median });
    }
    out.sort((x, y) => (y.saving / (1 + y.km)) - (x.saving / (1 + x.km)));
    return out.slice(0, k);
  }

  /** Where an area sits among all areas for the same unit: "cheaper than 70% of areas". */
  function rankAmong(areas, area, unit) {
    const here = unitFigure(area, unit);
    if (!here) return null;
    const meds = areas.map(a => unitFigure(a, unit)).filter(f => f && f.n >= 30).map(f => f.median);
    if (meds.length < 5) return null;
    const dearer = meds.filter(m => m > here.median).length;
    return { cheaperThanPct: Math.round(dearer / meds.length * 100), of: meds.length };
  }

  /** Rent trend from the monthly medians (only when contract-level data is in use). */
  function trend(area) {
    const m = (area && area.monthly || []).filter(x => x.median && x.n >= 10);
    if (m.length < 4) return null;
    const first = m.slice(0, 3), last = m.slice(-3);
    const avg = xs => xs.reduce((s, x) => s + x.median, 0) / xs.length;
    const pct = Math.round((avg(last) - avg(first)) / avg(first) * 100);
    return { pct, from: first[0].m, to: last[last.length - 1].m };
  }

  /** Useful facts about one check, most useful first. Each: {kind, ...}. Only facts the data
   *  supports are returned, so what a visitor sees varies with the area, not with chance. */
  function insights(areas, area, unit, rent) {
    const out = [];
    const f = unitFigure(area, unit);
    if (!f) return out;
    const v = verdict(rent, f.median);
    if (v) out.push({ kind: 'verdict', ...v, median: f.median });
    const t = trend(area);
    if (t && Math.abs(t.pct) >= 3) out.push({ kind: 'trend', ...t });
    // Comparing areas only makes sense for the same kind of home: "all homes" medians mix
    // studios in one area with villas in another.
    if (unit) {
      const cheaper = cheaperNearby(areas, area, unit);
      if (cheaper.length) out.push({ kind: 'cheaper', items: cheaper });
      const r = rankAmong(areas, area, unit);
      if (r) out.push({ kind: 'rank', ...r });
    }
    if (f.yield != null) out.push({ kind: 'yield', yield: f.yield });
    return out;
  }

  /** Change in an area's figure since it was saved. */
  function changeSince(snapshot, current) {
    if (!snapshot || !(snapshot.median > 0) || !(current > 0)) return null;
    const pct = Math.round((current - snapshot.median) / snapshot.median * 1000) / 10;
    return { pct, from: snapshot.median, to: current, since: snapshot.through || null };
  }

  // ---- Saved data (stays in this browser) ----
  const STORE_VERSION = 1, MAX_HISTORY = 8, MAX_SAVED = 30;

  function emptyStore() {
    return { v: STORE_VERSION, saved: [], history: [], last: null, seenThrough: null,
             prefs: { whatsNew: true, remindDays: 90, checkEvery: 0 }, view: null };
  }

  /** Read whatever is stored, keeping only fields we understand (never throws). */
  function cleanStore(raw) {
    const s = emptyStore();
    if (!raw || typeof raw !== 'object') return s;
    const str = (x, n = 120) => typeof x === 'string' ? x.slice(0, n) : null;
    const num = x => (typeof x === 'number' && isFinite(x) ? x : null);
    const item = x => x && str(x.area) ? {
      area: str(x.area), unit: str(x.unit) || '', rent: num(x.rent), renews: /^\d{4}-\d{2}-\d{2}$/.test(x.renews || '') ? x.renews : null,
      snap: x.snap && num(x.snap.median) ? { median: num(x.snap.median), through: str(x.snap.through, 10) } : null,
      at: str(x.at, 30),
    } : null;
    s.saved = (Array.isArray(raw.saved) ? raw.saved : []).map(item).filter(Boolean).slice(0, MAX_SAVED);
    s.history = (Array.isArray(raw.history) ? raw.history : []).map(item).filter(Boolean).slice(0, MAX_HISTORY);
    s.last = item(raw.last);
    s.seenThrough = str(raw.seenThrough, 10);
    const p = raw.prefs || {};
    s.prefs.whatsNew = p.whatsNew !== false;
    s.prefs.remindDays = [30, 60, 90].includes(p.remindDays) ? p.remindDays : 90;
    s.prefs.checkEvery = [0, 3, 6, 12].includes(p.checkEvery) ? p.checkEvery : 0;
    const v = raw.view;
    if (v && num(v.lat) && num(v.lng) && num(v.z)) s.view = { lat: v.lat, lng: v.lng, z: v.z };
    return s;
  }

  function remember(store, check) {
    const key = c => c.area + '|' + c.unit;
    store.last = check;
    store.history = [check, ...store.history.filter(h => key(h) !== key(check))].slice(0, MAX_HISTORY);
    return store;
  }

  function isSaved(store, area, unit) {
    return store.saved.findIndex(s => s.area === area && s.unit === (unit || ''));
  }

  /** What changed in the data since the visitor last looked, for their saved areas. */
  function whatsNew(store, through, areasByLabel) {
    if (!store.seenThrough || !through || through <= store.seenThrough) return null;
    const changes = [];
    for (const s of store.saved) {
      const f = unitFigure(areasByLabel[s.area], s.unit);
      const c = f && changeSince(s.snap, f.median);
      if (c && c.pct !== 0) changes.push({ area: s.area, unit: s.unit, ...c });
    }
    return { from: store.seenThrough, to: through, changes };
  }

  // ---- Calendar reminders (.ics): the visitor's own calendar does the reminding ----
  const icsEsc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const ymd = d => d.replace(/-/g, '');

  /** A calendar file. opts: {uid, title, date (yyyy-mm-dd), details, url, alarmDays, everyMonths}. */
  function ics(opts) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const next = new Date(Date.parse(opts.date + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dubai Rent Atlas//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + opts.uid, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ymd(opts.date), 'DTEND;VALUE=DATE:' + ymd(next),
      'SUMMARY:' + icsEsc(opts.title), 'DESCRIPTION:' + icsEsc(opts.details + (opts.url ? '\n' + opts.url : '')),
    ];
    if (opts.url) lines.push('URL:' + opts.url);
    if (opts.everyMonths) lines.push('RRULE:FREQ=MONTHLY;INTERVAL=' + opts.everyMonths);
    if (opts.alarmDays != null)
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(opts.title),
        'TRIGGER:-P' + opts.alarmDays + 'D', 'END:VALARM');
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function addMonths(isoDate, months) {
    const d = new Date(isoDate + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  const api = { norm, searchAreas, unitShort, unitOptions, unitFigure, verdict, km, cheaperNearby, rankAmong, trend, insights,
    changeSince, emptyStore, cleanStore, remember, isSaved, whatsNew, ics, addMonths, MAX_HISTORY, MAX_SAVED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RentInsights = api;
})(this);
