/* Street: walk Dubai's streets at eye level, with each nearby area's prices on signs (the owner's request, 28 Nov).
 * A MapLibre map over the 2D map, tilted almost flat to the ground, with OpenFreeMap's buildings raised and street names
 * along the roads. Each nearby area has a sign at its point: its yearly rent and sale price for every home type (the
 * area's medians from Ejari contracts and registered sales, not one building's price). A panel says which area you are
 * in, with its full figures. Move with the arrow keys or W A S D (Shift to run), the on-screen pad, or by clicking
 * the street ahead; drag to look around. "Google Street View" opens the real photos of the same spot in a new tab
 * (a Maps link, no key: embedding Google's imagery needs the owner's Maps Embed key, open item 5a).
 * Reads atlas.js's globals (map, viewCtl, T, safe, money, fmt, AREAS, POINTS, LABEL, OUTLINES, THIN,
 * styleFor, focusArea, countUse, visCenter, cssVar) and is wrapped in its own function.
 */
(function () {
  'use strict';
  if (typeof map === 'undefined' || typeof viewCtl === 'undefined') return;
  const NEAR_M = 2600;          // signs for areas within this distance of where you stand
  const MAX_SIGNS = 10;
  const WALK = 28, RUN = 90;    // metres a second (a brisk drive, and a fast one)
  const TURN = 75;              // degrees a second
  // MapLibre's camera sits behind and above the middle of the screen: at zoom 20.3 and a pitch of 82° it is about 70 m
  // back and 10 m up, close to a person's (or a car's) view along the street.
  const ZOOM = 20.3, PITCH = 82;
  const canGL = () => window.maplibregl && (!maplibregl.supported || maplibregl.supported());
  const metres = (a, b) => { const k = Math.cos((a.lat + b.lat) / 2 * Math.PI / 180); return Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * k); };
  const bearingTo = (a, b) => { const k = Math.cos(a.lat * Math.PI / 180); return (Math.atan2((b.lng - a.lng) * k, b.lat - a.lat) * 180 / Math.PI + 360) % 360; };
  // [lng, lat] rings, as data/outlines.json stores them.
  const inRing = (x, y, r) => { let inside = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; };

  // In the view bar after Peaks (phones show it as one more chip): the layer bar beside the zoom buttons is full at 320 px.
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'peaksBtn stBtn'; btn.textContent = T('Street');
  btn.title = T('Walk the streets at eye level, with each area\'s prices'); btn.setAttribute('aria-pressed', 'false'); btn.hidden = true;
  (function addBtn() { const v = document.querySelector('.views'), pk = v && v.querySelector('.peaksBtn'); if (pk) pk.after(btn); else setTimeout(addBtn, 300); })();
  setInterval(() => { const h = !canGL(); if (btn.hidden !== h) { btn.hidden = h; if (window.atlasState === 'ready' && typeof renderLabels === "function") renderLabels(); } }, 1500);
  btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); mS ? closeStreet() : openStreet(); });
  // "Walk the street" in an area's card (atlas.js writes the link; it carries the area's name).
  document.addEventListener('click', e => { const l = e.target.closest && e.target.closest('[data-walk]'); if (!l) return;
    const a = AREAS.find(x => x.label === l.dataset.walk); if (!a || !canGL()) return; e.preventDefault(); openStreet(a); });

  let mS = null, box = null, signs = [], here = null, held = new Set(), raf = 0, last = 0, hereKey = '';

  // Where to start: the area asked for, else the spot the map is zoomed in on, else the busiest area near the middle.
  function startAt(a) {
    if (a && a.lat != null) return { lat: a.lat, lng: a.lng, a };
    const c = visCenter();
    if (map.getZoom() >= 14) return { lat: c.lat, lng: c.lng };
    const busy = AREAS.filter(x => x.lat != null && !x.staff && (x.n || 0) >= 300);
    const best = (busy.length ? busy : AREAS.filter(x => x.lat != null)).reduce((b, x) => !b || metres(c, x) < metres(c, b) ? x : b, null);
    return best ? { lat: best.lat, lng: best.lng, a: best } : { lat: c.lat, lng: c.lng };
  }

  // The area you stand in: its outline if loaded, else the nearest area point within 1.5 km.
  function areaAt(p) {
    const byL = new Map(AREAS.map(a => [a.label, a]));
    for (const o of (typeof OUTLINES !== 'undefined' && OUTLINES) || []) { const a = byL.get(o.label); if (!a) continue;
      if (o.rings.some(r => r.length > 2 && inRing(p.lng, p.lat, r))) return a; }
    let best = null, bd = 1500;
    for (const a of AREAS) if (a.lat != null) { const d = metres(p, a); if (d < bd) { bd = d; best = a; } }
    return best;
  }

  // An area's figures for each home type: yearly rent and sale price (medians), thin rows marked.
  function rows(a, max) {
    return (a.by_unit || []).filter(u => u.median || u.sale).slice(0, max).map(u => {
      const thin = u.n != null && u.n < THIN;
      return '<tr' + (thin ? ' class="thin" title="' + safe(T('Fewer than {n} contracts: a thin figure', { n: THIN })) + '"' : '') + '><th scope="row">' + safe(T.unit(u.u)) + '</th><td>' +
        (u.median ? safe(money(u.median)) : '—') + '</td><td>' + (u.sale ? safe(money(u.sale)) : '—') + '</td></tr>'; }).join('');
  }
  const head = () => '<tr><th></th><th scope="col">' + T('Rent a year') + '</th><th scope="col">' + T('To buy') + '</th></tr>';
  const colourOf = a => { const p = POINTS.find(q => q.a.label === a.label); return p && LABEL.colorOf ? cssVar(LABEL.colorOf(p.v)) : ''; };

  function sign(a) {
    const el = document.createElement('button'); el.type = 'button'; el.className = 'stSign';
    const c = colourOf(a); if (c) el.style.setProperty('--c', c);
    el.innerHTML = '<span class="stBoard"><b>' + safe(T.place(a.label)) + '</b><table>' + head() + rows(a, 5) + '</table></span>';
    el.setAttribute('aria-label', T('{area}: open its card', { area: T.place(a.label) }));
    el.addEventListener('click', ev => { ev.stopPropagation(); closeStreet(); focusArea(a); });
    const mk = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([a.lng, a.lat]).addTo(mS);
    return { a, el, mk };
  }

  // Signs for the areas near you (re-chosen when you have moved), sized by distance and hidden behind you.
  let signAt = null;
  function placeSigns() {
    if (!mS) return; const c = mS.getCenter(), p = { lat: c.lat, lng: c.lng };
    if (!signAt || metres(signAt, p) > 400) {
      signAt = p;
      const want = AREAS.filter(a => a.lat != null && (a.by_unit || []).some(u => u.median || u.sale)).map(a => ({ a, d: metres(p, a) }))
        .filter(x => x.d < NEAR_M).sort((x, y) => x.d - y.d).slice(0, MAX_SIGNS).map(x => x.a);
      const keep = new Set(want.map(a => a.label));
      signs = signs.filter(s => { if (keep.has(s.a.label)) return true; s.mk.remove(); return false; });
      for (const a of want) if (!signs.some(s => s.a.label === a.label)) signs.push(sign(a));
    }
    const b = mS.getBearing(), kept = [];
    signs.map(s => ({ s, d: metres(p, s.a) })).sort((x, y) => x.d - y.d).forEach(({ s, d }) => {
      const off = Math.abs(((bearingTo(p, s.a) - b) + 540) % 360 - 180), behind = d > 40 && off > 75;
      s.el.style.setProperty('--k', Math.max(0.5, Math.min(1, 1.15 - d / 3000)).toFixed(2));
      s.el.classList.toggle('stOff', behind);
      if (behind) return;
      const r = s.el.querySelector('.stBoard').getBoundingClientRect(), V = mS.getContainer().getBoundingClientRect();
      if (r.right < V.left || r.left > V.right || r.bottom < V.top || r.top > V.bottom) { s.el.classList.add('stOff'); return; }
      const hit = kept.some(k => r.left < k.right && r.right > k.left && r.top < k.bottom && r.bottom > k.top);
      s.el.classList.toggle('stOff', hit); if (!hit) kept.push(r);
    });
  }

  // The panel: the area you are in, with every home type, and the Google Street View link for this spot.
  function updateHere() {
    if (!mS || !box) return; const c = mS.getCenter(), a = areaAt({ lat: c.lat, lng: c.lng });
    const g = box.querySelector('.stGoogle');
    g.href = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + c.lat.toFixed(6) + ',' + c.lng.toFixed(6) + '&heading=' + Math.round((mS.getBearing() + 360) % 360);
    const key = a ? a.label : ''; if (key === hereKey) return; hereKey = key; here = a;
    const el = box.querySelector('.stHere');
    if (!a) { el.innerHTML = '<b>' + T('Between areas') + '</b><small>' + T('No figures for this spot.') + '</small>'; return; }
    const r = rows(a, 8);
    el.innerHTML = '<small class="stIn">' + T('You are in') + '</small><b>' + safe(T.place(a.label)) + '</b>' +
      (r ? '<details class="stMore" open><summary>' + T('Prices here') + '</summary><table>' + head() + r + '</table>' +
        '<small class="muted">' + T('Medians for the whole area, from Ejari contracts and registered sales: not one building\'s price.') + '</small></details>'
        : '<small>' + T('No figures for this area yet.') + '</small>') +
      '<button type="button" class="btn stCard">' + T('Open its card') + '</button>';
    el.querySelector('.stCard').addEventListener('click', () => { closeStreet(); focusArea(a); });
    if (matchMedia('(max-width:600px)').matches) { const d = el.querySelector('details'); if (d) d.open = false; }
  }

  // Moving: forward or back along the way you face, turning on the spot; kept inside Dubai.
  function step(t) {
    raf = 0; if (!mS || !held.size) { last = 0; return; }
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 1 / 60; last = t;
    const run = held.has('run'), fwd = (held.has('f') ? 1 : 0) - (held.has('b') ? 1 : 0), turn = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0);
    let b = mS.getBearing() + turn * TURN * dt; const c = mS.getCenter();
    if (fwd) { const d = fwd * (run ? RUN : WALK) * dt, r = b * Math.PI / 180;
      c.lat = Math.max(24.6, Math.min(25.45, c.lat + Math.cos(r) * d / 111320));
      c.lng = Math.max(54.85, Math.min(55.65, c.lng + Math.sin(r) * d / (111320 * Math.cos(c.lat * Math.PI / 180)))); }
    mS.jumpTo({ center: c, bearing: b });
    raf = requestAnimationFrame(step);
  }
  const go = k => { held.add(k); if (!raf) raf = requestAnimationFrame(step); };
  const stop = k => held.delete(k);
  const KEYS = { ArrowUp: 'f', w: 'f', W: 'f', ArrowDown: 'b', s: 'b', S: 'b', ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r' };
  const typing = e => /^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
  // Arabic pages mirror the screen, not the street: left still turns left.
  function onKey(e) {
    if (!mS || typing(e)) return;
    if (e.key === 'Escape') { closeStreet(); return; }
    if (e.key === 'Shift') { e.type === 'keydown' ? held.add('run') : held.delete('run'); return; }
    const k = KEYS[e.key]; if (!k) return; e.preventDefault();
    if (e.type === 'keydown') { if (e.shiftKey) held.add('run'); go(k); } else stop(k);
  }
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  addEventListener('blur', () => held.clear());

  // Drag (mouse or one finger) to look around, like a street photo: sideways turns, up and down tilts.
  function lookDrag(cv) {
    let sx = 0, sy = 0, b0 = 0, p0 = 0, on = false, id = null;
    cv.addEventListener('pointerdown', e => { if (e.button > 0 || !e.isPrimary) return; on = true; id = e.pointerId; sx = e.clientX; sy = e.clientY; b0 = mS.getBearing(); p0 = mS.getPitch(); });
    cv.addEventListener('pointermove', e => { if (!on || e.pointerId !== id) return;
      mS.jumpTo({ bearing: b0 - (e.clientX - sx) * 0.25, pitch: Math.max(50, Math.min(85, p0 - (e.clientY - sy) * 0.15)) }); });
    const end = e => { if (e.pointerId === id) on = false; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }

  function openStreet(a) {
    if (!canGL()) return;
    if (mS) closeStreet();
    if (window.close3d) close3d(); if (window.closePeaks) closePeaks();
    const s = startAt(a);
    box = document.createElement('div'); box.className = 'map3d street';
    box.innerHTML = '<div class="m3" id="mS"></div><button type="button" class="btn primary m3x">' + T('Back to the map') + '</button>' +
      '<section class="stHere" aria-live="polite"></section>' +
      '<div class="stPad" role="group" aria-label="' + T('Move') + '">' +
        '<button type="button" data-k="f" aria-label="' + T('Go forward') + '">▲</button>' +
        '<button type="button" data-k="l" aria-label="' + T('Turn left') + '">↶</button>' +
        '<button type="button" data-k="b" aria-label="' + T('Go back') + '">▼</button>' +
        '<button type="button" data-k="r" aria-label="' + T('Turn right') + '">↷</button></div>' +
      '<p class="m3n stHow"><span class="stTip">' + T('Arrow keys or W A S D to move, Shift to go faster; drag to look around; click the street to go there.') + '</span>' +
        ' <a class="stGoogle" target="_blank" rel="noopener" href="#">' + T('See the real street on Google Street View') + '</a></p>';
    document.querySelector('.mapWrap').append(box);
    mS = new maplibregl.Map({ container: 'mS', style: styleFor(), center: [s.lng, s.lat], zoom: 16.5, pitch: 0, bearing: 0, maxPitch: 85,
      minZoom: 17, maxZoom: 22, dragPan: false, dragRotate: false, keyboard: false, attributionControl: { compact: true } });
    btn.setAttribute('aria-pressed', 'true'); countUse('street');
    box.querySelector('.m3x').addEventListener('click', closeStreet);
    box.querySelectorAll('.stPad button').forEach(b => {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', e => { e.preventDefault(); go(k); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => stop(k)));
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(k); } });
      b.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') stop(k); });
      b.addEventListener('click', e => { if (e.detail === 0) { go(k); setTimeout(() => stop(k), 350); } }); // a screen reader's "click"
    });
    lookDrag(mS.getCanvasContainer());
    const pw = parseFloat(getComputedStyle(document.querySelector('.mapWrap')).getPropertyValue('--paneW')) || 0;
    if (pw && matchMedia('(min-width:1100px)').matches) mS.setPadding(document.documentElement.dir === 'rtl' ? { right: pw } : { left: pw });
    mS.on('load', () => {
      const st = mS.getStyle(), src = Object.keys(st.sources).find(k => st.sources[k].type === 'vector'), dark = document.documentElement.dataset.theme === 'dark';
      // At eye level, symbols repeated along roads multiply (tiles stop at zoom 14 and are stretched six levels): one-way
      // arrows go (they overflow MapLibre's symbol buffers), road numbers are spaced out to one every 600 px or so.
      for (const l of st.layers || []) if (l.type === 'symbol') {
        if (/one_way/.test(l.id)) mS.setLayoutProperty(l.id, 'visibility', 'none');
        else if (l['source-layer'] === 'transportation_name' && /shield/.test(l.id)) mS.setLayoutProperty(l.id, 'symbol-spacing', 600); }
      // Each nearby area's ground in its price colour, as on the map, under the buildings.
      const byL = new Map(POINTS.map(p => [p.a.label, p]));
      const feats = ((typeof OUTLINES !== 'undefined' && OUTLINES) || []).filter(o => byL.has(o.label) && LABEL.colorOf)
        .map(o => ({ type: 'Feature', properties: { c: cssVar(LABEL.colorOf(byL.get(o.label).v)) }, geometry: { type: 'Polygon', coordinates: o.rings } }));
      const firstSym = (st.layers || []).find(l => l.type === 'symbol'), under = firstSym && firstSym.id;
      if (feats.length) {
        mS.addSource('stAreas', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
        mS.addLayer({ id: 'stAreaFill', type: 'fill', source: 'stAreas', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.22 } },
          ((st.layers || []).find(l => l['source-layer'] === 'transportation') || {}).id || under);
        mS.addLayer({ id: 'stAreaLine', type: 'line', source: 'stAreas', paint: { 'line-color': ['get', 'c'], 'line-width': 3, 'line-opacity': 0.8 } }, under);
      }
      // Buildings raised (the tiers of tall towers only: their full-footprint outline is marked hide_3d), lighter the taller.
      if (src) mS.addLayer({ id: 'stBld', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 14, filter: ['!=', ['get', 'hide_3d'], true],
        paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, dark ? '#4F463D' : '#CFC3AF', 60, dark ? '#6B6158' : '#E3D9C8', 250, dark ? '#8A7F72' : '#F3ECDF'],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.92 } }, under);
      // Drop onto the nearest street, facing along it, then tilt up to eye level.
      let at = { lat: s.lat, lng: s.lng }, face = mS.getBearing();
      try {
        const roads = mS.queryRenderedFeatures({ layers: (st.layers || []).filter(l => l['source-layer'] === 'transportation' && l.type === 'line').map(l => l.id) })
          .filter(f => !/rail|path|track|ferry|aeroway/.test((f.properties && f.properties.class) || ''));
        let bd = 500;
        for (const f of roads) { const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
          for (const ln of lines) for (let i = 0; i < ln.length - 1; i++) {
            const A = { lng: ln[i][0], lat: ln[i][1] }, B = { lng: ln[i + 1][0], lat: ln[i + 1][1] }, k = Math.cos(s.lat * Math.PI / 180);
            const ax = A.lng * k, bx = B.lng * k, px = s.lng * k, dx = bx - ax, dy = B.lat - A.lat, L2 = dx * dx + dy * dy;
            const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (s.lat - A.lat) * dy) / L2)) : 0, P = { lat: A.lat + t * dy, lng: A.lng + t * (B.lng - A.lng) }, d = metres(s, P);
            if (d < bd) { bd = d; at = P; face = bearingTo(A, B); } } }
      } catch (_) { /* no roads drawn yet: start on the point */ }
      mS.easeTo({ center: [at.lng, at.lat], zoom: ZOOM, pitch: PITCH, bearing: face, duration: matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 1600 });
      signAt = null; placeSigns(); updateHere();
    });
    let q = false;
    mS.on('move', () => { if (!q) { q = true; requestAnimationFrame(() => { q = false; placeSigns(); }); } });
    mS.on('moveend', updateHere);
    // Click the street ahead to go there (up to 500 m), like stepping along in a street photo.
    mS.on('click', e => { const c = mS.getCenter(), d = metres({ lat: c.lat, lng: c.lng }, e.lngLat); if (d > 500 || d < 3) return;
      mS.easeTo({ center: e.lngLat, duration: Math.min(1800, 300 + d * 3) }); });
  }
  function closeStreet() {
    if (!mS) return; const c = mS.getCenter();
    held.clear(); if (raf) cancelAnimationFrame(raf); raf = 0; last = 0;
    try { mS.remove(); } catch (_) { /* already gone */ }
    mS = null; signs = []; signAt = null; hereKey = ''; here = null; if (box) box.remove(); box = null;
    btn.setAttribute('aria-pressed', 'false');
    map.setView([c.lat, c.lng], 16, { animate: false });
  }
  window.openStreet = openStreet; window.closeStreet = closeStreet; window.streetMap = () => mS; window.streetHere = () => here;
})();
