// The rent-check logic (assets/app/insights.js): search, verdicts, discoveries, saved data, reminders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const RI = createRequire(import.meta.url)('../assets/app/insights.js');

const area = (label, lat, lng, units, extra = {}) => ({
  label, lat, lng, n: units.reduce((s, u) => s + u.n, 0), median: units[0] ? units[0].median : null,
  dld_areas: extra.dld || [], top_projects: extra.projects || [], by_unit: units, monthly: extra.monthly || [], ...extra,
});
const one = (median, n = 500) => ({ u: '1-bedroom apartments', n, median, yield: 6.5 });
const AREAS = [
  area('Jumeirah Village Circle', 25.058, 55.209, [one(70000, 15000), { u: 'Studios', n: 7000, median: 48000 }],
       { dld: ['Al Barsha South Fourth'], projects: [{ p: 'Bloom Towers', n: 40, median: 72000 }] }),
  area('Arjan', 25.064, 55.236, [one(62000, 3000)]),           // 2.8 km away, cheaper
  area('Dubai Sports City', 25.039, 55.222, [one(58000, 2500)]), // 2.5 km, cheaper still
  area('Dubai Marina', 25.080, 55.140, [one(110000, 9000)]),     // 7 km, dearer
  area('Tiny Place', 25.06, 55.21, [one(30000, 5)]),             // too few contracts to suggest
  area('Hatta', 24.80, 56.12, [one(20000, 400)]),                // far away
  area('Business Bay', 25.186, 55.268, [one(95000, 9000)]),
];

test('search: exact, nicknames, official DLD names, buildings, typos', () => {
  assert.equal(RI.searchAreas(AREAS, 'Arjan')[0].how, 'exact');
  assert.equal(RI.searchAreas(AREAS, 'jvc')[0].area.label, 'Jumeirah Village Circle');
  assert.equal(RI.searchAreas(AREAS, 'al barsha south fourth')[0].area.label, 'Jumeirah Village Circle');
  assert.equal(RI.searchAreas(AREAS, 'dubai')[0].how, 'starts');
  assert.deepEqual(RI.searchAreas(AREAS, 'bloom').map(h => [h.area.label, h.how]), [['Jumeirah Village Circle', 'building']]);
  const typo = RI.searchAreas(AREAS, 'busines bay');
  assert.equal(typo[0].area.label, 'Business Bay');
  assert.equal(typo[0].how, 'close', 'a typo is offered as a suggestion, not silently accepted');
  assert.deepEqual(RI.searchAreas(AREAS, 'zzzz'), []);
  assert.deepEqual(RI.searchAreas(AREAS, '  '), []);
});

test('verdict: below, about (within 5%), above', () => {
  assert.deepEqual(RI.verdict(63000, 70000), { pct: -10, diff: -7000, word: 'below' });
  assert.equal(RI.verdict(72000, 70000).word, 'about');
  assert.equal(RI.verdict(80000, 70000).word, 'above');
  assert.equal(RI.verdict(null, 70000), null);
  assert.equal(RI.verdict(50000, null), null);
});

test('cheaper nearby: same unit, close, trustworthy, best value first', () => {
  const jvc = AREAS[0];
  const got = RI.cheaperNearby(AREAS, jvc, '1-bedroom apartments');
  assert.deepEqual(got.map(c => c.area.label), ['Dubai Sports City', 'Arjan']);
  assert.ok(got.every(c => c.km < 12 && c.saving > 0));
  assert.deepEqual(RI.cheaperNearby(AREAS, jvc, 'Studios'), [], 'no other area has studio figures');
  assert.deepEqual(RI.cheaperNearby(AREAS, AREAS[2], '1-bedroom apartments'), [], 'nothing cheaper near the cheapest');
});

test('rank among areas and insights only include what the data supports', () => {
  assert.deepEqual(RI.rankAmong(AREAS, AREAS[0], '1-bedroom apartments'), { cheaperThanPct: 33, dearerThanPct: 50, of: 6 });
  const facts = RI.insights(AREAS, AREAS[0], '1-bedroom apartments', 80000).map(f => f.kind);
  assert.deepEqual(facts, ['verdict', 'cheaper', 'rank', 'yield']);
  assert.deepEqual(RI.insights(AREAS, AREAS[0], '1-bedroom apartments', null).map(f => f.kind), ['cheaper', 'rank', 'yield']);
  assert.deepEqual(RI.insights(AREAS, AREAS[0], '5-bedroom villas', 1), [], 'unknown unit: nothing invented');
  assert.deepEqual(RI.insights(AREAS, AREAS[0], '', 80000).map(f => f.kind), ['verdict'],
                   'all homes: no area-to-area comparisons (different mixes of homes)');
  assert.equal(RI.unitShort('1-bedroom apartments'), '1 bed');
  assert.equal(RI.unitShort('4-bedroom villas'), '4 bed villa');
  assert.equal(RI.unitShort('Studios'), 'Studio');
  assert.equal(RI.unitShort('2 bed'), '2 bed');
  assert.equal(RI.unitShort(''), 'All homes');
  const monthly = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map((m, i) => ({ m, n: 50, median: 60000 + i * 1000 }));
  assert.equal(RI.trend({ monthly }).pct, 5);
  assert.equal(RI.trend({ monthly: monthly.slice(0, 3) }), null, 'too short to call a trend');
});

test('saved data: cleaned on read, history capped and de-duplicated, never throws', () => {
  assert.deepEqual(RI.cleanStore(null), RI.emptyStore());
  assert.deepEqual(RI.cleanStore('junk'), RI.emptyStore());
  const s = RI.cleanStore({ saved: [{ area: 'Arjan', unit: 'Studios', rent: 'lots', renews: 'soon', evil: '<script>' }, { nope: 1 }],
                            prefs: { remindDays: 7, checkEvery: 6, whatsNew: false }, view: { lat: 25, lng: 55, z: 12 } });
  assert.deepEqual(s.saved, [{ area: 'Arjan', unit: 'Studios', rent: null, renews: null, snap: null, at: null }]);
  assert.deepEqual(s.prefs, { whatsNew: false, remindDays: 90, checkEvery: 6 });
  let st = RI.emptyStore();
  for (let i = 0; i < 12; i++) st = RI.remember(st, { area: 'A' + i, unit: '' });
  st = RI.remember(st, { area: 'A5', unit: '' });
  assert.equal(st.history.length, RI.MAX_HISTORY);
  assert.equal(st.history[0].area, 'A5');
  assert.equal(st.history.filter(h => h.area === 'A5').length, 1);
});

test("what's new: only when the data moved on, with changes for saved areas", () => {
  const byLabel = Object.fromEntries(AREAS.map(a => [a.label, a]));
  const st = RI.emptyStore();
  st.saved = [{ area: 'Arjan', unit: '1-bedroom apartments', snap: { median: 60000, through: '2026-10-29' } },
              { area: 'Dubai Marina', unit: '1-bedroom apartments', snap: { median: 110000, through: '2026-10-29' } }];
  st.seenThrough = '2026-10-29';
  const w = RI.whatsNew(st, '2026-11-13', byLabel);
  assert.deepEqual(w.changes.map(c => [c.area, c.pct]), [['Arjan', 3.3]], 'unchanged areas are not listed');
  assert.equal(RI.whatsNew(st, '2026-10-29', byLabel), null, 'same data, nothing to say');
  assert.equal(RI.whatsNew(RI.emptyStore(), '2026-11-13', byLabel), null, 'first visit');
});

test('calendar file: all-day event, reminder before, optional repeat', () => {
  const txt = RI.ics({ uid: 'x@y', title: 'Rent renewal: JVC, 1 bed', date: '2027-03-01', alarmDays: 90,
                       details: 'Check; the market', url: 'https://example.org/?area=JVC' });
  assert.match(txt, /^BEGIN:VCALENDAR\r\n/);
  assert.match(txt, /DTSTART;VALUE=DATE:20270301\r\nDTEND;VALUE=DATE:20270302/);
  assert.match(txt, /SUMMARY:Rent renewal: JVC\\, 1 bed/);
  assert.match(txt, /DESCRIPTION:Check\\; the market\\nhttps:\/\/example.org/);
  assert.match(txt, /TRIGGER:-P90D/);
  assert.doesNotMatch(txt, /RRULE/);
  assert.match(RI.ics({ uid: 'z', title: 't', date: '2027-01-31', details: '', everyMonths: 6 }), /RRULE:FREQ=MONTHLY;INTERVAL=6/);
  assert.equal(RI.addMonths('2026-11-16', 3), '2027-02-16');
});

test('areas with no count per home type (older districts): no all-homes figure, still comparable', () => {
  const karama = { label: 'Al Karama', lat: 25.245, lng: 55.305, n: 12391, median: 57330, median_kind: 'unit',
                   median_unit: '1-bedroom apartments', dld_areas: ['Al Karama'],
                   by_unit: [{ u: '1-bedroom apartments', n: null, median: 57330 }, { u: 'Studios', n: null, median: 44000 }] };
  const mankhool = { label: 'Mankhool', lat: 25.249, lng: 55.295, n: 10285, median: 63670, median_kind: 'unit',
                     by_unit: [{ u: '1-bedroom apartments', n: null, median: 63670 }] };
  assert.deepEqual(RI.unitOptions(karama).map(u => u.u), ['1-bedroom apartments', 'Studios'], 'source order kept');
  assert.equal(RI.unitFigure(karama, ''), null, 'no all-homes median is published');
  assert.equal(RI.unitFigure(karama, 'Studios').median, 44000);
  const cheaper = RI.cheaperNearby([karama, mankhool], mankhool, '1-bedroom apartments');
  assert.deepEqual(cheaper.map(c => [c.area.label, c.n]), [['Al Karama', 12391]], 'the area total stands in for trust');
});


test('ranges travel with the figure when a source has them, and are absent otherwise', () => {
  const a = { label: 'A', n: 400, median: 70000, p25: 60000, p75: 82000,
              by_unit: [{ u: 'Studios', n: 100, median: 45000, p25: 40000, p75: 50000 }, { u: '1-bedroom apartments', n: 80, median: 65000 }] };
  assert.deepEqual([RI.unitFigure(a, '').p25, RI.unitFigure(a, '').p75], [60000, 82000]);
  assert.equal(RI.unitFigure(a, 'Studios').p75, 50000);
  assert.equal(RI.unitFigure(a, '1-bedroom apartments').p25, undefined);
});

test('industrial zones (mostly staff accommodation) are left out of comparisons', () => {
  const jvc = AREAS[0];
  const staff = Object.assign({}, AREAS[2], { label: 'Jabal Ali Industrial First', staff: true, lat: jvc.lat + 0.01, lng: jvc.lng });
  const pool = AREAS.concat([staff]);
  assert.ok(!RI.cheaperNearby(pool, jvc, '1-bedroom apartments').some(c => c.area.staff), 'never suggested as the same home for less');
  assert.deepEqual(RI.rankAmong(pool, jvc, '1-bedroom apartments'), RI.rankAmong(AREAS, jvc, '1-bedroom apartments'), 'not counted in the rank');
  assert.equal(RI.rankAmong(pool, staff, '1-bedroom apartments'), null, 'and not ranked itself');
});
