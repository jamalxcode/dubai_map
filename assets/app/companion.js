/* "Check a rent", My areas, reminders and resume. Runs after the page's own script and
   uses its globals (map, layer, META, CACHE, AGG). Everything personal stays in this
   browser's localStorage; nothing is sent anywhere. Logic lives in insights.js. */
(function () {
  'use strict';
  const RI = window.RentInsights;
  const KEY = 'rentAtlas';
  const el = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const aed = n => n == null || !isFinite(n) ? '—' : 'AED ' + Math.round(n).toLocaleString('en-AE');
  const short = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : Math.round(n / 1e3) + 'k';
  const dateText = d => d ? new Date(d + 'T00:00:00+04:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' }) : '';
  const plural = (n, w) => n.toLocaleString('en-AE') + ' ' + w + (n === 1 ? '' : 's');

  let store = RI.emptyStore(), AREAS_ALL = [], BY_LABEL = {}, THROUGH = null, current = null;
  // Phones: the card starts as one line (area + Check) so the map stays near the top of the
  // first screen; it opens when the visitor taps it and folds back with "Close".
  const PHONE = matchMedia('(max-width:860px)');
  const PANE = matchMedia('(min-width:1100px)'); // the map has its own full-height pane
  const compact = on => {
    const c = el('companion'), folded = !!on && PHONE.matches;
    if (!c) return;
    c.classList.toggle('compact', folded);
    const input = el('ckArea');
    if (input) input.placeholder = folded ? 'Check a rent: type an area' : 'e.g. JVC, Business Bay, Al Qusais';
  };
  const isCompact = () => el('companion').classList.contains('compact');

  // ---- storage (a private window or blocked storage just means nothing is remembered) ----
  function load() { try { store = RI.cleanStore(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { store = RI.emptyStore(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* not remembered */ } }

  // ---- markup ----
  function mount() {
    const host = el('companion');
    if (!host) return false;
    host.innerHTML = `
      <div class="ck-new" id="ckNew" hidden role="status"></div>
      <div class="ck">
        <div class="ck-head">
          <h2 id="ckTitle">Check a rent</h2>
          <button type="button" class="link ck-close" data-act="close">Close</button>
          <p>What tenants actually pay for a home like yours, from registered contracts.</p>
        </div>
        <form class="ck-form" id="ckForm" autocomplete="off" novalidate>
          <label class="field ck-area"><span class="lbl">Area</span>
            <input id="ckArea" list="ckAreas" placeholder="e.g. JVC, Business Bay, Al Qusais" enterkeyhint="search" required aria-describedby="ckTitle">
          </label>
          <datalist id="ckAreas"></datalist>
          <label class="field ck-unit">Home<select id="ckUnit" disabled><option value="">Pick an area first</option></select></label>
          <label class="field ck-rent"><span>Your yearly rent <span class="opt">(optional)</span></span>
            <input id="ckRent" type="text" inputmode="numeric" placeholder="e.g. 75,000">
          </label>
          <button class="btn primary" type="submit" id="ckGo">Check</button>
        </form>
        <div class="ck-result" id="ckResult" aria-live="polite"></div>
      </div>
      <div class="ck-mine" id="ckMine" hidden></div>`;
    return true;
  }

  // ---- the core action ----
  function fillAreaList() {
    const opts = [];
    for (const a of AREAS_ALL) {
      opts.push(`<option value="${esc(a.label)}"></option>`);
      for (const d of a.dld_areas || []) if (RI.norm(d) !== RI.norm(a.label)) opts.push(`<option value="${esc(d)}">${esc(a.label)}</option>`);
    }
    el('ckAreas').innerHTML = opts.join('');
  }

  function fillUnits(area, keep) {
    const sel = el('ckUnit');
    const units = RI.unitOptions(area);
    sel.disabled = !area;
    if (!area) { sel.innerHTML = '<option value="">Pick an area first</option>'; return ''; }
    sel.innerHTML = units.map(u => `<option value="${esc(u.u)}">${esc(RI.unitShort(u.u))}</option>`).join('') +
      (area.median_kind === 'unit' ? '' : `<option value="">All homes</option>`);  // no all-homes median published
    // Keep the visitor's choice when the new area has it; otherwise its most common home,
    // the fairest default for comparing areas.
    const allHomes = area.median_kind !== 'unit';
    const choice = keep === '' && allHomes ? '' : units.some(u => u.u === keep) ? keep : (units[0] ? units[0].u : '');
    sel.value = choice;
    return choice;
  }

  const rentValue = () => { const n = parseInt(el('ckRent').value.replace(/[^\d]/g, ''), 10); return n > 0 ? n : null; };

  /** Resolve the typed area. Returns the area, or null after showing suggestions. */
  function resolveArea(text) {
    const hits = RI.searchAreas(AREAS_ALL, text, 6);
    const exact = hits.find(h => h.how === 'exact');
    if (exact) return exact.area;
    if (hits.length === 1 && hits[0].how !== 'close') return hits[0].area;
    showNoMatch(text, hits);
    return null;
  }

  function check({ areaText, unit, rent, quiet } = {}) {
    areaText = areaText != null ? areaText : el('ckArea').value;
    if (!areaText.trim()) { el('ckResult').innerHTML = ''; return; }
    const area = resolveArea(areaText);
    if (!area) { current = null; return; }
    el('ckArea').value = area.label;
    const u = fillUnits(area, unit != null ? unit : (el('ckUnit').disabled ? null : el('ckUnit').value));
    if (rent !== undefined) el('ckRent').value = rent ? rent.toLocaleString('en-AE') : '';
    current = { area, unit: u, rent: rentValue() };
    render();
    store = RI.remember(store, { area: area.label, unit: u, rent: current.rent, at: new Date().toISOString() });
    save();
    renderMine();
    if (!quiet) compact(false);
    if (!quiet && PHONE.matches) el('ckResult').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // With the map beside the rent check (two-pane layout), a check takes the map to that area.
    // On narrower screens the map is further down the page, so it waits for "Show on the map".
    if (!quiet && PANE.matches) showOnMap(area, { scroll: false });
  }

  function showNoMatch(text, hits) {
    const close = hits.filter(h => h.how === 'close'), some = hits.filter(h => h.how !== 'close');
    const pick = (some.length ? some : close).slice(0, 6);
    el('ckResult').innerHTML = `
      <div class="ck-empty">
        <p><b>${some.length ? 'Several areas match' : 'No area called'} “${esc(text)}”${some.length ? '' : ' in the data'}.</b>
        ${pick.length ? (some.length ? 'Which one?' : 'Did you mean:') : 'Try the area name on your Ejari contract (for example <i>Al Barsha South Fourth</i> for JVC), or find it on the map.'}</p>
        ${pick.length ? `<div class="chips">${pick.map(h => `<button type="button" class="chip" data-area="${esc(h.area.label)}">${esc(h.area.label)}</button>`).join('')}</div>` : ''}
        <p class="muted">Older districts such as Deira and Bur Dubai are added once daily contract data is switched on.</p>
      </div>`;
  }

  function nextStep(saved, f) {
    // One recommended next step, in the order that builds the most value for the visitor.
    if (!current.rent) return { id: 'rent', label: 'Compare with my rent' };
    if (saved < 0) return { id: 'save', label: 'Save to My areas' };
    const s = store.saved[saved];
    if (!s.renews) return { id: 'remind', label: 'Remind me before renewal' };
    return { id: 'map', label: 'Show on the map' };
  }

  function render() {
    const { area, unit, rent } = current;
    const f = RI.unitFigure(area, unit);
    const out = el('ckResult');
    if (!f) {
      const units = RI.unitOptions(area);
      out.innerHTML = `<div class="ck-empty"><p><b>Too few contracts for ${esc(unit)} in ${esc(area.label)} to give a fair figure.</b>
        ${units.length ? 'Figures exist for:' : ''}</p>
        <div class="chips">${units.map(u => `<button type="button" class="chip" data-unit="${esc(u.u)}">${esc(RI.unitShort(u.u))}</button>`).join('')}</div></div>`;
      return;
    }
    const facts = RI.insights(AREAS_ALL, area, unit, rent);
    const v = facts.find(x => x.kind === 'verdict');
    const savedIdx = RI.isSaved(store, area.label, unit);
    const step = nextStep(savedIdx, f);
    const what = unit || 'All homes';
    const isTypical = !unit && area.median_kind === 'typical';
    const period = AGG ? `last 12 months, to ${dateText(THROUGH)}` : 'last 12 months';
    let verdictHtml = '';
    if (v) {
      const words = { below: `${Math.abs(v.pct)}% below`, above: `${v.pct}% above`, about: 'about the same as' };
      verdictHtml = `<p class="ck-verdict ck-${v.word}">You pay <b>${aed(rent)}</b>: <b>${words[v.word]}</b> the median` +
        (v.word === 'about' ? '.' : ` (${aed(Math.abs(v.diff))} a year ${v.word === 'below' ? 'less' : 'more'}).`) +
        `<br><small>${f.p25 != null && f.p75 != null
          ? (rent < f.p25 ? 'That is in the cheapest quarter.' : rent > f.p75 ? 'That is in the dearest quarter.' : 'That is within the middle half.')
          : 'Half of these tenants pay more and half less.'} Size, floor, view and building all move the price.</small></p>`;
    }
    const cheaper = facts.find(x => x.kind === 'cheaper'), rank = facts.find(x => x.kind === 'rank'), tr = facts.find(x => x.kind === 'trend');
    const finds = [];
    if (cheaper) finds.push(`<li><b>Same home for less nearby:</b> ` + cheaper.items.map(c =>
      `<button type="button" class="link" data-area="${esc(c.area.label)}" data-unit="${esc(unit)}">${esc(c.area.label)}</button> ${aed(c.median)} <span class="muted">(${c.km} km, ${short(c.saving)} less)</span>`).join(', ') + '</li>');
    if (tr) finds.push(`<li><b>Trend:</b> the median is ${tr.pct > 0 ? 'up' : 'down'} ${Math.abs(tr.pct)}% from ${esc(tr.from)} to ${esc(tr.to)}.</li>`);
    if (rank) finds.push(`<li>Cheaper than <b>${rank.cheaperThanPct}%</b> of ${rank.of} areas with figures for ${esc(what.toLowerCase())}.</li>`);
    if (f.yield != null) finds.push(`<li class="muted">For owners: gross rental yield ${f.yield}%.</li>`);
    const secondary = [];
    if (step.id !== 'save' && savedIdx < 0) secondary.push(`<button type="button" class="link" data-act="save">Save to My areas</button>`);
    if (step.id !== 'map') secondary.push(`<button type="button" class="link" data-act="map">Show on the map</button>`);
    if (area.url) secondary.push(`<a href="${esc(area.url)}" target="_blank" rel="noopener">Dubai Data page</a>`);
    out.innerHTML = `
      <div class="ck-answer">
        <p class="ck-what">${esc(what)} in <b>${esc(area.label)}</b></p>
        <p class="ck-big"><i class="pie" aria-hidden="true" style="--p:${Math.min(100, Math.round(f.median / 1000))}%"></i>${aed(f.median)} <span>a year</span></p>
        <p class="muted">${f.n == null
          ? `Median for this home type, ${area.through ? 'to ' + dateText(area.through) : period}. Source: Continental Club Property (CC BY 4.0), which gives ${plural(area.n, 'contract')} for the whole area but no count per home type.`
          : `${isTypical ? 'Typical' : 'Median'} of ${plural(f.n, 'contract')}, ${period}.`}${savedIdx >= 0 ? ' <span class="tag">Saved</span>' : ''}</p>
        <p class="muted ck-range">${f.p25 != null && f.p75 != null
          ? `The middle half of these tenants pay <b>${aed(f.p25)}</b> to <b>${aed(f.p75)}</b>.`
          : 'No range yet: the open sources publish only the middle figure (half pay more, half less). Ranges arrive with contract-level data.'}</p>
        ${verdictHtml}
        ${finds.length ? `<ul class="ck-finds">${finds.join('')}</ul>` : ''}
        <div class="ck-actions">
          <button type="button" class="btn primary" data-act="${step.id}">${step.label}</button>
          ${secondary.length ? `<span class="ck-links">${secondary.join('<span class="sep" aria-hidden="true">·</span>')}</span>` : ''}
        </div>
        <div id="ckRemindHere"></div>
      </div>`;
  }

  // ---- My areas: saved areas, recent checks, reminders, data ----
  function renderMine() {
    const box = el('ckMine');
    const recent = store.history.filter(h => RI.isSaved(store, h.area, h.unit) < 0 && !(current && h.area === current.area.label && h.unit === current.unit)).slice(0, 5);
    if (!store.saved.length && !recent.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    const savedHtml = store.saved.map((s, i) => {
      const f = RI.unitFigure(BY_LABEL[s.area], s.unit);
      const ch = f && RI.changeSince(s.snap, f.median);
      const v = f && RI.verdict(s.rent, f.median);
      return `<li>
        <button type="button" class="mine-main" data-area="${esc(s.area)}" data-unit="${esc(s.unit)}" data-rent="${s.rent || ''}">
          <b>${esc(s.area)}</b> <span class="muted">${esc(s.unit || 'All homes')}</span>
          <span class="mine-fig">${f ? aed(f.median) : 'no figure now'}${ch && ch.pct !== 0 ? ` <small class="${ch.pct > 0 ? 'up' : 'down'}">${ch.pct > 0 ? '+' : ''}${ch.pct}% since ${esc(dateText(ch.since)) || 'saved'}</small>` : ch ? ' <small class="muted">no change since saved</small>' : ''}</span>
          ${v ? `<small class="muted">You pay ${aed(s.rent)} (${v.word === 'about' ? 'about the median' : Math.abs(v.pct) + '% ' + v.word})</small>` : ''}
          ${s.renews ? `<small class="muted">Renews ${esc(dateText(s.renews))}</small>` : ''}
        </button>
        <button type="button" class="x" data-del="${i}" aria-label="Remove ${esc(s.area)} from My areas">×</button>
      </li>`;
    }).join('');
    box.innerHTML = `
      ${store.saved.length ? `<h3>My areas</h3><ul class="mine-list">${savedHtml}</ul>` : ''}
      ${recent.length ? `<div class="mine-recent"><span class="muted">Recent:</span> ${recent.map(h => `<button type="button" class="chip" data-area="${esc(h.area)}" data-unit="${esc(h.unit)}">${esc(h.area)}${h.unit ? ' · ' + esc(RI.unitShort(h.unit)) : ''}</button>`).join('')}
        <button type="button" class="link" data-act="clear-history">Clear</button></div>` : ''}
      <details class="mine-settings">
        <summary>Reminders and your saved data</summary>
        <div class="set-grid">
          <label class="field">Renewal reminders arrive
            <select id="setRemind">${[90, 60, 30].map(d => `<option value="${d}" ${store.prefs.remindDays === d ? 'selected' : ''}>${d} days before</option>`).join('')}</select>
          </label>
          <label class="field">Remind me to check the market
            <select id="setEvery">${[[0, 'Never'], [3, 'Every 3 months'], [6, 'Every 6 months'], [12, 'Once a year']].map(([m, t]) => `<option value="${m}" ${store.prefs.checkEvery === m ? 'selected' : ''}>${t}</option>`).join('')}</select>
          </label>
          <button type="button" class="btn" data-act="every-ics" ${store.prefs.checkEvery ? '' : 'disabled'}>Add to my calendar</button>
          <label class="check"><input type="checkbox" id="setNew" ${store.prefs.whatsNew ? 'checked' : ''}> Tell me what changed when I come back</label>
        </div>
        <p class="muted">Reminders go into your own calendar, which does the reminding: delete the event there to stop it. Your areas and checks are saved only in this browser, never sent anywhere.</p>
        <p class="data-acts"><button type="button" class="link" data-act="export">Download my data</button><span class="sep">·</span>
          <label class="link">Import<input type="file" id="setImport" accept="application/json" hidden></label><span class="sep">·</span>
          <button type="button" class="link" data-act="wipe">Delete my saved data</button></p>
      </details>`;
  }

  function saveCurrent() {
    const { area, unit, rent } = current;
    const f = RI.unitFigure(area, unit);
    if (RI.isSaved(store, area.label, unit) >= 0) return;
    store.saved.unshift({ area: area.label, unit, rent, renews: null, at: new Date().toISOString(),
      snap: f ? { median: f.median, through: THROUGH } : null });
    store.saved = store.saved.slice(0, RI.MAX_SAVED);
    save(); render(); renderMine();
  }

  function remindForm() {
    let i = RI.isSaved(store, current.area.label, current.unit);
    if (i < 0) { saveCurrent(); i = RI.isSaved(store, current.area.label, current.unit); }
    const s = store.saved[i];
    const today = new Date().toISOString().slice(0, 10);
    el('ckRemindHere').innerHTML = `
      <form class="ck-remind" id="ckRemindForm">
        <label class="field">My lease renews on<input type="date" id="ckRenews" min="${today}" value="${s.renews || ''}" required></label>
        <label class="field">Remind me<select id="ckRemindDays">${[90, 60, 30].map(d => `<option value="${d}" ${store.prefs.remindDays === d ? 'selected' : ''}>${d} days before</option>`).join('')}</select></label>
        <button class="btn primary" type="submit">Add to my calendar</button>
        <p class="muted">Downloads a calendar event; your calendar app reminds you. A good time to check the market is before your landlord's renewal notice (usually 90 days ahead).</p>
      </form>`;
    el('ckRenews').focus();
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const siteUrl = (area, unit) => location.origin + location.pathname + '?area=' + encodeURIComponent(area) + (unit ? '&unit=' + encodeURIComponent(unit) : '');

  function renewalIcs(s, days) {
    const f = RI.unitFigure(BY_LABEL[s.area], s.unit);
    download('rent-renewal-' + RI.norm(s.area).replace(/ /g, '-') + '.ics', RI.ics({
      uid: 'renewal-' + RI.norm(s.area + ' ' + s.unit).replace(/ /g, '-') + '-' + s.renews + '@dubai-rent-atlas',
      title: 'Rent renewal: ' + s.area + ' (check the market)',
      date: s.renews, alarmDays: days,
      details: `Your lease renews today. Before agreeing a new rent, check what tenants pay for ${s.unit || 'homes'} in ${s.area}` +
        (f ? ` (median ${aed(f.median)} a year when you set this reminder).` : '.'),
      url: siteUrl(s.area, s.unit),
    }), 'text/calendar');
  }

  function everyIcs() {
    const months = store.prefs.checkEvery;
    if (!months) return;
    const first = store.saved[0];
    download('rent-check-every-' + months + '-months.ics', RI.ics({
      uid: 'market-check-every-' + months + '@dubai-rent-atlas',
      title: 'Check Dubai rents' + (first ? ': ' + first.area : ''),
      date: RI.addMonths(new Date().toISOString().slice(0, 10), months), everyMonths: months, alarmDays: 0,
      details: 'A reminder you set on Dubai Rent Atlas to see how rents have moved. Delete this event to stop it.',
      url: first ? siteUrl(first.area, first.unit) : location.origin + location.pathname,
    }), 'text/calendar');
  }

  // ---- what changed since the last visit ----
  function showWhatsNew() {
    const box = el('ckNew');
    const isReturning = store.saved.length || store.history.length;
    if (!THROUGH) return;
    if (!store.seenThrough || !isReturning) { store.seenThrough = THROUGH; save(); return; }
    const w = RI.whatsNew(store, THROUGH, BY_LABEL);
    if (!w || !store.prefs.whatsNew) { if (w) { store.seenThrough = THROUGH; save(); } return; }
    const items = w.changes.slice(0, 4).map(c => `<li><button type="button" class="link" data-area="${esc(c.area)}" data-unit="${esc(c.unit)}">${esc(c.area)}${c.unit ? ' · ' + esc(c.unit) : ''}</button>: ${aed(c.to)} <small class="${c.pct > 0 ? 'up' : 'down'}">${c.pct > 0 ? '+' : ''}${c.pct}% since you saved it</small></li>`).join('');
    box.innerHTML = `<p><b>New figures since your last visit</b>: rents now run to ${esc(dateText(w.to))} (was ${esc(dateText(w.from))}).</p>
      ${items ? `<ul>${items}</ul>` : '<p class="muted">Your saved areas have not changed.</p>'}
      <button type="button" class="btn" data-act="seen">Got it</button>`;
    box.hidden = false;
  }

  // ---- map: from exploring to checking, and back ----
  function showOnMap(area, { scroll = true } = {}) {
    if (area.lat == null || typeof map === 'undefined') return;
    const open = () => {
      if (typeof layer === 'undefined') return;
      let found = false;
      layer.eachLayer(m => { if (m.options && m.options.title === area.label && m.getPopup()) { m.openPopup(); found = true; } });
      // Merged with its neighbours at this zoom: open its own breakdown at its point anyway.
      if (!found && typeof popup === 'function') L.popup({ maxWidth: 320 }).setLatLng([area.lat, area.lng]).setContent(popup(area)).openOn(map);
    };
    if (scroll) el('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (map.getZoom() === 14 && map.getBounds().contains([area.lat, area.lng])) { open(); return; }
    map.once('moveend', () => setTimeout(open, 50));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) map.setView([area.lat, area.lng], 14);
    else map.flyTo([area.lat, area.lng], 14, { duration: 0.8 });
  }

  function onPopup(e) {
    const content = e.popup.getContent();
    if (typeof content !== 'string' || content.includes('ck-popact')) return;
    const m = content.match(/<span class="t">([^<]*)<\/span>/);
    const label = m && new DOMParser().parseFromString(m[1], 'text/html').body.textContent;
    if (!label || !BY_LABEL[label]) return; // group popups list several areas: no single check
    e.popup.setContent(content + `<p class="ck-popact"><button type="button" class="btn primary" data-check="${esc(label)}">Check a rent here</button></p>`);
  }

  function onPopupClick(e) {
    const b = e.target.closest('[data-check]');
    if (!b) return;
    map.closePopup();
    el('companion').scrollIntoView({ behavior: 'smooth', block: 'start' });
    check({ areaText: b.dataset.check, quiet: true });
    compact(false);
    setTimeout(() => el('ckRent').focus({ preventScroll: true }), 400);
  }

  // ---- events ----
  function wire() {
    const form = el('ckForm');
    // Tapping the one-line card opens it; nothing else changes until the visitor acts.
    el('ckArea').addEventListener('focus', () => { if (isCompact()) compact(false); });
    PHONE.addEventListener('change', () => compact(PHONE.matches && !current));
    form.addEventListener('submit', e => { e.preventDefault(); check(); });
    el('ckArea').addEventListener('change', () => check());
    el('ckUnit').addEventListener('change', () => check());
    let t;
    el('ckRent').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { if (current) { current.rent = rentValue(); render(); remember(); } }, 350); });
    const remember = () => { store = RI.remember(store, { area: current.area.label, unit: current.unit, rent: current.rent, at: new Date().toISOString() }); save(); };

    el('companion').addEventListener('click', e => {
      const b = e.target.closest('button, [data-act]');
      if (!b) return;
      if (b.dataset.area) { check({ areaText: b.dataset.area, unit: b.dataset.unit, rent: b.dataset.rent ? +b.dataset.rent : undefined }); if (b.closest('#ckMine, #ckNew')) el('ckTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (b.dataset.unit != null && current) { check({ areaText: current.area.label, unit: b.dataset.unit }); return; }
      if (b.dataset.del != null) { store.saved.splice(+b.dataset.del, 1); save(); renderMine(); if (current) render(); return; }
      switch (b.dataset.act) {
        case 'close': compact(true); el('companion').scrollIntoView({ block: 'start' }); break;
        case 'rent': el('ckRent').focus(); el('ckRent').scrollIntoView({ block: 'center', behavior: 'smooth' }); break;
        case 'save': saveCurrent(); break;
        case 'remind': remindForm(); break;
        case 'map': showOnMap(current.area); break;
        case 'clear-history': store.history = []; save(); renderMine(); break;
        case 'every-ics': everyIcs(); break;
        case 'seen': store.seenThrough = THROUGH; save(); el('ckNew').hidden = true; break;
        case 'export': download('dubai-rent-atlas-my-data.json', JSON.stringify(store, null, 2), 'application/json'); break;
        case 'wipe':
          if (confirm('Delete your saved areas, recent checks and settings from this browser?')) {
            try { localStorage.removeItem(KEY); } catch (err) { /* nothing stored */ }
            store = RI.emptyStore(); store.seenThrough = THROUGH; renderMine(); if (current) render();
          }
          break;
      }
    });
    el('companion').addEventListener('submit', e => {
      if (e.target.id !== 'ckRemindForm') return;
      e.preventDefault();
      const i = RI.isSaved(store, current.area.label, current.unit);
      store.saved[i].renews = el('ckRenews').value;
      store.prefs.remindDays = +el('ckRemindDays').value;
      save();
      renewalIcs(store.saved[i], store.prefs.remindDays);
      render(); renderMine();
      el('ckRemindHere').innerHTML = `<p class="ck-done">Reminder downloaded: open the file to add it to your calendar. It will remind you ${store.prefs.remindDays} days before ${esc(dateText(store.saved[i].renews))}.</p>`;
    });
    el('companion').addEventListener('change', e => {
      if (e.target.id === 'setRemind') { store.prefs.remindDays = +e.target.value; save(); }
      if (e.target.id === 'setEvery') { store.prefs.checkEvery = +e.target.value; save(); renderMine(); el('ckMine').querySelector('details').open = true; }
      if (e.target.id === 'setNew') { store.prefs.whatsNew = e.target.checked; save(); }
      if (e.target.id === 'setImport' && e.target.files[0]) {
        e.target.files[0].text().then(txt => {
          const incoming = RI.cleanStore(JSON.parse(txt));
          for (const s of incoming.saved) if (RI.isSaved(store, s.area, s.unit) < 0) store.saved.push(s);
          store.saved = store.saved.slice(0, RI.MAX_SAVED); store.prefs = incoming.prefs;
          save(); renderMine();
        }).catch(() => alert('That file is not a Dubai Rent Atlas export.'));
      }
    });
    map.on('popupopen', onPopup);
    el('map').addEventListener('click', onPopupClick);
    let mv;
    map.on('moveend', () => { clearTimeout(mv); mv = setTimeout(() => { const c = map.getCenter(); store.view = { lat: +c.lat.toFixed(4), lng: +c.lng.toFixed(4), z: map.getZoom() }; save(); }, 600); });
  }

  // ---- start ----
  function ready() {
    if (!RI || !mount()) return;
    compact(true);
    AREAS_ALL = (typeof CACHE !== 'undefined' && CACHE.homes) || [];
    BY_LABEL = Object.fromEntries(AREAS_ALL.map(a => [a.label, a]));
    THROUGH = (META && (META.data_through || META.newest_start_date)) || null;
    load();
    fillAreaList();
    wire();
    // Resume: a link's own area wins, then the last check; the map comes back where it was left.
    const qs = new URLSearchParams(location.search);
    if (store.view && !qs.get('area')) map.setView([store.view.lat, store.view.lng], store.view.z, { animate: false });
    const start = qs.get('area') ? { area: qs.get('area'), unit: qs.get('unit') || '', rent: null } : store.last;
    if (start && BY_LABEL[start.area]) check({ areaText: start.area, unit: start.unit, rent: start.rent, quiet: true });
    renderMine();
    showWhatsNew();
  }

  function failed() {
    if (!mount()) return;
    el('ckResult').innerHTML = `<div class="ck-empty"><p><b>The rent data didn't load.</b> This is usually a brief network hiccup.</p>
      <button type="button" class="btn primary" onclick="location.reload()">Try again</button></div>`;
    el('ckForm').hidden = true;
  }

  // The page may have finished loading its data before this script ran.
  if (window.atlasState === 'ready') ready();
  else if (window.atlasState === 'error') failed();
  else {
    window.addEventListener('atlas:ready', ready, { once: true });
    window.addEventListener('atlas:error', failed, { once: true });
  }
})();
