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
    if (((state || {}).hotel_prices || {}).state === 'no_key')
      items.push('<li><b>' + esc(T('Hotel prices: off')) + '</b>: ' + esc(T("the owner's choice, since LiteAPI's live key needs a payment card; each place links to booking sites for prices.")) + '</li>');
    const un = p.unplaced || [];
    items.push('<li><b>' + esc(T('{n} areas waiting for a map point', { n: un.length })) + '</b>' + (un.length ? ' ' + esc(T('(see "Needs you")')) : '') + '</li>');
    const uc = p.unconfirmed || [];
    items.push('<li><b>' + esc(T('{n} big changes waiting to be confirmed', { n: uc.length })) + '</b>' + (uc.length ? ': ' + uc.slice(0, 10).map(x => esc(T.place(x.area)) + (x.unit ? ' · ' + esc(T.unit(x.unit, true)) : '') + ' ' + (x.pct > 0 ? '+' : '') + x.pct + '%').join(', ') : '') + '</li>');
    items.push('<li><b>' + esc(T('{n} figures where another source differs by more than 15%', { n: fmt(p.sources_differ) })) + '</b></li>');
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

  // Unresolved issues a person can fix, each with why it matters and what to do. Every condition the robot
  // can't resolve by itself belongs here (docs/INTERFACE_RULES.md, 7b): add new ones when a new kind appears.
  function needs(st, state, issues, runs, branches) {
    const s = state || {}, p = (st && st.pending) || {}, out = [];
    const add = (title, why, todo, link) => out.push({ title, why, todo, link });
    for (const u of p.unplaced || [])
      add(T('Place {area} on the map', { area: T.place(u.area) }), T('{n} contracts are in the table but not on the map: no official or checked point exists for this name.', { n: fmt(u.n) }),
        T('Find the area on Makani, the DLD map or Google Maps and send its coordinates (lat, lng), or another name it is known by (e.g. "Al Twar 5" for Al Twar Fifth). A checked point goes in data/area_locations.csv.'));
    if (st && st.backup) add(T('Dubai Data has stopped updating'), T('The map is running on backup figures from Continental Club since {d}.', { d: day(st.backup.since) }),
      T('Check datadubai.ae and its weekly export; if their format changed, the collector needs updating.'), 'https://datadubai.ae/');
    for (const [key, name] of [['datadubai', 'Dubai Data'], ['crosscheck:ccp', 'Continental Club Property'], ['crosscheck:dred', 'Dubai Real Estate Data']]) {
      const b = key.startsWith('crosscheck:') ? (s.crosscheck || {})[key.slice(11)] || {} : s[key] || {};
      if (b.state === 'failed') add(T('{source} is failing', { source: name }), b.status || '', T("Open the source's page to see whether it moved or changed; the last good figures stay on the map meanwhile."));
    }
    const last = runs && runs[0];
    if (last && last.ok && last.ok !== 'success') add(T('The last pull failed'), T('Started {t}.', { t: kuwait(last.at) }), T('Open the run, read the failing step, and re-run it once the cause is fixed.'), last.url);
    for (const i of (issues || []).filter(i => !i.pull_request))
      add(i.title.replace(/^Data alert:\s*/, ''), T('An open alert from the freshness check, since {t}.', { t: kuwait(i.created_at) }), T('Open the alert for details; it closes itself once the problem is gone.'), i.html_url);
    if ((s.pulse || {}).state === 'no_key')
      add(T('Get the Dubai Pulse API key'), T('It unlocks contract-level data: rent ranges, rent per m², new vs renewal, monthly trends, and Dubai\'s official hotel room rates and occupancy (DET) for the Hotels view.'),
        T('Follow up the Digital Dubai request, or have someone with UAE Pass request dld_rent_contracts-open-api on data.dubai; then add DUBAI_PULSE_KEY and DUBAI_PULSE_SECRET as repository secrets.'), 'https://data.dubai');
    const hp = s.hotel_prices || {};
    // No key is the owner's choice (18 Nov: LiteAPI's live key needs a payment card), so it is not asked for here;
    // it shows under "Waiting" instead. A key that is added but rejected or sandbox still needs the owner.
    if (hp.state === 'failed' && /sandbox|401/.test(hp.status || ''))
      add(T('Get a LiteAPI key for hotel prices'), hp.state === 'failed' ? hp.status : T('It unlocks each hotel\'s average price a night and each area\'s typical hotel price in the Hotels view.'),
        T('Create a free account at liteapi.travel, copy the live API key from the dashboard (not the sandbox key) and add it as the repository secret LITEAPI_KEY. Prices appear after the next pull.'), 'https://liteapi.travel');
    else if (hp.state === 'failed') add(T('Hotel prices are failing'), hp.status || '', T("Open the source's page to see whether it moved or changed; the last good figures stay on the map meanwhile."), 'https://liteapi.travel');
    if ((s.dld || {}).state === 'off')
      add(T("Ask DLD for written permission"), T("DLD's own open-data service stays off without it."), T('If DLD agrees in writing, set the repository variable DLD_ENABLED=1.'));
    const stale = (branches || []).filter(b => !['main', 'data'].includes(b.name) && !/^gh-pages$/.test(b.name));
    if (stale.length) add(T('Delete {n} old branches', { n: stale.length }), stale.map(b => b.name).join(', '),
      T('Coding sessions may not delete branches: delete them under the repository\'s Branches page if they are no longer needed.'), 'https://github.com/' + REPO + '/branches/all');
    $('needs').innerHTML = out.length ? out.map(n => '<li><b>' + esc(n.title) + '</b>' + (n.why ? '<br><span class="muted">' + esc(n.why) + '</span>' : '') +
      '<br><span class="todo">' + esc(T('What to do:')) + ' ' + esc(n.todo) + '</span>' + (n.link ? ' <a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(T('Open')) + '</a>' : '') + '</li>').join('')
      : '<li>' + esc(T('Nothing needs you right now.')) + '</li>';
    return out.length;
  }

  function overall(nAlerts, runs, st, nNeeds) {
    const last = runs[0];
    const bad = nAlerts > 0 || (last && last.ok && last.ok !== 'success') || (st && st.backup);
    $('overall').textContent = bad ? T('Needs a look') : T('All fine');
    $('overall').className = 'num ' + (bad ? 'bad' : 'good');
    $('overallCap').textContent = [nAlerts ? T('{n} open alerts', { n: nAlerts }) : last ? T('Last pull {t}', { t: kuwait(last.at) }) : '',
      nNeeds ? T('{n} things need you', { n: nNeeds }) : ''].filter(Boolean).join(' · ');
  }

  async function main() {
    const [st, state, meta, runsText, gh, issues, branches] = await Promise.all([
      data('status.json'), data('state.json'), data('meta.json'), data('runs.jsonl', true),
      get(API + 'actions/workflows/daily-ejari.yml/runs?per_page=12').then(j => j.workflow_runs).catch(() => null),
      get(API + 'issues?state=open&labels=data-alert&per_page=50').catch(() => null),
      get(API + 'branches?per_page=100').catch(() => null)
    ]);
    const log = (runsText || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    totals(st, meta);
    lastPull(log, state || (meta && meta.state));
    used(st);
    leftOut(st);
    pending(st, state || (meta && meta.state));
    const runs = recentRuns(gh, log);
    pubHours(state);
    const nNeeds = needs(st, state || (meta && meta.state), issues, runs, branches);
    overall(alerts(issues), runs, st, nNeeds);
    window.statusState = 'ready';
  }
  main().catch(e => { $('overall').textContent = T('Unavailable'); $('overallCap').textContent = String(e && e.message || e); window.statusState = 'error'; });
})();
