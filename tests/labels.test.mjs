// Label placement rules (assets/app/labels.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const RL = createRequire(import.meta.url)('../assets/app/labels.js');

const size = () => ({ w: 100, h: 38 });
const item = (name, x, y, v = 50000, n = 100) => ({ a: { label: name }, v, n, x, y, lat: y, lng: x });
const overlaps = cl => {
  let k = 0;
  for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
    const a = cl[i], b = cl[j];
    if (Math.abs(a.lx - b.lx) * 2 < a.w + b.w && Math.abs(a.ly - b.ly) * 2 < a.h + b.h) k++;
  }
  return k;
};

test('far-apart areas keep their own labels at their points', () => {
  const cl = RL.place([item('A', 0, 0), item('B', 500, 0)], size);
  assert.equal(cl.length, 2);
  assert.ok(cl.every(c => c.single && c.lx === c.x && c.ly === c.y));
});

test('a crowd merges into one label with the contract-weighted average at the weighted centre', () => {
  const pts = [item('A', 0, 0, 40000, 300), item('B', 10, 0, 80000, 100), item('C', 0, 10, 60000, 100), item('D', 10, 10, 60000, 100)];
  const cl = RL.place(pts, size);
  assert.equal(cl.length, 1);
  assert.equal(cl[0].members.length, 4);
  assert.equal(Math.round(cl[0].val), Math.round((40000 * 300 + 80000 * 100 + 60000 * 200) / 600));
  assert.equal(cl[0].N, 600);
  assert.equal(RL.place(pts, size, { sum: true })[0].val, 600, 'counts add up');
});

test('a pair too close for both labels comes apart: one moves beside its point', () => {
  const cl = RL.place([item('Big', 0, 0, 50000, 900), item('Small', 30, 0, 52000, 100)], size);
  assert.equal(cl.length, 2, 'split, not merged');
  assert.equal(overlaps(cl), 0);
  const big = cl.find(c => c.members[0].a.label === 'Big');
  assert.ok(big.lx === big.x && big.ly === big.y, 'the busier area keeps its spot');
  assert.ok(cl.some(c => c.lx !== c.x || c.ly !== c.y), 'the other is moved');
});

test('groups of more than three stay merged', () => {
  const pts = [0, 1, 2, 3].map(i => item('P' + i, i * 5, 0));
  assert.equal(RL.place(pts, size).length, 1);
});

test('labels step out from under a map button', () => {
  const blocks = [{ x: 0, y: 0, w: 60, h: 60 }];
  const [c] = RL.place([item('A', 10, 10)], size, { blocks });
  assert.ok(Math.abs(c.lx - 0) * 2 >= c.w + 60 || Math.abs(c.ly - 0) * 2 >= c.h + 60, 'clear of the button');
});

test('no overlaps on a dense random city, and it stays quick', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts = Array.from({ length: 400 }, (_, i) => item('A' + i, rnd() * 1400, rnd() * 900, 30000 + rnd() * 150000, 1 + Math.round(rnd() * 5000)));
  const t0 = Date.now();
  const cl = RL.place(pts, size, { pad: 6 });
  assert.equal(overlaps(cl), 0);
  assert.equal(cl.reduce((s, c) => s + c.members.length, 0), 400, 'every area is in exactly one label');
  assert.ok(Date.now() - t0 < 1500, `placed 400 areas in ${Date.now() - t0} ms`);
});

test('a label at the edge of the map slides inside when the spot is free; one off screen stays put', () => {
  const view = { x0: 0, y0: 0, x1: 400, y1: 300 };
  const cl = RL.place([item('Edge', 395, 150), item('Away', 900, 150)], size, { view });
  const edge = cl.find(c => c.members[0].a.label === 'Edge'), away = cl.find(c => c.members[0].a.label === 'Away');
  assert.ok(edge.lx + edge.w / 2 <= 400, 'inside the right edge');
  assert.equal(edge.x, 395, 'its point is unchanged, so a line joins them');
  assert.equal(away.lx, 900, 'a label whose point is off screen is not pulled in');
});
