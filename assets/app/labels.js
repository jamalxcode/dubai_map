/* Map label placement for the Dubai Rent Atlas: no DOM, no Leaflet, so the rules are unit-tested
 * (tests/labels.test.mjs). The page projects areas to pixels, asks for placements, then draws them.
 *
 *   RentLabels.place(items, size, { pad, sum, blocks })
 *     items  [{ a, v, n, x, y, lat, lng }]: an area, its value, its contract count (the weight),
 *            its point in layer pixels and on the map.
 *     size   (members, val) -> { w, h }: the box of a label that shows these members.
 *     pad    gap kept between labels (px).  sum: the value is a count, so groups add up.
 *     blocks [{ x, y, w, h }]: boxes labels must avoid (map buttons, legend), centre and size.
 *   -> [{ members, N, val, lat, lng, single, x, y, lx, ly, w, h }]: (x, y) is the label's point,
 *      (lx, ly) where the label sits; they differ when a label was moved beside its point.
 *
 * Rules, in order:
 *   1. Labels that would overlap merge into one, showing the contract-weighted average (or the
 *      total for counts) at the weighted centre. The busiest areas merge first.
 *   2. A merged label of up to three areas comes apart again when every one of its labels fits
 *      at its own point or just beside it (above, below, left, right, diagonally).
 *   3. A label under a map button or the legend steps aside to the nearest free spot.
 * No two returned labels overlap, and none sits on a block unless there was no free spot.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RentLabels = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_SPLIT = 3;

  function place(items, size, { pad = 6, sum = false, blocks = [] } = {}) {
    const make = members => {
      const N = members.reduce((s, o) => s + o.n, 0);
      const w = o => (N ? o.n / N : 1 / members.length);
      const val = sum ? N : members.reduce((s, o) => s + o.v * w(o), 0);
      const at = k => members.reduce((s, o) => s + o[k] * w(o), 0);
      const x = at('x'), y = at('y');
      const box = size(members, val);
      return { members, N, val, lat: at('lat'), lng: at('lng'), single: members.length === 1, x, y, lx: x, ly: y, w: box.w, h: box.h };
    };
    const hit = (a, b) => Math.abs(a.lx - b.lx) * 2 < a.w + b.w + pad && Math.abs(a.ly - b.ly) * 2 < a.h + b.h + pad;
    const onBlock = c => blocks.some(b => hit(c, { lx: b.x, ly: b.y, w: b.w, h: b.h }));

    // 1. Merge. After a merge the grown label is checked again from its own place in the list,
    //    instead of starting the whole scan over; passes repeat until nothing overlaps.
    let cl = items.map(p => make([p]));
    for (let again = true; again;) {
      again = false;
      cl.sort((p, q) => q.N - p.N);
      for (let i = 0; i < cl.length; i++) {
        for (let k = i + 1; k < cl.length; k++) {
          if (hit(cl[i], cl[k])) {
            cl[i] = make(cl[i].members.concat(cl[k].members));
            cl.splice(k, 1);
            k = i;
            again = true;
          }
        }
      }
    }

    const spots = c => [[0, 0], [0, -(c.h + pad)], [0, c.h + pad], [c.w / 2 + 10, 0], [-(c.w / 2 + 10), 0],
      [c.w / 2, -(c.h + pad)], [-c.w / 2, -(c.h + pad)], [c.w / 2, c.h + pad], [-c.w / 2, c.h + pad]];
    const fit = (c, others) => {
      for (const [dx, dy] of spots(c)) {
        const t = Object.assign({}, c, { lx: c.x + dx, ly: c.y + dy });
        if (!others.some(o => hit(t, o)) && !onBlock(t)) return t;
      }
      return null;
    };

    // 2. Small groups come apart when there is room.
    for (let i = 0; i < cl.length; i++) {
      const c = cl[i];
      if (c.single || c.members.length > MAX_SPLIT) continue;
      const rest = cl.filter((_, j) => j !== i), parts = [];
      for (const m of [...c.members].sort((p, q) => q.n - p.n)) {
        const t = fit(make([m]), rest.concat(parts));
        if (!t) break;
        parts.push(t);
      }
      if (parts.length === c.members.length) { cl.splice(i, 1, ...parts); i += parts.length - 1; }
    }

    // 3. Out from under the map's buttons and legend.
    for (let i = 0; i < cl.length; i++) {
      if (!onBlock(cl[i])) continue;
      const t = fit(cl[i], cl.filter((_, j) => j !== i));
      if (t) cl[i] = t;
    }
    return cl;
  }

  return { place, MAX_SPLIT };
});
