// Page check in a real browser (Chromium via Playwright) against the real data, run by the
// Tests workflow after loading the data branch. Catches what unit tests can't: labels that
// overlap or hide an area, sideways scrolling on phones, a broken rent check, the map pushed
// off the first phone screen, keyboard labels, and WCAG A/AA problems (axe-core).
//
//   node tests/ui-check.mjs            (needs: npm i --no-save playwright axe-core; data loaded)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
    const under0 = await underControls(page);
    check(!under0.length, `${name}: at the start no label sits under the map's buttons or legend${under0.length ? ': ' + under0.join(', ') : ''}`);
    const labelNames = await page.evaluate(() => [...document.querySelectorAll('.rl small')].map(e => e.textContent));
    check(labelNames.every(t => !/…\s*…|\.\.\./.test(t)) && !labelNames.some(t => /\b(TOWN SQUARE|DAMAC HILLS|LA MER)\b/.test(t)),
      `${name}: label names are shortened once and all-capitals names show in title case`);
    const tops = await page.evaluate(() => ['n12', 'mapped', 'nAreas'].map(id => { const r = document.createRange(); r.selectNodeContents(document.getElementById(id)); return Math.round(r.getClientRects()[0]?.top ?? -1); }));
    check(tops.every(t => Math.abs(t - tops[0]) <= 2), `${name}: the three key figures line up (${tops.join(', ')})`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${name}: no sideways scrolling`);
    if (name === 'desktop') {
      const pane = await page.evaluate(() => { const r = document.querySelector('.mapWrap').getBoundingClientRect(); return { left: r.left, top: r.top, h: r.height / innerHeight }; });
      check(pane.left >= 400 && pane.top <= 1 && pane.h >= 0.98, `desktop: map is a full-height pane on the right (left ${Math.round(pane.left)} px, ${Math.round(pane.h * 100)}% high)`);
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
    const badges = await page.evaluate(() => [...document.querySelectorAll('.rl')].map(e => [e.style.getPropertyValue('--c'), e.style.getPropertyValue('--on').toUpperCase(), getComputedStyle(e.querySelector('b')).backgroundColor]));
    check(badges.length >= 10 && badges.every(([c, on, bg]) => /--b[1-6]/.test(c) && bg !== 'rgba(0, 0, 0, 0)' && (/--b[56]/.test(c) ? on === '#FFFCF5' : on === '#2B2118')),
      `${name}: each label's figure sits on a badge in its key colour, with readable type (${badges.length})`);
    check(await page.evaluate(() => !document.querySelector('.pie') && [...document.querySelectorAll('.rl.grp small')].every(e => /\+\d+$/.test(e.textContent))),
      `${name}: merged labels name their busiest area and how many more ("+N"); no dials`);
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
      await page.click(`.viewSw button[data-m="${m}"]`);
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
    const shapes = await page.waitForFunction(() => document.querySelectorAll('.leaflet-outlines-pane path').length, null, { timeout: 5000 }).then(h => h.jsonValue()).catch(() => 0);
    check(shapes >= 50, `${name}: official community outlines are shaded under the labels (${shapes})`);
    const z0 = await page.evaluate(() => map.getZoom());
    await page.click('.leaflet-control-zoom-in');
    await page.waitForTimeout(400);
    check(await page.evaluate(() => map.getZoom()) === z0 + 1, `${name}: the + zoom button zooms in`);
    await page.evaluate(() => map.setView([24.5, 54.3], 8, { animate: false }));
    await page.click('.leaflet-bar a.fit');
    await page.waitForTimeout(500);
    const fit = await page.evaluate(() => ({ z: map.getZoom(), c: map.getCenter() }));
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
      await page.waitForTimeout(300);
      check(!!(await page.$('.leaflet-popup-content')), `${name}: Enter on a map label opens its breakdown`);
      const lead = await page.evaluate(() => { const c = [...document.querySelectorAll('.leaflet-popup-content')].find(e => e.querySelector('.t')); return { lead: c.querySelector('.lead')?.textContent || '', pick: c.querySelector('tr.pick td')?.textContent || '', all: !!c.querySelector('.allh') }; });
      check(/^1-bedroom apartments: median AED/.test(lead.lead) && lead.pick === '1-bedroom apartments' && lead.all,
        `${name}: the breakdown leads with the picked home's figure, highlights its row, then all homes`);
      await page.waitForSelector('.leaflet-popup-content .pics .strip img', { timeout: 5000 }).catch(() => {});
      const see = await page.evaluate(() => ({
        links: [...document.querySelectorAll('.leaflet-popup-content .see a')].map(a => a.href),
        photos: [...document.querySelectorAll('.leaflet-popup-content .pics .strip a')].map(a => a.textContent + ' ' + a.title) }));
      check(see.links.length === 3 && see.links.every(u => /^https:\/\/www\.google\.com\//.test(u)) && see.links.some(u => /map_action=pano/.test(u)),
        `${name}: the breakdown links to Google Maps, Street View and Google photos`);
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
      await page.click('.viewSw button[data-m="sale"]');
      await page.waitForTimeout(700);
      const qs = await page.evaluate(() => location.search);
      check(/view=sale/.test(qs) && /home=homes:1-bedroom/.test(qs) && /at=25\.\d+,55\.\d+,\d+/.test(qs), `desktop: the address keeps the home, view and map position (${decodeURIComponent(qs)})`);
      await page.click('.viewSw button[data-m="median"]');
    }
    // The finder above the table filters the table only; the map keeps every area.
    const before = await page.evaluate(() => ({ rows: document.querySelectorAll('#rows tr').length, pts: POINTS.length }));
    await page.fill('#search', 'marina');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ rows: document.querySelectorAll('#rows tr').length, pts: POINTS.length }));
    check(after.rows < before.rows && after.rows >= 1 && after.pts === before.pts, `${name}: the table finder narrows the table (${before.rows} → ${after.rows} rows) and leaves the map alone`);
    await page.fill('#search', '');
    await page.waitForTimeout(300);
    // Labels stay inside the map: none whose centre is on the map crosses its edge.
    const crossing = await page.evaluate(() => { const b = map.getContainer().getBoundingClientRect();
      return [...document.querySelectorAll('.rl')].filter(e => { const r = e.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
        return cx > b.left && cx < b.right && cy > b.top && cy < b.bottom && (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1); }).map(e => e.textContent); });
    check(!crossing.length, `${name}: no label on the map is cut off by its edge${crossing.length ? ': ' + crossing.join(', ') : ''}`);
    // Key figures in big type, freshness in one small line; sources listed once, run status folded away.
    check(await page.evaluate(() => /^\d+$/.test(document.getElementById('nAreas').textContent) && /Kuwait/.test(document.getElementById('fresh').textContent)
      && document.querySelectorAll('#inUse li').length >= 1 && !!document.querySelector('#healthBox:not([open]) #sources') && !document.getElementById('foot').textContent.trim()),
      `${name}: key figures, one freshness line, sources once (status folded under "Data health")`);
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
      check(!!(await page.$('.leaflet-popup-content')), 'desktop: and opens its breakdown');
      // One home choice for the page: the check set the map's picker; the map's picker re-checks the area.
      const sync0 = await page.evaluate(() => [document.getElementById('home').value, document.getElementById('ckUnit').value]);
      await page.selectOption('#home', 'homes|2-bedroom apartments');
      await page.waitForTimeout(400);
      const sync1 = await page.evaluate(() => [document.getElementById('ckUnit').value, document.querySelector('.ck-what')?.textContent || '']);
      check(sync0[0] === 'homes|' + sync0[1] && sync1[0] === '2-bedroom apartments' && /2-bedroom/.test(sync1[1]),
        `desktop: the rent check and the map share one home choice (${sync0.join(' / ')} → ${sync1[0]})`);
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
