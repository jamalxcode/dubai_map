/* English and Arabic. The language is picked before first paint (index.html: a ?lang= link,
 * else the saved choice, else the device language) and set on <html lang dir>; this file
 * translates the page's fixed text and gives the scripts T(), T.count(), T.unit() and T.list().
 *
 *   T('English text', { var: value })   the Arabic for that text when the page is in Arabic,
 *                                        else the English; {var} placeholders are filled in.
 * Keys are the English text itself, so the code stays readable and anything without a
 * translation falls back to English. Area names stay as registered in Ejari (English), which is
 * also what the search matches. Numbers keep Western digits, as on Ejari contracts.
 * tests/i18n.test.mjs checks that every T('…') key used by the page has an Arabic entry.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.T = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const doc = root.document;
  const LANG = doc && doc.documentElement.lang === 'ar' ? 'ar' : 'en';

  // The Arabic tables live in i18n-ar.js (about 95 KB), downloaded only when the page is in Arabic: written in right
  // after this script, so they are in place before the page's own scripts run. Node (the tests) requires them.
  const DICT = () => root.I18N_AR || (typeof module === 'object' && module.exports && typeof require === 'function' ? require('./i18n-ar.js') : null) || { STATIC: {}, AR: {} };
  if (LANG === 'ar' && doc && !root.I18N_AR && doc.readyState === 'loading') {
    const me = doc.currentScript && doc.currentScript.src;
    if (me) doc.write('<script src="' + me.replace(/i18n\.js(?=[?#]|$)/, 'i18n-ar.js') + '"><\/script>');
  }

  function T(s, vars) {
    const AR = DICT().AR;
    let out = LANG === 'ar' && Object.prototype.hasOwnProperty.call(AR, s) ? AR[s] : s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? '' : String(vars[k])));
    return out;
  }
  T.lang = LANG;
  T.locale = LANG === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB';
  Object.defineProperty(T, 'AR', { get: () => DICT().AR });
  Object.defineProperty(T, 'STATIC', { get: () => DICT().STATIC });

  // "9,810 contracts" / "9,810 عقود". Arabic counts: 1, 2, 3-10 (by the last two digits), 11 and up.
  const WORDS = {
    contract: ['عقد واحد', 'عقدان', 'عقود', 'عقدًا'],
    area: ['منطقة واحدة', 'منطقتان', 'مناطق', 'منطقة'],
    hotel: ['فندق واحد', 'فندقان', 'فنادق', 'فندقًا'],
  };
  T.count = (n, word) => {
    const num = Number(n).toLocaleString('en-AE');
    if (LANG !== 'ar' || !WORDS[word]) return num + ' ' + word + (n === 1 ? '' : 's');
    const [one, two, few, many] = WORDS[word], h = n % 100;
    return n === 1 ? one : n === 2 ? two : (h >= 3 && h <= 10 ? num + ' ' + few : num + ' ' + many);
  };

  // Home types are stored in English ("1-bedroom apartments"); this is how they are shown.
  T.unit = (u, short) => {
    if (!u) return T('All homes');
    const studio = /^Studios?$/i.test(u), m = /^(\d+)-bedroom (apartments?|villas?)$/i.exec(u);
    if (LANG !== 'ar') {
      if (!short) return u;
      return studio ? 'Studio' : m ? m[1] + ' bed' + (/villa/i.test(m[2]) ? ' villa' : '') : u;
    }
    if (studio) return short ? 'استوديو' : 'استوديوهات';
    if (!m) return T(u);
    const n = +m[1], villa = /villa/i.test(m[2]);
    const rooms = n === 1 ? 'غرفة نوم واحدة' : n === 2 ? 'غرفتا نوم' : n + ' غرف نوم';
    if (short) return rooms + (villa ? ' (فيلا)' : '');
    const kind = villa ? 'فلل' : 'شقق';
    return kind + (n === 1 ? ' بغرفة نوم' : n === 2 ? ' بغرفتي نوم' : ' بـ' + n + ' غرف نوم');
  };

  // "Villas, Commercial and Everything" / "الفلل، التجاري والكل".
  // Area names as shown: names registered all in capitals ("TOWN SQUARE") in title case ("Town Square"),
  // keeping acronyms and words with digits; others as registered. Search and storage keep the registered name.
  const ACRONYMS = new Set(['JLT', 'JVC', 'JVT', 'JBR', 'DIFC', 'DMCC', 'MBR', 'DSO', 'IMPZ', 'DIP', 'DHCC', 'DIC', 'DMC', 'UAE', 'II', 'III', 'IV', 'DXB']);
  T.place = name => {
    const n = String(name ?? '');
    if (!/[A-Z]{2}/.test(n) || /[a-z]/.test(n)) return n;
    return n.replace(/[A-Z][A-Z'’]*/g, w => ACRONYMS.has(w) ? w : w[0] + w.slice(1).toLowerCase());
  };
  T.list = items => items.length < 2 ? items.join('')
    : items.slice(0, -1).join(T(', ')) + (LANG === 'ar' ? ' و' : ' and ') + items[items.length - 1];

  T.set = lang => {
    try { root.localStorage.setItem('lang', lang); } catch (e) { /* this visit only */ }
    const u = new URL(root.location.href);
    u.searchParams.set('lang', lang);
    root.location.replace(u.href);
  };

  // Translate the page's fixed text (called by i18n-ar.js once its tables are in) and wire the language button.
  T._apply = () => {
    if (!doc || LANG !== 'ar' || T._applied) return;
    const STATIC = DICT().STATIC;
    if (!Object.keys(STATIC).length) return;
    T._applied = true;
    if (doc.getElementById('title')) doc.title = 'أطلس دبي العقاري | إيجاري';
    doc.querySelectorAll('[data-t]').forEach(el => { const v = STATIC[el.dataset.t]; if (v) el.innerHTML = v; });
    doc.querySelectorAll('[data-t-ph]').forEach(el => { const v = STATIC[el.dataset.tPh]; if (v) el.placeholder = v; });
    doc.querySelectorAll('[data-t-aria]').forEach(el => { const v = STATIC[el.dataset.tAria]; if (v) el.setAttribute('aria-label', v); });
  };
  if (doc) {
    T._apply(); // the tables may already be here (a cached copy run first); else i18n-ar.js calls it
    // Language switch in the header: both languages always shown, the current one highlighted.
    const sw = doc.getElementById('langSw');
    if (sw) {
      sw.setAttribute('aria-label', LANG === 'ar' ? 'اللغة' : 'Language');
      sw.querySelectorAll('button[data-l]').forEach(b => {
        const on = b.dataset.l === LANG;
        b.setAttribute('aria-pressed', String(on));
        b.title = b.dataset.l === 'ar' ? 'اقرأ هذه الصفحة بالعربية' : 'Read this page in English';
        b.addEventListener('click', () => { if (!on) T.set(b.dataset.l); });
      });
    }
  }
  return T;
});
