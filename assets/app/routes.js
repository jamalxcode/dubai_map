/* Bus and Boats: Dubai's bus routes and marine transport (abra, water bus, water taxi, ferry) as map layers, beside
 * the Metro and Tram (atlas.js). Data: data/routes.json from collector/routes.py (RTA's GTFS timetable feed, weekly),
 * loaded only when a layer is first turned on. Reads atlas.js's globals (map, viewCtl, namesBtn, T, safe, countUse,
 * getJSON, clearFocus) and is wrapped in its own function.
 *
 * Bus routes are faint lines (intercity ones dashed); stops show from street zoom (14) up. Tapping a route picks it
 * out (bold, with its stops at any zoom); tapping a stop lists its buses, each of which picks its route out. Boats are
 * dashed lines on the water with their stations always shown. Every card says how current RTA's feed is.
 */
(function () {
  'use strict';
  if (typeof map === 'undefined' || typeof viewCtl === 'undefined') return;
  const STOPS_FROM = 14;
  let R = null, asked = false, busOn = false, boatOn = false, pick = null;
  map.createPane('routes'); map.getPane('routes').style.zIndex = 390; // under the Metro and Tram (395), over the areas
  const canvas = L.canvas({ pane: 'routes', padding: 0.3 });
  const busLayer = L.layerGroup(), stopLayer = L.layerGroup(), boatLayer = L.layerGroup(), pickLayer = L.layerGroup();

  const dark = () => document.documentElement.dataset.theme === 'dark';
  const C = () => dark() ? { bus: '#B3A898', busPick: '#F6F1E7', stop: '#F6F1E7', stopRing: '#8A7F72', boat: '#F6F1E7', casing: '#1E1712' }
    : { bus: '#6F6458', busPick: '#2B2118', stop: '#FFFCF5', stopRing: '#6F6458', boat: '#2B2118', casing: '#F6F1E7' };
  const name = s => T.lang === 'ar' && s[3] ? s[3] : s[2];
  const KIND = { abra: 'Abra', 'water bus': 'Water bus', 'water taxi': 'Water taxi', ferry: 'Ferry' };

  // Google's encoded polyline (five decimals), as collector/routes.py writes it.
  function decode(str) {
    const pts = []; let i = 0, lat = 0, lng = 0;
    while (i < str.length) {
      for (let k = 0; k < 2; k++) {
        let shift = 0, res = 0, b;
        do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
        const d = res & 1 ? ~(res >> 1) : res >> 1;
        if (k === 0) lat += d; else lng += d;
      }
      pts.push([lat / 1e5, lng / 1e5]);
    }
    return pts;
  }
  const feedNote = () => R && R.feed && R.feed.from ? '<p class="muted tnote">' + T('Routes and stops: RTA timetable feed, {a} to {b}.', { a: niceD(R.feed.from), b: niceD(R.feed.to) }) + '</p>' : '';
  const niceD = d => new Date(d + 'T00:00:00').toLocaleDateString(T.lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // ---- Buttons, beside Metro -------------------------------------------------------------------------------------
  const mk = (cls, txt, title) => { const b = document.createElement('a'); b.className = 'metroBtn ' + cls; b.href = '#'; b.role = 'button'; b.textContent = txt;
    b.title = title; b.setAttribute('aria-pressed', 'false'); viewCtl.getContainer().insertBefore(b, namesBtn()); return b; };
  const busBtn = mk('busBtn', T('Bus'), T('Show bus routes and stops')), boatBtn = mk('boatBtn', T('Boats'), T('Show abra, water bus and ferry routes'));
  L.DomEvent.on(busBtn, 'click', e => { L.DomEvent.stop(e); show('bus', !busOn, true); });
  L.DomEvent.on(boatBtn, 'click', e => { L.DomEvent.stop(e); show('boat', !boatOn, true); });

  function load() {
    if (R) return Promise.resolve(R);
    if (asked) return new Promise(res => { const t = setInterval(() => { if (R || !asked) { clearInterval(t); res(R); } }, 200); });
    asked = true;
    return getJSON('data/routes.json').then(d => {
      if (!d || !d.bus) throw new Error('no routes');
      d.bus.routes.forEach(r => { r.pts = decode(r.line); });
      d.marine.routes.forEach(r => { r.pts = decode(r.line); });
      R = d; return R;
    }).catch(() => { asked = false; busBtn.hidden = boatBtn.hidden = true; return null; });
  }
  function show(which, on, count) {
    const btn = which === 'bus' ? busBtn : boatBtn;
    if (which === 'bus') busOn = on; else boatOn = on;
    btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('on', on);
    try { localStorage.setItem(which === 'bus' ? 'busLayer' : 'boatLayer', on ? '1' : '0'); } catch (e) { /* this visit only */ }
    if (count) countUse((which === 'bus' ? 'bus' : 'boats') + (on ? '-on' : '-off'));
    if (!on) { (which === 'bus' ? [busLayer, stopLayer] : [boatLayer]).forEach(l => l.remove()); if (pick && pick.kind === which) unpick(); credit(); return; }
    load().then(d => { if (!d) return; if (which === 'bus') { drawBus(); busLayer.addTo(map); stopsByZoom(); } else { drawBoats(); boatLayer.addTo(map); } credit(); });
  }
  let credited = false;
  function credit() {
    const want = busOn || boatOn, a = map.attributionControl, txt = T('Buses and boats') + ': <a href="https://www.dubaipulse.gov.ae/data/rta-public-transports/rta_gtfs-open" target="_blank" rel="noopener">RTA</a>';
    if (!a) return;
    if (want && !credited) { a.addAttribution(txt); credited = txt; } else if (!want && credited) { a.removeAttribution(credited); credited = false; }
  }

  // ---- Drawing ---------------------------------------------------------------------------------------------------
  function drawBus() {
    busLayer.clearLayers(); stopLayer.clearLayers(); const c = C();
    for (const r of R.bus.routes) {
      const l = L.polyline(r.pts, { renderer: canvas, color: c.bus, weight: 2, opacity: 0.5, dashArray: r.intercity ? '6 5' : null, interactive: true, bubblingMouseEvents: false });
      l.bindTooltip(T('Bus {ref}', { ref: r.ref }) + (r.name ? ': ' + r.name : ''), { sticky: true, direction: 'top' });
      l.on('click', e => { pickRoute('bus', r); openRoute('bus', r, e.latlng); });
      busLayer.addLayer(l);
    }
    for (const s of R.bus.stops) {
      const m = L.circleMarker([s[0], s[1]], { renderer: canvas, radius: 3, weight: 1.5, color: c.stopRing, fillColor: c.stop, fillOpacity: 1, bubblingMouseEvents: false });
      m.on('click', () => openStop('bus', s));
      stopLayer.addLayer(m);
    }
  }
  function drawBoats() {
    boatLayer.clearLayers(); const c = C();
    for (const r of R.marine.routes) {
      boatLayer.addLayer(L.polyline(r.pts, { renderer: canvas, color: c.casing, weight: 6, opacity: 0.85, interactive: false }));
      const l = L.polyline(r.pts, { renderer: canvas, color: c.boat, weight: 2.6, opacity: 0.95, dashArray: '7 6', bubblingMouseEvents: false });
      l.bindTooltip(T(KIND[r.kind] || 'Ferry') + ' ' + r.ref + (r.name ? ': ' + r.name : ''), { sticky: true, direction: 'top' });
      l.on('click', e => { pickRoute('boat', r); openRoute('boat', r, e.latlng); });
      boatLayer.addLayer(l);
    }
    for (const s of R.marine.stations) {
      const m = L.circleMarker([s[0], s[1]], { renderer: canvas, radius: 5, weight: 2.5, color: c.boat, fillColor: c.casing, fillOpacity: 1, bubblingMouseEvents: false });
      m.bindTooltip(name(s), { direction: 'top', offset: [0, -5] });
      m.on('click', () => openStop('boat', s));
      boatLayer.addLayer(m);
    }
  }
  function stopsByZoom() { if (!busOn) return; if (map.getZoom() >= STOPS_FROM) stopLayer.addTo(map); else stopLayer.remove(); }
  map.on('zoomend', stopsByZoom);

  // One route picked out: bold, its stops at any zoom; cleared by tapping elsewhere, Escape or turning the layer off.
  function pickRoute(kind, r) {
    unpick(); pick = { kind, ref: r.ref }; const c = C();
    pickLayer.addLayer(L.polyline(r.pts, { renderer: canvas, color: c.casing, weight: 8, opacity: 0.9, interactive: false }));
    pickLayer.addLayer(L.polyline(r.pts, { renderer: canvas, color: kind === 'bus' ? c.busPick : c.boat, weight: 4.5, opacity: 1, dashArray: kind === 'boat' ? '7 6' : null, interactive: false }));
    const list = kind === 'bus' ? R.bus.stops : R.marine.stations;
    for (const s of list) if (s[4].includes(r.ref)) {
      const m = L.circleMarker([s[0], s[1]], { renderer: canvas, radius: 4.5, weight: 2.5, color: kind === 'bus' ? c.busPick : c.boat, fillColor: c.casing, fillOpacity: 1, bubblingMouseEvents: false });
      m.bindTooltip(name(s), { direction: 'top', offset: [0, -5] }); m.on('click', () => openStop(kind, s)); pickLayer.addLayer(m);
    }
    pickLayer.addTo(map);
  }
  function unpick() { pickLayer.clearLayers(); pickLayer.remove(); pick = null; }
  map.on('click', () => { if (pick) unpick(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && pick) unpick(); });

  // ---- Cards -----------------------------------------------------------------------------------------------------
  const routeByRef = (kind, ref) => (kind === 'bus' ? R.bus.routes : R.marine.routes).find(r => r.ref === ref);
  const chip = (kind, ref) => '<button type="button" class="tchip rchip" data-route="' + kind + ':' + safe(ref) + '">' + safe(ref) + '</button>';
  function openRoute(kind, r, at) {
    const n = (kind === 'bus' ? R.bus.stops : R.marine.stations).filter(s => s[4].includes(r.ref)).length;
    const head = kind === 'bus' ? T('Bus {ref}', { ref: r.ref }) : T(KIND[r.kind] || 'Ferry') + ' ' + r.ref;
    const html = '<span class="t">' + safe(head) + '</span>' + (r.name ? '<p>' + safe(r.name) + '</p>' : '') +
      '<p class="muted">' + (kind === 'bus' ? T('{n} stops', { n: n }) : T('{n} stations', { n: n })) + (r.intercity ? ' · ' + T('Intercity') : '') + '</p>' + feedNote();
    clearFocus(); L.popup({ maxWidth: 300 }).setLatLng(at).setContent(html).openOn(map); countUse(kind === 'bus' ? 'bus-route' : 'boat-route');
  }
  function openStop(kind, s) {
    const html = '<span class="t">' + safe(name(s)) + '</span>' +
      (s[4].length ? '<p>' + (kind === 'bus' ? T('Buses here') : T('Boats here')) + '</p><p class="tlines">' + s[4].map(ref => chip(kind, ref)).join(' ') + '</p>'
        + (kind === 'boat' ? '<ul class="tnear">' + s[4].map(ref => { const r = routeByRef('boat', ref); return r ? '<li><b>' + safe(T(KIND[r.kind] || 'Ferry') + ' ' + ref) + '</b> ' + safe(r.name) + '</li>' : ''; }).join('') + '</ul>' : '')
        : '') + feedNote();
    clearFocus(); L.popup({ maxWidth: 300 }).setLatLng([s[0], s[1]]).setContent(html).openOn(map); countUse(kind === 'bus' ? 'bus-stop' : 'boat-station');
  }
  // A route number on a card picks that route out (pop-up or phone sheet).
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-route]'); if (!b || !R) return;
    const [kind, ref] = b.dataset.route.split(':'), r = routeByRef(kind, ref); if (!r) return;
    e.preventDefault(); map.closePopup(); if (typeof closeSheet === 'function') closeSheet();
    pickRoute(kind, r); map.flyToBounds(L.latLngBounds(r.pts), Object.assign(typeof framePad === 'function' ? framePad(40) : { padding: [40, 40] }, { maxZoom: 15, duration: 0.6 }));
  });

  // Theme switch redraws in the night colours; the layers come back as the visitor left them.
  new MutationObserver(() => { if (!R) return; if (busOn) drawBus(); if (boatOn) drawBoats(); if (pick) { const r = routeByRef(pick.kind, pick.ref); if (r) pickRoute(pick.kind, r); } stopsByZoom(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  try { if (localStorage.getItem('busLayer') === '1') show('bus', true, false); if (localStorage.getItem('boatLayer') === '1') show('boat', true, false); } catch (e) { /* none saved */ }
  window.showRoutes = show; window.routesData = () => R; window.routesState = () => ({ bus: busOn, boat: boatOn, pick: pick && pick.ref, stopsShown: map.hasLayer(stopLayer) }); window.openRouteStop = openStop; window.pickRoute = (kind, ref) => { const r = R && routeByRef(kind, ref); if (r) pickRoute(kind, r); return !!r; };
})();
