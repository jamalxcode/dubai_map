// Metro and Tram helpers (assets/app/transit.js): distances to outlines, areas near a station, rent near stations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const TR = createRequire(import.meta.url)('../assets/app/transit.js');

// A square area about 1.1 km a side at Dubai's latitude, and stations around it.
const sq = [[25.10, 55.20], [25.10, 55.211], [25.11, 55.211], [25.11, 55.20], [25.10, 55.20]];
const outlines = new Map([['Square', [sq]]]);
const inside = { name: 'In', lat: 25.105, lng: 55.205 };
const east = { name: 'East', lat: 25.105, lng: 55.211 + 0.007 }; // about 700 m east of the edge
const far = { name: 'Far', lat: 25.20, lng: 55.30 };

test('distances: metres, inside an outline is 0, outside is to the nearest edge', () => {
  assert.ok(Math.abs(TR.metres([25.10, 55.20], [25.11, 55.20]) - 1113) < 5);
  assert.equal(TR.toOutline([inside.lat, inside.lng], [sq]), 0);
  const d = TR.toOutline([east.lat, east.lng], [sq]);
  assert.ok(d > 650 && d < 760, `east edge distance ${d}`);
});

test('areas near a station use the outline, or the point when there is none', () => {
  const areas = [{ label: 'Square', lat: 25.105, lng: 55.205 }, { label: 'Dot', lat: 25.105, lng: 55.220 }];
  assert.deepEqual(TR.areasNear(east, areas, outlines, 800).map(a => a.label), ['Dot', 'Square']);
  assert.deepEqual(TR.areasNear(east, areas, outlines, 500).map(a => a.label), ['Dot']); // the point is ~200 m away
  assert.deepEqual(TR.areasNear(far, areas, outlines, 1600), []);
  const n = TR.nearest(areas, outlines, [east, inside, far]);
  assert.equal(n.get('Square').station.name, 'In');
  assert.equal(n.get('Square').m, 0);
  assert.equal(n.get('Dot').station.name, 'East');
});

test('rent near stations is contract-weighted, cheapest first, stations with nothing near left out', () => {
  const areas = [{ label: 'Square', lat: 25.105, lng: 55.205 }, { label: 'Dot', lat: 25.105, lng: 55.220 }];
  const points = [{ label: 'Square', v: 60000, n: 300 }, { label: 'Dot', v: 90000, n: 100 }];
  const r = TR.stationRents([east, inside, far], areas, outlines, points, 800);
  assert.deepEqual(r.map(x => x.station.name), ['In', 'East']);
  assert.equal(r[0].v, 60000);
  assert.equal(r[1].v, (60000 * 300 + 90000 * 100) / 400);
  assert.equal(r[1].areas, 2);
});

test('places go to the area whose outline holds them, else the nearest area point within 1.5 km', () => {
  const areas = [{ label: 'Square', lat: 25.105, lng: 55.205 }, { label: 'Dot', lat: 25.105, lng: 55.220 }, { label: 'Far', lat: 25.30, lng: 55.40 }];
  const places = [{ lat: 25.101, lng: 55.201 }, { lat: 25.106, lng: 55.222 }, { lat: 25.20, lng: 55.30 }, { lat: 25.105, lng: 55.212 }];
  // In the square; near Dot; nowhere near anything; just outside the square's east edge, 706 m from Square's point
  // and 806 m from Dot's: the nearer point wins.
  assert.deepEqual(TR.assign(places, areas, outlines), ['Square', 'Dot', null, 'Square']);
  assert.deepEqual(TR.assign(places, areas, new Map()), ['Square', 'Dot', null, 'Square']); // without outlines: nearest point
  assert.deepEqual(TR.assign([{ lat: 25.105, lng: 55.212 }], [areas[1]], new Map(), 500), [null]); // beyond the limit
});
