# Dubai Rent Atlas

A map of what people **actually pay** to rent across Dubai, built from **Ejari rent contracts** registered with the Dubai Land Department (DLD). Not advertised asking prices, and not the RERA Rental Index calculator.

- **Site:** https://jamalxcode.github.io/dubai_map/
- **Repository:** https://github.com/jamalxcode/dubai_map

## What you see

- **Rent as text on the map:** each area shows its median yearly rent, e.g. "AED 65k · Jumeirah Village Circle". Areas too close to read apart merge into one blue label with the contract-weighted average; tap to zoom in. Labels never overlap.
- **Property type:** Homes (flats, studios and villas together, the default), Flats, Studios, Villas, Commercial, or Everything. Labour camps, land and bulk leases (one contract worth millions spread over tiny units) only appear under Everything, so they never skew home rents.
- **Average rent in view:** one big number for whatever is on screen, rolling to the new value as you pan and zoom.
- **Filters:** search, unit (studio, 1 bed, 2 bed… where DLD records rooms), rent range, and what the labels show (median rent, rent per m², contract count).
- **Popup per area:** median and middle-half range, rent per m², new vs renewal, monthly trend, unit breakdown and busiest buildings.
- **Table:** the newest contracts, downloadable as CSV.
- **Warning:** a yellow sign appears if the data is older than it should be.
- **Phone:** map first; filters slide up from a button.

Every DLD area is placed at a reference point **inside its official Dubai Municipality community** (not on a building); see "Placing areas on the map".

Built as one static page: [Leaflet](https://leafletjs.com/) for the map, [GSAP](https://gsap.com/) for motion, [Lenis](https://lenis.darkroom.engineering/) for smooth scrolling, and two [React Bits](https://reactbits.dev/) components (Counter and SplitText) ported to plain JavaScript so the site still needs no build step.

## Data sources

One main source and several backups. If one fails, the next one keeps the map going, and `data/meta.json` → `sources` shows the status of each.

| # | Source | Role | Key? | Freshness |
|---|---|---|---|---|
| 1 | **DLD open data** (`gateway.dubailand.gov.ae/open-data`, the service behind DLD's [Real Estate Data](https://dubailand.gov.ae/en/open-data/real-estate-data/) page) | **Main.** Every Ejari contract, homes only on the map | No | Daily |
| 2 | [Ejari on Dubai Pulse](https://www.dubaipulse.gov.ae/data/dld-registration/dld_rent_contracts-open) API | Backup, only on days the main source failed | Yes (`DUBAI_PULSE_KEY` / `_SECRET`) | Daily |
| 3 | [Dubai Data](https://datadubai.ae/) community medians, from [Hugging Face](https://huggingface.co/datasets/datadubai/dubai-real-estate-dld), then the [GitHub mirror](https://github.com/datadubai/dubai-real-estate-dld) | Backup for the map until our own history covers a year; also maps DLD area names to communities | No | Weekly |
| 4 | Manual CSV in `data/inbox/` | Always imported | No | When added |

**Which one the map shows:** our own contracts (1 and 2) once they cover at least 300 days and 1,000 contracts; Dubai Data (3) before that. The DLD service only returns contracts from January 2026 onward, so the switch happens by itself after the back-fill finishes (about 11 days after the first run).

Dubai Data attribution: *Dubai Data (datadubai.ae), Continental Club Property — based on Dubai Land Department open data. Not an official DLD product.* (CC BY 4.0)

**About source 1:** DLD offers this service through its public website rather than as a documented API with written terms, so this repo treats it carefully (see below). If DLD ever asks us to stop, set the repo variable `DLD_DISABLED=1` and the backups carry on. No source includes tenant or unit details.

## How the daily update works (and why it won't get us blocked)

`.github/workflows/daily-ejari.yml` runs once a day at **05:17 Kuwait time**. Each step may fail without stopping the others:

1. `collector/fetch_dld.py` (main):
   - at most **one run per Dubai calendar day** (re-runs the same day don't contact DLD unless "force" is ticked);
   - pulls the last 3 days, plus one 6-day slice of the last 60 days (cycling, so late registrations are caught within about 10 days);
   - back-fills **one missing month per day**, newest first, until January 2026 onward is complete;
   - requests are **sequential**, 2,000 rows per page, a 2-second pause between pages, at most 70 pages per run;
   - on errors or "slow down" it waits briefly at most twice, then **stops until tomorrow**;
   - an honest User-Agent pointing at this repo; no CAPTCHA pages are touched.
2. `collector/fetch_ejari.py` (backup): calls the Dubai Pulse API only if keys are set **and** the main source failed today, with the same politeness rules. Also imports any CSV in `data/inbox/`.
3. New contracts are merged into small daily files under `data/contracts/YYYY-MM/DD.csv.gz` (de-duplicated, so overlaps and corrections are safe; daily files keep each commit small).
4. `collector/fetch_datadubai.py` (backup) refreshes the Dubai Data files with conditional requests (Hugging Face first, GitHub if that fails).
5. `collector/build.py` writes the small files the page loads: `data/areas.json`, `data/latest.json`, `data/meta.json`. Only homes count (flats, studios, villas): shops, offices, labour camps and whole-building leases would skew the medians.
6. The data checks in `tests/test_data.py` run; if they fail, nothing is committed.
7. The data commit triggers the Pages deploy. Only the page and those JSON files are published, not the raw archive.

### Optional: Dubai Pulse key for backup source 2

1. Register at [Dubai Pulse](https://www.dubaipulse.gov.ae/) and request API access to `dld_rent_contracts-open`. You get an API key and secret by email.
2. In this repo: **Settings → Secrets and variables → Actions**
   - Secrets: `DUBAI_PULSE_KEY`, `DUBAI_PULSE_SECRET`
   - Variable `EJARI_API_URL`, only if the endpoint in your Dubai Pulse account differs from the default `https://api.dubaipulse.gov.ae/open/dld/dld_rent_contracts-open`
   - Variable `EJARI_FILTER`, only if the date filter syntax needs adjusting (default `contract_start_date>='{from}' AND contract_start_date<='{to}'`)
3. Run **Actions → Daily Ejari pull → Run workflow** once to check. `data/meta.json` → `state.last_api_status` shows `ok` or the reason it stopped.

### No API key yet? Manual import

Download a Rents CSV from [DLD open data](https://dubailand.gov.ae/en/open-data/real-estate-data/) yourself and upload it into `data/inbox/` on GitHub (Add file → Upload files). The workflow imports it, deletes it from the inbox and rebuilds the map. The API isn't touched.

## Placing areas on the map

In order, the first match wins:

1. `data/area_locations.csv`: hand-checked points (`field=area` matches the official DLD area name, `field=any` a marketing name anywhere in the project).
2. Dubai Data's DLD-area → community table, placed at the hand-checked points in `data/community_locations.csv`.
3. **Official Dubai Municipality communities** (`data/dm_communities.csv`): one point per community, guaranteed to lie inside its official boundary. Made by `collector/dm_communities.py` from DM's open data. DLD spellings that differ from DM's (e.g. "Al Murqabat" vs "Al Muraqqabat") are in `data/dld_dm_aliases.csv`, each one reviewed.
4. **OpenStreetMap** (`data/osm_area_points.csv`): for brand-new areas DM hasn't published yet. `collector/geocode_missing.py` accepts a result only if it is inside Dubai, is a place (not a shop or road) and its name matches.

**Actions → Place unplaced areas** runs steps 3 and 4 every Sunday (and by hand). Tested on all of 2026's contracts: 99.6% of home contracts land on the map; the rest are listed under "Areas not on the map yet".

## Run locally

```sh
python3 collector/fetch_ejari.py   # imports data/inbox/*.csv; API pull if keys are in env
python3 collector/build.py
python3 -m http.server 8080        # open http://localhost:8080
```

Standard-library Python only; nothing to install.

### Tests

```sh
python3 -m unittest discover -s tests -v   # collector, build, and sanity checks on the committed data
node --test tests/page.test.mjs            # stale-data rule and pinned script hashes in index.html
```

`.github/workflows/tests.yml` runs both on every push and pull request. The daily data job also runs the data checks before it commits, so a broken source file is not published.

## Roadmap

1. First real pull: confirm endpoint, filter syntax and field values; tune `area_locations.csv` from `unmatched_areas`.
2. Community polygons (Dubai Municipality `dm_community` on Dubai Pulse) with a DLD-area crosswalk, to shade areas under the rent labels.
3. Building/project points, geocoded once per project name and cached with a confidence level; unresolved projects stay at community level.
4. Longer trends, year-on-year change, new-vs-renewal rent gap.
5. Private comparison against your own units, kept out of this public repo.
6. Other cities in the region, each with its own source adapter and location file.

## Notes

Independent tool, not an official DLD/RERA service. Respect Dubai Pulse terms. Never commit API keys (they live in GitHub Secrets). Map tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), mapping via [Leaflet](https://leafletjs.com/). Design goals: [docs/DESIGN_GOALS.md](docs/DESIGN_GOALS.md) · decision log: [docs/DECISIONS.md](docs/DECISIONS.md) · how it was built: [docs/CONVERSATION.md](docs/CONVERSATION.md).
