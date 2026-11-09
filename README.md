# Dubai Rent Atlas

A map of what people **actually pay** to rent across Dubai, built from **Ejari rent contracts** registered with the Dubai Land Department (DLD). Not advertised asking prices, and not the RERA Rental Index calculator.

- **Site:** https://jamalxcode.github.io/dubai_map/
- **Repository:** https://github.com/jamalxcode/dubai_map

## What you see

- **Community bubbles:** size = contracts in the last 12 months, colour = median annual rent, AED per m², or contract count. Filter by unit type.
- **Popup per community:** median and middle-half range, new vs renewal counts, a 12-month median trend, medians by unit type, and the busiest projects/buildings.
- **Table:** every contract that started in the last 30 days, searchable, filterable by rent, exportable to CSV.
- **Freshness:** last data build and last Ejari pull, shown in Kuwait time.

Bubbles sit at an **approximate reference point per community**, not on a building. Areas without a reference point still appear in the table and are listed under "Areas not yet placed on the map".

## Data sources

The map uses whichever is richer, automatically:

1. **Per-contract Ejari data (once a Dubai Pulse key is added).** [Ejari rent contracts on Dubai Pulse](https://www.dubaipulse.gov.ae/data/dld-registration/dld_rent_contracts-open), published by DLD. Gives contract-level detail: 12-month trend, AED/m², new vs renewal, top buildings, last-30-days table. Used once at least 1,000 contracts from the last 12 months are stored.
2. **Community medians from Dubai Data (works today, no key).** [Dubai Data](https://datadubai.ae/) imports the same Ejari feed daily and publishes trailing-12-month median annual rent per community and per bedroom count, plus gross yield and median sale price, under **CC BY 4.0** ([GitHub mirror](https://github.com/datadubai/dubai-real-estate-dld), updated weekly). Covers ~300,000 contracts across ~100 master communities. Older non-master-planned districts (Deira, Bur Dubai, Karama…) are not in it.

   Attribution: *Dubai Data (datadubai.ae), Continental Club Property — based on Dubai Land Department open data. Not an official DLD product.*

Neither source includes tenant or unit details.

## How the daily update works (and why it won't get us blocked)

`.github/workflows/daily-ejari.yml` runs once a day at **05:17 Kuwait time**:

1. `collector/fetch_ejari.py` pulls contracts from the Dubai Pulse API, **politely**:
   - at most **one pull per Dubai calendar day** (a state file records it; re-runs the same day don't call the API, even manual ones, unless "force" is ticked);
   - one access token per run, a small window (last 2 days of contract start dates);
   - pages of 1,000 rows with a 4-second pause between pages, capped at 30 pages;
   - on "slow down" (429/503) it waits as asked at most twice, then **stops until tomorrow**;
   - an honest User-Agent pointing at this repo; no scraping of CAPTCHA-protected pages.
2. New contracts are merged into monthly files under `data/contracts/` (deduplicated on contract id + line, so overlaps and corrections are safe).
3. `collector/fetch_datadubai.py` refreshes the Dubai Data files from GitHub (conditional requests, so unchanged files cost nothing; DLD is not contacted).
4. `collector/build.py` writes the small files the page loads: `data/areas.json`, `data/latest.json`, `data/meta.json`.
5. The data commit triggers the Pages deploy. Only the page and those JSON files are published, not the raw archive.

### Setup (one time)

1. Register at [Dubai Pulse](https://www.dubaipulse.gov.ae/) and request API access to `dld_rent_contracts-open`. You get an API key and secret by email.
2. In this repo: **Settings → Secrets and variables → Actions**
   - Secrets: `DUBAI_PULSE_KEY`, `DUBAI_PULSE_SECRET`
   - Variable `EJARI_API_URL`, only if the endpoint in your Dubai Pulse account differs from the default `https://api.dubaipulse.gov.ae/open/dld/dld_rent_contracts-open`
   - Variable `EJARI_FILTER`, only if the date filter syntax needs adjusting (default `contract_start_date>='{from}' AND contract_start_date<='{to}'`)
3. Run **Actions → Daily Ejari pull → Run workflow** once to check. `data/meta.json` → `state.last_api_status` shows `ok` or the reason it stopped.

### No API key yet? Manual import

Download a Rents CSV from [DLD open data](https://dubailand.gov.ae/en/open-data/real-estate-data/) yourself and upload it into `data/inbox/` on GitHub (Add file → Upload files). The workflow imports it, deletes it from the inbox and rebuilds the map. The API isn't touched.

## Placing communities on the map

`data/community_locations.csv` holds an approximate point per Dubai Data community (cross-checked against project coordinates in the same dataset). `data/area_locations.csv` maps names to approximate reference points:

- `field=area` rows match the official DLD area name exactly (e.g. Marsa Dubai → Dubai Marina, Al Barsha South Fourth → JVC, Al Warsan First → International City).
- `field=any` rows match a marketing name anywhere in the master project, project or area (e.g. "damac hills 2").

After real data arrives, `data/meta.json` → `unmatched_areas` lists the busiest unplaced areas. Add rows for them.

## Run locally

```sh
python3 collector/fetch_ejari.py   # imports data/inbox/*.csv; API pull if keys are in env
python3 collector/build.py
python3 -m http.server 8080        # open http://localhost:8080
```

Standard-library Python only; nothing to install.

## Roadmap

1. First real pull: confirm endpoint, filter syntax and field values; tune `area_locations.csv` from `unmatched_areas`.
2. Community polygons (Dubai Municipality `dm_community` on Dubai Pulse) with a DLD-area crosswalk, to turn bubbles into a shaded map.
3. Building/project points, geocoded once per project name and cached with a confidence level; unresolved projects stay at community level.
4. Longer trends, year-on-year change, new-vs-renewal rent gap.
5. Private comparison against your own units, kept out of this public repo.

## Notes

Independent tool, not an official DLD/RERA service. Respect Dubai Pulse terms. Never commit API keys (they live in GitHub Secrets). Map tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), mapping via [Leaflet](https://leafletjs.com/). Design history: [docs/DECISIONS.md](docs/DECISIONS.md).
