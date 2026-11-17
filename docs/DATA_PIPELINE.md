# How the data is pulled, organised and stored

Three times a day a GitHub Actions job pulls rents from public sources, turns them into a few small JSON files, checks them, and saves them. The website only reads those files. This page explains each part; the exact rules and thresholds are in [BUSINESS_RULES.md](BUSINESS_RULES.md).

## 1. When it runs

The **"Daily Ejari pull"** workflow (`.github/workflows/daily-ejari.yml`) runs at **06:17, 14:17 and 22:17 UAE time** (02:17, 10:17, 18:17 UTC). cron-job.org also starts it, because GitHub's own scheduler can be late or skip runs. Its first step stops GitHub from switching off a quiet schedule after 60 days.

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
     - It first checks datadubai.ae's live pages. When their date has moved on, it reads each community's page, one request a second.
     - Otherwise it uses the weekly export from Hugging Face, with the GitHub mirror as a fallback.
     - A file that hasn't changed costs one tiny request (an ETag check).
   - **Cross-checks** (`collector/fetch_crosscheck.py`, at most once a day): dubairealestatedata.com and continentalclub.ae. Continental Club also supplies the **56 older districts** (Deira, Bur Dubai, Karama…) that Dubai Data doesn't cover.
   - **Placing new areas** (`collector/geocode_missing.py`): an area with no map point gets a careful OpenStreetMap look-up, at most 10 per pull. A point is only accepted after checks (inside Dubai, a place rather than a shop or road, a close name match).
3. **Build** (`collector/build.py`): turns the raw files into what the page shows (section 4).
4. **Check before publishing** (`tests/test_data.py`): the files must be well-formed, the counts must add up, and the placed contracts must match the total. If anything looks broken, nothing is saved.
5. **Save:** commit the generated files to the `data` branch.
   - Files are only added or updated, never deleted.
   - If nothing changed, nothing is committed.
   - If another job saved in the meantime, this one puts its change on top and retries.
6. **Deploy, only if a file the page loads changed** (`areas*.json`, `latest.json`, `meta.json`, `outlines.json`: the `PAGE_FILES` list).
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

## 5. Safety rules

- **Never publish a smaller catalog:** if a build has 30% fewer areas or contracts than the last one, it refuses (`collector/output.py`), and the site keeps the previous data.
- **Polite fetching** (`collector/net.py`): a few small requests, a clear User-Agent, pauses between pages. No logins, no CAPTCHA workarounds, no listing sites. The DLD service stays off without permission.
- **Each source records its own state** (`state.json`, `collector/state.py`): that drives the "Data health" list and stops a failed source from being retried too soon.

## 6. After the pull

- **`freshness.yml` runs every 6 hours** (`scripts/check_fresh.py`). It fails, and GitHub emails the owner, if the data is more than 7 days old or the pulls stop. Busy areas still missing a map point are listed as warnings, without an email.
- **The weekly "Place unplaced areas" job** (`geocode.yml`) refreshes the Municipality community list and outlines, rebuilds, saves and deploys.
- **In the browser,** the page loads only the small JSON files. It's static, so visitors never touch the sources.

So after every pull, either:

- nothing changed and nothing happens, or
- new figures are checked, committed to `data` with a date stamp, and deployed live within a few minutes.

If a source fails, the last good data stays up, the failure shows under "Data health", and the freshness check emails the owner if it lasts.
