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

async function open(browser, viewport, colorScheme = 'light', query = '') {
  const page = await (await browser.newContext({ viewport, colorScheme })).newPage();
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
      check(await page.isVisible('.maplang') && /name:en/.test(await field()), `${name}: map names start in English, with a language button on the map`);
      await page.click('.maplang button[data-l="ar"]');
      check(/name:ar/.test(await field()) && await page.evaluate(() => localStorage.getItem('mapLang') === 'ar'), `${name}: "عربي" switches the map's place names to Arabic, and is remembered`);
      await page.click('.maplang button[data-l="both"]');
      check(/name_en/.test(await field()) && !/name:ar/.test(await field()), `${name}: "Both" restores the style's own names`);
      await page.click('.maplang button[data-l="en"]');
    }
    const view0 = await page.evaluate(() => ({ c: map.getCenter(), z: map.getZoom() }));
    await page.evaluate(() => fitDubai(false));
    await page.waitForTimeout(300);
    const underLang = await page.evaluate(() => { const b = document.querySelector('.maplang'); if (!b || b.hidden) return 0; const r = b.getBoundingClientRect();
      return [...document.querySelectorAll('.rl')].filter(e => { const a = e.getBoundingClientRect(); return a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom; }).length; });
    check(underLang === 0, `${name}: no rent label sits under the map language button (${underLang})`);
    await page.evaluate(v => map.setView(v.c, v.z, { animate: false }), view0);
    await page.waitForTimeout(300);
    const pies = await page.evaluate(() => document.querySelectorAll('.rl .pie').length);
    check(pies >= 10, `${name}: rent labels show the rent dial (${pies})`);
    const scale = await page.evaluate(() => { const vals = POINTS.map(p => p.v); return { top: LABEL.top, max: Math.max(...vals),
      bands: new Set(vals.map(v => LABEL.colorOf(v))).size, note: document.querySelector('#legend .note')?.textContent || '' }; });
    check(scale.top === scale.max && scale.bands === 6 && /279k|\d+k/.test(scale.note),
      `${name}: the price key tops out at the top price pulled (AED ${Math.round(scale.top / 1000)}k) and uses all six colours`);
    const fills = await page.evaluate(() => [...document.querySelectorAll('.rl.rent')].map(e => parseFloat(e.style.getPropertyValue('--f'))));
    check(fills.length >= 10 && fills.every(f => f > 0 && f <= 100), `${name}: rent labels are shaded in proportion to the rent (${fills.slice(0, 4).join('%, ')}%…)`);
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
    // The rent check: a nickname finds the area and shows a figure.
    await page.evaluate(() => scrollTo(0, 0));
    await page.click('#ckArea');
    await page.fill('#ckArea', 'jvc');
    await page.press('#ckArea', 'Enter');
    await page.waitForTimeout(400);
    const big = await page.$eval('.ck-big', e => e.textContent).catch(() => '');
    check(/AED\s*[\d,]+/.test(big), `${name}: rent check answers "jvc" (${big.trim().slice(0, 30)})`);
    if (name === 'desktop') {
      await page.waitForTimeout(1300); // the fly to the area
      const c = await page.evaluate(() => ({ z: map.getZoom(), lat: map.getCenter().lat, lng: map.getCenter().lng }));
      const near = Math.abs(c.lat - 25.058) < 0.02 && Math.abs(c.lng - 55.209) < 0.02;
      check(near && c.z >= 13, `desktop: a rent check takes the map to the area (JVC; zoom ${c.z})`);
      check(!!(await page.$('.leaflet-popup-content')), 'desktop: and opens its breakdown');
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
