// Arabic version (assets/app/i18n.js): every text the page shows has a translation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const T = require('../assets/app/i18n.js'); // no document here: English, but the tables are exposed
const code = read('assets/app/atlas.js') + read('assets/app/companion.js') + read('assets/app/status.js') + read('assets/app/fun.js');

// Every string literal handed to T(...), including both arms of T(cond ? 'a' : 'b').
function keys(src) {
  const out = new Set();
  for (const m of src.matchAll(/\bT\(\s*((?:[^()'"`]|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")*?)\s*(?:,\s*\{|\))/g)) {
    const args = m[1].replace(/[!=]==?\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g, ''); // values compared in a condition
    for (const s of args.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)) out.add((s[1] ?? s[2]).replace(/\\'/g, "'"));
  }
  return out;
}

test('every T() key in the page scripts has an Arabic translation', () => {
  const ks = keys(code);
  assert.ok(ks.size > 150, `found ${ks.size} keys`);
  const missing = [...ks].filter(k => !(k in T.AR));
  assert.deepEqual(missing, []);
  for (const t of ['Never', 'Every 3 months', 'Every 6 months', 'Once a year']) assert.ok(t in T.AR, t); // picked from a list
});

test('every fixed text key in index.html has an Arabic translation, and placeholders survive', () => {
  const html = read('index.html') + read('status/index.html');
  const used = [...html.matchAll(/data-t(?:-ph|-aria)?="([^"]+)"/g)].map(m => m[1]);
  assert.ok(used.length > 30);
  assert.deepEqual(used.filter(k => !(k in T.STATIC)), []);
  assert.match(T.STATIC['a.unm'], /<span id="unmatchedN">/, 'the count element the script fills is kept');
  for (const [en, ar] of Object.entries(T.AR)) {
    const vars = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
    assert.equal(vars(ar), vars(en), `same {placeholders} in: ${en}`);
  }
});

test('Arabic counts, home types and lists (rules run in English mode here, so check the tables)', () => {
  assert.equal(T.count(9810, 'contract'), '9,810 contracts');
  assert.equal(T.count(1, 'area'), '1 area');
  assert.equal(T.unit('1-bedroom apartments', true), '1 bed');
  assert.equal(T.unit('Studios', true), 'Studio');
  assert.equal(T.unit(''), 'All homes');
  assert.equal(T.list(['Villas', 'Commercial', 'Everything']), 'Villas, Commercial and Everything');
});

test('Arabic mode: plurals by the last two digits, home types, lists, RTL', async () => {
  const doc = { documentElement: { lang: 'ar' }, querySelectorAll: () => [], getElementById: () => null, set title(v) {} };
  const src = read('assets/app/i18n.js');
  const self = { document: doc };
  const TA = new Function('self', 'module', src + '\nreturn self.T;')(self, undefined);
  assert.equal(TA.lang, 'ar');
  assert.equal(TA('Check a rent'), 'تحقّق من إيجار');
  assert.equal(TA('{n} contracts', { n: '12k' }), '12k عقد');
  assert.equal(TA.count(1, 'contract'), 'عقد واحد');
  assert.equal(TA.count(2, 'area'), 'منطقتان');
  assert.equal(TA.count(7, 'area'), '7 مناطق');
  assert.equal(TA.count(9810, 'contract'), '9,810 عقود', '...10: plural form');
  assert.equal(TA.count(12391, 'contract'), '12,391 عقدًا');
  assert.equal(TA.unit('1-bedroom apartments'), 'شقق بغرفة نوم');
  assert.equal(TA.unit('2-bedroom apartments', true), 'غرفتا نوم');
  assert.equal(TA.unit('3-bedroom apartments'), 'شقق بـ3 غرف نوم');
  assert.equal(TA.unit('Studios'), 'استوديوهات');
  assert.equal(TA.list(['الفلل', 'التجاري', 'الكل']), 'الفلل، التجاري والكل');
  assert.equal(TA('Untranslated thing'), 'Untranslated thing', 'falls back to English');
});
