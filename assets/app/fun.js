/* Exploring for its own sake (the owner's request, 20 Nov: "more fun, more engaging"), with real data only:
 *   a strip of facts that fly the map to their answer, first-visit tips, the 60-second tour, Guess the rent;
 *   "You" on the map after a rent check; figures that count up when the view changes; a budget slider on the map;
 *   Save as image on every card; Rent or buy in sale and yield cards; a stay finder in the Hotels views;
 *   one headline fact on an area's card.
 * Reads atlas.js's globals (AREAS, POINTS, LABEL, map, areaValue, labelText, focusArea…); hooks it calls are on window.
 * Nothing here keeps score: facts are the reward (docs/DESIGN_GOALS.md, goal 9). Every string goes through T(). */
(function () {
  'use strict';
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const solid = a => a && a.lat != null && !a.staff && (a.n || 0) >= THIN;
  const oneBed = () => { const us = new Set(); AREAS.forEach(a => a.by_unit.forEach(u => us.add(u.u))); return [...us].find(u => /^1[- ]?bed/i.test(u)) || null; };
  const unitOf = (a, u) => a.by_unit.find(x => x.u === u) || {};
  const homeName = () => ($('unit').value ? T.unit($('unit').value) : TYPENAME()).toLowerCase();
  const pickView = m => { const sel = $('metric'); if (sel.value !== m && [...sel.options].some(o => o.value === m)) { sel.value = m; sel.dispatchEvent(new Event('change')); } };
  const pickHome = u => { if (window.setMapHome) window.setMapHome(u || ''); };
  const k = v => v >= 1e5 ? Math.round(v / 1000) * 1000 : v;

  // ---- The strip: facts, the tour, Guess the rent, first-visit tips ----------------------------------------
  const strip = document.createElement('section');
  strip.className = 'wrap funStrip'; strip.setAttribute('aria-label', T('Dubai right now'));
  document.querySelector('.pane > .controls').after(strip);

  function facts() {
    const out = [], ob = oneBed();
    if (ob) {
      const c = AREAS.filter(a => solid(a) && unitOf(a, ob).median && (unitOf(a, ob).n == null || unitOf(a, ob).n >= THIN)).sort((x, y) => unitOf(x, ob).median - unitOf(y, ob).median)[0];
      if (c) out.push({ id: 'cheap1', txt: T('Cheapest 1-bed: {area}, AED {v} a year', { area: T.place(c.label), v: fmt(unitOf(c, ob).median) }), go: () => { pickView('median'); pickHome(ob); focusArea(c); } });
      const near = TRANSIT && typeof nearMap === 'function' && nearMap();
      if (near) {
        const w = Transit.WALKS[10], n = AREAS.filter(a => solid(a) && unitOf(a, ob).median && near.get(a.label) && near.get(a.label).m <= w).sort((x, y) => unitOf(x, ob).median - unitOf(y, ob).median)[0];
        if (n) out.push({ id: 'metro', txt: T('Cheapest 1-bed a 10-minute walk from the Metro: {area}, AED {v}', { area: T.place(n.label), v: fmt(unitOf(n, ob).median) }), go: () => { pickView('median'); pickHome(ob); focusArea(n); } });
      }
    }
    const busy = AREAS.filter(solid).sort((p, q) => q.n - p.n)[0];
    if (busy) out.unshift({ id: 'busiest', txt: T('Busiest rental market: {area}, {n} contracts a year', { area: T.place(busy.label), n: fmt(busy.n) }), go: () => { pickView('median'); focusArea(busy); } });
    const y = AREAS.filter(a => solid(a) && a.yield_pct != null && a.n >= 200).sort((p, q) => q.yield_pct - p.yield_pct)[0];
    if (y) out.push({ id: 'yield', txt: T('Best yield: {area}, {v}% a year', { area: T.place(y.label), v: Number(y.yield_pct).toFixed(1) }), go: () => { pickView('yield'); focusArea(y); } });
    const r = AREAS.filter(a => solid(a) && a.rent_change && a.rent_change.pct > 0).sort((p, q) => q.rent_change.pct - p.rent_change.pct)[0];
    if (r) out.push({ id: 'rise', txt: T('Biggest rent rise: {area}, +{v}%', { area: T.place(r.label), v: r.rent_change.pct }), go: () => { pickView('median'); focusArea(r); } });
    if (HOTELS) {
      const h = HOTELS.filter(x => x.price && x.rating >= 4.5 && x.reviews >= MIN_REVIEWS).sort((p, q) => p.price - q.price)[0];
      if (h) out.push({ id: 'hotel', txt: T('Cheapest 4.5-star-rated hotel night: {name}, AED {v}', { name: hotelName(h), v: fmt(h.price) }), go: () => { pickView('hotels'); setTimeout(() => { map.setView([h.lat, h.lng], 15, { animate: false }); openHotel(h); }, 350); } });
    }
    if (HOMES && typeof homesBy === 'function') {
      const g = [...homesBy()].filter(([, x]) => x.prices.length >= STAY_THIN).sort((p, q) => q[1].typical - p[1].typical)[0];
      if (g) out.push({ id: 'homes', txt: T('Dearest holiday homes: {area}, AED {v} a night', { area: T.place(g[0]), v: fmt(g[1].typical) }), go: () => { pickView('homes'); const a = byLabel(g[0]); if (a) setTimeout(() => focusArea(a), 350); } });
    }
    return out;
  }
  let FACTS = [], sig = '';
  function renderStrip() {
    FACTS = facts();
    const s = FACTS.map(f => f.id).join() + '|' + T.lang + '|' + (STAY($('metric').value) ? 'stay' : 'rent');
    if (s === sig) return; sig = s;
    strip.innerHTML = '<div class="funHead"><h2>' + T('Dubai right now') + '</h2>' + tipsHtml() + '</div><div class="funChips">' +
      FACTS.map((f, i) => '<button type="button" class="funChip" data-fact="' + i + '">' + safe(f.txt) + '</button>').join('') +
      '<button type="button" class="funChip act" data-tour>' + T('Take the 60-second tour') + '</button>' +
      '<button type="button" class="funChip act" data-guess>' + T('Guess the rent') + '</button></div><div class="guessBox" id="guessBox" hidden></div>';
  }
  strip.addEventListener('click', e => {
    const f = e.target.closest('[data-fact]'); if (f) { const x = FACTS[+f.dataset.fact]; if (x) { countUse('fact', x.id); x.go(); scrollToMap(); } return; }
    if (e.target.closest('[data-tour]')) { startTour(); return; }
    if (e.target.closest('[data-guess]')) { newGuess(); return; }
    if (e.target.closest('[data-tip-next]')) { tip++; LS.set('funTip', String(tip)); sig = ''; renderStrip(); return; }
    if (e.target.closest('[data-tip-x]')) { tip = 99; LS.set('funTip', '99'); sig = ''; renderStrip(); }
  });
  const scrollToMap = () => { if (matchMedia('(max-width:860px)').matches) document.querySelector('.mapPane').scrollIntoView({ block: 'start', behavior: FX ? 'smooth' : 'auto' }); };

  // First visit: three tips, one at a time, in the strip (never over the map or a control); gone once dismissed.
  let tip = +(LS.get('funTip') || 0);
  function tipsHtml() {
    // The tips fit the view: in Hotels and Holiday homes there is no Home picker, so they talk about places to stay.
    const tips = STAY($('metric').value)
      ? [T('Tip 1 of 3: each label is an area\'s typical price a night; tap a dot for one place\'s price, rating and links.'), T('Tip 2 of 3: set a nightly budget with the slider on the map, and the list below keeps the places within it.'),
        T('Tip 3 of 3: switch the map between Rent, Sale price, Yield, Hotels and Holiday homes.')]
      : [T('Tip 1 of 3: pick your home (studio, 1-bed…) with Home, and every figure follows.'), T('Tip 2 of 3: tap an area on the map for its breakdown, photos and a link to share.'),
        T('Tip 3 of 3: switch the map between Rent, Sale price, Yield, Hotels and Holiday homes.')];
    if (tip >= tips.length) return '';
    return '<p class="funTip" role="status">' + tips[tip] + ' <button type="button" class="link" data-tip-next>' + (tip < tips.length - 1 ? T('Next tip') : T('Got it')) + '</button>' +
      '<button type="button" class="funX" data-tip-x aria-label="' + safe(T('Hide the tips')) + '">×</button></p>';
  }

  // ---- Guess the rent: an area, a slider, the answer. No score, no streak: how close you were is the fact. ----
  let G = null;
  function newGuess() {
    const ob = oneBed(), box = $('guessBox'); if (!ob) return;
    const pool = AREAS.filter(a => solid(a) && unitOf(a, ob).median && (unitOf(a, ob).n || 0) >= 300);
    if (!pool.length) return;
    const vals = pool.map(a => unitOf(a, ob).median).sort((p, q) => p - q), lo = Math.floor(vals[0] / 5000) * 5000, hi = Math.ceil(vals[vals.length - 1] / 5000) * 5000;
    let a; do { a = pool[Math.floor(Math.random() * pool.length)]; } while (G && pool.length > 1 && a.label === G.a.label);
    G = { a, ob, real: unitOf(a, ob).median };
    const mid = Math.round((lo + hi) / 2 / 1000) * 1000;
    box.hidden = false; countUse('guess');
    box.innerHTML = '<p class="gq">' + T('What does a 1-bedroom apartment in {area} rent for, a year?', { area: '<b>' + safe(T.place(a.label)) + '</b>' }) + '</p>' +
      '<label class="gs"><input type="range" id="guessIn" min="' + lo + '" max="' + hi + '" step="1000" value="' + mid + '" aria-label="' + safe(T('Your guess (AED a year)')) + '"><output id="guessOut">AED ' + fmt(mid) + '</output></label>' +
      '<p class="ga"><button type="button" class="btn primary" data-reveal>' + T('Reveal') + '</button> <button type="button" class="link" data-guess-x>' + T('Close') + '</button></p>';
  }
  document.addEventListener('input', e => { if (e.target.id === 'guessIn') $('guessOut').textContent = 'AED ' + fmt(+e.target.value); });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-reveal]') && G) {
      const g = +$('guessIn').value, d = g - G.real, p = Math.round(Math.abs(d) / G.real * 100);
      $('guessBox').innerHTML = '<p class="gq">' + T('{area}: a 1-bedroom apartment rents for {aed} a year (the median of {n}).', { area: '<b>' + safe(T.place(G.a.label)) + '</b>', aed: '<b>AED ' + fmt(G.real) + '</b>', n: T.count(unitOf(G.a, G.ob).n || G.a.n, 'contract') }) + '</p>' +
        '<p class="gr">' + (p === 0 ? T('Spot on.') : d > 0 ? T('Your guess was {p}% high (AED {d} over).', { p, d: fmt(Math.abs(d)) }) : T('Your guess was {p}% low (AED {d} under).', { p, d: fmt(Math.abs(d)) })) + '</p>' +
        '<p class="ga"><button type="button" class="btn primary" data-guess>' + T('Another area') + '</button> <button type="button" class="link" data-guess-map>' + T('Show it on the map') + '</button> <button type="button" class="link" data-guess-x>' + T('Close') + '</button></p>';
      countUse('guess-reveal');
    }
    if (e.target.closest('[data-guess-map]') && G) { pickView('median'); pickHome(G.ob); focusArea(G.a); scrollToMap(); }
    if (e.target.closest('[data-guess-x]')) { $('guessBox').hidden = true; G = null; }
  });

  // ---- The tour: six stops chosen from the data, one caption each, moved on by the visitor (no autoplay). ------
  let TOUR = null;
  const tourBox = document.createElement('div'); tourBox.className = 'tourBox'; tourBox.hidden = true; tourBox.setAttribute('role', 'dialog'); tourBox.setAttribute('aria-label', T('Tour of Dubai'));
  document.querySelector('.mapWrap').append(tourBox);
  function stops() {
    const pool = AREAS.filter(solid), out = [], seen = new Set();
    const add = (a, view, text) => { if (a && !seen.has(a.label)) { seen.add(a.label); out.push({ a, view, text }); } };
    const busiest = [...pool].sort((p, q) => q.n - p.n)[0];
    add(busiest, 'median', T('{area}: the busiest rental market, {n} contracts in a year, typically AED {v} a year.', { area: T.place(busiest.label), n: fmt(busiest.n), v: fmt(busiest.median) }));
    const byRent = pool.filter(a => a.median && a.median_kind !== 'unit').sort((p, q) => q.median - p.median);
    if (byRent.length) add(byRent[0], 'median', T('{area}: among the dearest, typically AED {v} a year for a home here.', { area: T.place(byRent[0].label), v: fmt(byRent[0].median) }));
    if (byRent.length) add(byRent[byRent.length - 1], 'median', T('{area}: among the cheapest, typically AED {v} a year.', { area: T.place(byRent[byRent.length - 1].label), v: fmt(byRent[byRent.length - 1].median) }));
    const y = pool.filter(a => a.yield_pct != null && a.n >= 200).sort((p, q) => q.yield_pct - p.yield_pct)[0];
    if (y) add(y, 'yield', T('{area}: a landlord here earns about {v}% of the price a year in rent, the best yield.', { area: T.place(y.label), v: Number(y.yield_pct).toFixed(1) }));
    const s = pool.filter(a => a.sale_median).sort((p, q) => q.sale_median - p.sale_median)[0];
    if (s) add(s, 'sale', T('{area}: homes sell for a median of AED {v}.', { area: T.place(s.label), v: fmt(k(s.sale_median)) }));
    if (HOTELS && hotelPriced()) {
      const g = [...hotelsBy()].filter(([, x]) => x.prices.length >= STAY_THIN).sort((p, q) => p[1].typical - q[1].typical)[0];
      if (g) add(byLabel(g[0]), 'hotels', T('{area}: the cheapest hotel nights, typically AED {v}.', { area: T.place(g[0]), v: fmt(g[1].typical) }));
    }
    return out.slice(0, 6);
  }
  function startTour() { TOUR = { list: stops(), i: 0 }; if (!TOUR.list.length) return; countUse('tour'); scrollToMap(); map.closePopup(); showStop(); }
  function showStop() {
    const st = TOUR.list[TOUR.i], n = TOUR.list.length;
    pickView(st.view); map.flyTo([st.a.lat, st.a.lng], 14, { duration: FX ? 1.2 : 0, animate: FX });
    tourBox.hidden = false;
    tourBox.innerHTML = '<p class="tStep">' + T('Stop {i} of {n}', { i: TOUR.i + 1, n }) + '</p><p class="tText">' + safe(st.text) + '</p><p class="tActs">' +
      (TOUR.i > 0 ? '<button type="button" class="link" data-tour-back>' + T('Back') + '</button>' : '') +
      (TOUR.i < n - 1 ? '<button type="button" class="btn primary" data-tour-next>' + T('Next stop') + '</button>' : '<button type="button" class="btn primary" data-tour-end>' + T('End of the tour') + '</button>') +
      '<button type="button" class="link" data-tour-open>' + T('Open this area') + '</button><button type="button" class="funX" data-tour-end aria-label="' + safe(T('End the tour')) + '">×</button></p>';
    tourBox.querySelector('.btn').focus({ preventScroll: true });
  }
  function endTour() { TOUR = null; tourBox.hidden = true; }
  tourBox.addEventListener('click', e => {
    if (!TOUR) return;
    if (e.target.closest('[data-tour-next]')) { TOUR.i++; showStop(); } else if (e.target.closest('[data-tour-back]')) { TOUR.i--; showStop(); }
    else if (e.target.closest('[data-tour-open]')) { const a = TOUR.list[TOUR.i].a; endTour(); focusArea(a); } else if (e.target.closest('[data-tour-end]')) endTour();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && TOUR) endTour(); });

  // ---- "You" on the map after a rent check with a rent ----------------------------------------------------
  let youMk = null;
  document.addEventListener('atlas:mine', e => {
    const d = e.detail || {}, a = byLabel(d.area); if (youMk) { youMk.remove(); youMk = null; }
    if (!a || a.lat == null || !d.rent) return;
    const m = (unitOf(a, d.unit).median) || a.median; if (!m) return;
    const p = Math.round((d.rent - m) / m * 100);
    const txt = T('You: AED {v}', { v: compact(d.rent) }) + ' · ' + (p === 0 ? T('at the median') : p > 0 ? T('{p}% above', { p }) : T('{p}% below', { p: -p }));
    youMk = L.marker([a.lat, a.lng], { interactive: false, keyboard: false, zIndexOffset: 900, icon: L.divIcon({ className: 'youWrap', html: '<div class="you ' + (p > 0 ? 'up' : 'down') + '">' + safe(txt) + '</div>', iconSize: [0, 0] }) }).addTo(map);
  });

  // ---- Labels count up when the view changes; the budget slider follows ------------------------------------
  let lastView = null;
  window.afterLabels = (els, metric) => {
    const view = metric + '|' + $('unit').value;
    if (FX && lastView && view !== lastView) {
      const byL = new Map(POINTS.map(p => [p.a.label, p.v]));
      for (const el of els) {
        const v = byL.get(el.dataset.area), b = el.querySelector('b'); if (v == null || !b) continue;
        const t0 = performance.now(), from = v * 0.55;
        const step = t => { const f = Math.min(1, (t - t0) / 600), e2 = 1 - Math.pow(1 - f, 3); b.textContent = labelText(from + (v - from) * e2, metric); if (f < 1) requestAnimationFrame(step); else b.textContent = labelText(v, metric); };
        requestAnimationFrame(step);
      }
    }
    lastView = view;
    syncSlider(metric);
    // Labels keep clear of the map's controls as they were when placed: if the slider appeared or changed size, place them again.
    const r = slider.getContainer().getBoundingClientRect(), sg = slider.getContainer().hidden + ':' + Math.round(r.width) + 'x' + Math.round(r.height);
    if (sg !== sliderSig) { sliderSig = sg; if (!relabeling) { relabeling = true; try { renderLabels(); } finally { relabeling = false; } } }
  };
  let sliderSig = '', relabeling = false;

  // A budget slider on the map: the same maximum as the Max box beside the budget (they always agree).
  const Slider = L.Control.extend({ options: { position: 'bottomleft' }, onAdd() {
    const d = L.DomUtil.create('div', 'budgetSlider leaflet-bar');
    d.innerHTML = '<label><span id="bsTxt"></span><input type="range" id="bsIn" min="0" max="100" step="1"></label>';
    L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d; } });
  const slider = new Slider().addTo(map);
  // Phones: the map is too narrow for the slider and the labels together, so it sits above the map, under the view chips.
  const SL_MQ = matchMedia('(max-width:860px)'), slHome = slider.getContainer().parentNode;
  function placeSlider() { const el = slider.getContainer(), chips = document.querySelector('.viewChips');
    if (SL_MQ.matches && chips) { if (el.parentNode !== chips) chips.after(el); el.classList.add('out'); } else if (el.parentNode !== slHome) { slHome.append(el); el.classList.remove('out'); } }
  placeSlider(); SL_MQ.addEventListener('change', placeSlider);
  let RANGE = null;
  function syncSlider(metric) {
    const el = slider.getContainer(), stay = STAY(metric), on = metric === 'median' || (stay && stayPriced(metric));
    el.hidden = !on; if (!on) return;
    const unit = $('unit').value, vals = AREAS.filter(a => a.lat != null).map(a => areaValue(a, metric, unit)).filter(v => v != null).sort((p, q) => p - q);
    if (!vals.length) { el.hidden = true; return; }
    const stepV = stay ? 10 : 1000, top = Math.ceil(vals[Math.floor(vals.length * 0.97)] / stepV) * stepV, bottom = Math.floor(vals[0] / stepV) * stepV;
    RANGE = { stay, stepV, top, bottom };
    const inp = $('bsIn'), cur = +$('max').value;
    inp.min = bottom; inp.max = top + stepV; inp.step = stepV; inp.value = cur && cur <= top ? cur : top + stepV;
    sliderText();
  }
  function sliderText() {
    const v = +$('bsIn').value, any = !RANGE || v > RANGE.top;
    $('bsTxt').textContent = any ? T('Any budget: drag to set a maximum') : RANGE.stay ? T('Up to AED {v} a night', { v: fmt(v) }) : T('Up to AED {v} a year', { v: fmt(v) });
    $('bsIn').setAttribute('aria-valuetext', $('bsTxt').textContent);
  }
  document.addEventListener('input', e => {
    if (e.target.id !== 'bsIn' || !RANGE) return;
    const v = +e.target.value; $('max').value = v > RANGE.top ? '' : String(v); sliderText();
    $('max').dispatchEvent(new Event('input')); countUse('budget-slider');
  });
  $('max').addEventListener('input', e => { if (e.isTrusted && RANGE) { const v = +$('max').value; $('bsIn').value = v && v <= RANGE.top ? v : RANGE.top + RANGE.stepV; sliderText(); } });

  // ---- One headline fact on an area's card (rent, sale price, yield) ---------------------------------------
  window.cardFact = (a, m) => {
    if (!['median', 'sale', 'sale_psf', 'yield'].includes(m) || !solid(a)) return '';
    const unit = $('unit').value, v = areaValue(a, m, unit); if (v == null) return '';
    const vals = AREAS.filter(solid).map(x => areaValue(x, m, unit)).filter(x => x != null).sort((p, q) => p - q), n = vals.length; if (n < 20) return '';
    const below = vals.filter(x => x < v).length, above = vals.filter(x => x > v).length, home = homeName();
    let t = '';
    if (m === 'yield') t = above === 0 ? T('The best yield in Dubai for {home}', { home }) : above < n * 0.1 ? T('Among the 10% best yields in Dubai for {home}', { home }) : '';
    else t = below === 0 ? T('The cheapest area in Dubai for {home}', { home }) : below < n * 0.1 ? T('Among the 10% cheapest areas for {home}', { home })
      : above === 0 ? T('The dearest area in Dubai for {home}', { home }) : above < n * 0.1 ? T('Among the 10% dearest areas for {home}', { home }) : '';
    return t ? '<p class="hfact">' + safe(t) + '</p>' : '';
  };

  // ---- Rent or buy: what the same home costs to rent and to buy (an estimate with the visitor's own numbers) ----
  window.rentOrBuy = (price, rent, what) => {
    if (!price || !rent) return '';
    return '<details class="rob" data-p="' + price + '" data-r="' + rent + '" data-w="' + safe(what || '') + '"><summary>' + T('Rent or buy?') + '</summary>' +
      '<label class="robIn"><span>' + T('Deposit') + ' <output data-o="d">25%</output></span><input type="range" data-rob="d" min="20" max="80" step="5" value="25"></label>' +
      '<label class="robIn"><span>' + T('Mortgage rate') + ' <output data-o="i">4.5%</output></span><input type="range" data-rob="i" min="2" max="8" step="0.25" value="4.5"></label>' +
      '<div class="robOut">' + robText(price, rent, 25, 4.5, what) + '</div>' +
      '<small class="muted">' + T('An estimate: a 25-year loan; service charges, maintenance and changes in price or rent are left out. Not financial advice.') + '</small></details>';
  };
  function robText(p, r, dep, rate, what) {
    const loan = p * (1 - dep / 100), i = rate / 100 / 12, n = 25 * 12, pay = i ? loan * i / (1 - Math.pow(1 + i, -n)) : loan / n;
    const yrs = p / r, fees = p * 0.06;
    return '<p>' + T('Renting{what}: about AED {m} a month (AED {r} a year).', { what: what ? ' (' + safe(what) + ')' : '', m: fmt(Math.round(r / 12 / 100) * 100), r: fmt(r) }) + '</p>' +
      '<p>' + T('Buying at AED {p}: a {d}% deposit (AED {dv}) plus about AED {f} in fees (DLD 4%, agent 2%), then about AED {pay} a month.', { p: fmt(k(p)), d: dep, dv: fmt(k(p * dep / 100)), f: fmt(k(fees)), pay: fmt(Math.round(pay / 100) * 100) }) + '</p>' +
      '<p><b>' + T('The price equals {y} years of rent here.', { y: yrs.toFixed(1) }) + '</b></p>';
  }
  document.addEventListener('input', e => {
    const s = e.target.closest && e.target.closest('[data-rob]'); if (!s) return;
    const box = s.closest('.rob'), d = +box.querySelector('[data-rob="d"]').value, i = +box.querySelector('[data-rob="i"]').value;
    box.querySelector('[data-o="d"]').textContent = d + '%'; box.querySelector('[data-o="i"]').textContent = i + '%';
    box.querySelector('.robOut').innerHTML = robText(+box.dataset.p, +box.dataset.r, d, i, box.dataset.w || '');
  });
  document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('rob') && e.target.open) countUse('rent-or-buy'); }, true);

  // ---- Find a stay (Hotels and Holiday homes): the cheapest five within the nightly budget and a rating ----
  const finder = document.createElement('div'); finder.className = 'finder'; finder.hidden = true;
  document.getElementById('stayFacts').before(finder);
  let minRating = 0;
  window.stayFinder = metric => {
    if (!STAY(metric) || !stayPriced(metric)) { finder.hidden = true; return; }
    const lo = +$('min').value || 0, hi = +$('max').value || Infinity, [a, b] = hi < lo ? [hi, lo] : [lo, hi];
    const pool = (metric === 'homes' ? (HOMES || []).map(h => ({ h, k: 'homes' })) : (HOTELS || []).filter(h => h.price).map(h => ({ h, k: 'hotels' })))
      .filter(x => x.h.price >= a && x.h.price <= b && (!minRating || (x.h.rating >= minRating && x.h.reviews >= MIN_REVIEWS))).sort((p, q) => p.h.price - q.h.price).slice(0, 5);
    finder.hidden = false;
    finder.innerHTML = '<div class="fHead"><h3>' + (metric === 'homes' ? T('Find a holiday home') : T('Find a hotel')) + '</h3><label>' + T('Rated') + ' <select id="fRate">' +
      [[0, T('any')], [4, T('4 or more')], [4.5, T('4.5 or more')]].map(([v, t]) => '<option value="' + v + '"' + (v === minRating ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label></div>' +
      (pool.length ? '<ol>' + pool.map((x, i) => '<li><button type="button" class="link" data-find="' + i + '">' + safe(x.k === 'hotels' ? hotelName(x.h) : x.h.name) + '</button><span>AED ' + fmt(x.h.price) + (x.h.area ? ' · ' + safe(T.place(x.h.area)) : '') + (x.h.rating && x.h.reviews >= MIN_REVIEWS ? ' · ' + T('rated {r}', { r: Math.round(x.h.rating * 10) / 10 }) : '') + '</span></li>').join('') + '</ol>'
        : '<p class="muted">' + T('Nothing matches: widen the budget or the rating.') + '</p>') +
      '<p class="muted fNote">' + T('Cheapest first, within your nightly budget.') + '</p>';
    finder._pool = pool;
  };
  finder.addEventListener('change', e => { if (e.target.id === 'fRate') { minRating = +e.target.value; window.stayFinder($('metric').value); countUse('stay-finder', 'rating ' + minRating); } });
  finder.addEventListener('click', e => { const b = e.target.closest('[data-find]'); if (!b) return; const x = finder._pool[+b.dataset.find]; if (!x) return;
    map.setView([x.h.lat, x.h.lng], 15, { animate: false }); (x.k === 'hotels' ? openHotel : openHome)(x.h); scrollToMap(); countUse('stay-finder-open'); });

  // ---- Save as image: a picture of the card, made in the browser ------------------------------------------
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-img]'); if (!b) return; e.preventDefault();
    const open = b.dataset.img, kind = open[0], key = open.slice(2), m = $('metric').value, rootCs = getComputedStyle(document.documentElement);
    const cssCol = c => { const v = /var\((--[\w-]+)\)/.exec(c || ''); return v ? rootCs.getPropertyValue(v[1]).trim() : (c || '#521825'); };
    let name, fig, sub, col;
    if (kind === 'a') {
      const a = byLabel(key); if (!a) return; const v = areaValue(a, m, $('unit').value); name = T.place(a.label);
      fig = v == null ? '' : m === 'yield' ? Number(v).toFixed(1) + '%' : 'AED ' + fmt(m === 'sale' ? k(v) : v);
      sub = { median: T('median yearly rent, {home}', { home: homeName() }), sale: T('median sale price, {home}', { home: homeName() }), yield: T('gross rental yield, {home}', { home: homeName() }),
        hotels: hotelPriced() ? T('typical hotel price a night') : T('places to stay'), homes: T('typical holiday home price a night'), median_sqm: T('median rent per m² a year') }[m] || '';
      col = v != null && LABEL.colorOf ? cssCol(LABEL.colorOf(v)) : '#521825';
    } else {
      const h = (kind === 'h' ? HOTELS : HOMES || []).find(x => x.name + '|' + x.lat + '|' + x.lng === key); if (!h) return;
      name = kind === 'h' ? hotelName(h) : h.name; fig = h.price ? 'AED ' + fmt(h.price) : ''; sub = (h.price ? T('a night, lowest on booking sites') : '') + (h.area ? ' · ' + T.place(h.area) : '');
      col = h.price && LABEL.colorOf && STAY(m) ? cssCol(LABEL.colorOf(h.price)) : '#C9A227';
    }
    try { await Promise.all(['700 64px "Barlow Condensed"', '500 28px "Barlow"'].map(f => document.fonts.load(f))); } catch (_) { /* system fonts then */ }
    const c = document.createElement('canvas'); c.width = 1200; c.height = 630; const x = c.getContext('2d'), rtl = T.lang === 'ar';
    x.direction = rtl ? 'rtl' : 'ltr'; x.textAlign = 'start'; const X = rtl ? 1140 : 60;
    x.fillStyle = '#F6F1E7'; x.fillRect(0, 0, 1200, 630); x.fillStyle = '#521825'; x.fillRect(0, 0, 1200, 110); x.fillStyle = '#C9A227'; x.fillRect(0, 110, 1200, 6);
    x.fillStyle = '#F6F1E7'; x.font = '700 46px "Barlow Condensed", sans-serif'; x.fillText(T('Dubai Real Estate Atlas'), X, 72);
    x.fillStyle = '#2B2118'; x.font = '700 72px "Barlow Condensed", sans-serif'; x.fillText(name.length > 34 ? name.slice(0, 33) + '…' : name, X, 220);
    if (fig) {
      x.font = '700 120px "Barlow Condensed", sans-serif'; const w = x.measureText(fig).width + 70, bx = rtl ? 1140 - w : 60;
      x.fillStyle = col; x.globalAlpha = .18; x.fillRect(bx, 262, w, 160); x.globalAlpha = 1; x.lineWidth = 12; x.strokeStyle = col; x.strokeRect(bx + 6, 268, w - 12, 148);
      x.fillStyle = '#2B2118'; x.fillText(fig, rtl ? 1140 - 35 : 95, 385);
    }
    x.fillStyle = '#4F463D'; x.font = '500 34px "Barlow", sans-serif'; x.fillText(sub, X, 485);
    x.fillStyle = '#6B6158'; x.font = '500 24px "Barlow", sans-serif';
    x.fillText(T('Data to {d}', { d: niceDate((META && (META.data_through || META.newest_start_date)) || new Date().toISOString().slice(0, 10)) }) + ' · ' + location.host + location.pathname.replace(/index\.html$/, ''), X, 580);
    countUse('save-image', { a: 'area', h: 'hotel', s: 'holiday home' }[kind]);
    c.toBlob(async blob => {
      if (!blob) return; const file = new File([blob], (name || 'dubai').replace(/[^\w؀-ۿ-]+/g, '-') + '.png', { type: 'image/png' });
      if (navigator.canShare && matchMedia('(pointer:coarse)').matches && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (err) { if (err && err.name === 'AbortError') return; } }
      const u = URL.createObjectURL(blob), aEl = document.createElement('a'); aEl.href = u; aEl.download = file.name; document.body.append(aEl); aEl.click(); aEl.remove(); setTimeout(() => URL.revokeObjectURL(u), 1500);
      window.lastImage = { name: file.name, size: blob.size };
    }, 'image/png');
  });

  // ---- 3D: the city with its buildings raised, tilted, the area labels on top (MapLibre on its own, over the map) ----
  // The 2D map is Leaflet with MapLibre under it, which can't tilt; 3D opens a MapLibre map in the same place, with
  // OpenFreeMap's building heights, the area outlines in their price colours and the labels; "Back to 2D" returns.
  const btn3d = document.createElement('a'); btn3d.className = 'metroBtn d3Btn'; btn3d.href = '#'; btn3d.role = 'button'; btn3d.textContent = T('3D');
  btn3d.title = T('See the city in 3D'); btn3d.setAttribute('aria-pressed', 'false'); btn3d.hidden = true;
  viewCtl.getContainer().insertBefore(btn3d, namesBtn());
  let m3 = null, box3 = null;
  const canGL = () => window.maplibregl && (!maplibregl.supported || maplibregl.supported());
  // The button appears once MapLibre is in; the bar grows, so labels are placed again to stay clear of it.
  setInterval(() => { const h = !canGL(); if (btn3d.hidden !== h) { btn3d.hidden = h; if (window.atlasState === 'ready') renderLabels(); } }, 1500);
  btn3d.addEventListener('click', e => { e.preventDefault(); m3 ? close3d() : open3d(); });
  function open3d() {
    if (!canGL()) return;
    if (window.closeStreet) closeStreet();
    box3 = document.createElement('div'); box3.className = 'map3d';
    box3.innerHTML = '<div class="m3" id="m3"></div><button type="button" class="btn primary m3x">' + T('Back to 2D') + '</button><p class="m3n">' + T('Drag with two fingers or right-click to turn and tilt.') + '</p>';
    document.querySelector('.mapWrap').append(box3);
    const c = map.getCenter();
    m3 = new maplibregl.Map({ container: 'm3', style: styleFor(), center: [c.lng, c.lat], zoom: Math.max(11, map.getZoom() - 0.5), pitch: 58, bearing: -18, attributionControl: { compact: true } });
    btn3d.setAttribute('aria-pressed', 'true'); btn3d.classList.add('on'); countUse('3d');
    box3.querySelector('.m3x').addEventListener('click', close3d);
    m3.on('load', () => {
      const src = Object.keys(m3.getStyle().sources).find(k => m3.getStyle().sources[k].type === 'vector');
      if (src) m3.addLayer({ id: 'bld3d', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 12,
        // A tall building drawn in tiers (the Burj Khalifa) also has a full-footprint outline marked hide_3d: raising it too
        // buries the tiers in one fat block, so only the tiers are raised.
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: { 'fill-extrusion-color': document.documentElement.dataset.theme === 'dark' ? '#6B6158' : '#D9CFBE', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.85 } });
      // Area outlines in their price colour, and the labels as on the 2D map.
      const rs = getComputedStyle(document.documentElement), col = c2 => { const v = /var\((--[\w-]+)\)/.exec(c2 || ''); return v ? rs.getPropertyValue(v[1]).trim() : c2; };
      const byL = new Map(POINTS.map(p => [p.a.label, p]));
      const feats = (typeof OUTLINES !== 'undefined' && OUTLINES || []).filter(o => byL.has(o.label)).map(o => ({ type: 'Feature', properties: { c: col(LABEL.colorOf(byL.get(o.label).v)) },
        geometry: { type: 'Polygon', coordinates: o.rings } }));
      if (feats.length) {
        m3.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
        m3.addLayer({ id: 'areas-fill', type: 'fill', source: 'areas', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.28 } }, 'bld3d');
        m3.addLayer({ id: 'areas-line', type: 'line', source: 'areas', paint: { 'line-color': ['get', 'c'], 'line-width': 2 } });
      }
      // Busiest first; a label that would cover one already shown waits until the view gives it room.
      const els = POINTS.filter(p => !p.thin).sort((p, q) => q.n - p.n).slice(0, 60).map(p => {
        const el = document.createElement('div'); el.className = 'rl rl3';
        el.style.setProperty('--c', LABEL.colorOf(p.v)); el.innerHTML = '<b>' + safe(labelText(p.v, LABEL.metric)) + '</b><small>' + safe(T.place(p.a.label)) + '</small>';
        el.addEventListener('click', () => { const a = p.a; close3d(); focusArea(a); });
        new maplibregl.Marker({ element: el }).setLngLat([p.a.lng, p.a.lat]).addTo(m3);
        return el;
      });
      let queued = false;
      const declutter = () => { queued = false; const kept = [];
        els.forEach(el => { const r = el.getBoundingClientRect();
          const hit = kept.some(k => r.left < k.right + 4 && r.right + 4 > k.left && r.top < k.bottom + 4 && r.bottom + 4 > k.top);
          el.classList.toggle('rl3off', hit); if (!hit) kept.push(r); }); };
      const soon = () => { if (!queued) { queued = true; requestAnimationFrame(declutter); } };
      m3.on('move', soon); soon();
    });
  }
  function close3d() {
    if (!m3) return; const c = m3.getCenter(), z = m3.getZoom();
    try { m3.remove(); } catch (_) { /* already gone */ }
    m3 = null; if (box3) box3.remove(); box3 = null; btn3d.setAttribute('aria-pressed', 'false'); btn3d.classList.remove('on');
    map.setView([c.lat, c.lng], Math.round(z + 0.5), { animate: false });
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && m3) close3d(); });
  window.open3d = open3d; window.close3d = close3d;

  // ---- Peaks: yearly rent as a mountain range (the owner's request, 24 Nov) ------------------------------------------
  // Each area's median rent for the home picked becomes height: the dearest areas rise as peaks, the cheapest sit at sea
  // level, and the ground between areas is smoothed (a Gaussian, about 1.3 km), fading to sea level away from any area.
  // The terrain is drawn in the browser (MapLibre raster-dem tiles from a custom protocol): no new data, no outside
  // service. The ground is tinted on the price key's blues, shaded like hills, with the street map draped over it.
  const PEAK_H = 3600;            // metres for the dearest areas (95th percentile and up): a picture, not a scale model
  const PEAK_SIGMA = 0.012;       // smoothing, in degrees of latitude (about 1.3 km)
  const PEAK_STEP = 0.003;        // the surface's grid (about 330 m), sampled smoothly between points
  let mP = null, boxP = null, SURF = null, surfVer = 0, protoOn = false;
  const btnP = document.createElement('button'); btnP.type = 'button'; btnP.dataset.peaks = ''; btnP.className = 'peaksBtn';
  btnP.textContent = T('Peaks'); btnP.title = T('See rents as a mountain range'); btnP.setAttribute('aria-pressed', 'false'); btnP.hidden = true;
  (function addPeaksBtn() { const v = document.querySelector('.views'); if (v) v.append(btnP); else setTimeout(addPeaksBtn, 300); })();
  setInterval(() => { const h = !canGL(); if (btnP.hidden !== h) { btnP.hidden = h; if (window.atlasState === 'ready') renderLabels(); } }, 1500);
  btnP.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); mP ? closePeaks() : openPeaks(); });

  // The surface: a grid of heights over the areas' box (pure arithmetic, from AREAS and the Home picker).
  // Peaks follow the map's view (the owner's request, 24 Nov): rent, sale price (or per sq ft), yield, or a night in a
  // hotel or holiday home; each area weighs as in that view (its contracts, or its places with a price).
  const peakMetric = () => { const m = $('metric').value; return m === 'hotels' && !hotelPriced() ? 'median' : m; };
  function weightOf(a, unit, m) {
    if (m === 'hotels') return ((hotelsBy() || new Map()).get(a.label) || { prices: [] }).prices.length || 1;
    if (m === 'homes') return ((homesBy() || new Map()).get(a.label) || { prices: [] }).prices.length || 1;
    const bu = unit && !STAY(m) ? a.by_unit.find(u => u.u === unit) : null;
    return bu ? (bu.n != null ? bu.n : Math.round((a.n || 0) / Math.max(1, a.by_unit.length))) || 1 : (a.n || 1); }
  function buildSurface(unit, m) {
    const pts = AREAS.filter(a => a.lat != null).map(a => ({ a, v: areaValue(a, m, STAY(m) ? '' : unit), w: weightOf(a, unit, m) })).filter(p => p.v != null && p.v > 0);
    if (pts.length < 5) return null;
    const vs = pts.map(p => p.v).sort((x, y) => x - y), q = f => vs[Math.min(vs.length - 1, Math.max(0, Math.round(f * (vs.length - 1))))];
    const lo = q(0.05), hi = q(0.95), cx = Math.cos(25.15 * Math.PI / 180), s2 = 2 * PEAK_SIGMA * PEAK_SIGMA;
    const lat0 = Math.min(...pts.map(p => p.a.lat)) - 0.05, lat1 = Math.max(...pts.map(p => p.a.lat)) + 0.05;
    const lng0 = Math.min(...pts.map(p => p.a.lng)) - 0.05, lng1 = Math.max(...pts.map(p => p.a.lng)) + 0.05;
    const ny = Math.ceil((lat1 - lat0) / PEAK_STEP) + 1, nx = Math.ceil((lng1 - lng0) / PEAK_STEP) + 1, h = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) { const la = lat0 + j * PEAK_STEP;
      for (let i = 0; i < nx; i++) { const ln = lng0 + i * PEAK_STEP; let sw = 0, sv = 0, sk = 0;
        for (const p of pts) { const dy = la - p.a.lat, dx = (ln - p.a.lng) * cx, d2 = dx * dx + dy * dy; if (d2 > 25 * s2) continue;
          const k = Math.exp(-d2 / s2); sk += k; sw += k * p.w; sv += k * p.w * p.v; }
        if (!sw) continue;
        const norm = Math.min(1, Math.max(0, (sv / sw - lo) / (hi - lo || 1))), m = Math.min(1, sk / 0.6), land = m * m * (3 - 2 * m);
        h[j * nx + i] = land * Math.pow(norm, 1.25) * PEAK_H; } }
    return { lat0, lng0, nx, ny, h, lo, hi, pts, m };
  }
  function heightAt(la, ln) { const S = SURF; if (!S) return 0;
    const fy = (la - S.lat0) / PEAK_STEP, fx = (ln - S.lng0) / PEAK_STEP, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= S.nx - 1 || j >= S.ny - 1) return 0;
    const tx = fx - i, ty = fy - j, g = (a, b) => S.h[b * S.nx + a];
    return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - ty) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * ty; }
  // Terrain tiles (Terrarium encoding) drawn on demand from the surface.
  function peaksProtocol() { if (protoOn) return; protoOn = true;
    maplibregl.addProtocol('peaks', async params => {
      const [z, x, y] = params.url.replace('peaks://', '').split('?')[0].split('/').map(Number), N = 256, n = 2 ** z;
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
      const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
      for (let py = 0; py < N; py++) { const la = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + (py + 0.5) / N) / n))) * 180 / Math.PI;
        for (let px = 0; px < N; px++) { const ln = (x + (px + 0.5) / N) / n * 360 - 180, v = heightAt(la, ln) + 32768, o = (py * N + px) * 4;
          d[o] = Math.floor(v / 256); d[o + 1] = Math.floor(v) % 256; d[o + 2] = Math.floor((v - Math.floor(v)) * 256); d[o + 3] = 255; } }
      ctx.putImageData(img, 0, 0);
      const blob = cv.convertToBlob ? await cv.convertToBlob({ type: 'image/png' }) : await new Promise(r => cv.toBlob(r, 'image/png'));
      return { data: await blob.arrayBuffer() };
    }); }

  function openPeaks() {
    if (!canGL()) return;
    if (m3) close3d();
    if (window.closeStreet) closeStreet();
    const unit = $('unit').value, pm = peakMetric(); SURF = buildSurface(unit, pm); surfVer++;
    if (!SURF) return;
    peaksProtocol();
    const rs = getComputedStyle(document.documentElement), blue = k => rs.getPropertyValue('--b' + k).trim();
    const home = ($('unit').value ? T.unit($('unit').value) : TYPENAME()).toLowerCase(), stay = STAY(pm), yld = pm === 'yield';
    const fig = v => labelText(v, pm);
    const title = { median: T('Rent as mountains: {home}', { home: safe(home) }), sale: T('Sale price as mountains: {home}', { home: safe(home) }),
      sale_psf: T('Sale price per sq ft as mountains: {home}', { home: safe(home) }), yield: T('Yield as mountains: {home}', { home: safe(home) }),
      hotels: T('A hotel night as mountains'), homes: T('A holiday home night as mountains') }[pm] || T('Rent as mountains: {home}', { home: safe(home) });
    boxP = document.createElement('div'); boxP.className = 'map3d peaks';
    boxP.innerHTML = '<div class="m3" id="mP"></div><button type="button" class="btn primary m3x">' + T('Back to the map') + '</button>' +
      '<div class="pkKey"><b>' + title + '</b>' +
      '<span class="pkBar" aria-hidden="true"></span><span class="pkEnds"><span>' + safe(fig(SURF.lo)) + '</span><span>' + safe(fig(SURF.hi)) + '+</span></span>' +
      '<small class="pkHow">' + (yld ? T('Peaks are the highest yields; sea level is the lowest.') : T('Peaks are the dearest areas; sea level is the cheapest.')) + '</small>' +
      (yld ? '' : '<small><i class="pkRing" aria-hidden="true"></i>' + T('Good value: among the cheapest busy areas') + '</small>') +
      '<small class="muted">' + (stay ? T('Heights come from each area\'s typical price a night, smoothed between areas: a picture of the market, not one place\'s price.')
        : yld ? T('Heights come from each area\'s gross yield, smoothed between areas: a picture of the market, not one home\'s return.')
        : /^sale/.test(pm) ? T('Heights come from each area\'s median sale price, smoothed between areas: a picture of the market, not one home\'s price.')
        : T('Heights come from each area\'s median yearly rent, smoothed between areas: a picture of the market, not one building\'s price.')) + '</small></div>' +
      '<p class="m3n">' + T('Drag with two fingers or right-click to turn and tilt.') + '</p>';
    document.querySelector('.mapWrap').append(boxP);
    boxP.querySelector('.pkBar').style.background = 'linear-gradient(90deg,' + [1, 2, 3, 4, 5, 6].map(blue).join(',') + ')';
    // Start looking from inland towards the sea, over the dearest areas (unless the map was already zoomed in on a spot).
    const busyCam = SURF.pts.filter(p => !p.a.staff && p.w >= (STAY(pm) ? 3 : 100)), top = (busyCam.length ? busyCam : SURF.pts).slice().sort((p, q) => q.v - p.v).slice(0, 10);
    const near = map.getZoom() >= 13, c = near ? map.getCenter() : { lat: top.reduce((t, p) => t + p.a.lat, 0) / top.length - 0.03, lng: top.reduce((t, p) => t + p.a.lng, 0) / top.length + 0.03 };
    mP = new maplibregl.Map({ container: 'mP', style: styleFor(), center: [c.lng, c.lat], zoom: near ? map.getZoom() - 0.5 : 10.5, pitch: 62, bearing: -38, maxPitch: 80, attributionControl: { compact: true } });
    btnP.setAttribute('aria-pressed', 'true'); countUse('peaks');
    boxP.querySelector('.m3x').addEventListener('click', closePeaks);
    mP.on('load', () => {
      const tiles = ['peaks://{z}/{x}/{y}?v=' + surfVer];
      mP.addSource('pkDem', { type: 'raster-dem', tiles, tileSize: 256, encoding: 'terrarium', maxzoom: 12 });
      mP.addSource('pkShade', { type: 'raster-dem', tiles, tileSize: 256, encoding: 'terrarium', maxzoom: 12 });
      // The price colours and hill shading go under the roads (over land and water), so roads, the Creek, the coast and
      // every name and landmark stay on top of the mountains.
      const lays = mP.getStyle().layers || [], under = lays.find(l => l['source-layer'] === 'transportation' || l['source-layer'] === 'building' || l.type === 'symbol');
      const before = under && under.id;
      mP.addLayer({ id: 'pkColour', type: 'color-relief', source: 'pkShade', paint: { 'color-relief-opacity': 0.6,
        'color-relief-color': ['interpolate', ['linear'], ['elevation'], 0, 'rgba(0,0,0,0)', 20, blue(1), PEAK_H * 0.15, blue(2), PEAK_H * 0.35, blue(3), PEAK_H * 0.55, blue(4), PEAK_H * 0.75, blue(5), PEAK_H, blue(6)] } }, before);
      mP.addLayer({ id: 'pkShadeL', type: 'hillshade', source: 'pkShade', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#08306B', 'hillshade-highlight-color': 'rgba(255,252,245,0.6)', 'hillshade-illumination-direction': 300 } }, before);
      mP.setTerrain({ source: 'pkDem', exaggeration: 1 });
      // No sky or fog: on real graphics cards the fog washed the whole street map out to ivory (25 Nov).
      // Names on the peaks (the dearest busy areas, spread out) and gold rings on the best value (the cheapest busy areas).
      // Busy: 100+ contracts (3+ places with a price for nights); value rings need 300+ contracts (5+ places). A yield's
      // peaks are already the good news, so it has no rings.
      const minW = stay ? 3 : 100, ringW = stay ? 5 : 300;
      const busy = SURF.pts.filter(p => !p.a.staff && (p.w || 0) >= minW), far = (p, list) => list.every(q => Math.hypot(p.a.lat - q.a.lat, p.a.lng - q.a.lng) > 0.025);
      const pick = (arr, k) => arr.reduce((out, p) => (out.length < k && far(p, out) ? out.concat([p]) : out), []);
      const tops = pick([...busy].sort((p, q) => q.v - p.v), 7), lows = yld ? [] : pick([...busy].filter(p => p.w >= ringW).sort((p, q) => p.v - q.v), 4);
      const pkEls = [];
      for (const [list, cls] of [[tops, 'pk top'], [lows, 'pk low']]) for (const p of list) {
        const el = document.createElement('button'); el.type = 'button'; el.className = cls;
        el.innerHTML = '<span class="pkCard"><b>' + safe(fig(p.v)) + '</b><small>' + safe(T.place(p.a.label)) + '</small></span>';
        el.setAttribute('aria-label', T.place(p.a.label) + ': ' + fig(p.v));
        el.addEventListener('click', () => { const a = p.a; closePeaks(); focusArea(a); });
        new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.a.lng, p.a.lat]).addTo(mP); pkEls.push(el); }
      // Peaks first, dearest first: a card that would cover one already shown waits until the view gives it room.
      let queued = false;
      const tidy = () => { queued = false; const kept = [];
        pkEls.forEach(el => { const r = el.querySelector('.pkCard').getBoundingClientRect();
          const hit = kept.some(k => r.left < k.right + 4 && r.right + 4 > k.left && r.top < k.bottom + 4 && r.bottom + 4 > k.top);
          el.classList.toggle('pkOff', hit); if (!hit) kept.push(r); }); };
      mP.on('move', () => { if (!queued) { queued = true; requestAnimationFrame(tidy); } }); mP.on('idle', tidy); requestAnimationFrame(tidy);
    });
  }
  function closePeaks() {
    if (!mP) return; const c = mP.getCenter(), z = mP.getZoom();
    try { mP.remove(); } catch (_) { /* already gone */ }
    mP = null; if (boxP) boxP.remove(); boxP = null; btnP.setAttribute('aria-pressed', 'false');
    map.setView([c.lat, c.lng], Math.round(z + 0.3), { animate: false });
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && mP) closePeaks(); });
  // Switching the view (or the home) while Peaks is open redraws the mountains for it, from the same spot.
  const redrawPeaks = () => { if (!mP) return; const c = mP.getCenter(), z = mP.getZoom(), b = mP.getBearing(), pt = mP.getPitch();
    closePeaks(); map.setView([c.lat, c.lng], Math.round(z), { animate: false }); openPeaks(); if (mP) mP.jumpTo({ center: c, zoom: z, bearing: b, pitch: pt }); };
  $('metric').addEventListener('change', () => setTimeout(redrawPeaks, 0));
  $('home').addEventListener('change', () => setTimeout(redrawPeaks, 0));
  window.openPeaks = openPeaks; window.closePeaks = closePeaks; window.peaksHeight = heightAt; window.peaksMap = () => mP;

  // ---- Start: the strip once the rent data is in, again when hotels, holiday homes or Metro arrive ----------
  let tries = 0;
  (function wait() {
    if (window.atlasState === 'ready' && AREAS.length) { renderStrip(); if (++tries < 30) setTimeout(wait, 1000); }
    else setTimeout(wait, 300);
  })();
  window.funRefresh = () => { sig = ''; renderStrip(); };
  $('metric').addEventListener('change', () => renderStrip()); // tips follow the view
})();
