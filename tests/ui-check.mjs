// Page check in a real browser (Chromium via Playwright) against the real data, run by the
// Tests workflow after loading the data branch. Catches what unit tests can't: labels that
// overlap or hide an area, sideways scrolling on phones, a broken rent check, the map pushed
// off the first phone screen, keyboard labels, and WCAG A/AA problems (axe-core).
//
//   node tests/ui-check.mjs            (needs: npm i --no-save playwright axe-core; data loaded)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const AXE = await readFile(process.env.AXE_PATH || require.resolve('axe-core/axe.min.js'), 'utf8');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };

// A tiny static server for the repo root (page + data/ + assets/).
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const failures = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };

async function open(browser, viewport, colorScheme = 'light', query = '', ctx = {}) {
  const page = await (await browser.newContext({ viewport, colorScheme, ...ctx })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/tile\.openstreetmap\.org/, r => r.abort()); // no tile load on every test run
  // Photos near an area (Wikimedia Commons): a stand-in answer with one photo, one diagram and one map,
  // and a tiny image, so the filter and credits are tested without calling Wikimedia.
  const photo = (i, title, mime) => ({ pageid: i, index: i, title, imageinfo: [{ mime, thumburl: `https://thumb.wikimedia.org/t${i}.jpg`,
    descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    extmetadata: { Artist: { value: '<a href="x">Test Photographer</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] });
  await page.route(/commons\.wikimedia\.org\/w\/api\.php/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { pages: {
    1: photo(1, 'File:Marina towers at dusk.jpg', 'image/jpeg'), 2: photo(2, 'File:Racetrack course.svg', 'image/svg+xml'),
    3: photo(3, 'File:Location map of the marina.jpg', 'image/jpeg') } } }) }));
  await page.route(/thumb\.wikimedia\.org/, r => r.fulfill({ contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') }));
  // The vector base map: a tiny local style instead of OpenFreeMap, so the language button is tested
  // without depending on that service (its tiles, fonts and sprites are not fetched).
  await page.route(/tiles\.openfreemap\.org/, r => /\/styles\//.test(r.request().url()) ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({
    version: 8, sources: { p: { type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [55.27, 25.2] },
      properties: { name: 'برج خليفة', 'name:en': 'Burj Khalifa', 'name:ar': 'برج خليفة', name_en: 'Burj Khalifa' } }] } } },
    layers: [{ id: 'place_label', type: 'symbol', source: 'p', layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']] } }] }) }) : r.abort());
  await page.goto(BASE + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  return { page, errors };
}

// Labels under the map's buttons or legend, by their text.
const underControls = page => page.evaluate(() => {
  const blocks = [...document.querySelectorAll('.leaflet-control,.legend')].map(e => e.getBoundingClientRect()).filter(r => r.width);
  return [...document.querySelectorAll('.rl')].filter(e => { const a = e.getBoundingClientRect();
    return blocks.some(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom); }).map(e => e.textContent);
});
const overlaps = page => page.evaluate(() => {
  const r = [...document.querySelectorAll('.rl')].map(e => e.getBoundingClientRect());
  let n = 0;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i], b = r[j];
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) n++;
  }
  return { labels: r.length, overlaps: n };
});

async function axe(page, label) {
  // Check the page at rest: labels fading in (GSAP) would be measured half transparent.
  await page.waitForFunction(() => !window.gsap || !gsap.globalTimeline.getChildren(true, true, false).some(t => t.isActive()), null, { timeout: 5000 }).catch(() => {});
  // …and with the map still and any breakdown fully faded in (a fly-to opens it after landing; Leaflet fades it in).
  await page.waitForFunction(() => typeof map === 'undefined' || (!map._flyToFrame && !map._animatingZoom && [...document.querySelectorAll('.leaflet-popup')].every(e => getComputedStyle(e).opacity === '1')), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(250);
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    exclude: [['.leaflet-tile-pane']],
  })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0] && v.nodes[0].target.join(' ') })));
  const serious = res.filter(v => v.impact === 'serious' || v.impact === 'critical');
  for (const v of res) console.log(`     axe ${v.impact}: ${v.id} (${v.n}) e.g. ${v.sample}`);
  check(!serious.length, `${label}: no serious or critical accessibility problems (axe, WCAG 2.1 AA)`);
}

const browser = await chromium.launch();
try {
  for (const [name, viewport] of [['desktop', { width: 1350, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const { page, errors } = await open(browser, viewport);
    const start = await overlaps(page);
    check(start.labels >= 10, `${name}: map shows rent labels (${start.labels})`);
    check(start.overlaps === 0, `${name}: no labels overlap at the start (${start.overlaps})`);
    // The price dial: the median of what's on screen between the lowest and highest area, in the view's unit.
    const dial = await page.evaluate(() => { const vb = window.viewBounds ? viewBounds() : map.getBounds(), vals = POINTS.filter(p => vb.contains([p.a.lat, p.a.lng])).map(p => p.v);
      const num = s => +String(s).replace(/[^\d.]/g, '') * (/k$/.test(s) ? 1000 : /M$/.test(s) ? 1e6 : 1);
      return { on: !document.getElementById('dialBox').classList.contains('off'), kind: document.getElementById('dialKind').textContent, unit: document.getElementById('dialUnit').textContent,
        med: num(document.getElementById('med').getAttribute('aria-label')), lo: num(document.getElementById('dialMin').textContent), hi: num(document.getElementById('dialMax').textContent),
        min: Math.min(...vals), max: Math.max(...vals), knob: !!document.getElementById('dialKnob').getAttribute('cx') }; });
    check(dial.on && /Median rent/.test(dial.kind) && /AED a year/.test(dial.unit) && dial.knob && dial.lo <= dial.med && dial.med <= dial.hi && Math.abs(dial.lo - dial.min) / dial.min < 0.05 && Math.abs(dial.hi - dial.max) / dial.max < 0.05,
      `${name}: the rent dial shows the median (${dial.med}) between the lowest (${dial.lo}) and highest (${dial.hi}) area in view, in AED a year`);
    const under0 = await underControls(page);
    check(!under0.length, `${name}: at the start no label sits under the map's buttons or legend${under0.length ? ': ' + under0.join(', ') : ''}`);
    const labelNames = await page.evaluate(() => [...document.querySelectorAll('.rl small')].map(e => e.textContent));
    check(labelNames.every(t => !/…\s*…|\.\.\./.test(t)) && !labelNames.some(t => /\b(TOWN SQUARE|DAMAC HILLS|LA MER)\b/.test(t)),
      `${name}: label names are shortened once and all-capitals names show in title case`);
    const tops = await page.evaluate(() => ['n12', 'mapped', 'nAreas'].map(id => { const r = document.createRange(); r.selectNodeContents(document.getElementById(id)); return Math.round(r.getClientRects()[0]?.top ?? -1); }));
    check(tops.every(t => Math.abs(t - tops[0]) <= 2), `${name}: the three key figures line up (${tops.join(', ')})`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${name}: no sideways scrolling`);
    if (name === 'desktop') {
      // The map fills the window; the side panel floats over its left side, slightly see-through (24 Nov).
      const pane = await page.evaluate(() => { const r = document.querySelector('.mapWrap').getBoundingClientRect(), p = document.querySelector('.pane'), pr = p.getBoundingClientRect();
        const a = (getComputedStyle(p).backgroundColor.match(/[\d.]+/g) || []).map(Number), alpha = a.length > 3 ? a[3] : 1;
        return { left: r.left, w: r.width / innerWidth, top: r.top, h: r.height / innerHeight, pw: pr.width, alpha, zoom: map.zoomControl.getContainer().getBoundingClientRect().left }; });
      check(pane.left <= 1 && pane.w >= 0.98 && pane.top <= 1 && pane.h >= 0.98 && pane.pw >= 400 && pane.alpha >= 0.5 && pane.alpha < 0.95 && pane.zoom >= pane.pw,
        `desktop: the map fills the window and the panel (${Math.round(pane.pw)} px) floats over it, slightly see-through (${Math.round(pane.alpha * 100)}% solid), the zoom buttons beside it`);
      await page.evaluate(() => scrollTo(0, 1500));
      const still = await page.evaluate(() => document.querySelector('.mapWrap').getBoundingClientRect().top);
      check(Math.abs(still) <= 1, 'desktop: the map pane stays in place while the left pane scrolls');
      await page.evaluate(() => scrollTo(0, 0));
    }
    // Base map language: English, Arabic or both for the base map's place names.
    const base = await page.waitForFunction(() => gl || map._osm, null, { timeout: 15000 }).then(() => page.evaluate(() => gl ? 'vector' : 'raster')).catch(() => 'none');
    check(base !== 'none', `${name}: the base map loads (${base})`);
    if (base === 'vector') {
      const field = () => page.evaluate(() => JSON.stringify(gl.getLayoutProperty('place_label', 'text-field')));
      check(await page.isVisible('.viewSw .names') && /name:en/.test(await field()), `${name}: map names follow the page (English), with one names button in the map's bar`);
      await page.click('.viewSw .names');
      check(/name_en/.test(await field()) && !/name:ar/.test(await field()) && await page.evaluate(() => localStorage.getItem('mapBoth') === '1' && document.querySelector('.viewSw .names').getAttribute('aria-pressed') === 'true'),
        `${name}: the names button shows English and Arabic together, and is remembered`);
      await page.click('.viewSw .names');
      check(/name:en/.test(await field()), `${name}: pressed again, names follow the page language`);
    }
    const view0 = await page.evaluate(() => ({ c: map.getCenter(), z: map.getZoom() }));
    await page.evaluate(() => fitDubai(false));
    await page.waitForTimeout(300);
    const underLang = await page.evaluate(() => { const b = document.querySelector('.viewSw'); if (!b || b.hidden) return 0; const r = b.getBoundingClientRect();
      return [...document.querySelectorAll('.rl')].filter(e => { const a = e.getBoundingClientRect(); return a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom; }).length; });
    check(underLang === 0, `${name}: no rent label sits under the map's bar (${underLang})`);
    await page.evaluate(v => map.setView(v.c, v.z, { animate: false }), view0);
    await page.waitForTimeout(300);
    // The figure is a badge in its key colour, with dark type on the four light blues and light type on the two dark ones.
    // The price shows in each label's frame: a thick border in its key colour; the figure itself is plain dark type.
    const badges = await page.evaluate(() => [...document.querySelectorAll('.rl')].map(e => { const cs = getComputedStyle(e), b = getComputedStyle(e.querySelector('b'));
      const probe = document.createElement('i'); probe.style.color = 'var(' + (e.style.getPropertyValue('--c').match(/--b[1-6]/) || ['--b3'])[0] + ')'; e.append(probe); const key = getComputedStyle(probe).color; probe.remove();
      return [e.style.getPropertyValue('--c'), parseFloat(cs.borderTopWidth), cs.borderTopColor, key, b.backgroundColor, b.color]; }));
    check(badges.length >= 10 && badges.every(([c, w, bc, key, bg, fg]) => /--b[1-6]/.test(c) && w >= 3 && bc === key && bg === 'rgba(0, 0, 0, 0)' && fg === 'rgb(43, 33, 24)'),
      `${name}: each label's price shows in a thick border in its key colour; the figure is plain dark type (${badges.length})`);
    check(await page.evaluate(() => !document.querySelector('.pie') && [...document.querySelectorAll('.rl.grp small')].every(e => /\+ (1 area|\d+ areas)$|· \d+ more nearby$/.test(e.textContent))),
      `${name}: merged labels name their busiest area and how many more ("JLT + 12 areas", or "JVC · 21 more nearby" for a big group); no dials`);
    const scale = await page.evaluate(() => { const vals = POINTS.map(p => p.v).sort((a, b) => a - b);
      const p95 = vals[Math.round(.95 * (vals.length - 1))], p05 = vals[Math.round(.05 * (vals.length - 1))];
      return { top: LABEL.top, p95, p05, max: vals.at(-1), min: vals[0], topColour: LABEL.colorOf(vals.at(-1)), lowColour: LABEL.colorOf(vals[0]),
        ticks: document.querySelectorAll('#legend .ticks span').length }; });
    check(scale.top === scale.p95 && scale.top < scale.max && scale.topColour === 'var(--b6)' && scale.lowColour === 'var(--b1)' && scale.ticks === 7,
      `${name}: the key runs from the 5th to the 95th percentile (AED ${Math.round(scale.p05 / 1000)}k to ${Math.round(scale.p95 / 1000)}k, not ${Math.round(scale.min / 1000)}k to ${Math.round(scale.max / 1000)}k); the extremes keep the end colours`);
    // The legend folds to its colour bar (phones start folded) and unfolds again.
    const fold0 = await page.evaluate(() => document.getElementById('legend').classList.contains('folded'));
    await page.click('#legend .t');
    const fold1 = await page.evaluate(() => ({ f: document.getElementById('legend').classList.contains('folded'), exp: document.querySelector('#legend .t').getAttribute('aria-expanded') }));
    check(fold0 === (name === 'phone') && fold1.f === !fold0 && fold1.exp === String(fold0), `${name}: the legend ${fold0 ? 'starts folded and unfolds' : 'folds to its colour bar'} with its title button`);
    await page.click('#legend .t');
    // Map views: rent, sale price, gross yield; each its own key (5th-95th percentile), legend and labels.
    const views = {};
    for (const m of ['sale', 'yield', 'median']) {
      await page.click(`.views button[data-m="${m}"]`);
      await page.waitForTimeout(300);
      views[m] = await page.evaluate(() => { const vals = POINTS.map(p => p.v).sort((a, b) => a - b);
        return { metric: LABEL.metric, top: LABEL.top, p95: vals[Math.round(.95 * (vals.length - 1))], title: document.querySelector('#legend .t').textContent,
          label: document.querySelector('.rl b')?.textContent || '', select: document.getElementById('metric').value }; });
    }
    check(views.sale.metric === 'sale' && views.sale.top === views.sale.p95 && /M|k/.test(views.sale.label) && /sale|البيع/i.test(views.sale.title) && views.sale.select === 'sale',
      `${name}: "Sale price" switches the map, its key (top AED ${Math.round(views.sale.top / 1000)}k) and legend`);
    check(views.yield.metric === 'yield' && views.yield.top === views.yield.p95 && /%/.test(views.yield.label),
      `${name}: "Yield" shows gross yields with their own key (top ${views.yield.top}%)`);
    check(views.median.metric === 'median' && views.median.top !== views.sale.top, `${name}: "Rent" switches back`);
    // Hotels (OpenStreetMap): only offered once data/hotels.json is published; groups add hotels, never contracts.
    if (await page.evaluate(() => !!document.querySelector('.views button[data-m="hotels"]:not([hidden])'))) {
      await page.click('.views button[data-m="hotels"]');
      await page.waitForTimeout(400);
      const h = await page.evaluate(() => ({ metric: LABEL.metric, dots: document.querySelectorAll('.hdot').length, total: HOTELS.length, priced: hotelPriced(), nPriced: HOTELS.filter(x => x.price).length, rings: document.querySelectorAll('.hdot.none').length, zoom: map.getZoom(),
        texts: [...document.querySelectorAll('.rl b')].map(e => e.textContent),
        badges: [...document.querySelectorAll('.rl')].map(e => e.style.getPropertyValue('--c')),
        legend: !!document.querySelector('#legend .hkey'), ramp: !!document.querySelector('#legend .ramp'), url: /view=hotels/.test(location.search) }));
      const biggest = Math.max(0, ...h.texts.map(t => +t.replace(/[^\d]/g, '')));
      // With prices, places without one are hollow rings shown only from street level (zoom 14).
      // With prices: no dots at the city-wide zoom (below 12: the labels carry it), priced dots from 12, hollow rings from 14.
      check(h.metric === 'hotels' && (h.priced ? (h.zoom < 12 ? h.dots === 0 : h.zoom < 14 ? h.dots === h.nPriced && h.rings === 0 : h.dots === h.total) : h.dots === h.total) && h.total >= 300 && h.texts.length > 0 && h.legend && h.url && (h.priced
        ? h.texts.every(t => /AED|درهم/.test(t)) && h.badges.every(c => /--b[1-6]/.test(c)) && h.ramp      // prices: blue key, as every price
        : biggest <= h.total && h.badges.every(c => /oxblood/.test(c)) && !h.ramp),                           // counts: oxblood, no price key
        `${name}: "Hotels" shows ${h.dots} places to stay and ${h.priced ? 'typical prices a night per area on the blue key' : 'counts per area (largest ' + biggest + ')'}`);
      if (!h.priced) {
        check(await page.evaluate(() => document.getElementById('dialBox').classList.contains('off')), `${name}: counting places, the dial steps aside (a count is not a price)`);
        const head = await page.evaluate(() => [document.getElementById('med').textContent, document.getElementById('medLabel').textContent]);
        check(/places?$/.test(head[0].trim()) && !/AED/.test(head[0]) && /nightly prices on booking sites/.test(head[1]),
          `${name}: without prices, the big number says it counts places ("${head[0].trim()}"), never reads as a price`);
      }
      check((await overlaps(page)).overlaps === 0, `${name}: no labels overlap in the hotels view`);
      // An area's card in the Hotels view leads with its places to stay; its rents fold away under them.
      const hc = await page.evaluate(async () => { const a = AREAS.find(x => hotelsBy().has(x.label)); focusArea(a);
        await new Promise(r => setTimeout(r, 1500)); const c = document.querySelector('.areaSheet:not([hidden]) .body') || document.querySelector('.leaflet-popup-content');
        return c ? { table: !!c.querySelector('.htab .hrow'), folded: !!c.querySelector('details.rentMore:not([open])'), actsFolded: !!c.querySelector('details.rentMore [data-check]') && ![...c.querySelectorAll('[data-check]')].some(x => !x.closest('details.rentMore')), leadFirst: c.querySelector('.lead')?.compareDocumentPosition(c.querySelector('details.rentMore')) === 4 } : null; });
      check(hc && hc.table && hc.folded && hc.leadFirst && hc.actsFolded, `${name}: in the Hotels view an area's card lists its places to stay first, rents and "Check a rent here" folded under them`);
      await page.evaluate(() => { map.closePopup(); try { closeSheet(); } catch (e) {} });
      await page.click('.views button[data-m="median"]');
      await page.waitForTimeout(300);
    }
    const shapes = await page.waitForFunction(() => document.querySelectorAll('.leaflet-outlines-pane path').length, null, { timeout: 5000 }).then(h => h.jsonValue()).catch(() => 0);
    check(shapes >= 50, `${name}: official community outlines are shaded under the labels (${shapes})`);
    const z0 = await page.evaluate(() => map.getZoom());
    await page.click('.leaflet-control-zoom-in');
    await page.waitForTimeout(400);
    check(await page.evaluate(() => map.getZoom()) === z0 + 1, `${name}: the + zoom button zooms in`);
    await page.evaluate(() => map.setView([24.5, 54.3], 8, { animate: false }));
    await page.click('.leaflet-bar a.fit');
    await page.waitForTimeout(500);
    const fit = await page.evaluate(() => ({ z: map.getZoom(), c: (window.viewBounds ? viewBounds() : map.getBounds()).getCenter() }));
    check(fit.z >= 9 && fit.c.lng > 55 && fit.c.lng < 55.5, `${name}: "All Dubai" brings the whole city back (zoom ${fit.z})`);
    if (name === 'phone') {
      const top = await page.evaluate(() => document.querySelector('.mapWrap').getBoundingClientRect().top / innerHeight);
      check(top < 0.6, `phone: the map starts in the top 60% of the first screen (${Math.round(top * 100)}%)`);
    }
    // Areas stay findable by name when zoomed in (International City sits next to Warsan).
    await page.evaluate(() => map.setView([25.16, 55.41], 13, { animate: false }));
    await page.waitForTimeout(300);
    const names = await page.evaluate(() => [...document.querySelectorAll('.rl small')].map(e => e.textContent).join(' | '));
    check(/International City/.test(names), `${name}: International City is named at zoom 13`);
    const z13 = await overlaps(page);
    check(z13.overlaps === 0, `${name}: no labels overlap at zoom 13`);
    await page.evaluate(() => map.setView([25.16, 55.38], 14, { animate: false }));
    await page.waitForTimeout(300);
    const z14 = await page.evaluate(() => ({ groups: document.querySelectorAll('.rl.grp').length, leaders: document.querySelectorAll('path.leader').length }));
    check(z14.groups <= 3, `${name}: at zoom 14 nearly every area has its own label (${z14.groups} merged, ${z14.leaders / 2} moved beside their point)`);
    check((await overlaps(page)).overlaps === 0, `${name}: no labels overlap at zoom 14`);
    await page.evaluate(() => fitDubai(false));
    await page.waitForTimeout(300);
    const hidden = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('.leaflet-control,.legend')].map(e => e.getBoundingClientRect()).filter(r => r.width);
      return [...document.querySelectorAll('.rl')].filter(e => { const a = e.getBoundingClientRect();
        return blocks.some(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom); }).map(e => e.textContent);
    });
    check(!hidden.length, `${name}: no label sits under the zoom buttons or the legend${hidden.length ? ': ' + hidden.join(', ') : ''}`);
    // Keyboard: Enter on a single label opens its breakdown.
    await page.evaluate(() => map.closePopup());
    const focused = await page.evaluate(() => { const el = [...document.querySelectorAll('.rl:not(.grp)')][0]; if (el) el.focus(); return !!el; });
    if (focused) {
      await page.keyboard.press('Enter');
      // The map first zooms to the area (focusArea), then opens its breakdown.
      await page.waitForSelector('.leaflet-popup-content .t', { timeout: 4000 }).catch(() => {});
      check(!!(await page.$('.leaflet-popup-content')), `${name}: Enter on a map label opens its breakdown`);
      check(await page.evaluate(() => document.getElementById('map').classList.contains('focusing') && document.querySelectorAll('.rl.focus').length === 1),
        `${name}: opening an area sets it apart (the rest of the map dimmed, its label marked)`);
      const lead = await page.evaluate(() => { const c = [...document.querySelectorAll('.leaflet-popup-content')].find(e => e.querySelector('.t')); return { lead: c.querySelector('.lead')?.textContent || '', pick: c.querySelector('tr.pick td')?.textContent || '', all: !!c.querySelector('.allh') }; });
      check(/^1-bedroom apartments: median AED/.test(lead.lead) && lead.pick === '1-bedroom apartments' && lead.all,
        `${name}: the breakdown leads with the picked home's figure, highlights its row, then all homes`);
      await page.waitForSelector('.leaflet-popup-content .pics .strip img', { timeout: 5000 }).catch(() => {});
      const see = await page.evaluate(() => ({
        links: [...document.querySelectorAll('.leaflet-popup-content .see a:not([data-walk])')].map(a => a.href),
        walk: !!document.querySelector('.leaflet-popup-content .see a[data-walk]') || !window.maplibregl,
        photos: [...document.querySelectorAll('.leaflet-popup-content .pics .strip a')].map(a => a.textContent + ' ' + a.title) }));
      check(see.links.length === 3 && see.links.every(u => /^https:\/\/www\.google\.com\//.test(u)) && see.links.some(u => /map_action=pano/.test(u)) && see.walk,
        `${name}: the breakdown links to Google Maps, Street View and Google photos, and walks its streets here`);
      check(see.photos.length === 1 && /Test Photographer/.test(see.photos[0]) && /CC BY-SA 4\.0/.test(see.photos[0]),
        `${name}: photos taken nearby show with author and licence, no maps or diagrams (${see.photos.length})`);
      if (name === 'phone') {
        const sh = await page.evaluate(() => { const e = document.querySelector('.areaSheet'); const r = e && !e.hidden && e.getBoundingClientRect();
          return r ? { w: r.width, right: r.right, popupShown: getComputedStyle(document.querySelector('.leaflet-popup') || document.body).display !== 'none' } : null; });
        check(!!sh && sh.right <= 390 && !sh.popupShown, `phone: the breakdown slides up as a full-width sheet, not a pop-up (${sh && Math.round(sh.w)} px)`);
      }
      await page.click('.leaflet-popup-content .pics .strip a');
      await page.waitForTimeout(200);
      const v = await page.evaluate(() => { const e = document.querySelector('.viewer'); return e && !e.hidden && { cap: e.querySelector('figcaption').textContent, src: e.querySelector('img').getAttribute('src') }; });
      check(!!v && /Test Photographer/.test(v.cap) && /Wikimedia Commons/.test(v.cap), `${name}: tapping a photo opens it large with its credit`);
      await page.keyboard.press('Escape');
      check(await page.evaluate(() => document.querySelector('.viewer').hidden), `${name}: Escape closes the photo viewer`);
      if (name === 'phone') {
        await page.click('.areaSheet .sheetX');
        await page.waitForTimeout(300); // Leaflet fades the pop-up out before removing it
        check(await page.evaluate(() => document.querySelector('.areaSheet').hidden && !document.querySelector('.leaflet-popup')), 'phone: × closes the sheet and its pop-up');
      }
      await page.evaluate(() => map.closePopup());
    }
    // One home picker (no type buttons, no second search, no filter sheet): a home size drops the table's unit column.
    check(await page.evaluate(() => !document.querySelector('.seg,.fab,#side') && !!document.getElementById('home').offsetParent && document.getElementById('home').options.length >= 4),
      `${name}: one home picker, in view, with no type buttons or filter sheet`);
    const cols = await page.evaluate(() => document.querySelectorAll('#thead th').length);
    await page.selectOption('#home', 'homes|');
    await page.waitForTimeout(300);
    const allCols = await page.evaluate(() => document.querySelectorAll('#thead th').length);
    check(cols === 5 && allCols === 6, `${name}: with one home size picked the table drops its unit column (${cols} columns; all homes ${allCols})`);
    if (await page.evaluate(() => [...document.getElementById('home').options].some(o => o.value === 'flat|'))) {
      await page.selectOption('#home', 'flat|');
      await page.waitForFunction(() => TYPE === 'flat' && POINTS.length > 0, null, { timeout: 5000 }).catch(() => {});
      check(await page.evaluate(() => TYPE === 'flat' && POINTS.length >= 20 && document.querySelectorAll('.rl').length >= 1), `${name}: "Flats, any size" switches the map to flats`);
    }
    await page.selectOption('#home', 'homes|1-bedroom apartments');
    await page.waitForTimeout(300);
    // All homes: an area's rows show its name once; the key says sizes are mixed. Headers sort the table.
    await page.selectOption('#home', 'homes|');
    await page.waitForTimeout(300);
    const grouped = await page.evaluate(() => ({ cont: document.querySelectorAll('#rows tr.cont').length, blank: [...document.querySelectorAll('#rows tr.cont td.w')].every(td => !td.offsetHeight || td.querySelector('.vh')),
      note: /Mixed home sizes/.test(document.getElementById('legend').textContent) }));
    check(grouped.cont > 10 && grouped.blank && grouped.note, `${name}: with all homes, each area's name shows once over its units (${grouped.cont} follow-on rows), and the key notes mixed sizes`);
    await page.click('#thead button.sort[data-k="n"]');
    const s1 = await page.evaluate(() => ({ sort: document.querySelector('#thead th[aria-sort="descending"] .sort')?.dataset.k, n: [...document.querySelectorAll('#rows tr')].slice(0, 20).map(tr => +tr.children[3].textContent.replace(/,/g, '')) }));
    await page.click('#thead button.sort[data-k="n"]');
    const s2 = await page.evaluate(() => ({ sort: document.querySelector('#thead th[aria-sort="ascending"] .sort')?.dataset.k, n: [...document.querySelectorAll('#rows tr')].slice(0, 20).map(tr => +tr.children[3].textContent.replace(/,/g, '')) }));
    check(s1.sort === 'n' && s1.n.every((v, i) => !i || v <= s1.n[i - 1]) && s2.sort === 'n' && s2.n.every((v, i) => !i || v >= s2.n[i - 1]),
      `${name}: clicking "Contracts" sorts the table, highest first, then lowest first`);
    await page.selectOption('#home', 'homes|1-bedroom apartments');
    await page.waitForTimeout(300);
    if (name === 'desktop') {
      check(await page.evaluate(() => document.querySelectorAll('#inUse .srcH').length >= 1 && document.querySelectorAll('#inUse ul li').length >= 1),
        'desktop: sources are listed as "Figures from" (and "Checked against")');
      // The address keeps the map's state.
      await page.click('.views button[data-m="sale"]');
      await page.waitForTimeout(700);
      const qs = await page.evaluate(() => location.search);
      check(/view=sale/.test(qs) && /home=homes:1-bedroom/.test(qs) && /at=2[45]\.\d+,55\.\d+,\d+/.test(qs), `desktop: the address keeps the home, view and map position (${decodeURIComponent(qs)})`);
      // Compare: from an area to a suggested neighbour; the panel says which is cheaper, the link keeps both.
      await page.evaluate(() => window.startCompare('Jumeirah Village Circle'));
      await page.waitForTimeout(400);
      await page.click('.cmpSugg .chip');
      await page.waitForTimeout(1200);
      const cmp = await page.evaluate(() => ({ open: !document.querySelector('.cmpPanel').hidden, head: document.querySelector('.vsVerdict')?.textContent || '', link: /compare=/.test(location.search), units: document.querySelectorAll('[data-cmp-unit]').length }));
      check(cmp.open && /cheaper than|About the same/.test(cmp.head) && cmp.link && cmp.units > 1, `desktop: Compare opens two areas side by side (${cmp.head.slice(0, 70)}…)`);
      await axe(page, 'desktop with Compare open');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      // Metro and Tram, when data/transit.json is published: the walk filter keeps only areas near a station and names one.
      if (await page.evaluate(() => !document.querySelector('.f-walk').hidden)) {
        await page.selectOption('#walk', '10');
        await page.waitForTimeout(500);
        const t = await page.evaluate(() => ({ note: document.getElementById('budgetNote').textContent, stops: document.querySelectorAll('.tstop').length, on: document.querySelector('.metroBtn').getAttribute('aria-pressed') }));
        check(/within a 10-minute walk of a Metro or Tram station/.test(t.note) && t.stops > 20 && t.on === 'true', `desktop: Near Metro / Tram shows the lines and keeps areas near a station (${t.note.slice(0, 60)}…)`);
        await page.selectOption('#walk', '0');
        await page.waitForTimeout(300);
      }
      await page.click('.views button[data-m="median"]');
    }
    // The finder above the table filters the table only; the map keeps every area.
    const before = await page.evaluate(() => ({ rows: document.querySelectorAll('#rows tr').length, pts: POINTS.length }));
    await page.fill('#search', 'marina');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ rows: document.querySelectorAll('#rows tr').length, pts: POINTS.length }));
    check(after.rows < before.rows && after.rows >= 1 && after.pts === before.pts, `${name}: the table finder narrows the table (${before.rows} → ${after.rows} rows) and leaves the map alone`);
    await page.fill('#search', '');
    await page.waitForTimeout(300);
    // The zoom bar's buttons (All Dubai, Near me) fit their bar.
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.leaflet-control-zoom a')].filter(a => a.scrollWidth > a.clientWidth + 1).map(a => a.textContent));
    check(!clipped.length, `${name}: the zoom bar's buttons fit${clipped.length ? ': ' + clipped.join(', ') : ''}`);
    // Feature use is counted (a stand-in counter here): a view change and a table sort.
    await page.evaluate(() => { window.__ev = []; window.goatcounter = { count: e => window.__ev.push(e.path.replace(/^.*\/event\//, '')) }; });
    await page.click('.views button[data-m="sale"]');
    await page.click('.views button[data-m="median"]');
    await page.click('#thead button.sort[data-k="a"]');
    const ev = await page.evaluate(() => window.__ev);
    check(ev.includes('view-sale') && ev.includes('table-sort'), `${name}: feature use is counted, by name only (${ev.join(', ')})`);
    // Labels stay inside the map: none whose centre is on the map crosses its edge.
    const crossing = await page.evaluate(() => { const b = map.getContainer().getBoundingClientRect();
      return [...document.querySelectorAll('.rl')].filter(e => { const r = e.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
        return cx > b.left && cx < b.right && cy > b.top && cy < b.bottom && (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1); }).map(e => e.textContent); });
    check(!crossing.length, `${name}: no label on the map is cut off by its edge${crossing.length ? ': ' + crossing.join(', ') : ''}`);
    // Key figures in big type, freshness in one small line; sources listed once, run status folded away.
    // The key figures follow the chosen home: its contracts, the cheapest area, areas shown of those with figures.
    const kf = await page.evaluate(() => ({ n12T: document.getElementById('n12T').textContent, n12: +(document.getElementById('n12').getAttribute('aria-label') || '').replace(/[^\d]/g, ''),
      cheap: document.getElementById('mapped').textContent, areas: document.getElementById('nAreas').textContent, fresh: document.getElementById('fresh').textContent,
      inUse: document.querySelectorAll('#inUse li').length, health: !!document.getElementById('healthBox'), status: !!document.querySelector('.statusLink a[href="status/"]'),
      unm: document.getElementById('unmatchedBox').hidden || +document.getElementById('unmatchedN').textContent > 0, foot: document.getElementById('foot').textContent.trim(),
      hotels: /Xotelo/.test(document.querySelector('.about').textContent), points: POINTS.length, sum: POINTS.reduce((t, p) => t + (p.n || 0), 0) }));
    check(/Contracts for /.test(kf.n12T) && kf.n12 > 0 && kf.n12 <= kf.sum + 1 && /AED/.test(kf.cheap) && kf.areas.replace(/,/g, '').startsWith(String(kf.points)) && / of \d+ with figures/.test(kf.areas.replace(/(\d)of/, '$1 of'))
      && /Kuwait/.test(kf.fresh) && kf.inUse >= 1 && !kf.health && kf.status && kf.unm && !kf.foot && kf.hotels,
      `${name}: key figures follow the home (${kf.n12T}: ${kf.n12}; cheapest ${kf.cheap}; ${kf.areas}), one freshness line, sources once, a status link, hotel sources credited`);
    if (name === 'phone') {
      const vis = await page.evaluate(() => [...document.querySelectorAll('#thead th')].filter(t => t.offsetParent).map(t => t.textContent));
      check(vis.length === 3, `phone: the table shows the area, the view's figure and contracts only (${vis.join(' | ')})`);
      const cr0 = await page.evaluate(() => getComputedStyle(document.querySelector('.leaflet-control-attribution')).display);
      await page.click('.leaflet-bar.credits');
      const cr1 = await page.evaluate(() => getComputedStyle(document.querySelector('.leaflet-control-attribution')).display);
      check(cr0 === 'none' && cr1 !== 'none', `phone: the map credits fold behind "i" and open with one tap`);
      await page.click('.leaflet-bar.credits');
    }
    // The rent check: a nickname finds the area and shows a figure.
    await page.evaluate(() => scrollTo(0, 0));
    await page.click('#ckArea');
    await page.fill('#ckArea', 'jvc');
    await page.press('#ckArea', 'Enter');
    await page.waitForTimeout(400);
    const big = await page.$eval('.ck-big', e => e.textContent).catch(() => '');
    check(/AED\s*[\d,]+/.test(big), `${name}: rent check answers "jvc" (${big.trim().slice(0, 30)})`);
    const more = await page.evaluate(() => { const d = document.querySelector('.ck-moreinfo'); return d ? d.open : null; });
    check(more === (name !== 'phone'), `${name}: nearby, rank and owner figures are ${name === 'phone' ? 'folded under "More about this area"' : 'shown'} (${more})`);
    if (name === 'desktop') {
      // A breakdown opened near the top-right buttons must not sit under them (the map pans instead).
      const clear = await page.evaluate(async () => { map.closePopup(); const a = AREAS.find(x => x.lat != null && x.median);
        const s = map.getSize(); map.setView([a.lat, a.lng], 14, { animate: false }); map.panBy([-s.x * .4, -s.y * .35], { animate: false });
        L.popup({ maxWidth: 320 }).setLatLng([a.lat, a.lng]).setContent(popup(a)).openOn(map); await new Promise(r => setTimeout(r, 600));
        const pr = document.querySelector('.leaflet-popup-content-wrapper').getBoundingClientRect();
        const hits = [...document.querySelectorAll('.leaflet-control,.legend')].map(e => e.getBoundingClientRect())
          .filter(c => c.width && pr.left < c.right && c.left < pr.right && pr.top < c.bottom && c.top < pr.bottom).length;
        map.closePopup(); return hits; });
      check(clear === 0, `desktop: a breakdown near the map's buttons isn't hidden under them (${clear} overlaps)`);
      // The rents table fits the side pane without sideways scrolling, from the narrowest two-pane width up.
      for (const w of [1100, 1350, 1920]) {
        await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(200);
        const [sw, cw] = await page.evaluate(() => { const e = document.querySelector('.tableWrap'); return [e.scrollWidth, e.clientWidth]; });
        check(sw <= cw + 1, `desktop ${w}px: the rents table fits without scrolling sideways (${sw} in ${cw})`);
      }
      await page.setViewportSize(viewport); await page.waitForTimeout(200);
      await page.click('#ckArea'); await page.fill('#ckArea', 'jvc'); await page.press('#ckArea', 'Enter');
      await page.waitForTimeout(1300); // the fly to the area
      // The breakdown may pan the map to clear the buttons, so check JVC is in view rather than centred.
      const c = await page.evaluate(() => ({ z: map.getZoom(), inView: map.getBounds().pad(-0.05).contains([25.058, 55.209]) }));
      const near = c.inView;
      check(near && c.z >= 13, `desktop: a rent check takes the map to the area (JVC; zoom ${c.z})`);
      // The breakdown never covers the area it is about (above it or beside it, whichever shows the area larger).
      const cover = await page.evaluate(() => { const card = document.querySelector('.leaflet-popup'), ring = document.querySelector('.focusRing');
        if (!card || !ring) return null; const c = card.getBoundingClientRect(), a = ring.getBoundingClientRect();
        const ix = Math.max(0, Math.min(c.right, a.right) - Math.max(c.left, a.left)), iy = Math.max(0, Math.min(c.bottom, a.bottom) - Math.max(c.top, a.top));
        return Math.round(ix * iy / (a.width * a.height) * 100); });
      check(cover !== null && cover <= 3, `desktop: the area's breakdown leaves the area in view (${cover}% covered)`);
      check(!!(await page.$('.leaflet-popup-content')), 'desktop: and opens its breakdown');
      // One home choice for the page: the check set the map's picker; the map's picker re-checks the area.
      // Our own history and the cross-checks in a breakdown: change since an earlier update, an unconfirmed
      // jump, other sources more than 15% away (fields the build adds; injected here).
      const notes = await page.evaluate(() => { const a = AREAS.find(x => x.label === 'Jumeirah Village Circle');
        const h = popup(Object.assign({}, a, { rent_change: { since: '2025-11-14', pct: 6.5 }, unconfirmed: { from: 44000, pct: 50 },
          disagree: [{ source: 'Dubai Real Estate Data', unit: 'studios to 2 beds', ours: 66000, theirs: 52000, pct: 26.9 }] }));
        const d = document.createElement('div'); d.innerHTML = h; return d.textContent; });
      check(/Rent \+6\.5% since 14 Nov 2025/.test(notes) && /waiting for the next update to confirm/.test(notes) && /Other sources differ by more than 15%/.test(notes) && /AED 52,000/.test(notes),
        'desktop: a breakdown shows the change since an earlier update, an unconfirmed jump, and sources that differ');
      const staffNote = await page.evaluate(() => { const a = AREAS.find(x => x.lat != null); const d = document.createElement('div');
        d.innerHTML = popup(Object.assign({}, a, { staff: true })); return d.textContent; });
      check(/industrial zone: most homes here are staff accommodation/.test(staffNote), 'desktop: an industrial zone says its homes are mostly staff accommodation');
      // One Home control for the page: the check has none of its own and follows the map's picker.
      const sync0 = await page.evaluate(() => [!document.getElementById('ckUnit'), document.querySelector('.ck-what')?.textContent || '']);
      await page.selectOption('#home', 'homes|2-bedroom apartments');
      await page.waitForTimeout(400);
      const sync1 = await page.evaluate(() => document.querySelector('.ck-what')?.textContent || '');
      await page.click('.ck-others button[data-unit="Studios"]');
      await page.waitForTimeout(400);
      const sync2 = await page.evaluate(() => [document.getElementById('home').value, document.querySelector('.ck-what')?.textContent || '']);
      check(sync0[0] && /1-bedroom/.test(sync0[1]) && /2-bedroom/.test(sync1) && sync2[0] === 'homes|Studios' && /Studios/.test(sync2[1]),
        `desktop: the rent check uses the map's Home picker, and "Other homes here" switches both (${sync2[0]})`);
      await page.selectOption('#home', 'homes|1-bedroom apartments');
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
      await page.click('.ck-actions [data-act="share"]');
      await page.waitForTimeout(200);
      const link = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      check(/\/a\/jumeirah-village-circle\/(\?unit=|$)/.test(link), `desktop: "Share" copies the area's preview link (${link.replace(BASE, '')})`);
      check(/og:image/.test(await page.content()), 'desktop: the page has link-preview tags');
    }
    check(!errors.length, `${name}: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await axe(page, name);
    await page.context().close();
  }
  // Arabic: right to left, translated, the rent check still works, nothing sideways, accessible.
  for (const [name, viewport] of [['Arabic desktop', { width: 1350, height: 900 }], ['Arabic phone', { width: 390, height: 844 }]]) {
    const { page, errors } = await open(browser, viewport, 'light', '?lang=ar');
    check(await page.evaluate(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'ar'), `${name}: the page reads right to left`);
    await page.waitForFunction(() => gl || map._osm, null, { timeout: 15000 }).catch(() => {});
    check(await page.evaluate(() => !gl || /name:ar/.test(JSON.stringify(gl.getLayoutProperty('place_label', 'text-field')))), `${name}: map place names start in Arabic`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${name}: no sideways scrolling`);
    await page.waitForTimeout(500);
    const underAr = await underControls(page);
    check(!underAr.length, `${name}: no label sits under the map's buttons or legend${underAr.length ? ': ' + underAr.join(', ') : ''}`);
    await page.click('#ckArea');
    await page.fill('#ckArea', 'jvc');
    await page.press('#ckArea', 'Enter');
    await page.waitForTimeout(400);
    const big = await page.$eval('.ck-big', e => e.textContent).catch(() => '');
    check(/AED\s*[\d,]+/.test(big) && /سنويًا/.test(big), `${name}: rent check answers in Arabic (${big.trim()})`);
    // Leftover English: common interface words in visible text (area names, AED and sources stay English).
    const english = await page.evaluate(() => {
      const words = /\b(Check|Share|Save|Show|Median|Contracts|Filters|Unit|Area|Average|Weekly|Download|Remind|Loading)\b/;
      const skip = el => el.closest('.leaflet-container,#sources,#foot,#rows,option,.ck-what b,[lang="en"]');
      const out = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode());) {
        const el = n.parentElement;
        if (!el || skip(el) || !el.offsetParent) continue;
        if (words.test(n.textContent)) out.push(n.textContent.trim().slice(0, 40));
      }
      return out;
    });
    check(!english.length, `${name}: no English interface text left${english.length ? ': ' + english.join(' | ') : ''}`);
    check(!errors.length, `${name}: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await axe(page, name);
    await page.context().close();
  }
  // The data status page (status/): totals, the last pull, recent runs and alerts, in English and Arabic.
  for (const [name, viewport, q] of [['status desktop', { width: 1350, height: 900 }, ''], ['status phone', { width: 390, height: 844 }, ''], ['status Arabic phone', { width: 390, height: 844 }, '?lang=ar']]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // The data branch, served from ./data; GitHub's API, stubbed (two runs, no open alerts).
    await page.route(/raw\.githubusercontent\.com\/.+\/data\/data\//, async r => {
      const f = r.request().url().split('/data/data/')[1];
      try {
        let body = await readFile(join(ROOT, 'data', f));
        // Hotel prices last refreshed 3 days ago: "Needs you" must say so.
        if (f === 'state.json') { const j = JSON.parse(body); j.serp_stays = { state: 'no_key', status: 'no credentials' }; j.routes = { state: 'ok', status: 'ok', feed_from: '2025-08-29', feed_to: '2025-12-31', via: 'mirror' }; j.hotel_prices = { state: 'ok', status: 'ok', last_ok_at: new Date(Date.now() - 72 * 36e5).toISOString(), listed: 2625, matched: 527, list_at: new Date().toISOString() }; body = JSON.stringify(j); }
        await r.fulfill({ body, contentType: f.endsWith('.json') ? 'application/json' : 'text/plain' }); }
      catch { await r.fulfill({ status: 404, body: 'not found' }); }
    });
    await page.route(/api\.github\.com\/repos\/.+\/actions\/workflows\/daily-ejari\.yml\/runs/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ workflow_runs: [
      { run_started_at: '2026-11-17T18:00:00Z', created_at: '2026-11-17T18:00:00Z', updated_at: '2026-11-17T18:01:10Z', event: 'workflow_dispatch', conclusion: 'success', html_url: 'https://github.com/x/y/actions/runs/2' },
      { run_started_at: '2026-11-17T10:17:00Z', created_at: '2026-11-17T10:17:00Z', updated_at: '2026-11-17T10:17:20Z', event: 'schedule', conclusion: 'success', html_url: 'https://github.com/x/y/actions/runs/1' }] }) }));
    await page.route(/api\.github\.com\/repos\/.+\/issues/, r => r.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.route(/api\.github\.com\/repos\/.+\/branches/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ name: 'main' }, { name: 'data' }, { name: 'old-probe' }, { name: 'rera-check' }]) }));
    await page.goto(BASE + 'status/' + q);
    await page.waitForFunction(() => window.statusState, null, { timeout: 15000 }).catch(() => {});
    const st = await page.evaluate(() => ({ state: window.statusState, overall: document.getElementById('overall').textContent,
      totals: document.querySelectorAll('#totals div').length, contracts: document.querySelector('#totals dd')?.textContent || '',
      pulled: document.querySelectorAll('#pulled tr').length, det: /DET|دائرة الاقتصاد/.test(document.getElementById('pulled').textContent), used: document.querySelectorAll('#used tr').length, runs: document.querySelectorAll('#runs tr').length,
      left: document.querySelectorAll('#left li').length, pending: document.querySelectorAll('#pending li').length, alerts: document.getElementById('alerts').textContent,
      sideways: document.documentElement.scrollWidth > innerWidth, dir: document.documentElement.dir,
      needs: [...document.querySelectorAll('#needs li')].map(li => li.textContent), hotels: document.querySelectorAll('#hotels div').length, hotelsText: document.getElementById('hotels').textContent, needsFirst: document.querySelector('main section')?.classList.contains('needs') }));
    // Unresolved issues a person can fix come first, each with what to do (here: the Dubai Pulse key, an old branch).
    // No LiteAPI key is the owner's choice (18 Nov), so it is not asked for.
    check(st.needsFirst && st.needs.some(t => /old-probe/.test(t)) && !st.needs.some(t => /rera-check/.test(t)) && st.needs.some(t => /Dubai Pulse|دبي بالس/.test(t)) && !st.needs.some(t => /LiteAPI/.test(t)) && st.needs.some(t => /timetables are out of date|جداول الحافلات/.test(t)) && st.needs.some(t => /price widget|أداة أسعار/.test(t)) && st.needs.some(t => /Hotel prices have not refreshed|لم تُحدَّث أسعار الفنادق/.test(t)) && st.needs.some(t => /SerpApi/.test(t)) && st.needs.every(t => /What to do|ما العمل/.test(t)),
      `${name}: "Needs you" comes first and lists what a person can fix, with what to do, stale hotel prices included (${st.needs.length})`);
    check(st.hotels === 9 && /Xotelo/.test(st.hotelsText) && /AED [\d,]+ – [\d,]+/.test(st.hotelsText), `${name}: the Hotels section gives places, matches, prices, their range and freshness, DET and the partner panel`);
    check(st.state === 'ready' && /[\d,]{5,}/.test(st.contracts) && st.totals === 5 && st.pulled === 9 && st.det && st.used === 3 && st.runs === 2 && st.left >= 3 && st.pending >= 3,
      `${name}: shows the totals (${st.contracts} contracts), what each source pulled (hotel sources too), what's in use, left out and waiting, and recent pulls`);
    check(/All fine|كل شيء/.test(st.overall) && /No open alerts|لا تنبيهات/.test(st.alerts), `${name}: says all is fine when the last pull worked and no alert is open`);
    check(!st.sideways, `${name}: no sideways scrolling`);
    if (q) check(st.dir === 'rtl', `${name}: reads right to left`);
    check(!errors.length, `${name}: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await axe(page, name);
    await ctx.close();
  }
  // Night prices without per-hotel prices: DET's official rate on the night dial and in a hotel's card, and a
  // booking partner's widget that loads only when tapped (both stubbed here: no Dubai Pulse, no partner).
  {
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/data\/hotel_prices\.json/, r => r.fulfill({ status: 404, body: 'not found' }));  // DET's rate is for when no hotel has a price
    await page.route(/data\/serp_stays\.json/, r => r.fulfill({ status: 404, body: 'not found' }));  // nor from Google Hotels
    await page.route(/data\/hotel_stats\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ fetched: '2026-11-18', source: 'test',
      months: [{ month: '2026-07', adr: 380 }, { month: '2026-08', adr: 410 }, { month: '2026-09', adr: 520 }, { month: '2026-10', adr: 640 }], latest: { month: '2026-10', adr: 640, occupancy: 78 } }) }));
    await page.route(/assets\/app\/partners\.js/, r => r.fulfill({ contentType: 'application/javascript',
      body: "window.PRICE_WIDGET={partner:'Test Partner',url:'https://widget.example/w?ss={name}&in={checkin}&out={checkout}&lang={lang}'};" }));
    await page.route(/widget\.example/, r => r.fulfill({ contentType: 'text/html', body: '<p>prices</p>' }));
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await page.click('.views button[data-m="hotels"]');
    await page.waitForFunction(() => HOTEL_STATS && HOTELS, null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => draw());
    await page.waitForTimeout(400);
    const d = await page.evaluate(() => ({ on: !document.getElementById('dialBox').classList.contains('off'), kind: document.getElementById('dialKind').textContent,
      med: document.getElementById('med').getAttribute('aria-label'), lo: document.getElementById('dialMin').textContent, hi: document.getElementById('dialMax').textContent, cap: document.getElementById('medLabel').textContent }));
    check(d.on && /Dubai average a night/.test(d.kind) && /640/.test(d.med) && d.lo === '380' && d.hi === '640' && /October 2026/.test(d.cap),
      `night dial: with DET's figures, Dubai's average room rate (${d.med}) between the lowest and highest month (${d.lo}–${d.hi})`);
    await page.evaluate(() => openHotel(HOTELS.find(h => h.area) || HOTELS[0]));
    await page.waitForTimeout(300);
    const card = await page.evaluate(() => { const c = document.querySelector('.leaflet-popup-content'); return { text: c.textContent, frames: c.querySelectorAll('iframe').length }; });
    check(/average room rate in October 2026: AED 640 a night/.test(card.text) && /Show live prices from Test Partner/.test(card.text) && card.frames === 0,
      "a hotel's card gives Dubai's official rate and offers the partner's live prices, loading nothing until tapped");
    await page.click('.leaflet-popup-content [data-pw]');
    await page.waitForTimeout(300);
    const src = await page.evaluate(() => document.querySelector('.leaflet-popup-content .pwidget iframe')?.getAttribute('src') || '');
    check(/^https:\/\/widget\.example\/w\?ss=[^&]+&in=\d{4}-\d\d-\d\d&out=\d{4}-\d\d-\d\d&lang=en$/.test(src), `tapping it loads the partner's panel for that hotel and dates (${src.slice(0, 60)}…)`);
    check(!errors.length, `night prices: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await axe(page, 'hotel card with the partner panel');
    await ctx.close();
  }
  // Hotel prices (Xotelo, data/hotel_prices.json): every other place priced today, one priced too long ago (hidden).
  if (await readFile(join(ROOT, 'data/hotels.json')).then(() => true).catch(() => false)) {
    const hs = JSON.parse(await readFile(join(ROOT, 'data/hotels.json'), 'utf8')).hotels;
    const today = new Date().toISOString().slice(0, 10), old = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10);
    const rows = hs.filter((h, i) => i % 2 === 0).map((h, i) => [h[0], h[4], h[5], 300 + (i * 37) % 900, 2, 250 + (i * 37) % 900, 350 + (i * 37) % 900, i === 0 ? old : today]);
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/data\/hotel_prices\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ fetched: today, source: 'Xotelo test', currency: 'AED', keep_days: 10, hotels: rows }) }));
    // 35 days of price history for every area: 300 rising to 334 (+10% over the last four weeks' comparison window).
    const histDays = Array.from({ length: 35 }, (_, i) => ({ d: new Date(Date.now() - (34 - i) * 864e5).toISOString().slice(0, 10), v: 300 + i }));
    await page.route(/data\/stay_history\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ days: histDays.map(x => ({ d: x.d,
      hotels: { all: [x.v, 50], areas: new Proxy({}, {}) } })) }) }));
    // Google Hotels via SerpApi: a hotel Xotelo hasn't priced (index 1), and one vacation rental for the Holiday homes view.
    await page.route(/data\/serp_stays\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ fetched: today, keep_days: 10,
      hotels: [[hs[1][0], hs[1][4], hs[1][5], 444, 1, 444, 444, today, 4.6, 80, 4]], homes: [['Google Rental Test', 25.0805, 55.1405, 777, 1, 777, 777, today, 4.8, 12, 'https://example.com/listing', 'g:test']] }) }));
    await page.goto(BASE + '?view=hotels');
    await page.waitForFunction(() => window.atlasState === 'ready' && HOTEL_PRICES && SERP && HOTELS && hotelPriced(), null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => draw());
    await page.waitForTimeout(400);
    const v = await page.evaluate(() => {
      const g = [...hotelsBy().entries()].filter(([, x]) => x.prices.length > 1).sort((a, b) => b[1].prices.length - a[1].prices.length)[0];
      return { kind: document.getElementById('dialKind').textContent, on: !document.getElementById('dialBox').classList.contains('off'), lo: document.getElementById('dialMin').textContent, hi: document.getElementById('dialMax').textContent,
        labels: [...document.querySelectorAll('.rl b')].map(e => e.textContent), staleHidden: HOTELS[0].price === null, area: g && g[0] };
    });
    check(v.on && /Median a night/.test(v.kind) && v.lo && v.hi && v.labels.length && v.labels.every(t => /AED/.test(t)) && v.staleHidden,
      `hotel prices: the dial shows the median a night between the lowest and highest area (${v.lo}–${v.hi}); labels are prices; a price older than 10 days is not shown`);
    const sec = await page.evaluate(a => { const d = document.createElement('div'); d.innerHTML = hotelSection(byLabel(a)); return d.textContent; }, v.area);
    check(/From AED [\d,]+ to [\d,]+ a night/.test(sec) && /Typical hotel price AED/.test(sec), `an area's card gives its typical hotel price and its range (${v.area})`);
    const tr = await page.evaluate(a => { STAY_HIST.days.forEach((d, i) => { d.hotels.areas = { [a]: [d.hotels.all[0], 4] }; });
      const box = document.createElement('div'); box.innerHTML = hotelSection(byLabel(a)); return { text: box.textContent, svg: !!box.querySelector('.trend svg.chart') }; }, v.area);
    check(tr.svg && /Typical hotel price a night, \d{1,2} \w{3} to \d{1,2} \w{3}/.test(tr.text) && /\+\d+% since \d{1,2} \w{3}/.test(tr.text),
      `an area's card draws its hotel price history and the change over four weeks (${(tr.text.match(/[+-]\d+% since \d{1,2} \w{3}/) || [''])[0]})`);
    await page.evaluate(() => openHotel(HOTELS.find(h => h.src === 'xotelo')));
    await page.waitForTimeout(300);
    const card = await page.evaluate(() => document.querySelector('.leaflet-popup-content').textContent);
    check(/Average AED [\d,]+ a night/.test(card) && /Lowest price on booking sites/.test(card) && /Nights? of \d{1,2} \w{3}/.test(card), "a priced hotel's card gives its average, its range and the nights priced");
    // The side panel follows the view: no home picker or rent check, nightly figures, a prices-by-area table.
    const pan = await page.evaluate(() => { const vis = el => !!el && getComputedStyle(el).display !== 'none' && !el.closest('[hidden]');
      return { home: vis(document.querySelector('.controls .f-home')), check: vis(document.getElementById('companion')), facts: vis(document.getElementById('stayFacts')), rentFacts: vis(document.querySelector('.facts:not(.stayFacts)')),
        range: document.getElementById('rangeLbl').textContent, med: document.getElementById('sfMed').textContent, title: document.getElementById('tableTitle').textContent, rows: document.querySelectorAll('#rows button[data-area]').length,
        first: +((document.querySelector('#rows tr td:nth-child(2)') || {}).textContent || '0').replace(/,/g, ''), second: +((document.querySelector('#rows tr:nth-child(2) td:nth-child(2)') || {}).textContent || '0').replace(/,/g, '') }; });
    check(!pan.home && !pan.check && pan.facts && !pan.rentFacts && /Nightly budget/.test(pan.range) && /AED [\d,]+/.test(pan.med) && /Hotel prices by area/.test(pan.title) && pan.rows > 3 && pan.first <= pan.second,
      `the side panel follows the Hotels view: nightly budget, nightly figures (${pan.med}), "${pan.title}" cheapest first (${pan.rows} areas)`);
    // The nightly budget filters areas by their typical price; the rent view keeps its own (empty) budget.
    const bud = await page.evaluate(async () => { const all = POINTS.length, lim = String(Math.round(median(POINTS.map(p => p.v)))); $('max').value = lim; draw(); const n = POINTS.length, ok = POINTS.every(p => p.v <= +lim), note = document.getElementById('budgetNote').textContent;
      $('metric').value = 'median'; $('metric').dispatchEvent(new Event('change')); const rentMax = $('max').value, home = getComputedStyle(document.querySelector('.controls .f-home')).display !== 'none';
      $('metric').value = 'hotels'; $('metric').dispatchEvent(new Event('change')); const back = $('max').value; $('max').value = ''; draw(); return { all, n, ok, note, rentMax, home, back, lim }; });
    check(bud.n > 0 && bud.n < bud.all && bud.ok && /a night/.test(bud.note) && bud.rentMax === '' && bud.home && bud.back === bud.lim,
      `the nightly budget keeps ${bud.n} of ${bud.all} areas (typical AED ${bud.lim} a night or less); the rent view keeps its own budget and its home picker`);
    await page.waitForFunction(() => HOMES && HOMES.some(x => x.src === 'google'), null, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => { map.closePopup(); openHotel(HOTELS[1]); });
    await page.waitForTimeout(400);
    const gg = await page.evaluate(() => { const h = HOTELS[1], t = [...document.querySelectorAll('.leaflet-popup-content')].map(e => e.textContent).join(' ');
      const r = (HOMES || []).find(x => x.src === 'google'); return { src: h.src, price: h.price, card: t, rental: !!r }; });
    check(gg.src === 'google' && gg.price === 444 && /Google Hotels, via SerpApi/.test(gg.card) && /Lowest rate on Google Hotels/.test(gg.card) && gg.rental,
      `Google Hotels (SerpApi) fills a hotel Xotelo has no price for, says so on its card, and adds its vacation rentals to Holiday homes (${gg.src}, ${gg.price}, rental ${gg.rental})`);
    check(!errors.length, `hotel prices: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }
  // Holiday homes (Xotelo, data/holiday_homes.json): their own view, priced on the blue scale, with their own dots and cards.
  if (await readFile(join(ROOT, 'data/holiday_homes.json')).then(() => true).catch(() => false)) {
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const today = new Date().toISOString().slice(0, 10);
    const src = JSON.parse(await readFile(join(ROOT, 'data/holiday_homes.json'), 'utf8'));
    src.homes = src.homes.map(r => Object.assign([...r], { 7: today }));  // dated today, so none is hidden as old
    await page.route(/data\/holiday_homes\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(src) }));
    await page.goto(BASE + '?view=homes');
    await page.waitForFunction(() => window.atlasState === 'ready' && HOMES && $('metric').value === 'homes', null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => draw());
    await page.waitForTimeout(400);
    const v = await page.evaluate(() => ({ btn: !!document.querySelector('.views button[data-m="homes"]:not([hidden])'), pressed: document.querySelector('.views button[data-m="homes"]')?.getAttribute('aria-pressed'),
      dots: document.querySelectorAll('.hhdot').length, hotelDots: document.querySelectorAll('.hdot').length, n: HOMES.length, zoom: map.getZoom(),
      labels: [...document.querySelectorAll('.rl b')].map(e => e.textContent), badges: [...document.querySelectorAll('.rl')].map(e => e.style.getPropertyValue('--c')),
      kind: document.getElementById('dialKind').textContent, legend: document.getElementById('legend').textContent,
      area: [...homesBy().keys()][0] }));
    check(v.btn && v.pressed === 'true' && (v.zoom < 12 ? v.dots === 0 : v.dots === v.n) && v.hotelDots === 0 && v.labels.length && v.labels.every(t => /AED/.test(t)) && v.badges.every(c => /--b[1-6]/.test(c)) && /Median a night/.test(v.kind) && /Typical holiday home price/.test(v.legend),
      `holiday homes: their own view (${v.n} places, own dots, no hotel dots), prices on the blue key, the dial and legend say so`);
    const sec = await page.evaluate(a => { const d = document.createElement('div'); d.innerHTML = homeSection(byLabel(a)); return d.textContent; }, v.area);
    check(/Typical holiday home price AED [\d,]+ a night/.test(sec) && /holiday homes? with a price/.test(sec), `an area's card gives its typical holiday home price (${v.area})`);
    await page.evaluate(() => openHome(HOMES[0]));
    await page.waitForTimeout(300);
    const card = await page.evaluate(() => { const c = document.querySelector('.leaflet-popup-content'); return { text: c.textContent, ta: !!c.querySelector('a[href^="https://www.tripadvisor."]') }; });
    check(/Serviced apartment or holiday home/.test(card.text) && /Average AED [\d,]+ a night/.test(card.text) && card.ta, "a holiday home's card gives its kind, rating, price and a Tripadvisor link");
    check(!errors.length, `holiday homes: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await axe(page, 'holiday homes view with a card open');
    await ctx.close();
  }
  // Phones, places-to-stay views: the view bar stays clear of the zoom buttons, and an area's list fits the sheet.
  if (await readFile(join(ROOT, 'data/holiday_homes.json')).then(() => true).catch(() => false)) {
    for (const w of [320, 375]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 780 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const today = new Date().toISOString().slice(0, 10);
      const src = JSON.parse(await readFile(join(ROOT, 'data/holiday_homes.json'), 'utf8'));
      src.homes = src.homes.map(r => Object.assign([...r], { 7: today }));
      await page.route(/data\/holiday_homes\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(src) }));
      await page.goto(BASE + '?view=homes');
      await page.waitForFunction(() => window.atlasState === 'ready' && HOMES, null, { timeout: 15000 }).catch(() => {});
      await page.evaluate(() => draw());
      await page.waitForTimeout(400);
      const bar = await page.evaluate(() => { const v = document.querySelector('.viewSw').getBoundingClientRect(), z = map.zoomControl.getContainer().getBoundingClientRect();
        return { clear: !(v.left < z.right && v.right > z.left && v.top < z.bottom && v.bottom > z.top), on: document.querySelector('.views button[aria-pressed="true"]')?.dataset.m }; });
      check(bar.clear && bar.on === 'homes', `${w} px: the view bar stays clear of the zoom buttons (five views; it scrolls)`);
      await page.evaluate(() => { const g = [...homesBy().entries()].sort((a, b) => b[1].list.length - a[1].list.length)[0]; focusArea(byLabel(g[0])); });
      await page.waitForTimeout(1600);
      const sh = await page.evaluate(() => { const s = document.querySelector('.areaSheet:not([hidden])'), t = s && s.querySelector('.htab'), first = s && s.querySelector('.body').children[1];
        return { open: !!s, fits: !!t && t.getBoundingClientRect().right <= s.getBoundingClientRect().right + 1 && s.scrollWidth <= s.clientWidth + 1, leads: !!first && first.classList.contains('hsec') }; });
      check(sh.open && sh.fits && sh.leads, `${w} px: a holiday home area's sheet leads with its prices and its list fits the screen`);
      await ctx.close();
    }
  }
  // Phones, English and Arabic: every view shows as a chip above the map; an area's sheet leads with its figures.
  for (const [w, q] of [[320, '?lang=ar'], [390, '']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 780 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE + q);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const ch = await page.evaluate(() => { const bs = [...document.querySelectorAll('.viewChips button[data-m]')].filter(b => !b.hidden), m = document.getElementById('map').getBoundingClientRect();
      return { n: bs.length, have: [...document.getElementById('metric').options].filter(o => document.querySelector('.views button[data-m="' + o.value + '"]')).length, inside: bs.every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= m.top + 1; }),
        metro: !!document.querySelector('.viewSw .metroBtn'), inZoom: !!map.zoomControl.getContainer().querySelector('.metroBtn') }; });
    check(ch.n >= 3 && ch.n === ch.have && ch.inside && ch.metro && !ch.inZoom, `${w} px${q ? ' (Arabic)' : ''}: all ${ch.n} views show as chips above the map; Metro sits with the map's layer switch, not the zoom stack`);
    await page.evaluate(() => focusArea(AREAS.filter(a => a.lat != null).sort((a, b) => b.n - a.n)[0]));
    await page.waitForTimeout(1600);
    const order = await page.evaluate(() => { const b = document.querySelector('.areaSheet:not([hidden]) .body'); if (!b) return null; const kids = [...b.children];
      const see = kids.findIndex(k => k.classList.contains('see')), fig = kids.findIndex(k => /AED [\d,]+/.test(k.textContent) && !k.classList.contains('see')); return { see, fig }; });
    check(order && order.fig > 0 && order.see > order.fig, `${w} px${q ? ' (Arabic)' : ''}: an area's sheet leads with its figures, the Google links below`);
    await ctx.close();
  }
  // Sharing a card: a line of text and a link; the link reopens that card (an area, a hotel) in the same view.
  {
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    const a = await page.evaluate(() => AREAS.filter(x => x.lat != null).sort((p, q) => q.n - p.n)[0].label);
    await page.evaluate(l => focusArea(byLabel(l)), a);
    await page.waitForTimeout(1500);
    const line = await page.evaluate(() => { const p = document.querySelector('.leaflet-popup-content .shareLine'); return p && p.textContent; });
    await page.click('.leaflet-popup-content [data-share]');
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    const url = (clip.match(/https?:\/\/\S+/) || [''])[0];
    check(/Send this area to someone:/.test(line || '') && /median rent AED [\d,]+ a year/.test(clip) && /[?&]open=a:/.test(url) && url.startsWith(BASE),
      `an area's card has a share line; the link and a line of text are copied (${clip.split('\n')[0].slice(0, 70)})`);
    const p2 = await ctx.newPage();
    await p2.goto(url);
    await p2.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await p2.waitForTimeout(2500);
    const opened = await p2.evaluate(() => { const t = document.querySelector('.leaflet-popup-content .t'); return t && t.dataset.label; });
    check(opened === a, `the shared link opens that area's card (${opened})`);
    await p2.waitForFunction(() => typeof HOTELS !== 'undefined' && HOTELS && HOTELS.some(h => h.price), null, { timeout: 10000 }).catch(() => {});
    if (await p2.evaluate(() => typeof HOTELS !== 'undefined' && !!(HOTELS && HOTELS.some(h => h.price)))) {
      const key = await p2.evaluate(() => { const h = HOTELS.find(x => x.price); return h.name + '|' + h.lat + '|' + h.lng; });
      const hurl = BASE + '?view=hotels&open=h:' + encodeURIComponent(key);
      await p2.goto(hurl);
      await p2.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
      await p2.waitForTimeout(3500);
      const hc = await p2.evaluate(() => { const c = document.querySelector('.leaflet-popup-content'); return c ? c.textContent : ''; });
      check(/Send this hotel to someone:/.test(hc) && hc.includes(key.split('|')[0]), 'a shared hotel link opens that hotel\'s card');
    }
    await ctx.close();
  }
  // In the Sale price and Yield views an area's card leads with that figure; rent appears as "annual rent" and the
  // rent breakdown folds under "Annual rents in this area".
  {
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 } });
    const page = await ctx.newPage();
    // Rent view: rent leads; sales are one small line with a button to the Sale price view, no sale chart.
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => focusArea(AREAS.filter(x => x.lat != null && x.sale_median && x.yield_pct != null).sort((p, q) => q.n - p.n)[0]));
    await page.waitForTimeout(1600);
    const rc = await page.evaluate(() => { const e = document.querySelector('.leaflet-popup-content'), lead = e.querySelector('p.lead') || e.querySelector('p.allh');
      return { lead: (lead || {}).textContent || '', note: (e.querySelector('.salesNote') || {}).textContent || '', btn: !!e.querySelector('.salesNote [data-view="sale"]'), chart: /Sale price per sq ft/.test(e.textContent) }; });
    check(/a year/.test(rc.lead) && !/sale price/i.test(rc.lead) && /Buying here: median sale price AED/.test(rc.note) && rc.btn && !rc.chart,
      `Rent view: the card leads with rent; sales are one small line with a button to sale prices (${rc.note.slice(0, 70)})`);
    for (const v of ['sale', 'yield']) {
      await page.goto(BASE + '?view=' + v);
      await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
      const c = await page.evaluate(m => { const a = AREAS.filter(x => x.lat != null && x.sale_median && x.yield_pct != null).sort((p, q) => q.n - p.n)[0]; focusArea(a); return a.label; }, v);
      await page.waitForTimeout(1600);
      const card = await page.evaluate(() => { const e = document.querySelector('.leaflet-popup-content'); const d = e && e.querySelector('details.rentMore');
        const lead = e && [...e.children].find(k => k.matches('p.lead,p.allh')); return e ? { lead: lead ? lead.textContent : '', folded: !!d && !d.open, sum: d ? d.querySelector('summary').textContent : '' } : null; });
      const ok = v === 'sale' ? /median sale price AED [\d,]+|Median sale price AED [\d,]+/.test(card.lead) && /annual rent/i.test(card.lead) : /gross yield [\d.]+%|Gross yield [\d.]+%/i.test(card.lead) && /annual rent/i.test(card.lead);
      check(card && ok && card.folded && /Annual rents in this area/.test(card.sum), `${v === 'sale' ? 'Sale price' : 'Yield'} view: ${c}'s card leads with ${v === 'sale' ? 'its sale price' : 'its yield'}; rent says "annual rent" and folds away (${card && card.lead.slice(0, 60)})`);
    }
    await ctx.close();
  }
  // Exploring for fun (fun.js): facts strip, tips, Guess the rent, the tour, "You", the slider, Save as image,
  // Rent or buy, the card's headline fact, the stay finder.
  {
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready' && document.querySelectorAll('.funChip[data-fact]').length > 0, null, { timeout: 15000 }).catch(() => {});
    const st = await page.evaluate(() => ({ facts: [...document.querySelectorAll('.funChip[data-fact]')].map(b => b.textContent), tip: (document.querySelector('.funTip') || {}).textContent || '' }));
    check(st.facts.length >= 3 && st.facts.every(t => /AED|%|contracts/.test(t)) && /Tip 1 of 3/.test(st.tip), `"Dubai right now": ${st.facts.length} facts from the data, and the first tip (${(st.facts[0] || '').slice(0, 50)})`);
    await page.click('.funChip[data-fact="0"]');
    await page.waitForTimeout(1800);
    check(await page.evaluate(() => !!document.querySelector('.leaflet-popup-content .t')), 'tapping a fact flies the map to its answer and opens it');
    await page.click('[data-tip-next]'); await page.click('[data-tip-next]'); await page.click('[data-tip-next]');
    check(await page.evaluate(() => !document.querySelector('.funTip') && localStorage.getItem('funTip') === '3'), 'the three tips step through and stay gone');
    // Guess the rent: reveal says how close, with no score.
    await page.click('[data-guess]');
    await page.evaluate(() => { const i = document.getElementById('guessIn'); i.value = i.min; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('[data-reveal]');
    const gr = await page.evaluate(() => document.getElementById('guessBox').textContent);
    check(/rents for AED [\d,]+ a year/.test(gr) && /(low|high|Spot on)/.test(gr) && !/score|points|streak/i.test(gr), `Guess the rent reveals the answer and how close the guess was (${gr.match(/Your guess[^.]*\./) || 'spot on'})`);
    // The tour: stops with captions, moved on by the visitor.
    await page.click('[data-tour]');
    await page.waitForTimeout(600);
    const t1 = await page.evaluate(() => document.querySelector('.tourBox:not([hidden]) .tStep')?.textContent || '');
    await page.click('[data-tour-next]');
    await page.waitForTimeout(600);
    const t2 = await page.evaluate(() => document.querySelector('.tourBox .tStep')?.textContent || '');
    await page.keyboard.press('Escape');
    check(/Stop 1 of [4-6]/.test(t1) && /Stop 2 of/.test(t2) && await page.evaluate(() => document.querySelector('.tourBox').hidden), `the tour steps through its stops and ends on Escape (${t1})`);
    // "You" after a rent check with a rent.
    const you = await page.evaluate(() => { const a = AREAS.filter(x => x.lat != null).sort((p, q) => q.n - p.n)[0]; document.dispatchEvent(new CustomEvent('atlas:mine', { detail: { area: a.label, unit: a.by_unit[0].u, rent: a.by_unit[0].median * 1.1 } }));
      return document.querySelector('.you')?.textContent || ''; });
    check(/You: AED [\d.k]+ · 10% above/.test(you), `after a rent check, "You" shows on the map (${you})`);
    // The slider sets the Max box and the map follows.
    const sl = await page.evaluate(async () => { const all = POINTS.length, i = document.getElementById('bsIn'); const v = Math.round(median(POINTS.map(p => p.v)) / 1000) * 1000;
      i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 450));
      const out = { all, n: POINTS.length, max: document.getElementById('max').value, txt: document.getElementById('bsTxt').textContent, v };
      i.value = i.max; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 450)); out.back = POINTS.length; out.maxBack = document.getElementById('max').value; return out; });
    check(sl.max === String(sl.v) && sl.n > 0 && sl.n < sl.all && /Up to AED [\d,]+ a year/.test(sl.txt) && sl.back === sl.all && sl.maxBack === '', `the map's budget slider sets the Max box (${sl.txt}: ${sl.n} of ${sl.all} areas) and clears it at the end`);
    // Sale price card: the headline fact, Rent or buy.
    await page.evaluate(() => { const s = document.getElementById('metric'); s.value = 'sale'; s.dispatchEvent(new Event('change')); });
    await page.evaluate(() => focusArea(AREAS.filter(x => x.lat != null && x.sale_median && !x.staff).sort((p, q) => p.sale_median - q.sale_median)[0]));
    await page.waitForTimeout(1600);
    const card = await page.evaluate(() => { const c = document.querySelector('.leaflet-popup-content'); const d = c.querySelector('details.rob'); if (d) d.open = true;
      const inp = d && d.querySelector('[data-rob="d"]'); if (inp) { inp.value = 50; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      return { fact: (c.querySelector('.hfact') || {}).textContent || '', rob: d ? d.textContent : '' }; });
    check(/cheapest|dearest|best/i.test(card.fact) && /Rent or buy\?/.test(card.rob) && /50% deposit/.test(card.rob) && /years of rent/.test(card.rob), `a card has a headline fact (${card.fact}) and Rent or buy follows its sliders`);
    // Save as image downloads a picture of the card.
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('.leaflet-popup-content [data-img]')]);
    check(!!dl && /\.png$/.test(dl.suggestedFilename()), `Save as image makes a picture of the card (${dl ? dl.suggestedFilename() : 'none'})`);
    // Hotels: the stay finder lists the cheapest, and the rating filter narrows it.
    await page.evaluate(() => { const s = document.getElementById('metric'); if ([...s.options].some(o => o.value === 'hotels')) { s.value = 'hotels'; s.dispatchEvent(new Event('change')); } });
    await page.waitForTimeout(500);
    const fd = await page.evaluate(() => { const f = document.querySelector('.finder'); if (!f || f.hidden) return null; const n0 = f.querySelectorAll('li').length, p0 = [...f.querySelectorAll('li span')].map(s => +s.textContent.match(/AED ([\d,]+)/)[1].replace(/,/g, ''));
      const sel = document.getElementById('fRate'); sel.value = '4.5'; sel.dispatchEvent(new Event('change', { bubbles: true })); return { n0, sorted: p0.every((v, i) => !i || v >= p0[i - 1]), n1: f.querySelectorAll('li').length, txt: f.textContent }; });
    check(fd === null || (fd.n0 > 0 && fd.sorted && /Find a hotel/.test(fd.txt)), `Hotels: the stay finder lists the cheapest first${fd ? ' (' + fd.n0 + ', then ' + fd.n1 + ' rated 4.5+)' : ' (no hotel prices here)'}`);
    check(!errors.length, `fun features: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await axe(page, 'fun features (Hotels view with the finder)');
    await ctx.close();
  }
  // Review round (20 Nov): the card's actions stay in view, the tip fits a phone, the facts follow the map on phones,
  // the exact budget folds away, the header links to the market pages, and Arabic downloads only for Arabic pages.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 760 } });
    const page = await ctx.newPage();
    const asked = [];
    page.on('request', r => asked.push(r.url()));
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    check(!asked.some(u => /i18n-ar\.js/.test(u)), 'English page: the Arabic tables are not downloaded');
    const nav = await page.evaluate(() => [...document.querySelectorAll('.siteNav a')].map(a => a.getAttribute('href')).join(' '));
    check(/stats\/ areas\/ yields\//.test(nav), `the header links to the market pages (${nav})`);
    await page.evaluate(() => focusArea(AREAS.filter(a => a.lat != null && a.by_unit.length > 4).sort((p, q) => q.n - p.n)[0]));
    await page.waitForTimeout(1500);
    const act = await page.evaluate(() => { const b = document.querySelector('.leaflet-popup .ck-popact .btn'), box = document.querySelector('.leaflet-popup-content');
      if (!b || !box) return null; const r = b.getBoundingClientRect(), q = box.getBoundingClientRect();
      return { inside: r.top >= q.top - 1 && r.bottom <= q.bottom + 1, scrolls: box.scrollHeight > box.clientHeight + 2, folds: document.querySelectorAll('.leaflet-popup details.cardMore').length }; });
    check(act && act.inside && act.folds === 1, `desktop card: "Check a rent here" stays fully in view${act && act.scrolls ? ' while the card scrolls' : ''}, details folded under "Details and sources"`);
    await ctx.close();
    const ph = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await ph.goto(BASE);
    await ph.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await ph.waitForTimeout(1200);
    const lay = await ph.evaluate(() => { const top = e => e ? e.getBoundingClientRect().top + scrollY : null, tip = document.querySelector('.funTip'), strip = document.querySelector('.funStrip');
      return { map: top(document.querySelector('.mapWrap')), strip: top(strip), stripW: strip ? strip.getBoundingClientRect().width : 0, tipR: tip ? tip.getBoundingClientRect().right : 0,
        side: document.getElementById('dialSide').offsetParent !== null, fold: !document.querySelector('details.f-range').open, check: top(document.getElementById('companion')) }; });
    check(lay.strip > lay.map && lay.stripW <= 390 && lay.tipR <= 390 && !lay.side && lay.fold && lay.map < 560 && lay.check > lay.map,
      `phone: the map starts at ${Math.round(lay.map)} px (small dial, Home and Near on one row, budget folded); the rent check and the facts come after it; the tip fits the screen`);
    await ph.context().close();
    const ar = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const askedAr = [];
    ar.on('request', r => askedAr.push(r.url()));
    await ar.goto(BASE + '?lang=ar&max=60000');
    await ar.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    const arOk = await ar.evaluate(() => ({ title: document.getElementById('title').textContent, nav: document.querySelector('.siteNav a').getAttribute('href'), fold: document.querySelector('details.f-range').open }));
    check(askedAr.some(u => /i18n-ar\.js/.test(u)) && /أطلس/.test(arOk.title) && arOk.nav === 'ar/stats/' && arOk.fold,
      'Arabic page: the tables download, the page is in Arabic, the header links to the Arabic market pages, and a shared budget opens its boxes');
    await ar.context().close();
  }
  // Second critique (22 Nov): big groups speak for their busiest area, ratings to one decimal, tips fit the view,
  // the key's price history folds away.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const g = await page.evaluate(() => { const big = [...document.querySelectorAll('.rl.grp small')].map(e => e.textContent);
      return { big: big.filter(t => /more nearby/.test(t)), avg: big.filter(t => /\+ (9|[1-9]\d) areas/.test(t)) }; });
    check(g.avg.length === 0, `phone, all of Dubai: no label averages more than 8 areas${g.big.length ? ' (e.g. "' + g.big[0] + '")' : ''}`);
    const st = await page.evaluate(async () => { const s = document.getElementById('metric'); s.value = 'homes'; s.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 1500));
      const tip = (document.querySelector('.funTip') || {}).textContent || '', txt = document.body.innerText;
      return { tip, long: (txt.match(/rated \d\.\d{2,}/) || [''])[0], fold: !!document.querySelector('.legend details.trendFold:not([open])') || !document.querySelector('.legend .trend') }; });
    check(!/with Home/.test(st.tip) && !st.long && st.fold, `Holiday homes: the tip is about places to stay, ratings have one decimal, the key's price history is folded (${st.tip.slice(0, 40)})`);
    await ctx.close();
  }
  // Peaks (24 Nov): rent as a mountain range, a sixth button in the view bar.
  {
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    if (await page.evaluate(() => !!window.maplibregl && !document.querySelector('.views .peaksBtn').hidden)) {
      await page.click('.views .peaksBtn');
      await page.waitForTimeout(6000);
      const pk = await page.evaluate(() => { const busy = AREAS.filter(a => a.lat != null && !a.staff && (a.n || 0) >= 1000 && areaValue(a, 'median', $('unit').value) != null)
          .sort((p, q) => areaValue(q, 'median', $('unit').value) - areaValue(p, 'median', $('unit').value));
        const hi = busy[0], lo = busy[busy.length - 1];
        return { open: !!document.querySelector('.map3d.peaks canvas'), pressed: document.querySelector('.views .peaksBtn').getAttribute('aria-pressed'),
          hiH: peaksHeight(hi.lat, hi.lng), loH: peaksHeight(lo.lat, lo.lng), sea: peaksHeight(24.6, 54.6), tops: document.querySelectorAll('.pk.top').length, lows: document.querySelectorAll('.pk.low').length,
          key: (document.querySelector('.pkKey') || {}).textContent || '', hiName: hi.label, loName: lo.label }; });
      // Peaks follows the view: switching to Hotels and Yield while it is open redraws it for that view.
      await page.click('.views button[data-m="hotels"]'); await page.waitForTimeout(4000);
      const ph = await page.evaluate(() => ({ key: (document.querySelector('.pkKey b') || {}).textContent || '', top: (document.querySelector('.pk.top b') || {}).textContent || '' }));
      await page.click('.views button[data-m="yield"]'); await page.waitForTimeout(4000);
      const py = await page.evaluate(() => ({ key: (document.querySelector('.pkKey b') || {}).textContent || '', top: (document.querySelector('.pk.top b') || {}).textContent || '', rings: document.querySelectorAll('.pk.low').length }));
      check(/hotel night/i.test(ph.key) && /^AED [\d,]+$/.test(ph.top) && /^Yield as mountains/.test(py.key) && /%$/.test(py.top) && py.rings === 0,
        `Peaks follows the view: "${ph.key}" (top ${ph.top}), then "${py.key}" (top ${py.top}, no value rings)`);
      await page.click('.views button[data-m="median"]'); await page.waitForTimeout(800);
      await page.click('.map3d.peaks .m3x'); await page.waitForTimeout(300);
      const back = await page.evaluate(() => !document.querySelector('.map3d') && document.querySelector('.views .peaksBtn').getAttribute('aria-pressed') === 'false');
      check(pk.open && pk.pressed === 'true' && pk.hiH > pk.loH + 1000 && pk.sea === 0 && pk.tops >= 3 && pk.lows >= 2 && /Rent as mountains/.test(pk.key) && back,
        `Peaks: rent as mountains (${pk.hiName} ${Math.round(pk.hiH)} m, ${pk.loName} ${Math.round(pk.loH)} m, open sea 0), ${pk.tops} peaks named, ${pk.lows} good-value rings; Back to the map returns`);
    } else check(true, 'Peaks: no WebGL in this browser, so the button stays hidden');
    check(!errors.length, `Peaks: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }
  // Street (28 Nov): walk at eye level with each nearby area's prices on signs (street.js), opened from an area's card.
  {
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    if (await page.evaluate(() => !!window.maplibregl && !document.querySelector('.stBtn').hidden)) {
      const area = await page.evaluate(() => { const a = AREAS.filter(x => x.lat != null && !x.staff && (x.by_unit || []).some(u => u.median && u.sale)).sort((p, q) => q.n - p.n)[0]; focusArea(a); return a.label; });
      await page.waitForTimeout(1200);
      const link = await page.$(`[data-walk="${area}"]`);
      check(!!link, `Street: "${area}" card has a "Walk the streets here" link`);
      if (link) await link.click(); else await page.evaluate(l => openStreet(AREAS.find(a => a.label === l)), area);
      await page.waitForTimeout(6000);
      const s1 = await page.evaluate(() => { const m = streetMap(), g = document.querySelector('.stGoogle');
        return { open: !!document.querySelector('.map3d.street canvas'), pressed: document.querySelector('.stBtn').getAttribute('aria-pressed'), pitch: m.getPitch(), zoom: m.getZoom(),
          here: (streetHere() || {}).label, panel: document.querySelector('.stHere').textContent, signs: document.querySelectorAll('.stSign').length,
          sign: (document.querySelector('.stSign') || {}).textContent || '', google: g ? g.href : '', c: m.getCenter(),
          pad: [...document.querySelectorAll('.stPad button')].every(b => b.getAttribute('aria-label')) }; });
      check(s1.open && s1.pressed === 'true' && s1.pitch > 75 && s1.zoom > 19 && s1.here === area && /You are in/.test(s1.panel) && /Rent a year/.test(s1.panel) && /To buy/.test(s1.panel)
        && s1.signs >= 2 && /AED/.test(s1.sign) && /map_action=pano&viewpoint=25\.\d+,55\.\d+&heading=\d+/.test(s1.google) && s1.pad,
        `Street: eye level (pitch ${Math.round(s1.pitch)}, zoom ${s1.zoom.toFixed(1)}) in ${s1.here}, its rents and sale prices in the panel, ${s1.signs} price signs, Google Street View link, labelled pad`);
      await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowUp');
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(800); await page.keyboard.up('ArrowRight');
      const s2 = await page.evaluate(() => ({ c: streetMap().getCenter() }));
      const moved = Math.hypot((s2.c.lat - s1.c.lat) * 111320, (s2.c.lng - s1.c.lng) * 100900);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      const back = await page.evaluate(() => !document.querySelector('.map3d') && document.querySelector('.stBtn').getAttribute('aria-pressed') === 'false' && map.getZoom() >= 15);
      check(moved > 3 && back, `Street: the arrow keys walk (${Math.round(moved)} m), Escape returns to the map at that spot`);
    } else check(true, 'Street: no WebGL in this browser, so the button stays hidden');
    check(!errors.length, `Street: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }
  // Bus and Boats (routes.js, data/routes.json from RTA's GTFS feed): two layer switches beside Metro.
  if (existsSync(join(ROOT, 'data/routes.json'))) {
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await page.click('.busBtn'); await page.click('.boatBtn');
    await page.waitForFunction(() => window.routesData && routesData(), null, { timeout: 10000 }).catch(() => {});
    const st = await page.evaluate(async () => { const d = routesData(), s = routesState();
      const stop = d.bus.stops.find(x => x[4].length >= 3), rid = stop[4][0];
      map.setView([stop[0], stop[1]], 15, { animate: false }); await new Promise(r => setTimeout(r, 400));
      const shown = routesState().stopsShown;
      openRouteStop('bus', stop); await new Promise(r => setTimeout(r, 300));
      const card = document.querySelector('.leaflet-popup-content'), chips = [...card.querySelectorAll('[data-route]')].map(b => b.textContent);
      card.querySelector('[data-route]').click(); await new Promise(r => setTimeout(r, 900));
      const boat = d.marine.stations.find(x => x[4].length); openRouteStop('boat', boat); await new Promise(r => setTimeout(r, 300));
      const bcard = document.querySelector('.leaflet-popup-content').textContent;
      return { bus: s.bus, boat: s.boat, routes: d.bus.routes.length, stops: d.bus.stops.length, marine: d.marine.routes.length, shown, chips, rid, pick: routesState().pick,
        feed: /RTA timetable feed/.test(card.textContent), bcard, pressed: document.querySelector('.busBtn').getAttribute('aria-pressed') }; });
    check(st.bus && st.boat && st.pressed === 'true' && st.routes >= 100 && st.stops >= 1500 && st.marine >= 5,
      `Bus and Boats: ${st.routes} bus routes, ${st.stops} stops and ${st.marine} boat routes load when turned on`);
    check(st.shown && st.chips.length >= 3 && st.pick === st.rid && st.feed, `a bus stop's card lists its buses (${st.chips.slice(0, 5).join(', ')}…); a number picks its route out (${st.pick}); the card dates RTA's feed`);
    check(/Abra|Water bus|Ferry/.test(st.bcard), `a marine station's card names its boats (${st.bcard.slice(0, 70)})`);
    check(!errors.length, `Bus and Boats: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
    for (const [w, q] of [[390, ''], [320, '?lang=ar']]) {
      const pc = await browser.newContext({ viewport: { width: w, height: 800 } }); const pp = await pc.newPage();
      await pp.goto(BASE + q); await pp.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
      await pp.waitForTimeout(800);
      const bar = await pp.evaluate(() => { const v = document.querySelector('.viewSw').getBoundingClientRect(), z = map.zoomControl.getContainer().getBoundingClientRect();
        return { clear: v.left >= z.right || v.right <= z.left || v.top >= z.bottom, n: document.querySelectorAll('.viewSw .metroBtn:not([hidden])').length }; });
      const ar = q ? await pp.evaluate(async () => { showRoutes('bus', true); await new Promise(r => { const t = setInterval(() => { if (routesData()) { clearInterval(t); r(); } }, 100); });
        const s = routesData().bus.stops.find(x => x[3]); openRouteStop('bus', s); await new Promise(r => setTimeout(r, 300));
        return (document.querySelector('.areaSheet:not([hidden]) .t, .leaflet-popup-content .t') || {}).textContent === s[3]; }) : true;
      check(bar.clear && bar.n >= 3 && ar, `${w} px${q ? ' (Arabic)' : ''}: the layer switches (${bar.n}) sit beside the zoom buttons, not over them${q ? '; stop names in Arabic' : ''}`);
      await pc.close();
    }
  } else check(true, 'Bus and Boats: no routes.json loaded here, so the switches hide');
  // Ideas from other Dubai sites: currency on the map, sale price per sq ft, what's near, 3D.
  {
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // A stand-in lifestyle file: every area near a beach except the busiest one.
    await page.route(/data\/lifestyle\.json/, async r => { const a = JSON.parse(await readFile(join(ROOT, 'data/areas.json'), 'utf8')).areas.filter(x => x.lat != null).sort((p, q) => q.n - p.n);
      const areas = Object.fromEntries(a.map((x, i) => [x.label, { beach: i === 0 ? 9000 : 500, golf: 2500, park: 300, mall: 1200, schools: 12 }])); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ areas }) }); });
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    const cur = await page.evaluate(async () => { const before = document.querySelector('.rl b').textContent, sel = document.getElementById('cur');
      sel.value = 'USD'; sel.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 300));
      const after = document.querySelector('.rl b').textContent, unit = document.getElementById('dialUnit').textContent, eur = !document.querySelector('#cur option[value="EUR"]').hidden;
      sel.value = 'AED'; sel.dispatchEvent(new Event('change')); return { before, after, unit, eur }; });
    check(/^AED /.test(cur.before) && /^USD /.test(cur.after) && /USD/.test(cur.unit), `the currency switch shows the map in USD (${cur.before} → ${cur.after})${cur.eur ? ', EUR offered from today\'s rates' : ''}`);
    const psf = await page.evaluate(async () => { const s = document.getElementById('metric'); s.value = 'sale'; s.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 300));
      document.querySelector('[data-psf="sale_psf"]').click(); await new Promise(r => setTimeout(r, 300));
      return { metric: s.value, label: document.querySelector('.rl b').textContent, pressed: document.querySelector('.views button[data-m="sale"]').getAttribute('aria-pressed'), legend: document.getElementById('legend').textContent }; });
    check(psf.metric === 'sale_psf' && /\/sq ft/.test(psf.label) && psf.pressed === 'true' && /per sq ft/.test(psf.legend), `Sale price switches to per sq ft (${psf.label}), the Sale price button staying chosen`);
    const near = await page.evaluate(async () => { const s = document.getElementById('metric'); s.value = 'median'; s.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 300)); const all = POINTS.length, l = document.getElementById('walk'), opts = [...l.querySelectorAll('optgroup')].map(g => g.label + ': ' + [...g.children].map(o => o.value).join('|')); l.value = 'beach'; l.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 300));
      const out = { all, n: POINTS.length, note: document.getElementById('budgetNote').textContent, shown: !document.querySelector('.f-walk').hidden, opts, life: document.querySelectorAll('#life').length }; l.value = '0'; l.dispatchEvent(new Event('change')); return out; });
    check(near.shown && near.n === near.all - 1 && /near a beach/.test(near.note), `"Near: a beach" keeps the areas near one (${near.n} of ${near.all}): ${near.note.slice(0, 50)}`);
    check(near.life === 0 && near.opts.length === 2 && /10\|20/.test(near.opts[0]) && /beach\|golf\|park\|mall\|schools/.test(near.opts[1]), `one Near picker: Metro walks and places in one list (${near.opts.join('; ')})`);
    await page.evaluate(() => focusArea(AREAS.filter(x => x.lat != null).sort((p, q) => q.n - p.n)[1]));
    await page.waitForTimeout(1500);
    const life = await page.evaluate(() => (document.querySelector('.leaflet-popup-content .lifeLine') || {}).textContent || '');
    check(/Nearby: beach 500 m · golf course 2\.5 km · park 300 m · mall 1\.2 km · 12 schools within 2 km/.test(life), `an area's card says what's nearby (${life.slice(0, 60)})`);
    if (await page.evaluate(() => !!window.maplibregl && (!maplibregl.supported || maplibregl.supported()) && !document.querySelector('.d3Btn').hidden)) {
      await page.evaluate(() => map.closePopup()); await page.click('.d3Btn'); await page.waitForTimeout(1500);
      const d3 = await page.evaluate(() => ({ open: !!document.querySelector('.map3d canvas'), pressed: document.querySelector('.d3Btn').getAttribute('aria-pressed') }));
      await page.click('.m3x'); await page.waitForTimeout(300);
      const back = await page.evaluate(() => !document.querySelector('.map3d') && document.querySelector('.d3Btn').getAttribute('aria-pressed') !== 'true');
      check(d3.open && d3.pressed === 'true' && back, '3D opens a tilted map with raised buildings, and Back to 2D returns');
    } else check(true, '3D: no WebGL in this browser, so the button stays hidden');
    check(!errors.length, `these features: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await ctx.close();
  }
  // Backup source in use (Dubai Data stuck): the warning sign says so.
  {
    const ctx = await browser.newContext({ viewport: { width: 1350, height: 900 } });
    const page = await ctx.newPage();
    await page.route(/data\/meta\.json/, async r => { const res = await r.fetch(); const m = await res.json();
      m.backup = { since: '2026-11-01', days: 16, through: '2026-11-15' }; await r.fulfill({ response: res, json: m }); });
    await page.goto(BASE);
    await page.waitForFunction(() => window.atlasState === 'ready', null, { timeout: 15000 }).catch(() => {});
    const banner = await page.evaluate(() => { const e = document.getElementById('stale'); return e.classList.contains('on') ? e.textContent : ''; });
    check(/Backup figures in use/.test(banner) && /Continental Club/.test(banner), 'backup source: the warning sign says the figures come from Continental Club for now');
    await ctx.close();
  }
  // A link with the map's state opens that map: home, view and position.
  {
    const { page, errors } = await open(browser, { width: 1350, height: 900 }, 'light', '?home=homes:Studios&view=yield&at=25.08,55.15,13');
    const st = await page.evaluate(() => ({ home: document.getElementById('home').value, view: LABEL.metric, z: map.getZoom(), c: map.getCenter() }));
    check(st.home === 'homes|Studios' && st.view === 'yield' && st.z === 13 && Math.abs(st.c.lat - 25.08) < 0.01, `a link with ?home=…&view=…&at=… opens that map (${st.home}, ${st.view}, zoom ${st.z})`);
    check(!errors.length, `link state: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await page.context().close();
  }
  // Near me: in Dubai the map moves there and marks it; elsewhere it says so and stays.
  for (const [where, geolocation] of [['Dubai Marina', { latitude: 25.08, longitude: 55.14 }], ['London', { latitude: 51.5, longitude: -0.12 }]]) {
    const { page } = await open(browser, { width: 390, height: 844 }, 'light', '', { geolocation, permissions: ['geolocation'] });
    await page.click('.leaflet-control-zoom a.near');
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => ({ z: map.getZoom(), c: map.getCenter(), you: !!document.querySelector('path.you'), note: document.querySelector('.mapNote:not([hidden])')?.textContent || '' }));
    if (where === 'London') check(!r.you && /outside Dubai/.test(r.note), `"Near me" from London says you seem to be outside Dubai and leaves the map`);
    else check(r.you && r.z === 14 && Math.abs(r.c.lat - 25.08) < 0.01, `"Near me" in Dubai Marina moves the map there and marks the spot (zoom ${r.z})`);
    await page.context().close();
  }
  // A full breakdown (all homes, photos) opened near the top-right buttons stays whole inside the map and clear of
  // every control, at window sizes where it is taller than the clear space (it scrolls inside instead).
  for (const vp of [{ width: 960, height: 620 }, { width: 1100, height: 680 }, { width: 1350, height: 760 }, { width: 1440, height: 900 }]) {
    const { page } = await open(browser, vp);
    await page.selectOption('#home', 'homes|');
    await page.evaluate(() => document.getElementById('map').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    const fit = await page.evaluate(async () => {
      const a = AREAS.find(x => x.label === 'International City Phase 1') || AREAS.find(x => x.lat != null && x.by_unit.length > 3);
      const s = map.getSize(); map.setView([a.lat, a.lng], 14, { animate: false }); map.panBy([-s.x * .35, s.y * .4], { animate: false });
      L.popup({ maxWidth: 320 }).setLatLng([a.lat, a.lng]).setContent(popup(a)).openOn(map);
      await new Promise(r => setTimeout(r, 1200)); // photos arrive (stubbed), the card re-fits
      const m = map.getContainer().getBoundingClientRect(), pr = document.querySelector('.leaflet-popup-content-wrapper').getBoundingClientRect();
      const hits = [...document.querySelectorAll('.leaflet-control,.legend')].map(e => e.getBoundingClientRect())
        .filter(c => c.width && pr.left < c.right && c.left < pr.right && pr.top < c.bottom && c.top < pr.bottom).length;
      return { inside: pr.top >= m.top - 1 && pr.bottom <= m.bottom + 1 && pr.left >= m.left - 1 && pr.right <= m.right + 1, hits, h: Math.round(pr.height), mh: Math.round(m.height) };
    });
    check(fit.inside && fit.hits === 0, `${vp.width}×${vp.height}: a full breakdown stays inside the map and clear of its buttons (${fit.h} px card, ${fit.mh} px map, ${fit.hits} overlaps)`);
    await page.context().close();
  }
  // Phones, every view: no label sits on a map control (view bar, zoom, credits, budget slider, full-screen button).
  // Only the visible part of a label counts: one whose point is off the map is clipped by the map's edge
  // (overflow hidden), and the budget slider moves out above the map on phones.
  for (const width of [320, 344, 375]) {
    const { page, errors } = await open(browser, { width, height: 800 });
    const views = await page.evaluate(() => [...document.getElementById('metric').options].map(o => o.value));
    for (const v of views) {
      await page.evaluate(v => { const s = document.getElementById('metric'); s.value = v; s.dispatchEvent(new Event('change')); }, v);
      await page.waitForTimeout(300);
      await page.waitForFunction(() => !map._flyToFrame && !map._animatingZoom && (!window.gsap || !gsap.globalTimeline.getChildren(true, true, false).some(t => t.isActive())), null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
      const hit = await page.evaluate(() => {
        const m = map.getContainer().getBoundingClientRect();
        const controls = [...document.querySelectorAll('.leaflet-control')].map(e => ({ e, r: e.getBoundingClientRect() })).filter(c => c.r.width && c.r.height);
        const out = [];
        for (const el of document.querySelectorAll('.rl')) {
          const a = el.getBoundingClientRect();
          const l = Math.max(a.left, m.left), t = Math.max(a.top, m.top), r = Math.min(a.right, m.right), b = Math.min(a.bottom, m.bottom);
          if (r <= l || b <= t) continue; // wholly outside the map: clipped, not seen
          for (const c of controls) if (l < c.r.right && c.r.left < r && t < c.r.bottom && c.r.top < b)
            out.push(`"${el.querySelector('small')?.textContent}" on .${[...c.e.classList].find(k => k !== 'leaflet-control' && k !== 'leaflet-bar') || 'leaflet-control'}`);
        }
        return { metric: LABEL.metric, labels: document.querySelectorAll('.rl').length, out };
      });
      check(!hit.out.length, `${width} px, ${v} view (${hit.metric}, ${hit.labels} labels): no label overlaps a map control${hit.out.length ? ': ' + hit.out.join(', ') : ''}`);
    }
    check(!errors.length, `${width} px views: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await page.context().close();
  }
  // Tablet width: the compact header, so the rent check starts in the top third of the screen.
  {
    const { page } = await open(browser, { width: 960, height: 800 });
    const hb = await page.evaluate(() => Math.round(document.querySelector('.band').getBoundingClientRect().height));
    check(hb <= 260, `960 px: the header is compact (${hb} px high)`);
    await page.context().close();
  }
  // Wallet-sized screens (fold phone covers, small phones): nothing sideways, the sheet fits, buttons stay small.
  for (const width of [320, 344]) {
    const { page, errors } = await open(browser, { width, height: 760 });
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${width} px: no sideways scrolling`);
    await page.evaluate(() => { const a = AREAS.find(x => x.lat != null); L.popup().setLatLng([a.lat, a.lng]).setContent(popup(a)).openOn(map); });
    await page.waitForTimeout(300);
    const fit = await page.evaluate(() => { const r = document.querySelector('.areaSheet:not([hidden])')?.getBoundingClientRect(); return r && r.left >= 0 && r.right <= innerWidth; });
    check(!!fit, `${width} px: the area sheet fits the screen`);
    check(!errors.length, `${width} px: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await axe(page, `${width} px with the sheet open`);
    await page.context().close();
  }
  const { page } = await open(browser, { width: 1350, height: 900 }, 'dark');
  await axe(page, 'desktop, dark mode');
  await page.context().close();
} finally {
  await browser.close();
  server.close();
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall page checks passed');
process.exit(failures.length ? 1 : 0);
