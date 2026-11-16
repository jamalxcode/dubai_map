// Page check in a real browser (Chromium via Playwright) against the real data, run by the
// Tests workflow after loading the data branch. Catches what unit tests can't: labels that
// overlap or hide an area, sideways scrolling on phones, a broken rent check, the map pushed
// off the first phone screen, keyboard labels, and WCAG A/AA problems (axe-core).
//
//   node tests/ui-check.mjs            (needs: npm i --no-save playwright axe-core; data loaded)
// Env: LIBS_DIR serves Leaflet/GSAP/Lenis from local npm packages instead of the CDNs (offline use).
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

async function open(browser, viewport, colorScheme = 'light') {
  const page = await (await browser.newContext({ viewport, colorScheme })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/tile\.openstreetmap\.org/, r => r.abort()); // no tile load on every test run
  if (process.env.LIBS_DIR) {
    const L = process.env.LIBS_DIR.replace(/\/?$/, '/');
    await page.route(/unpkg\.com|cdn\.jsdelivr\.net/, r => {
      const u = r.request().url();
      const f = u.includes('leaflet.css') ? 'x-leaflet-1.9.4/package/dist/leaflet.css' : u.includes('leaflet.js') ? 'x-leaflet-1.9.4/package/dist/leaflet.js'
        : u.includes('gsap') ? 'x-gsap-3.15.1/package/dist/gsap.min.js' : 'x-lenis-1.3.27/package/dist/lenis.min.js';
      r.fulfill({ path: L + f, headers: { 'access-control-allow-origin': '*', 'content-type': f.endsWith('css') ? 'text/css' : 'application/javascript' } });
    });
  }
  await page.goto(BASE, { waitUntil: 'networkidle' });
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
    const pies = await page.evaluate(() => document.querySelectorAll('.rl .pie').length);
    check(pies >= 10, `${name}: rent labels show the AED 100k dial (${pies})`);
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
    // Keyboard: Enter on a single label opens its breakdown.
    await page.evaluate(() => map.closePopup());
    const focused = await page.evaluate(() => { const el = [...document.querySelectorAll('.rl:not(.grp)')][0]; if (el) el.focus(); return !!el; });
    if (focused) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      check(!!(await page.$('.leaflet-popup-content')), `${name}: Enter on a map label opens its breakdown`);
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
    check(!errors.length, `${name}: no script errors${errors.length ? ': ' + errors.join('; ') : ''}`);
    await axe(page, name);
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
