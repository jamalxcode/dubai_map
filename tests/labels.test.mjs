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

test('a label under a map button with no free spot joins its nearest neighbour; nothing overlaps or stays hidden', () => {
  const view = { x0: 0, y0: 0, x1: 300, y1: 200 };
  // A button fills the top-right corner; a crowd of labels leaves no free spot beside the one under it.
  const blocks = [{ x: 250, y: 25, w: 100, h: 50 }];
  const pts = [item('Under', 250, 25, 60000, 50)];
  for (let x = 50; x <= 250; x += 100) for (let y = 75; y <= 175; y += 50) pts.push(item(`P${x},${y}`, x, y));
  const cl = RL.place(pts, size, { view, blocks });
  const hidden = cl.filter(c => Math.abs(c.lx - 250) * 2 < c.w + 100 && Math.abs(c.ly - 25) * 2 < c.h + 50);
  assert.equal(hidden.length, 0, 'none sits under the button');
  assert.equal(overlaps(cl), 0);
  assert.ok(cl.some(c => c.members.some(m => m.a.label === 'Under')), 'its area is still on the map, in a group');
});

// Shown labels against blocks: the page draws only labels without `hidden`.
const onAnyBlock = (cl, blocks) => cl.filter(c => !c.hidden && blocks.some(b => Math.abs(c.lx - b.x) * 2 < c.w + b.w && Math.abs(c.ly - b.y) * 2 < c.h + b.h));

test('a phone map with the view bar, legend and credits: no shown label touches one, whatever is crowded under it', () => {
  // 341 x 494, like the map on a 375 px phone: view bar top right, zoom top left, legend and credits bottom right.
  const view = { x0: 0, y0: 0, x1: 341, y1: 494 };
  const blocks = [{ x: 262, y: 27, w: 138, h: 34 }, { x: 39, y: 75, w: 58, h: 130 }, { x: 227, y: 404, w: 211, h: 92 }, { x: 317, y: 470, w: 28, h: 28 }];
  const wide = (m) => ({ w: m.length > 1 ? 170 : 92, h: 50 });
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let run = 0; run < 30; run++) {
    const pts = Array.from({ length: 60 }, (_, i) => item('A' + i, rnd() * 341, rnd() * 494, 30000 + rnd() * 150000, 1 + Math.round(rnd() * 3000)));
    // The reported cases: an area right under the view bar, one on the credits.
    pts.push(item('Maritime', 180, 23, 2.4e6, 400), item('Mina', 200, 30, 2.3e6, 50), item('Hills2', 324, 464, 660000, 300));
    const cl = RL.place(pts, wide, { pad: 4, view, blocks });
    assert.deepEqual(onAnyBlock(cl, blocks).map(c => c.members.map(m => m.a.label).join('+')), [], `run ${run}: no shown label on a control`);
    assert.equal(overlaps(cl.filter(c => !c.hidden)), 0, `run ${run}: shown labels don't overlap`);
    assert.equal(cl.reduce((s, c) => s + c.members.length, 0), pts.length, `run ${run}: every area is in exactly one label, shown or hidden`);
  }
});

test('a label with nowhere to go off a control is hidden, not drawn under it', () => {
  // The control covers the whole map: there is no free spot and no neighbour to join.
  const view = { x0: 0, y0: 0, x1: 200, y1: 100 };
  const cl = RL.place([item('Lost', 100, 50)], size, { view, blocks: [{ x: 100, y: 50, w: 200, h: 100 }] });
  assert.equal(cl.length, 1);
  assert.equal(cl[0].hidden, true);
});

test('a stuck label joins a neighbour when the joined label has room, rather than being hidden', () => {
  const view = { x0: 0, y0: 0, x1: 400, y1: 300 };
  // A tall control down the left edge; the stuck label's own spots all fall on it or off the map,
  // but joined with its neighbour the group's centre lands clear of it.
  const blocks = [{ x: 60, y: 150, w: 120, h: 300 }];
  const cl = RL.place([item('Stuck', 20, 150, 50000, 10), item('Near', 230, 150, 50000, 500)], size, { view, blocks });
  assert.ok(cl.every(c => !c.hidden), 'nothing hidden');
  assert.deepEqual(onAnyBlock(cl, blocks), []);
  assert.ok(cl.some(c => c.members.length === 2), 'the two areas share a label');
});

test('many labels stuck under a panel do not starve a later one under a button (it is still joined or moved)', () => {
  // The phone bug: the first stuck label (a big group pressed against the legend) used up every round of
  // step 3, so "Dubai Maritime City + 1 area" under the view bar was returned on the button anyway.
  const view = { x0: 0, y0: 0, x1: 400, y1: 1000 };
  const blocks = [{ x: 90, y: 500, w: 180, h: 1000 }, { x: 340, y: 30, w: 120, h: 60 }];
  const pts = [];
  for (let i = 0; i < 8; i++) pts.push(item('Lost' + i, 10, 60 + i * 120, 50000, 1000 - i));
  pts.push(item('Under', 380, 20, 60000, 10), item('Beside', 350, 100, 60000, 500), item('Low', 250, 150, 60000, 400));
  const cl = RL.place(pts, size, { pad: 4, view, blocks });
  assert.deepEqual(onAnyBlock(cl, blocks), [], 'no shown label on a control');
  assert.equal(overlaps(cl.filter(c => !c.hidden)), 0);
  const under = cl.find(c => c.members.some(m => m.a.label === 'Under'));
  assert.ok(!under.hidden, 'the area under the button is still shown (moved or joined)');
  assert.ok(cl.filter(c => c.hidden).every(c => c.members.every(m => m.a.label.startsWith('Lost'))), 'only the areas with nowhere to go are hidden');
  assert.ok(cl.every(c => !c.members.some(m => m.a.label.startsWith('Lost')) || c.members.every(m => m.a.label.startsWith('Lost'))), 'no join across the map');
});

test('a big group speaks for its busiest area: its own value, at its point (lead)', () => {
  // Twelve areas piled together: with lead 8 the label shows the busiest one's figure, not a 12-area average.
  const pts = Array.from({ length: 12 }, (_, i) => item('A' + i, (i % 4) * 5, Math.floor(i / 4) * 5, 40000 + i * 10000, i === 7 ? 900 : 100));
  const [c] = RL.place(pts, size, { lead: 8 });
  assert.equal(c.members.length, 12);
  assert.equal(c.lead.a.label, 'A7');
  assert.equal(c.val, 110000);
  assert.equal(c.x, pts[7].x); assert.equal(c.y, pts[7].y);
  // Small groups keep the weighted average; counts (sum) always add up.
  const few = RL.place(pts.slice(0, 4), size, { lead: 8 })[0];
  assert.equal(few.lead, null);
  assert.equal(few.val, 55000);
  const counts = RL.place(pts, size, { lead: 8, sum: true })[0];
  assert.equal(counts.lead, null);
  assert.equal(counts.val, 2000);
});
