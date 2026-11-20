/* Map label placement for the Dubai Real Estate Atlas: no DOM, no Leaflet, so the rules are unit-tested
 * (tests/labels.test.mjs). The page projects areas to pixels, asks for placements, then draws them.
 *
 *   RentLabels.place(items, size, { pad, sum, blocks })
 *     items  [{ a, v, n, x, y, lat, lng }]: an area, its value, its contract count (the weight),
 *            its point in layer pixels and on the map.
 *     size   (members, val) -> { w, h }: the box of a label that shows these members.
 *     pad    gap kept between labels (px).  sum: the value is a count, so groups add up.
 *     blocks [{ x, y, w, h }]: boxes labels must avoid (map buttons, legend), centre and size.
 *   -> [{ members, N, val, lat, lng, single, x, y, lx, ly, w, h, hidden }]: (x, y) is the label's point,
 *      (lx, ly) where the label sits; they differ when a label was moved beside its point.
 *      hidden: true when the label could go nowhere clear of a block; the page doesn't draw it.
 *
 * Rules, in order:
 *   1. Labels that would overlap merge into one, showing the contract-weighted average (or the
 *      total for counts) at the weighted centre. The busiest areas merge first.
 *   2. A merged label of up to three areas comes apart again when every one of its labels fits
 *      at its own point or just beside it (above, below, left, right, diagonally).
 *   3. A label under a map button or the legend steps aside to the nearest free spot (beside its point,
 *      else up to two label-steps further out, else the nearest free position within a label's width
 *      and three heights); with no free spot it joins its nearest neighbour (within 1.5 times the two labels'
 *      widths) whose joined label then has a free spot, else it is hidden (never drawn under a control).
 *   0. With `view` ({ x0, y0, x1, y1 }, layer pixels), a label whose point is on screen is kept fully
 *      inside the edges from the start (so crowded edges merge rather than cut labels off), and later
 *      moves never take it back out.
 * No two shown labels overlap, and no shown label touches a block, whatever the input.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RentLabels = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_SPLIT = 3;

  function place(items, size, { pad = 6, sum = false, blocks = [], view = null } = {}) {
    const make = members => {
      const N = members.reduce((s, o) => s + o.n, 0);
      const w = o => (N ? o.n / N : 1 / members.length);
      const val = sum ? N : members.reduce((s, o) => s + o.v * w(o), 0);
      const at = k => members.reduce((s, o) => s + o[k] * w(o), 0);
      const x = at('x'), y = at('y');
      const box = size(members, val);
      return keepIn({ members, N, val, lat: at('lat'), lng: at('lng'), single: members.length === 1, x, y, lx: x, ly: y, w: box.w, h: box.h });
    };
    // 0. Inside the map: a label whose point is on screen starts fully inside the edges (a line joins it to its
    //    point if it had to slide), so crowded edges merge instead of cutting labels off.
    const onScreen = c => view && c.x >= view.x0 && c.x <= view.x1 && c.y >= view.y0 && c.y <= view.y1;
    const clampX = (c, x) => Math.min(Math.max(x, view.x0 + c.w / 2 + 2), view.x1 - c.w / 2 - 2);
    const clampY = (c, y) => Math.min(Math.max(y, view.y0 + c.h / 2 + 2), view.y1 - c.h / 2 - 2);
    function keepIn(c) { if (onScreen(c)) { c.lx = clampX(c, c.lx); c.ly = clampY(c, c.ly); } return c; }
    const outside = t => onScreen(t) && (t.lx !== clampX(t, t.lx) || t.ly !== clampY(t, t.ly));
    const hit = (a, b) => Math.abs(a.lx - b.lx) * 2 < a.w + b.w + pad && Math.abs(a.ly - b.ly) * 2 < a.h + b.h + pad;
    const onBlock = c => blocks.some(b => hit(c, { lx: b.x, ly: b.y, w: b.w, h: b.h }));

    // 1. Merge. After a merge the grown label is checked again from its own place in the list,
    //    instead of starting the whole scan over; passes repeat until nothing overlaps.
    const mergeAll = list => { for (let again = true; again;) {
      again = false;
      list.sort((p, q) => q.N - p.N);
      for (let i = 0; i < list.length; i++) {
        for (let k = i + 1; k < list.length; k++) {
          if (hit(list[i], list[k])) {
            list[i] = make(list[i].members.concat(list[k].members));
            list.splice(k, 1);
            k = i;
            again = true;
          }
        }
      }
    } return list; };
    let cl = mergeAll(items.map(p => make([p])));

    const spots = c => [[0, 0], [0, -(c.h + pad)], [0, c.h + pad], [c.w / 2 + 10, 0], [-(c.w / 2 + 10), 0],
      [c.w / 2, -(c.h + pad)], [-c.w / 2, -(c.h + pad)], [c.w / 2, c.h + pad], [-c.w / 2, c.h + pad]];
    const fit = (c, others, rings = 1) => {
      for (let k = 1; k <= rings; k++) {
        for (const [dx, dy] of spots(c)) {
          const t = Object.assign({}, c, { lx: c.x + dx * k, ly: c.y + dy * k });
          if (!others.some(o => hit(t, o)) && !onBlock(t) && !outside(t)) return t;
        }
      }
      return null;
    };
    // A wider search for a label the fixed spots can't place: any position within a label's width sideways
    // and three label-heights up or down, the nearest free one first (a line joins it to its point).
    const nearest = (c, others) => {
      const t = fit(c, others, 2);
      if (t) return t;
      const cand = [];
      for (let dx = -c.w; dx <= c.w; dx += c.w / 8) for (let dy = -3 * c.h; dy <= 3 * c.h; dy += c.h / 4) cand.push([dx, dy]);
      cand.sort((p, q) => p[0] ** 2 + p[1] ** 2 - q[0] ** 2 - q[1] ** 2);
      for (const [dx, dy] of cand) {
        const u = Object.assign({}, c, { lx: c.x + dx, ly: c.y + dy });
        if (!others.some(o => hit(u, o)) && !onBlock(u) && !outside(u)) return u;
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

    // 3. Out from under the map's buttons and legend: beside its point, else up to two label-steps further
    //    out, else the nearest free position close by (a line joins it to its point). A label with no free
    //    spot joins its nearest neighbour (merging on as usual) for which the label that then holds it finds
    //    a free spot, closest first, among neighbours within 1.5 times the two labels' widths. Otherwise it
    //    is hidden: never drawn under a control. Hidden labels are still returned (hidden: true), so every
    //    area stays in exactly one label, and they take part in no overlap test. Every stuck label gets its
    //    turn (a round limit once let one hopeless label starve the rest, which were then kept on controls).
    const shown = () => cl.filter(c => !c.hidden);
    for (let guard = cl.length * 2 + 10; guard > 0; guard--) {
      const i = cl.findIndex(c => !c.hidden && onBlock(c));
      if (i < 0) break;
      const c = cl[i], others = shown().filter(o => o !== c);
      const t = nearest(c, others);
      if (t) { cl[i] = t; continue; }
      const d = o => (o.x - c.x) ** 2 + (o.y - c.y) ** 2;
      // Join a neighbour, merging on as usual if the joined label overlaps others (tried on a copy);
      // kept only if the label holding this area ends up clear of every block.
      let joined = null;
      const reach = o => d(o) <= (1.5 * (c.w + o.w)) ** 2; // a neighbour, not an area across the map
      for (const o of others.filter(reach).sort((p, q) => d(p) - d(q))) {
        const trial = mergeAll(others.filter(r => r !== o).concat([make(c.members.concat(o.members))]));
        const mine = trial.find(r => r.members.includes(c.members[0]));
        const spot = onBlock(mine) ? nearest(mine, trial.filter(r => r !== mine)) : mine;
        if (spot) { joined = trial.map(r => r === mine ? spot : r); break; }
      }
      if (joined) cl = joined.concat(cl.filter(r => r.hidden));
      else cl[i] = Object.assign({}, c, { hidden: true });
    }
    // Anything still on a block (only if the guard ran out) is hidden too.
    cl = cl.map(c => !c.hidden && onBlock(c) ? Object.assign({}, c, { hidden: true }) : c);

    return cl;
  }

  return { place, MAX_SPLIT };
});
