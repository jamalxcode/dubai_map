# Dubai Rent Atlas

A map of what people **actually pay** to rent across Dubai, built from **Ejari rent contracts** registered with the Dubai Land Department (DLD). Not advertised asking prices, and not the RERA Rental Index calculator.

- **Site:** https://jamalxcode.github.io/dubai_map/
- **Repository:** https://github.com/jamalxcode/dubai_map

## What you see

- **Rent as text on the map:** each community shows its median annual rent, e.g. "AED 67k · Jumeirah Village Circle".
- **One number per group:** communities too close to read apart merge into one dark label with the average rent (weighted by contracts), e.g. "AED 75k avg · 22 communities". Click to zoom in and split it. Labels never overlap.
- **Average rent in view:** one headline number for whatever is on screen, updating as you pan and zoom.
- **Filters:** unit type (studio, 1-bed…), and show rent, gross yield or contract count.
- **Popup per community:** medians by unit type, gross yield and median sale price (plus trend, AED/m² and top buildings once per-contract data is available).
- **Table:** community × unit type with median rent, contracts and yield, exportable to CSV.
- **Freshness:** data-through date and last refresh, in Kuwait time.

Labels sit at an **approximate reference point per community**, not on a building. Areas without a reference point still appear in the table and are listed under "Areas not yet placed on the map".

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

## Placing communities on the map

`data/community_locations.csv` holds an approximate point per Dubai Data community (cross-checked against project coordinates in the same dataset). `data/area_locations.csv` maps names to approximate reference points:

- `field=area` rows match the official DLD area name exactly (e.g. Marsa Dubai → Dubai Marina, Al Barsha South Fourth → JVC, Al Warsan First → International City).
- `field=any` rows match a marketing name anywhere in the master project, project or area (e.g. "damac hills 2").

Names are also matched through Dubai Data's DLD-area → community table. Once the map runs on DLD contracts, `data/meta.json` → `unmatched_areas` lists the busiest unplaced areas (mostly older districts such as Al Murqabat, Mankhool or Al Qusais). **Actions → Geocode missing communities** suggests OpenStreetMap points for them; check each one, then add it to `area_locations.csv`.

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
