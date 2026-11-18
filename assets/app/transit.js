/* Metro and Tram: distances between stations and areas, and rent near each station. Pure functions, no DOM,
 * so they are tested in Node (tests/transit.test.mjs). The page (atlas.js) draws the lines and stations from
 * data/transit.json (OpenStreetMap, collector/transit.py) and uses these to keep only the areas within a walk
 * of a station, and to say what a home near each station typically rents for.
 *
 * Distances are straight lines from a station to the nearest edge of an area's official outline (0 when the
 * station is inside it), or to the area's point when it has no outline. Walking is slower than a straight
 * line, so a "10-minute walk" is 800 m and a "20-minute walk" 1,600 m (about 80 m a minute, with turns).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Transit = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const WALKS = { 10: 800, 20: 1600 }; // minutes → metres, straight line

  // Metres between [lat, lng] points (equirectangular; fine across a city).
  function metres(a, b) {
    const k = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
    return Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * k);
  }
  // Metres from p to the segment a-b ([lat, lng] each).
  function toSegment(p, a, b) {
    const k = Math.cos(p[0] * Math.PI / 180);
    const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111320;
  }
  // Is p inside the ring ([lat, lng] points)? Ray casting.
  function inRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i], [yj, xj] = ring[j];
      if ((yi > p[0]) !== (yj > p[0]) && p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  /** Metres from a point to an outline (a list of rings of [lat, lng]); 0 inside it. */
  function toOutline(p, rings) {
    if (rings.some(r => r.length > 2 && inRing(p, r))) return 0;
    let best = Infinity;
    for (const r of rings) for (let i = 0; i < r.length - 1; i++) best = Math.min(best, toSegment(p, r[i], r[i + 1]));
    return best;
  }

  /**
   * For each area (by label): its nearest station and the distance to it.
   * areas: [{label, lat, lng}]; outlines: Map label → rings of [lat, lng]; stations: [{name, lat, lng, ...}].
   */
  function nearest(areas, outlines, stations) {
    const out = new Map();
    for (const a of areas) {
      if (a.lat == null) continue;
      const rings = outlines && outlines.get(a.label);
      let best = { m: Infinity, station: null };
      for (const s of stations) {
        // Cheap test first: a station far from the area's point can't be near its outline.
        const far = metres([a.lat, a.lng], [s.lat, s.lng]);
        if (rings ? far > 8000 : false) continue;
        const m = rings ? toOutline([s.lat, s.lng], rings) : far;
        if (m < best.m) best = { m, station: s };
      }
      out.set(a.label, { m: Math.round(best.m), station: best.station });
    }
    return out;
  }

  /** The areas within `metres` of a station: [{label, m}], nearest first. */
  function areasNear(station, areas, outlines, maxM) {
    const out = [];
    for (const a of areas) {
      if (a.lat == null) continue;
      const rings = outlines && outlines.get(a.label);
      if (metres([a.lat, a.lng], [station.lat, station.lng]) > maxM + 6000) continue;
      const m = rings ? toOutline([station.lat, station.lng], rings) : metres([a.lat, a.lng], [station.lat, station.lng]);
      if (m <= maxM) out.push({ label: a.label, m: Math.round(m) });
    }
    return out.sort((x, y) => x.m - y.m);
  }

  /**
   * Typical rent near each station: the contract-weighted average of the areas within the walk that have a
   * figure (points: [{label, v, n}]). Stations with no such area are left out. Cheapest first.
   */
  function stationRents(stations, areas, outlines, points, maxM) {
    const byLabel = new Map(points.map(p => [p.label, p]));
    const out = [];
    for (const s of stations) {
      const near = areasNear(s, areas, outlines, maxM).map(x => byLabel.get(x.label)).filter(Boolean);
      const n = near.reduce((t, p) => t + (p.n || 1), 0);
      if (!near.length) continue;
      out.push({ station: s, v: near.reduce((t, p) => t + p.v * (p.n || 1), 0) / n, areas: near.length });
    }
    return out.sort((x, y) => x.v - y.v);
  }

  return { WALKS, metres, toSegment, inRing, toOutline, nearest, areasNear, stationRents };
});
