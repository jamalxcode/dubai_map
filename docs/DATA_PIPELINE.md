# How the data is pulled, organised and stored

Three times a day a GitHub Actions job pulls rents from public sources, turns them into a few small JSON files, checks them, and saves them. The website only reads those files. This page explains each part; the exact rules and thresholds are in [BUSINESS_RULES.md](BUSINESS_RULES.md).

## 1. When it runs

The **"Daily Ejari pull"** workflow (`.github/workflows/daily-ejari.yml`) runs at **06:17, 14:17 and 22:17 UAE time** (02:17, 10:17, 18:17 UTC). cron-job.org starts it on time; GitHub's own timer is the backup and often fires hours late. A first **guard** job lets a timer run step aside when a pull succeeded in the last 3 hours (manual and cron-job.org starts always run). The pull's first step stops GitHub from switching off a quiet schedule after 60 days.

Once a week the **"Place unplaced areas"** workflow (`geocode.yml`, Sundays) refreshes the official community points, looks up any area still off the map, and refreshes the Metro and Tram lines and stations (one Overpass request). A change to `collector/transit.py` on any branch runs **"Check the Metro and Tram collector"** (`transit-check.yml`), which fetches and builds without saving and prints a summary in its log.

## 2. Where the data lives

| Place | What's there | Who writes it |
|---|---|---|
| **`main` branch** | The code, the page, and hand-checked inputs: `data/area_locations.csv`, `data/community_locations.csv`, `data/dld_dm_aliases.csv`, `data/inbox/` | People (and Claude Code sessions) |
| **`data` branch** | Everything generated: the page's JSON files, raw copies of the sources, source states, map points | Only the robot (`scripts/data-branch.sh save`) |

Generated data stays off `main`, so the code history stays clean. Every pull leaves a dated commit on `data`, so any past version of the figures can be recovered.

Generated files (the `GENERATED` list in `scripts/data-branch.sh`):

| File | What it holds |
|---|---|
| `areas.json`, `areas_flat.json`, `areas_studio.json` | One record per map area for all homes, flats and studios: median rent, contracts, sale price, yield, breakdown by home size, sale-price trend, DLD areas, map point |
| `latest.json` | The table rows (area, DLD area, home size, rent, contracts, sale price, yield); also what Download CSV gives |
| `meta.json` | How far the data runs, when it was built, each source's status ("Data health"), areas with no map point yet |
| `outlines.json` | Official community outlines, simplified, one set per map area |
| `transit.json` | Dubai Metro and Dubai Tram lines and stations (OpenStreetMap, ODbL), refreshed weekly by "Place unplaced areas" (`collector/transit.py`); kept when a fetch fails or looks wrong (fewer than 2 metro lines, 40 metro stations, 1 tram line or 8 tram stops) |
| `hotels.json` | Places to stay (hotels, hotel apartments, hostels, guest houses) from OpenStreetMap (ODbL), inside Dubai's official community outlines and taking guests (no staff housing or residential towers): name, Arabic name, kind, stars, point. Refreshed weekly by "Place unplaced areas" (`collector/hotels.py`); kept when a fetch fails or returns fewer than 300 |
| `hotel_stats.json` | Dubai's official monthly hotel figures (DET, Dubai Pulse open data): average daily rate, occupancy, RevPAR, length of stay, last 36 months. Tried at most once every 20 hours (the figures are monthly; `collector/hotel_stats.py`, 20-second wait) with the Dubai Pulse key, else the open CSV; both are refused from outside the UAE, so this file appears once the key is added. Its state (`ok` with the latest month, `no_key`, `failed`) goes in `state.json` as `hotel_stats`, and from there to the run log and the status page. Rates outside AED 100–5,000 a night and occupancy outside 0–100% are left out |
| `hotel_prices.json` | Each matched hotel's nightly price in AED (lowest believable offer on booking sites for one room, 2 adults; 2 sample nights two to three weeks ahead) from Xotelo, free and with no key: `[name, lat, lng, average, nights, lowest, highest, checked]`, plus `keys` (our place to Xotelo's hotel), `info` (our place to its Tripadvisor rating, reviews and link, refreshed with the list) and `tried` (when each was last asked). Every pull prices up to 100 hotels, so each matched one is refreshed every couple of days (`collector/hotel_prices.py`, about 6 minutes); Xotelo's list is re-read once a day. Prices older than 10 days are dropped; kept as they were when Xotelo fails |
| `holiday_homes.json` | Holiday homes and serviced apartments from Xotelo's Dubai list (condominiums, villas, cottages; not those already priced as hotels), priced like hotels: `homes` rows `[name, lat, lng, average, nights, lowest, highest, checked, rating, reviews, Tripadvisor link, Xotelo key]` (priced places only), `places` (every candidate) and `tried`. Up to 50 asked a pull (`collector/holiday_homes.py`, about 3 minutes, after the hotel prices); prices older than 10 days dropped; kept as they were when Xotelo fails |
| `serp_stays.json` | Google Hotels prices through SerpApi (`collector/serp_stays.py`, needs `SERPAPI_KEY`): `hotels` (our places Xotelo hasn't priced, same row shape as hotel prices plus rating, reviews, class), `homes` (vacation rentals not already among Xotelo's holiday homes, same shape as holiday homes), `seen` (every place found, by Google's token), and this month's searches used (`used`, of 240). Two searches a pull; prices older than 10 days dropped |
| `stay_history.json` | Our own hotel and holiday home price history: one entry a day (`collector/stay_history.py`, right after the build), each area's median price a night and how many places it rests on, plus Dubai's median, for both kinds. A later pull the same day replaces that day; days are never removed (about 4 KB a day). The page loads it the first time a Hotels or Holiday homes view is drawn |
| `changes.json` | What changed since the previous publication: the biggest moves, unconfirmed jumps, new and gone areas (feeds the rent check's "since your last visit") |
| `history/<date>.json` | Our own rent history: every area's medians for each publication (about 30 KB each), named by the date the data runs to |
| `history/ccp/<date>.json` | The same for the older districts (Continental Club), by Continental Club's own date |
| `status.json` | The status page's counts: totals, what each source gave and what's used, left out and waiting |
| `runs.jsonl` | One line per pull (the last 300): when, how long, each source's state, how far the data runs |
| `state.json` | Each source's state: ok, failed with the reason, or off, and when it last ran |
| `datadubai/` | Dubai Data's files as last fetched (CSV export or rebuilt from the live pages), with ETags |
| `crosscheck/` | The cross-check sources' figures (and the older districts from Continental Club) |
| `contracts/` | The contract archive, once contract-level data (Dubai Pulse or DLD) is switched on |
| `osm_area_points.csv`, `dm_communities.csv`, `dm_outlines.json` | Map points and outlines from OpenStreetMap and Dubai Municipality |

`scripts/data-branch.sh load` copies the `data` branch into `./data`; run it before anything that needs the data.

## 3. What one pull does, step by step

1. **Load:** copy the current `data` branch into `./data`.
2. **Fetch from each source.** Each one runs on its own; one failing doesn't stop the others.
   - **DLD open-data service** (`collector/fetch_dld.py`): off until DLD gives written permission.
   - **Dubai Pulse API** (`collector/fetch_ejari.py`): real contract-level Ejari data, but it needs the API key still awaited from Digital Dubai. It also imports any files dropped in `data/inbox/`.
   - **Dubai Data** (`collector/fetch_datadubai.py`): **the main source today.** Medians per community and per bedroom count, from DLD's Ejari feed, under CC BY 4.0.
     - It first checks datadubai.ae's live pages. When their date has moved on, it reads each community's page, one request a second. Pages that fail get one more try after 30 seconds (never after a "slow down" or "forbidden" answer); a page failing twice means the weekly export is used instead.
     - Each new publication's date and when it was first seen go into `state.json` (`published_seen`, last 30), to learn when Dubai Data publishes.
     - Otherwise it uses the weekly export from Hugging Face, with the GitHub mirror as a fallback.
     - A file that hasn't changed costs one tiny request (an ETag check).
   - **Cross-checks** (`collector/fetch_crosscheck.py`, at most once a day): dubairealestatedata.com and continentalclub.ae. Continental Club also supplies the **56 older districts** (Deira, Bur Dubai, Karama…) that Dubai Data doesn't cover.
   - **Placing new areas** (`collector/geocode_missing.py`): an area with no map point gets a careful OpenStreetMap look-up, at most 10 per pull. A point is only accepted after checks (inside Dubai, a place rather than a shop or road, a close name match).
3. **Build** (`collector/build.py`): turns the raw files into what the page shows (section 4), compares them with our own history (section 5), and writes a summary to the run's page on GitHub: what changed since the previous publication, unconfirmed jumps, and where the cross-check sources differ by more than 15%.
   Before reading Dubai Data's files the build checks they still have the columns it uses; a renamed column stops the run with a message naming it (the previous data stays published).
   **Backup:** if Dubai Data's figures are more than 10 days old while Continental Club's are current, every area is built from Continental Club alone, by official DLD area (1-bedroom medians, fewer areas), and the page says so in its warning sign. It switches back by itself when Dubai Data publishes again.
4. **Check before publishing** (`tests/test_data.py`): the files must be well-formed, the counts must add up, and the placed contracts must match the total. If anything looks broken, nothing is saved.
5. **Log** (`scripts/run_log.py`): one line per pull in `runs.jsonl`, and the hours at which Dubai Data's publications were first seen, in the run's summary.
6. **Save:** commit the generated files to the `data` branch.
   - Files are only added or updated, never deleted.
   - If nothing changed, nothing is committed.
   - If another job saved in the meantime, this one puts its change on top and retries.
7. **Deploy, only if a file the page loads changed** (`areas*.json`, `latest.json`, `meta.json`, `outlines.json`: the `PAGE_FILES` list).
   - `.github/workflows/pages.yml` builds the site from `main`'s code plus the `data` branch's JSON (not the raw archive).
   - It also writes an area page for every area (`a/<area>/`, `scripts/share_pages.py`) and `sitemap.xml`, then publishes to GitHub Pages.
   - If only internal state changed, such as "last checked" times, there's no deploy.

## 4. How the build organises the figures

- **Areas:** Dubai Data communities and DLD areas are matched to one map area each. Each area gets:
  - its median rent, contract count, sale price and gross yield;
  - a breakdown by home size;
  - a 24-month sale-price trend and the change on a year ago;
  - its official DLD area names.
- **Map points** come from, in order of trust: Dubai Municipality's community list, hand-reviewed aliases, then the checked OpenStreetMap results. Coordinates are never guessed. An area with no point still appears in the table and is listed under "Areas not on the map yet".
- **Outlines:** the official Dubai Municipality boundaries are simplified (to about 40 m) and given to the busiest area that shares them.
- **Property types:** one file each for all homes, flats and studios. Labour camps and whole-building leases are kept out of home rents.
- **Thin figures:** anything from fewer than 10 contracts is still published, but flagged so the map draws it dashed.

## 5. Our own history

Dubai Data replaces its medians with each publication, so the build keeps a snapshot of every area's medians per publication (`collector/history.py`, `data/history/<date>.json`), and a separate series for the older districts by Continental Club's own date (`data/history/ccp/`). From the snapshots:

- **Change over time:** each area and home size gets its change against the snapshot about a year back, or, until there is a year of history, the oldest one at least four weeks back. The breakdown shows "Rent +6.5% since 14 Nov 2025".
- **Unconfirmed jumps:** a median (from at least 30 contracts) that moved more than 40% since the previous publication is published but marked: dashed on the map, with a note in its breakdown. The mark clears by itself when the next publication stays close to it.
- **What changed** (`changes.json`, and the run summary): moves of 5% or more, the jumps, new and gone areas.
- **Industrial zones:** areas whose name says "Industrial" are mostly staff accommodation; they are flagged (`staff`), noted on the page, and left out of the rent check's "same home for less nearby" and rank.
- **Sources that differ:** where a cross-check source is more than 15% away from our figure, the area's breakdown says so, with their figure.

The first snapshot is the publication to 16 Nov 2026, so changes appear from mid-December (four weeks later), and year-on-year from November 2027.

## 6. Safety rules

- **Unconfirmed jumps are marked, not hidden** (section 5): a single area's figure can't silently swing the map.
- **Never publish a smaller catalog:** if a build has 30% fewer areas or contracts than the last one, it refuses (`collector/output.py`), and the site keeps the previous data.
- **Polite fetching** (`collector/net.py`): a few small requests, a clear User-Agent, pauses between pages. No logins, no CAPTCHA workarounds, no listing sites. The DLD service stays off without permission.
- **Each source records its own state** (`state.json`, `collector/state.py`): that drives the "Data health" list and stops a failed source from being retried too soon.

## 7. After the pull

- **`freshness.yml` runs every 6 hours** (`scripts/check_fresh.py`). It fails, and GitHub emails the owner, if the data is more than 10 days old, the pulls stop, fewer than 80% of the week's pulls succeeded, a source fails, or the backup source is in use. Each problem also opens its own GitHub issue (label `data-alert`), closed with a note when it is no longer seen, so every outage leaves a record. Busy areas still missing a map point are listed as warnings, without an email.
- **The weekly "Place unplaced areas" job** (`geocode.yml`) refreshes the Municipality community list and outlines, rebuilds, saves and deploys.
- **The status page** (https://jamalxcode.github.io/dubai_map/status/, `status/index.html` + `assets/app/status.js`) shows, live: the totals (contracts, areas, figures, what's on the map), what each source pulled in the last pull, what each source gives and how much of it the map uses, what's left out (communities with no median, older-district areas Dubai Data already covers, industrial zones kept out of comparisons), what's waiting (areas without a map point, unconfirmed jumps, sources that differ, the Dubai Pulse key, DLD's permission), recent pulls and open alerts. It reads `status.json` (counts the build writes), `state.json` and `runs.jsonl` from the data branch, and GitHub's public API, in the visitor's browser, so it is current between deploys; the site's own copies are the fallback.
- **In the browser,** the page loads only the small JSON files. It's static, so visitors never touch the sources.

So after every pull, either:

- nothing changed and nothing happens, or
- new figures are checked, committed to `data` with a date stamp, and deployed live within a few minutes.

If a source fails, the last good data stays up, the failure shows under "Data health", and the freshness check emails the owner if it lasts.
