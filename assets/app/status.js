/* Data status page (status/): how the data is doing, read live when the page opens.
 *
 * Sources, all public and read in the visitor's browser:
 *   - the data branch (raw.githubusercontent.com): status.json (counts written by the build), state.json
 *     (each source's state and what it last pulled), runs.jsonl (one line per pull), meta.json;
 *     the site's own copies are the fallback if the data branch can't be reached;
 *   - GitHub's API: the pull's recent runs and the open "data-alert" issues.
 * Nothing here is about visitors. Text goes through T() (i18n.js) like the map page.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('en-AE', { maximumFractionDigits: 0 });
  const kuwait = iso => iso ? new Date(iso).toLocaleString(T.locale, { timeZone: 'Asia/Kuwait', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const day = d => d ? new Date(d + 'T00:00:00+04:00').toLocaleDateString(T.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' }) : '—';

  // Owner and repository from the address (jamalxcode.github.io/dubai_map/status/), else this project.
  const m = /^([\w-]+)\.github\.io$/.exec(location.hostname), seg = location.pathname.split('/').filter(Boolean)[0];
  const REPO = m && seg ? m[1] + '/' + seg : 'jamalxcode/dubai_map';
  const RAW = 'https://raw.githubusercontent.com/' + REPO + '/data/data/';
  const API = 'https://api.github.com/repos/' + REPO + '/';

  document.title = T('Data status') + ' | ' + T('Dubai Real Estate Atlas');

  async function get(url, text) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw Error(url + ' ' + r.status);
    return text ? r.text() : r.json();
  }
  // The data branch first (current between deploys), the site's copy if it can't be reached.
  const data = (name, text) => get(RAW + name, text).catch(() => get('../data/' + name, text)).catch(() => null);

  const SOURCE_NAMES = {
    datadubai: 'Dubai Data', 'crosscheck:ccp': 'Continental Club Property', 'crosscheck:dred': 'Dubai Real Estate Data',
    pulse: 'Dubai Pulse API', dld: 'DLD open-data service'
  };
  const STATE_TEXT = {
    ok: T('working'), failed: T('failing'), no_key: T('waiting for the API key'), off: T("off (waiting for DLD's permission)"),
    standby: T('on standby'), not_run: T('not run yet')
  };
  const stateCell = s => '<span class="st st-' + esc(s || 'not_run') + '">' + esc(STATE_TEXT[s] || s || T('not run yet')) + '</span>';

  function totals(st, meta) {
    const t = (st && st.totals) || { contracts: meta && meta.contracts_last_12m, areas: meta && meta.n_areas, contracts_on_map: meta && meta.mapped_last_12m };
    const pct = t.contracts ? Math.floor((t.contracts_on_map || 0) / t.contracts * 1000) / 10 : null;
    const rows = [[T('Contracts, last 12 months'), fmt(t.contracts)], [T('Areas'), fmt(t.areas)], [T('Figures (area × home size)'), fmt(t.figures)],
      [T('Areas on the map'), fmt(t.areas_on_map)], [T('Contracts on the map'), pct == null ? '—' : pct.toFixed(1) + '%']];
    $('totals').innerHTML = rows.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('');
    const through = (st && st.through) || (meta && meta.data_through);
    $('fresh').textContent = T('Data to {d} · built {t} (Kuwait time)', { d: day(through), t: kuwait((st && st.generated_at) || (meta && meta.generated_at)) }) +
      (st && st.backup ? ' · ' + T('Backup figures in use.') : '');
  }

  function pulledText(key, p) {
    if (!p) return '—';
    if (key === 'datadubai') {
      const live = p.live === 'updated' ? T('new publication: {n} community pages read', { n: fmt(p.pages) })
        : p.live === 'current' ? T('no new publication since the last pull') : p.live === 'failed' ? T('live pages failed; weekly export used')
          : p.live === 'off' ? T('live pages off') : T('checked recently; not asked again yet');
      return live + (p.export_files_updated ? ' · ' + T('{n} export files updated', { n: p.export_files_updated }) : '') + (p.through ? ' · ' + T('data to {d}', { d: day(p.through) }) : '');
    }
    if (key === 'pulse') return p.rows != null ? T('{rows} rows ({a} new, {u} updated)', { rows: fmt(p.rows), a: fmt(p.added), u: fmt(p.updated) }) : '—';
    return p.rows != null ? T('{rows} rows', { rows: fmt(p.rows) }) + (p.through ? ' · ' + T('data to {d}', { d: day(p.through) }) : '') : '—';
  }

  function lastPull(runs, state) {
    const last = runs && runs[runs.length - 1];
    $('lastRun').textContent = !last ? T('No pull logged yet.') : last.seconds != null
      ? T('{when}: took {s} s, data to {d}, {n} areas.', { when: kuwait(last.at), s: last.seconds, d: day(last.through), n: fmt(last.areas) })
      : T('{when}: data to {d}, {n} areas.', { when: kuwait(last.at), d: day(last.through), n: fmt(last.areas) });
    const pulled = (last && last.pulled) || {};
    const states = (last && last.sources) || {};
    const keys = ['datadubai', 'crosscheck:ccp', 'crosscheck:dred', 'pulse', 'dld'];
    const s = state || {};
    const stateOf = k => states[k] || (k.startsWith('crosscheck:') ? ((s.crosscheck || {})[k.slice(11)] || {}).state : (s[k] || {}).state);
    $('pulled').innerHTML = keys.map(k => '<tr><td>' + esc(T(SOURCE_NAMES[k])) + '</td><td>' + esc(pulledText(k, pulled[k])) + '</td><td>' + stateCell(stateOf(k)) + '</td></tr>').join('');
  }

  function used(st) {
    const s = (st && st.sources) || {};
    const dd = s.datadubai || {}, ccp = s.ccp || {}, cc = s.crosscheck || {};
    const row = (name, read, inuse, note) => '<tr><td>' + esc(name) + '</td><td class="r">' + esc(read) + '</td><td class="r">' + esc(inuse) + '</td><td>' + esc(note) + '</td></tr>';
    $('used').innerHTML =
      row('Dubai Data', T('{n} communities', { n: fmt(dd.communities) }), T('{n} areas', { n: fmt(dd.used) }), T('{n} of {m} bedroom figures have a median', { n: fmt(dd.bedroom_rows_used), m: fmt(dd.bedroom_rows) })) +
      row('Continental Club Property', T('{n} DLD areas ({r} figures)', { n: fmt(ccp.dld_areas), r: fmt(ccp.rows) }), T('{n} areas', { n: fmt(ccp.used) }), T('older districts only; {n} DLD areas already come from Dubai Data', { n: fmt(ccp.covered_by_dubai_data) })) +
      row('Dubai Real Estate Data', T('{n} figures', { n: fmt((cc.dred || {}).rows) }), '—', T('cross-check only'));
  }

  function leftOut(st) {
    const l = (st && st.left_out) || {};
    const items = [];
    const nm = l.no_median || [];
    items.push('<li><b>' + esc(T('{n} communities listed without a rent median', { n: nm.length })) + '</b>' + (nm.length ? ': ' + nm.slice(0, 12).map(x => esc(T.place(x.area)) + ' <span class="muted">(' + fmt(x.n) + ')</span>').join(', ') + (nm.length > 12 ? '…' : '') : '') + '</li>');
    items.push('<li><b>' + esc(T('{n} DLD areas from Continental Club already covered by Dubai Data', { n: fmt((((st || {}).sources || {}).ccp || {}).covered_by_dubai_data) })) + '</b> ' + esc(T('(Dubai Data is used there)')) + '</li>');
    items.push('<li><b>' + esc(T('{n} industrial zones', { n: fmt(l.staff_areas) })) + '</b> ' + esc(T('shown, but left out of comparisons (mostly staff accommodation)')) + '</li>');
    $('left').innerHTML = items.join('');
  }

  function pending(st, state) {
    const p = (st && st.pending) || {};
    const items = [];
    const un = p.unplaced || [];
    items.push('<li><b>' + esc(T('{n} areas waiting for a map point', { n: un.length })) + '</b>' + (un.length ? ': ' + un.map(x => esc(T.place(x.area)) + ' <span class="muted">(' + T('{n} contracts', { n: fmt(x.n) }) + ')</span>').join(', ') : '') + '</li>');
    const uc = p.unconfirmed || [];
    items.push('<li><b>' + esc(T('{n} big changes waiting to be confirmed', { n: uc.length })) + '</b>' + (uc.length ? ': ' + uc.slice(0, 10).map(x => esc(T.place(x.area)) + (x.unit ? ' · ' + esc(T.unit(x.unit, true)) : '') + ' ' + (x.pct > 0 ? '+' : '') + x.pct + '%').join(', ') : '') + '</li>');
    items.push('<li><b>' + esc(T('{n} figures where another source differs by more than 15%', { n: fmt(p.sources_differ) })) + '</b></li>');
    const s = state || {};
    if ((s.pulse || {}).state === 'no_key') items.push('<li><b>' + esc(T('Dubai Pulse API')) + '</b>: ' + esc(T('waiting for the API key (contract-level data)')) + '</li>');
    if ((s.dld || {}).state === 'off') items.push('<li><b>' + esc(T('DLD open-data service')) + '</b>: ' + esc(T("off until DLD's written permission")) + '</li>');
    $('pending').innerHTML = items.join('');
  }

  function recentRuns(gh, log) {
    const rows = gh && gh.length ? gh.slice(0, 12).map(r => ({
      at: r.run_started_at || r.created_at, how: r.event === 'schedule' ? T("GitHub's timer") : r.event === 'workflow_dispatch' ? T('cron-job.org or by hand') : r.event === 'push' ? T('a push') : r.event,
      ok: r.conclusion, secs: r.updated_at && r.run_started_at ? Math.round((new Date(r.updated_at) - new Date(r.run_started_at)) / 1000) : null, url: r.html_url
    })) : (log || []).slice(-12).reverse().map(r => ({ at: r.at, how: r.event, ok: 'success', secs: r.seconds }));
    $('runs').innerHTML = rows.map(r => '<tr><td>' + (r.url ? '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(kuwait(r.at)) + '</a>' : esc(kuwait(r.at))) + '</td><td>' + esc(r.how) + '</td><td>' +
      '<span class="st st-' + (r.ok === 'success' ? 'ok' : r.ok ? 'failed' : 'not_run') + '">' + esc(r.ok === 'success' ? T('worked') : r.ok === 'failure' ? T('failed') : r.ok || T('running')) + '</span></td><td class="r">' + (r.secs != null ? esc(r.secs + ' s') : '—') + '</td></tr>').join('') ||
      '<tr><td colspan="4">' + esc(T('No pull logged yet.')) + '</td></tr>';
    return rows;
  }

  function pubHours(state) {
    const seen = ((state || {}).datadubai || {}).published_seen || [];
    const count = {};
    for (const s of seen) { const h = new Date(s.seen_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit' }) + ':00'; count[h] = (count[h] || 0) + 1; }
    const list = Object.entries(count).sort((a, b) => b[1] - a[1]).map(([h, n]) => h + ' (' + n + '×)');
    $('pubHours').textContent = list.length ? T("Dubai Data's new figures were first seen at: {list} (Kuwait time).", { list: list.join(', ') }) : T("Dubai Data's publication times are being logged.");
  }

  function alerts(issues) {
    const open = (issues || []).filter(i => !i.pull_request);
    $('alerts').innerHTML = issues == null ? '<li class="muted">' + esc(T("GitHub's alert list couldn't be read just now.")) + '</li>'
      : open.length ? open.map(i => '<li><a href="' + esc(i.html_url) + '" target="_blank" rel="noopener">' + esc(i.title.replace(/^Data alert:\s*/, '')) + '</a> <span class="muted">(' + esc(T('since {t}', { t: kuwait(i.created_at) })) + ')</span></li>').join('')
        : '<li>' + esc(T('No open alerts.')) + '</li>';
    return open.length;
  }

  function overall(nAlerts, runs, st) {
    const last = runs[0];
    const bad = nAlerts > 0 || (last && last.ok && last.ok !== 'success') || (st && st.backup);
    $('overall').textContent = bad ? T('Needs a look') : T('All fine');
    $('overall').className = 'num ' + (bad ? 'bad' : 'good');
    $('overallCap').textContent = nAlerts ? T('{n} open alerts', { n: nAlerts }) : last ? T('Last pull {t}', { t: kuwait(last.at) }) : '';
  }

  async function main() {
    const [st, state, meta, runsText, gh, issues] = await Promise.all([
      data('status.json'), data('state.json'), data('meta.json'), data('runs.jsonl', true),
      get(API + 'actions/workflows/daily-ejari.yml/runs?per_page=12').then(j => j.workflow_runs).catch(() => null),
      get(API + 'issues?state=open&labels=data-alert&per_page=50').catch(() => null)
    ]);
    const log = (runsText || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    totals(st, meta);
    lastPull(log, state || (meta && meta.state));
    used(st);
    leftOut(st);
    pending(st, state || (meta && meta.state));
    const runs = recentRuns(gh, log);
    pubHours(state);
    overall(alerts(issues), runs, st);
    window.statusState = 'ready';
  }
  main().catch(e => { $('overall').textContent = T('Unavailable'); $('overallCap').textContent = String(e && e.message || e); window.statusState = 'error'; });
})();
