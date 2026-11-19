// Checks on index.html: the stale-data rule and safe loading of third-party scripts.
// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../assets/app/atlas.js', import.meta.url), 'utf8');
const html = page + '\n' + js; // markup + the page's script (split out of index.html)

// Pull the pure staleness() function out of the page and run it here.
const src = html.split('/*<staleness>*/')[1].split('/*</staleness>*/')[0];
const staleness = new Function(src + '\nreturn staleness;')();
const at = iso => Date.parse(iso + 'T12:00:00+04:00');

test('Dubai Data (daily pages, a few days behind DLD): fine up to 7 days, warns after', () => {
  const meta = { mode: 'aggregate', data_through: '2026-11-13' };
  assert.deepEqual(staleness(meta, at('2026-11-20')), { through: '2026-11-13', days: 7, limit: 7, stale: false });
  assert.equal(staleness(meta, at('2026-11-21')).stale, true);
  assert.equal(staleness(meta, at('2026-11-16')).days, 3);
});

test('daily Ejari pull: warns after 7 days', () => {
  const meta = { mode: 'contracts', newest_start_date: '2026-11-01' };
  assert.equal(staleness(meta, at('2026-11-08')).stale, false);
  assert.equal(staleness(meta, at('2026-11-09')).stale, true);
});

test('missing or malformed date shows no warning instead of breaking', () => {
  assert.equal(staleness({ mode: 'aggregate' }, Date.now()), null);
  assert.equal(staleness({ mode: 'aggregate', data_through: 'soon' }, Date.now()), null);
  assert.equal(staleness(null, Date.now()), null);
});

test('libraries are served from this site, never a CDN, and load before the page script', () => {
  assert.doesNotMatch(page, /<script\b[^>]*\bsrc="https?:\/\//, 'no third-party script tags (the counter is added at run time, off localhost)');
  assert.doesNotMatch(page, /<link\b[^>]*rel="stylesheet"[^>]*href="https?:/);
  const order = ['assets/vendor/leaflet/leaflet.js', 'assets/vendor/gsap/gsap.min.js', 'assets/vendor/lenis/lenis.min.js',
                 'assets/app/labels.js', 'assets/app/atlas.js', 'assets/app/insights.js', 'assets/app/companion.js'].map(f => page.indexOf(f));
  assert.ok(order.every(i => i > 0), 'all scripts present');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in dependency order');
  for (const f of ['leaflet/leaflet.js', 'leaflet/leaflet.css', 'gsap/gsap.min.js', 'lenis/lenis.min.js', 'leaflet/LICENSE', 'lenis/LICENSE'])
    assert.ok(readFileSync(new URL('../assets/vendor/' + f, import.meta.url)).length > 0, f);
});

test('no third-party font service, OSM tiles use the policy URL', () => {
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(html, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(html, /openstreetmap\.org\/copyright/);
  assert.doesNotMatch(html, /referrerpolicy|name="referrer"/i, 'tile policy: browsers must send a Referer');
});

test('elements the script relies on exist', () => {
  for (const id of ['map', 'stale', 'staleText', 'med', 'n12', 'mapped', 'fresh', 'home',
                    'theme', 'search', 'unit', 'metric', 'min', 'max', 'rows', 'thead', 'export', 'legend', 'n12T', 'mappedT', 'nAreasT', 'unmatchedBox'])
    assert.match(html, new RegExp(`id="${id}"`), id);
});

test('property type buttons are never rendered disabled', () => {
  assert.doesNotMatch(html, /b\.disabled\s*=/, 'a type without data gets no button instead of a dead one');
});

test('rent check hooks stay in place (assets/app/companion.js depends on them)', () => {
  assert.match(html, /<section[^>]*id="companion"/);
  assert.match(page, /<script src="assets\/app\/insights\.js\?v=__BUILD__"><\/script>\s*<script src="assets\/app\/companion\.js\?v=__BUILD__"><\/script>/);
  assert.match(html, /dispatchEvent\(new Event\('atlas:ready'\)\)/);
  assert.match(html, /dispatchEvent\(new Event\('atlas:error'\)\)/);
  assert.match(html, /href="assets\/app\/companion\.css\?v=__BUILD__"/);
});

test('one measure on the map: older districts only with a unit; starts on 1 bed; labels work by keyboard', () => {
  assert.match(html, /if\(!u&&a\.median_kind==='unit'\)return null;/, 'no all-homes value for per-unit-only areas');
  assert.match(html, /\['1-bedroom apartments','1 bed'\]\.find/, 'default unit is 1 bedroom');
  assert.match(html, /el\.setAttribute\('role','button'\)/);
  assert.doesNotMatch(html, /setAttribute\('aria-label',c\.single/, 'spoken name = visible text (WCAG 2.5.3)');
  assert.match(html, /e\.key==='Enter'\|\|e\.key===' '/);
});
