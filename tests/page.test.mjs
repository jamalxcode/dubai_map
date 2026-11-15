// Checks on index.html: the stale-data rule and safe loading of third-party scripts.
// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Pull the pure staleness() function out of the page and run it here.
const src = html.split('/*<staleness>*/')[1].split('/*</staleness>*/')[0];
const staleness = new Function(src + '\nreturn staleness;')();
const at = iso => Date.parse(iso + 'T12:00:00+04:00');

test('Dubai Data (weekly source): fine up to 14 days, warns after', () => {
  const meta = { mode: 'aggregate', data_through: '2026-10-29' };
  assert.deepEqual(staleness(meta, at('2026-11-12')), { through: '2026-10-29', days: 14, limit: 14, stale: false });
  assert.equal(staleness(meta, at('2026-11-13')).stale, true);
  assert.equal(staleness(meta, at('2026-11-15')).days, 17);
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

test('every external script and library stylesheet is pinned with an integrity hash', () => {
  const tags = [...(html.match(/<script\b[^>]*\bsrc="https?:\/\/[^"]+"[^>]*>/g) || []),
                ...(html.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) || [])];
  assert.ok(tags.length >= 4);
  for (const t of tags) assert.match(t, /integrity="sha(256|384)-[A-Za-z0-9+/=]+"/, t);
});

test('no third-party font service, OSM tiles use the policy URL', () => {
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(html, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(html, /openstreetmap\.org\/copyright/);
  assert.doesNotMatch(html, /referrerpolicy|name="referrer"/i, 'tile policy: browsers must send a Referer');
});

test('elements the script relies on exist', () => {
  for (const id of ['map', 'stale', 'staleText', 'side', 'openSheet', 'closeSheet', 'med', 'n12', 'mapped', 'types',
                    'plate', 'typesNote', 'theme', 'search', 'unit', 'metric', 'min', 'max', 'rows', 'thead', 'export', 'sources', 'legend'])
    assert.match(html, new RegExp(`id="${id}"`), id);
});

test('property type buttons are never rendered disabled', () => {
  assert.doesNotMatch(html, /b\.disabled\s*=/, 'a type without data gets no button instead of a dead one');
});
