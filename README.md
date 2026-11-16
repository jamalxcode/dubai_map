# Dubai Rent Atlas

A map of what people **actually pay** to rent across Dubai, built from **Ejari rent contracts** registered with the Dubai Land Department (DLD). Not advertised asking prices, and not the RERA Rental Index calculator.

- **Site:** https://jamalxcode.github.io/dubai_map/
- **Repository:** https://github.com/jamalxcode/dubai_map

## What you see

- **Check a rent (the main action):** type an area (nicknames like JVC work, so do official DLD names and typos), pick the home, optionally add your rent. You get the median, how your rent compares, cheaper areas nearby for the same home, and where the area ranks. One recommended next step: compare, save, set a renewal reminder, or see it on the map. Links like `?area=Arjan&unit=Studios` open a check directly. On phones the card is one line until tapped, so the map stays high on the first screen.
- **My areas:** save areas to see how their rent moves since you saved them; recent checks and the map view come back on your next visit; a short "new figures since your last visit" note appears only when the data has moved on (can be switched off). Everything is kept in your browser only, never sent anywhere, and can be downloaded, imported or deleted.
- **Reminders in your own calendar:** a renewal reminder (30, 60 or 90 days before your lease renews) and an optional "check the market" reminder every 3, 6 or 12 months, as calendar files. No accounts or push messages; delete the event to stop it.
- **Rent as text on the map:** each area shows its median yearly rent, e.g. "AED 65k · Jumeirah Village Circle". Areas too close to read apart merge into one blue label with the contract-weighted average; tap to zoom in. Labels never overlap.
- **Property type:** Homes (flats, studios and villas together, the default), Flats, Studios, Villas, Commercial, or Everything. Labour camps, land and bulk leases (one contract worth millions spread over tiny units) only appear under Everything, so they never skew home rents.
- **Average rent in view:** one big number for whatever is on screen, rolling to the new value as you pan and zoom.
- **Filters:** search, unit (studio, 1 bed, 2 bed… where DLD records rooms), rent range, and what the labels show (median rent, rent per m², contract count). The map **starts on 1-bedroom**, the one measure every area has (the older districts publish no all-homes median); "All units" shows only areas with an all-homes median, so two different measures are never coloured or averaged together.
- **Keyboard:** map labels are buttons: Tab to one, Enter or Space opens its breakdown (or zooms into a group).
- **Popup per area:** median and middle-half range, rent per m², new vs renewal, monthly trend, unit breakdown and busiest buildings.
- **Table:** the newest contracts, downloadable as CSV.
- **Warning:** a yellow sign appears if the data is older than it should be.
- **Phone:** map first; filters slide up from a button.
- **Wide screens (1100 px and up):** two panes: the map fills the window height on the right and stays put; the title, rent check, filters, figures and table scroll in a pane on the left. Below 1100 px the page is one column with the map right after the filters.
- **Zoom:** larger + and − buttons and an **All Dubai** button that brings the whole city back.
- **Rent check moves the map** (two-pane layout): checking an area flies the map there and opens its breakdown. On narrower screens, where the map is further down, "Show on the map" does it.
- **Rent dial and shaded labels:** a small pie next to every rent (map labels, the headline, the rent check) fills as the rent approaches AED 100k (full at 100k or more), and each rent label's box is shaded from the left by the same share (AED 52k shades about half the box), for a reading at a glance.

Every DLD area is placed at a reference point **inside its official Dubai Municipality community** (not on a building); see "Placing areas on the map".

Built as one static page: [Leaflet](https://leafletjs.com/) for the map, [GSAP](https://gsap.com/) for motion, [Lenis](https://lenis.darkroom.engineering/) for smooth scrolling, and two [React Bits](https://reactbits.dev/) components (Counter and SplitText) ported to plain JavaScript so the site still needs no build step.

## Data sources

| Source | Licence / terms | Key? | Freshness | Status |
|---|---|---|---|---|
| [Ejari on Dubai Pulse](https://www.dubaipulse.gov.ae/data/dld-registration/dld_rent_contracts-open) API | Dubai open-data licence (Dubai Data Law); credit the source | Yes, free (`DUBAI_PULSE_KEY` / `_SECRET`) | Daily | **Recommended daily source.** Runs as soon as the key is added. |
| [Dubai Data](https://datadubai.ae/) community medians: daily from the site's own JSON pages (`datadubai.ae/rents.json` + one page per community), else the weekly export on [Hugging Face](https://huggingface.co/datasets/datadubai/dubai-real-estate-dld) / the [GitHub mirror](https://github.com/datadubai/dubai-real-estate-dld) | CC BY 4.0; credit + licence link + say what changed (all on the page). The site offers its static JSON for reuse, no key; robots.txt allows these paths | No | Daily (data ~3 days behind DLD); weekly if the pages fail | Used today. Also maps DLD area names to communities. |
| DLD's open-data service (`gateway.dubailand.gov.ae/open-data`, behind DLD's [Real Estate Data](https://dubailand.gov.ae/en/open-data/real-estate-data/) page) | Only DLD's [website terms](https://dubailand.gov.ae/en/terms-conditions) apply: personal, noncommercial use unless DLD agrees in writing | No | Daily | **Off.** Built and tested, but only switched on (`DLD_ENABLED=1`) once DLD gives written permission. |
| Manual CSV in `data/inbox/` | Whatever licence the file came with | No | When added | Always imported. |
| **Cross-check:** [dubairealestatedata.com](https://www.dubairealestatedata.com/rents) (`/rents.md`: new-contract apartment median, top 30 areas, built from Dubai Pulse's bulk data) | CC BY 4.0, reuse incl. commercial with credit (its terms); robots.txt allows the page | No | Daily check (they update weekly) | Compared with our medians; the result is listed on the page. Never shown instead of ours. |
| [continentalclub.ae](https://continentalclub.ae/data-center/) (`/rents.md`: median by unit size for ~100 official DLD areas) | Data pages CC BY 4.0 incl. commercial (data centre); robots.txt: "Crawl it, quote it, cite it" | No | Daily | **Older districts:** the ~56 DLD areas Dubai Data doesn't publish (Deira, Bur Dubai, Karama, Al Qusais…) are added from it, credited on the page and in each popup (`collector/ccp_areas.py`). Their headline is the 1-bedroom median, labelled as such (the source has no all-homes median and no count per home type). Also a cross-check of our import for the areas both cover. |

**Sources reviewed on 16 Nov 2026** (one polite request per page from GitHub Actions):
- DLD [Real Estate Data](https://dubailand.gov.ae/en/open-data/real-estate-data/): the rents search and CSV download sit behind a CAPTCHA, and the page points to data.dubai for earlier years. Not automated.
- Dubai Pulse API: the gateway answers at both `apis.data.dubai/open/dld/dld_rent_contracts-open-api` (new host, tried first) and `api.dubaipulse.gov.ae/open/dld/dld_rent_contracts-open` (fallback); both return 401 without a key. Token: `api.dubaipulse.gov.ae/oauth/client_credential/accesstoken`. Ready the moment the key is added.
- DLD [Rental Index](https://dubailand.gov.ae/en/eservices/rental-index/): the allowed-increase calculator (a form), not rents. Not used, by design.
- DLD [Residential Rental Performance Index](https://dubailand.gov.ae/en/open-data/residential-rental-performance-index/): latest figures Q3 2022 and the page says it "should not be used for any commercial purposes". Not used.
- [Dubai Data](https://datadubai.ae/) on Hugging Face / GitHub: in use (above).
- [overit.ae](https://overit.ae/sources): company and register data, no rent figures; robots.txt content signals allow reference use only. Not used.

**Which one the map shows:** our own contracts once they hold at least 1,000 home contracts and contracts in at least 43 of the last 52 weeks (about 300 days; counted week by week, so one old import doesn't count as a full year); Dubai Data before that. The daily Dubai Pulse pull only covers recent weeks, so on its own it takes about 10 months to build up that history; importing a year of contracts once gets there straight away: download Dubai Pulse's full Ejari CSV ([dld_rent_contracts-open](https://www.dubaipulse.gov.ae/data/dld-registration/dld_rent_contracts-open), open-data licence), cut it to the last 12 months, and drop it in `data/inbox/`. `data/meta.json` → `sources` shows the status of each source, and the page lists it under "Where the numbers come from".

Dubai Data attribution: *Dubai Data (datadubai.ae), Continental Club Property — based on Dubai Land Department open data. Not an official DLD product.* (CC BY 4.0). No source includes tenant or unit details.

## How the update works (three times a day, and why it won't get us blocked)

`.github/workflows/daily-ejari.yml` runs at **05:17, 13:17 and 21:17 Kuwait time**, started by cron-job.org (see below), with GitHub's own schedule as a backup. Every source waits **at least 6 hours** between pulls, so a duplicate start does nothing; the heavier extras (late-registration slices, month back-fill) run only on the first pull of a Dubai day. Each step may fail without stopping the others:

1. `collector/fetch_dld.py` (**off unless `DLD_ENABLED=1`**, see above):
   - at most **one run every 6 hours** (sooner only if "force" is ticked); the slice and the back-fill below run on the first run of a Dubai day only;
   - pulls the last 3 days, plus one 6-day slice of the last 60 days (cycling, so late registrations are caught within about 10 days);
   - back-fills **one missing month per day**, newest first, until January 2026 onward is complete;
   - requests are **sequential**, 2,000 rows per page, a 2-second pause between pages, at most 70 pages per run;
   - on errors or "slow down" it waits briefly at most twice, then **stops until tomorrow**;
   - an honest User-Agent pointing at this repo; no CAPTCHA pages are touched.
2. `collector/fetch_ejari.py`: calls the Dubai Pulse API if keys are set (skipped on days the DLD service ran), with the same politeness rules: at most every 6 hours, contract start dates from 3 days back to 14 ahead plus (first pull of the day only) one 6-day slice of the last 60 days (cycling, so late registrations are caught within about 10 days), 1,000-row pages 4 seconds apart, at most 60 pages. Rows fetched before a stop are kept. Also imports any CSV in `data/inbox/`.
3. New contracts are merged into small daily files under `data/contracts/YYYY-MM/DD.csv.gz` on the **`data` branch** (de-duplicated, so overlaps and corrections are safe; daily files keep each commit small).
4. `collector/fetch_datadubai.py` reads Dubai Data's daily JSON pages at most every 6 hours: `rents.json` (one small request), then, only if it has a newer "through" date, one page per community, one request a second (about 100 requests, 2 minutes). All-or-nothing: if any page fails, the previous files stay and the weekly export (Hugging Face, then GitHub, conditional requests) is used. `DATADUBAI_LIVE=0` turns the daily pages off.
5. `collector/build.py` writes the small files the page loads: `data/areas.json`, `data/latest.json`, `data/meta.json`. Only homes count (flats, studios, villas): shops, offices, labour camps and whole-building leases would skew the medians.
6. If contracts, mapped contracts or areas fell by more than 30% since the last build (same source), `build.py` refuses to publish and keeps the previous files; re-run with "allow shrink" ticked if the drop is real. Then the data checks in `tests/test_data.py` run; if they fail, nothing is committed.
7. `collector/fetch_crosscheck.py` reads the two cross-check pages at most once a day; `build.py` compares them with our medians and lists the result on the page.
8. The data is saved to the **`data` branch**, and the site is redeployed only if a file the page loads changed (source state alone doesn't redeploy). Only the page and those JSON files are published, not the raw archive.

### The timer: cron-job.org

GitHub's schedules run late (this repo's daily job started about 7 hours late on some days), so, as for Flattery and heat.sala.company, [cron-job.org](https://console.cron-job.org/) starts the workflow through GitHub's API:

- Token: a fine-grained GitHub token for **jamalxcode/dubai_map only**, permission **Actions: read and write** (or add this repo to the token the Flattery jobs already use).
- Three jobs (or one job with three times): `POST https://api.github.com/repos/jamalxcode/dubai_map/actions/workflows/daily-ejari.yml/dispatches`, body `{"ref":"main"}`, headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `Content-Type: application/json`; at **02:17, 10:17 and 18:17 UTC**. GitHub answers `204` when it worked.
- GitHub's schedule stays on as a backup. The token expires; renew it in the cron-job.org jobs before it does.
- **Freshness check** (`.github/workflows/freshness.yml`, `scripts/check_fresh.py`, every 6 hours): fails, so GitHub emails you, when the data is over 10 days old, the latest pull is over 14 hours old or failed (cron-job.org stopped, token expired), the live site is behind the saved data (a failed deploy) or down, a source is failing, or a cross-check suddenly disagrees (below 50% / 70% agreement).
- GitHub switches off scheduled workflows after 60 days without repository activity, and data commits now go to the `data` branch, so `main` can stay quiet. Each run of the pull (and of the weekly placing job) switches its own schedule back on (`actions: write`), as Flattery's scan does; a switched-off workflow couldn't be started by cron-job.org either.

### Daily data: add the free Dubai Pulse key

1. Sign up at **[data.dubai](https://data.dubai)** (the Dubai Pulse portal moved there in Dec 2025 to Jan 2026; www.dubaipulse.gov.ae now redirects). Find the DLD rent contracts dataset and request access to **`dld_rent_contracts-open-api`**. Access is granted per dataset; approval time varies. You receive an **API key** (the client id) and an **API secret** (the client secret). Help: help@digitaldubai.ae, 600 56 0000.
   - **From outside the UAE** the sign-up page may answer "The requested URL was rejected" (its firewall; seen from Kuwait and from GitHub's US servers on 16 Nov). Write to support with the support ID it shows and ask for access; a UAE connection also works. The API itself (`apis.data.dubai`) is reachable from anywhere, so the scheduled pulls are unaffected. Status: request sent 16 Nov, waiting.
2. In this repo: **Settings → Secrets and variables → Actions**
   - Secrets: `DUBAI_PULSE_KEY`, `DUBAI_PULSE_SECRET`
   - Variable `EJARI_API_URL`, only to pin one endpoint (by default `https://apis.data.dubai/open/dld/dld_rent_contracts-open-api` is tried first, then `https://api.dubaipulse.gov.ae/open/dld/dld_rent_contracts-open`)
   - Variable `EJARI_FILTER`, only if the date filter syntax needs adjusting (default `contract_start_date>='{from}' AND contract_start_date<='{to}'`)
3. Run **Actions → Daily Ejari pull → Run workflow** (tick "force") once to check. A `403` in the status means the key works but that dataset hasn't been granted yet.
   The collector gets a token from `apis.data.dubai/oauth/client_credential/accesstoken` (old host as fallback), reads 500-row pages (the gateway's maximum), stops at the reported total or if a page repeats, and if the gateway refuses the date-range filter it reads newest first instead. `data/meta.json` (on the `data` branch) → `sources` shows each source's `state` (`ok`, `partial`, `failed`, `off`, `no_key`, `standby`, `not_run`) and the reason it stopped.

### No API key yet? Manual import

Drop a CSV of Ejari contracts into `data/inbox/` on GitHub (Add file → Upload files). The workflow imports it, deletes it from the inbox and rebuilds the map. Use a file you are allowed to republish: Dubai Pulse's [Ejari CSV](https://www.dubaipulse.gov.ae/data/dld-registration/dld_rent_contracts-open) is under Dubai's open-data licence. Files exported from the DLD website fall under DLD's website terms (personal, noncommercial use unless DLD agrees in writing), so don't publish those without DLD's OK.

## Placing areas on the map

In order, the first match wins:

1. `data/area_locations.csv`: hand-checked points (`field=area` matches the official DLD area name, `field=any` a marketing name anywhere in the project).
2. Dubai Data's DLD-area → community table, placed at the hand-checked points in `data/community_locations.csv`.
3. **Official Dubai Municipality communities** (`data/dm_communities.csv`): one point per community, guaranteed to lie inside its official boundary. Made by `collector/dm_communities.py` from DM's open data. DLD spellings that differ from DM's (e.g. "Al Murqabat" vs "Al Muraqqabat") are in `data/dld_dm_aliases.csv`, each one reviewed.
4. **OpenStreetMap** (`data/osm_area_points.csv`): for brand-new areas DM hasn't published yet. `collector/geocode_missing.py` accepts a result only if it is inside Dubai, is a place (not a shop or road) and its name matches.

**Actions → Place unplaced areas** runs steps 3 and 4 every Sunday (and by hand). Tested on all of 2026's contracts: 99.6% of home contracts land on the map; the rest are listed under "Areas not on the map yet".

## Where things live

- **`main`**: code, the page, workflows, and the hand-kept inputs (`data/area_locations.csv`, `data/community_locations.csv`, `data/dld_dm_aliases.csv`, `data/inbox/`).
- **`data`**: everything the jobs generate: the contract archive (`data/contracts/`), the Dubai Data mirror (`data/datadubai/`), computed map points (`dm_communities.csv`, `osm_area_points.csv`), source state (`state.json`) and the files the page loads (`areas*.json`, `latest.json`, `meta.json`). Code history stays readable; data history stays on its own branch.

`scripts/data-branch.sh load` copies the data branch into `./data` (plain files, git's index is untouched; they are in `.gitignore`). `scripts/data-branch.sh save "message"` commits the generated files back, adding and updating only, and retries if another job saved meanwhile. The workflows do both; you only need `load` locally.

## Run locally

```sh
scripts/data-branch.sh load        # the current published data
python3 collector/fetch_ejari.py   # imports data/inbox/*.csv; API pull if keys are in env
python3 collector/build.py
python3 -m http.server 8080        # open http://localhost:8080
```

The collectors share `collector/net.py` (User-Agent, bounded retries, stop for today) and `collector/state.py` (each source's state); `build.py` uses `kinds.py` (property types), `places.py` (map points) and `output.py` (the no-shrink guard and writing).

Standard-library Python only; nothing to install.

### Tests

```sh
python3 -m unittest discover -s tests -v   # collector, build, and sanity checks on the committed data
node --test tests/page.test.mjs            # stale-data rule and pinned script hashes in index.html
```

```sh
npm install --no-save playwright axe-core && npx playwright install chromium
node tests/ui-check.mjs                    # the page in Chromium with the real data: labels, overlaps, rent check, phone layout, keyboard, WCAG 2.1 AA (axe-core)
```

`.github/workflows/tests.yml` runs all three on every push and pull request. The daily data job also runs the data checks before it commits, so a broken source file is not published.

## Roadmap

1. First real pull: confirm endpoint, filter syntax and field values; tune `area_locations.csv` from `unmatched_areas`.
2. Community polygons (Dubai Municipality `dm_community` on Dubai Pulse) with a DLD-area crosswalk, to shade areas under the rent labels.
3. Building/project points, geocoded once per project name and cached with a confidence level; unresolved projects stay at community level.
4. Longer trends, year-on-year change, new-vs-renewal rent gap.
5. Private comparison against your own units, kept out of this public repo.
6. Other cities in the region, each with its own source adapter and location file.

## Licences and terms (checked 15 Nov 2026)

| What | Licence / terms | How this repo complies |
|---|---|---|
| Ejari data via Dubai Pulse | Dubai open-data licence | Source credited on the page and here. |
| DLD open-data service | DLD website terms: personal, noncommercial use without written agreement | Off by default; needs DLD's written OK. |
| Dubai Municipality community boundaries (`dm_communities.csv` is derived from them) | DM open data: mention Dubai Municipality as the source | Credited on the page and here. `dm_communities.py` downloads DM's own file first; two GitHub copies of the same DM file are fallbacks. |
| Dubai Data medians | CC BY 4.0 | Credit, licence link and "reshaped" note on the page. |
| Cross-check pages (dubairealestatedata.com, continentalclub.ae) | CC BY 4.0 (their stated terms for these figures) | Named on the page next to the comparison; their figures are compared, not republished. |
| OpenStreetMap map tiles | [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/) | Exact HTTPS URL, visible attribution, browsers send their normal Referer, no bulk/offline use, "Report a map problem" link. For heavy traffic, switch to another tile provider. |
| `osm_area_points.csv` (from Nominatim) | OpenStreetMap data, ODbL 1.0; [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) | © OpenStreetMap contributors, ODbL. The file stays open in this public repo. Max 1 request/s, identifying User-Agent, results cached. |
| Leaflet | BSD-2-Clause | Leaflet credit in the map corner. |
| GSAP | Standard "no charge" GSAP licence (Webflow), free incl. commercial use | Not used in a no-code animation tool, which that licence restricts. |
| Lenis | MIT | Credited. |
| React Bits (Counter, SplitText) | MIT + Commons Clause | Not copied: our own plain-JS versions of the two effects, credited. Commons Clause only forbids selling the components. |
| Barlow / Barlow Condensed fonts | SIL Open Font License 1.1 | Font files and `assets/fonts/OFL.txt` included; self-hosted, so no visitor data goes to a font service. |

**Privacy:** no cookies, no analytics, no personal data on any server. The page stores in the visitor's own browser: the dark/light choice and their saved areas, recent checks and reminder settings (`localStorage`, downloadable and deletable on the page), and a hidden warning (`sessionStorage`). Map tiles and the three libraries load from openstreetmap.org, unpkg.com and jsdelivr.net, which see visitors' IP addresses like any website they load from.

This is not legal advice. The one open question is the DLD service, which needs DLD's answer.

## Notes

Independent tool, not an official DLD/RERA service. Respect Dubai Pulse terms. Never commit API keys (they live in GitHub Secrets). Map tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), mapping via [Leaflet](https://leafletjs.com/). Design goals: [docs/DESIGN_GOALS.md](docs/DESIGN_GOALS.md) · decision log: [docs/DECISIONS.md](docs/DECISIONS.md) · how it was built: [docs/CONVERSATION.md](docs/CONVERSATION.md).
