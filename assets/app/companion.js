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
  const dateText = d => d ? new Date(d + 'T00:00:00+04:00').toLocaleDateString(T.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' }) : '';
  const plural = (n, w) => T.count(n, w);
  const U = u => T.unit(u), US = u => T.unit(u, true); // home types: shown in the page's language, stored in English

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
    if (input) input.placeholder = folded ? T('Check a rent: type an area') : T('e.g. JVC, Business Bay, Al Qusais');
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
          <h2 id="ckTitle">${T('Check a rent')}</h2>
          <button type="button" class="link ck-close" data-act="close">${T('Close')}</button>
          <p>${T('What tenants actually pay for a home like yours, from registered contracts.')}</p>
        </div>
        <form class="ck-form" id="ckForm" autocomplete="off" novalidate>
          <label class="field ck-area"><span class="lbl">${T('Area')}</span>
            <input id="ckArea" list="ckAreas" placeholder="${T('e.g. JVC, Business Bay, Al Qusais')}" enterkeyhint="search" required aria-describedby="ckTitle">
          </label>
          <datalist id="ckAreas"></datalist>
          <label class="field ck-unit">${T('Home')}<select id="ckUnit" disabled><option value="">${T('Pick an area first')}</option></select></label>
          <label class="field ck-rent"><span>${T('Your yearly rent')} <span class="opt">${T('(optional)')}</span></span>
            <input id="ckRent" type="text" inputmode="numeric" placeholder="${T('e.g. 75,000')}">
          </label>
          <button class="btn primary" type="submit" id="ckGo">${T('Check')}</button>
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
    if (!area) { sel.innerHTML = `<option value="">${T('Pick an area first')}</option>`; return ''; }
    sel.innerHTML = units.map(u => `<option value="${esc(u.u)}">${esc(US(u.u))}</option>`).join('') +
      (area.median_kind === 'unit' ? '' : `<option value="">${T('All homes')}</option>`);  // no all-homes median published
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

  // Counts what people use (GoatCounter events, no personal data): which features earn their place.
  const count = (what, title) => { try { window.goatcounter && window.goatcounter.count &&
    window.goatcounter.count({ path: location.host + '/dubai_map/event/' + what, title: title || what, event: true }); } catch { /* counting never breaks the page */ } };

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
    if (!quiet) count('check', area.label);
  }

  function showNoMatch(text, hits) {
    const close = hits.filter(h => h.how === 'close'), some = hits.filter(h => h.how !== 'close');
    const pick = (some.length ? some : close).slice(0, 6);
    el('ckResult').innerHTML = `
      <div class="ck-empty">
        <p><b>${some.length ? T('Several areas match “{q}”.', { q: esc(text) }) : T('No area called “{q}” in the data.', { q: esc(text) })}</b>
        ${pick.length ? (some.length ? T('Which one?') : T('Did you mean:')) : T('Try the area name on your Ejari contract (for example <i>Al Barsha South Fourth</i> for JVC), or find it on the map.')}</p>
        ${pick.length ? `<div class="chips">${pick.map(h => `<button type="button" class="chip" data-area="${esc(h.area.label)}">${esc(h.area.label)}</button>`).join('')}</div>` : ''}
        <p class="muted">${T('Some areas are missing until daily contract data is switched on.')}</p>
      </div>`;
  }

  function nextStep(saved, f) {
    // One recommended next step, in the order that builds the most value for the visitor.
    if (!current.rent) return { id: 'rent', label: T('Compare with my rent') };
    if (saved < 0) return { id: 'save', label: T('Save to My areas') };
    const s = store.saved[saved];
    if (!s.renews) return { id: 'remind', label: T('Remind me before renewal') };
    return { id: 'map', label: T('Show on the map') };
  }

  function render() {
    const { area, unit, rent } = current;
    const f = RI.unitFigure(area, unit);
    const out = el('ckResult');
    if (!f) {
      const units = RI.unitOptions(area);
      out.innerHTML = `<div class="ck-empty"><p><b>${T('Too few contracts for {unit} in {area} to give a fair figure.', { unit: esc(U(unit)), area: esc(area.label) })}</b>
        ${units.length ? T('Figures exist for:') : ''}</p>
        <div class="chips">${units.map(u => `<button type="button" class="chip" data-unit="${esc(u.u)}">${esc(US(u.u))}</button>`).join('')}</div></div>`;
      return;
    }
    const facts = RI.insights(AREAS_ALL, area, unit, rent);
    const v = facts.find(x => x.kind === 'verdict');
    const savedIdx = RI.isSaved(store, area.label, unit);
    const step = nextStep(savedIdx, f);
    const what = unit ? U(unit) : T('All homes');
    const isTypical = !unit && area.median_kind === 'typical';
    const period = AGG ? T('last 12 months, to {d}', { d: dateText(THROUGH) }) : T('last 12 months');
    let verdictHtml = '';
    if (v) {
      const vars = { rent: `<b>${aed(rent)}</b>`, pct: Math.abs(v.pct), diff: aed(Math.abs(v.diff)) };
      verdictHtml = `<p class="ck-verdict ck-${v.word}">` + (v.word === 'about'
          ? T('You pay {rent}: <b>about the same as</b> the median.', vars)
          : v.word === 'below' ? T('You pay {rent}: <b>{pct}% below</b> the median ({diff} a year less).', vars)
            : T('You pay {rent}: <b>{pct}% above</b> the median ({diff} a year more).', vars)) +
        `<br><small>${f.p25 != null && f.p75 != null
          ? (rent < f.p25 ? T('That is in the cheapest quarter.') : rent > f.p75 ? T('That is in the dearest quarter.') : T('That is within the middle half.'))
          : T('Half of these tenants pay more and half less.')} ${T('Size, floor, view and building all move the price.')}</small></p>`;
    }
    const cheaper = facts.find(x => x.kind === 'cheaper'), rank = facts.find(x => x.kind === 'rank'), tr = facts.find(x => x.kind === 'trend');
    const finds = [];
    if (cheaper) finds.push(`<li><b>${T('Same home for less nearby:')}</b> ` + cheaper.items.map(c =>
      `<button type="button" class="link" data-area="${esc(c.area.label)}" data-unit="${esc(unit)}">${esc(c.area.label)}</button> ${aed(c.median)} <span class="muted">(${T('{km} km, {s} less', { km: c.km, s: short(c.saving) })})</span>`).join(T(', ')) + '</li>');
    if (tr) finds.push(`<li><b>${T('Trend:')}</b> ${T(tr.pct > 0 ? 'the median is up {pct}% from {from} to {to}.' : 'the median is down {pct}% from {from} to {to}.', { pct: Math.abs(tr.pct), from: esc(tr.from), to: esc(tr.to) })}</li>`);
    if (rank) finds.push(`<li>${T('Cheaper than <b>{pct}%</b> of {of} areas with figures for {what}.', { pct: rank.cheaperThanPct, of: rank.of, what: esc(what.toLowerCase()) })}</li>`);
    if (f.yield != null) finds.push(`<li class="muted">${T('For owners: gross rental yield {v}%.', { v: f.yield })}</li>`);
    const secondary = [];
    if (step.id !== 'save' && savedIdx < 0) secondary.push(`<button type="button" class="link" data-act="save">${T('Save to My areas')}</button>`);
    if (step.id !== 'map') secondary.push(`<button type="button" class="link" data-act="map">${T('Show on the map')}</button>`);
    secondary.push(`<button type="button" class="link" data-act="share">${T('Share')}</button>`);
    if (area.url) secondary.push(`<a href="${esc(area.url)}" target="_blank" rel="noopener">${T('Dubai Data page')}</a>`);
    out.innerHTML = `
      <div class="ck-answer">
        <p class="ck-what">${T('{what} in {area}', { what: esc(what), area: `<b>${esc(area.label)}</b>` })}</p>
        <p class="ck-big">${(k => `<i class="pie" aria-hidden="true" style="--p:${k.share(f.median)}%;--c:${k.color(f.median)}"></i>`)(window.priceKey(unit))}<bdi>${aed(f.median)}</bdi> <span>${T('a year')}</span></p>
        <p class="muted">${f.n == null
          ? T('Median for this home type, {period}. Source: Continental Club Property (CC BY 4.0), which gives {n} for the whole area but no count per home type.', { period: area.through ? T('to {d}', { d: dateText(area.through) }) : period, n: plural(area.n, 'contract') })
          : T(isTypical ? 'Typical of {n}, {period}.' : 'Median of {n}, {period}.', { n: plural(f.n, 'contract'), period })}${savedIdx >= 0 ? ` <span class="tag">${T('Saved')}</span>` : ''}</p>
        ${AGG && /^[3-9]-bedroom/.test(unit) ? `<p class="muted">${T('Dubai Data groups homes by bedrooms: in villa communities this figure may include villas and townhouses.')}</p>` : ''}
        <p class="muted ck-range">${f.p25 != null && f.p75 != null
          ? T('The middle half of these tenants pay <b>{a}</b> to <b>{b}</b>.', { a: aed(f.p25), b: aed(f.p75) })
          : T('No range yet: the open sources publish only the middle figure (half pay more, half less). Ranges arrive with contract-level data.')}</p>
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
          <b>${esc(s.area)}</b> <span class="muted">${esc(s.unit ? U(s.unit) : T('All homes'))}</span>
          <span class="mine-fig">${f ? aed(f.median) : T('no figure now')}${ch && ch.pct !== 0 ? ` <small class="${ch.pct > 0 ? 'up' : 'down'}">${T('{sign}{pct}% since {when}', { sign: ch.pct > 0 ? '+' : '', pct: ch.pct, when: esc(dateText(ch.since)) || T('saved') })}</small>` : ch ? ` <small class="muted">${T('no change since saved')}</small>` : ''}</span>
          ${v ? `<small class="muted">${T('You pay {rent} ({how})', { rent: aed(s.rent), how: v.word === 'about' ? T('about the median') : T(v.word === 'below' ? '{pct}% below' : '{pct}% above', { pct: Math.abs(v.pct) }) })}</small>` : ''}
          ${s.renews ? `<small class="muted">${T('Renews {d}', { d: esc(dateText(s.renews)) })}</small>` : ''}
        </button>
        <button type="button" class="x" data-del="${i}" aria-label="${T('Remove {area} from My areas', { area: esc(s.area) })}">×</button>
      </li>`;
    }).join('');
    box.innerHTML = `
      ${store.saved.length ? `<h3>${T('My areas')}</h3><ul class="mine-list">${savedHtml}</ul>` : ''}
      ${recent.length ? `<div class="mine-recent"><span class="muted">${T('Recent:')}</span> ${recent.map(h => `<button type="button" class="chip" data-area="${esc(h.area)}" data-unit="${esc(h.unit)}">${esc(h.area)}${h.unit ? ' · ' + esc(US(h.unit)) : ''}</button>`).join('')}
        <button type="button" class="link" data-act="clear-history">${T('Clear')}</button></div>` : ''}
      <details class="mine-settings">
        <summary>${T('Reminders and your saved data')}</summary>
        <div class="set-grid">
          <label class="field">${T('Renewal reminders arrive')}
            <select id="setRemind">${[90, 60, 30].map(d => `<option value="${d}" ${store.prefs.remindDays === d ? 'selected' : ''}>${T('{d} days before', { d })}</option>`).join('')}</select>
          </label>
          <label class="field">${T('Remind me to check the market')}
            <select id="setEvery">${[[0, 'Never'], [3, 'Every 3 months'], [6, 'Every 6 months'], [12, 'Once a year']].map(([m, t]) => `<option value="${m}" ${store.prefs.checkEvery === m ? 'selected' : ''}>${T(t)}</option>`).join('')}</select>
          </label>
          <button type="button" class="btn" data-act="every-ics" ${store.prefs.checkEvery ? '' : 'disabled'}>${T('Add to my calendar')}</button>
          <label class="check"><input type="checkbox" id="setNew" ${store.prefs.whatsNew ? 'checked' : ''}> ${T('Tell me what changed when I come back')}</label>
        </div>
        <p class="muted">${T('Reminders go into your own calendar, which does the reminding: delete the event there to stop it. Your areas and checks are saved only in this browser, never sent anywhere. The site counts visits and which features are used (GoatCounter: no cookies, nothing personal).')}</p>
        <p class="data-acts"><button type="button" class="link" data-act="export">${T('Download my data')}</button><span class="sep">·</span>
          <label class="link">${T('Import')}<input type="file" id="setImport" accept="application/json" hidden></label><span class="sep">·</span>
          <button type="button" class="link" data-act="wipe">${T('Delete my saved data')}</button></p>
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
    count('save', area.label);
  }

  function remindForm() {
    let i = RI.isSaved(store, current.area.label, current.unit);
    if (i < 0) { saveCurrent(); i = RI.isSaved(store, current.area.label, current.unit); }
    const s = store.saved[i];
    const today = new Date().toISOString().slice(0, 10);
    el('ckRemindHere').innerHTML = `
      <form class="ck-remind" id="ckRemindForm">
        <label class="field">${T('My lease renews on')}<input type="date" id="ckRenews" min="${today}" value="${s.renews || ''}" required></label>
        <label class="field">${T('Remind me')}<select id="ckRemindDays">${[90, 60, 30].map(d => `<option value="${d}" ${store.prefs.remindDays === d ? 'selected' : ''}>${T('{d} days before', { d })}</option>`).join('')}</select></label>
        <button class="btn primary" type="submit">${T('Add to my calendar')}</button>
        <p class="muted">${T("Downloads a calendar event; your calendar app reminds you. A good time to check the market is before your landlord's renewal notice (usually 90 days ahead).")}</p>
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
      title: T('Rent renewal: {area} (check the market)', { area: s.area }),
      date: s.renews, alarmDays: days,
      details: T('Your lease renews today. Before agreeing a new rent, check what tenants pay for {what} in {area}.', { what: s.unit ? U(s.unit) : T('homes'), area: s.area }) +
        (f ? ' ' + T('(Median {aed} a year when you set this reminder.)', { aed: aed(f.median) }) : ''),
      url: siteUrl(s.area, s.unit),
    }), 'text/calendar');
  }

  function everyIcs() {
    const months = store.prefs.checkEvery;
    if (!months) return;
    const first = store.saved[0];
    download('rent-check-every-' + months + '-months.ics', RI.ics({
      uid: 'market-check-every-' + months + '@dubai-rent-atlas',
      title: T('Check Dubai rents') + (first ? ': ' + first.area : ''),
      date: RI.addMonths(new Date().toISOString().slice(0, 10), months), everyMonths: months, alarmDays: 0,
      details: T('A reminder you set on Dubai Rent Atlas to see how rents have moved. Delete this event to stop it.'),
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
    const items = w.changes.slice(0, 4).map(c => `<li><button type="button" class="link" data-area="${esc(c.area)}" data-unit="${esc(c.unit)}">${esc(c.area)}${c.unit ? ' · ' + esc(US(c.unit)) : ''}</button>: ${aed(c.to)} <small class="${c.pct > 0 ? 'up' : 'down'}">${T('{sign}{pct}% since you saved it', { sign: c.pct > 0 ? '+' : '', pct: c.pct })}</small></li>`).join('');
    box.innerHTML = `<p>${T('<b>New figures since your last visit</b>: rents now run to {to} (was {from}).', { to: esc(dateText(w.to)), from: esc(dateText(w.from)) })}</p>
      ${items ? `<ul>${items}</ul>` : `<p class="muted">${T('Your saved areas have not changed.')}</p>`}
      <button type="button" class="btn" data-act="seen">${T('Got it')}</button>`;
    box.hidden = false;
  }

  // ---- map: from exploring to checking, and back ----
  // The same rule as slug() in scripts/share_pages.py, which writes a/<slug>/ with this area's preview.
  const slug = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x00-\x7f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  function shareUrl(area, unit) {
    return new URL('a/' + slug(area.label) + '/' + (unit ? '?unit=' + encodeURIComponent(unit) : ''), location.href.split(/[?#]/)[0]).href;
  }
  // Phones: the system share sheet (WhatsApp and the rest). Elsewhere: copy the link.
  async function share(btn) {
    const { area, unit } = current, f = RI.unitFigure(area, unit);
    const url = shareUrl(area, unit);
    count('share', area.label);
    const text = f ? T('{what} in {area}: {aed} a year (median), from Ejari contracts.', { what: unit ? U(unit) : T('All homes'), area: area.label, aed: aed(f.median) })
      : T('Rents in {area}, from Ejari contracts.', { area: area.label });
    if (navigator.share && matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share({ title: T('Dubai Rent Atlas'), text, url }); } catch { /* closed the sheet */ }
      return;
    }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch { /* no clipboard permission */ }
    btn.textContent = ok ? T('Link copied') : url;
    if (ok) setTimeout(() => { if (btn.isConnected) btn.textContent = T('Share'); }, 2500);
  }

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
    e.popup.setContent(content + `<p class="ck-popact"><button type="button" class="btn primary" data-check="${esc(label)}">${T('Check a rent here')}</button></p>`);
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
        case 'share': share(b); break;
        case 'clear-history': store.history = []; save(); renderMine(); break;
        case 'every-ics': everyIcs(); break;
        case 'seen': store.seenThrough = THROUGH; save(); el('ckNew').hidden = true; break;
        case 'export': download('dubai-rent-atlas-my-data.json', JSON.stringify(store, null, 2), 'application/json'); break;
        case 'wipe':
          if (confirm(T('Delete your saved areas, recent checks and settings from this browser?'))) {
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
      el('ckRemindHere').innerHTML = `<p class="ck-done">${T('Reminder downloaded: open the file to add it to your calendar. It will remind you {d} days before {date}.', { d: store.prefs.remindDays, date: esc(dateText(store.saved[i].renews)) })}</p>`;
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
        }).catch(() => alert(T('That file is not a Dubai Rent Atlas export.')));
      }
    });
    map.on('popupopen', onPopup);
    document.addEventListener('click', onPopupClick); // the map's pop-up, or the phone sheet that shows its content
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
    el('ckResult').innerHTML = `<div class="ck-empty"><p>${T("<b>The rent data didn't load.</b> This is usually a brief network hiccup.")}</p>
      <button type="button" class="btn primary" onclick="location.reload()">${T('Try again')}</button></div>`;
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
