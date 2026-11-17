# Dubai Real Estate Atlas: design notes, goals and decision log

**Last updated:** 2026-11-10  
**Repository:** `jamalxcode/dubai_map`  
**Public site (live):** https://jamalxcode.github.io/dubai_map/  
**See also:** [DESIGN_GOALS.md](DESIGN_GOALS.md) (what we're aiming for) · [CONVERSATION.md](CONVERSATION.md) (how we got here)

## The idea

Create a practical, visual rental-market intelligence tool showing **real annual rents registered with the Dubai Land Department (Ejari / RERA)** over a map of Dubai. A user can see what tenants actually pay, not just what agents advertise. Start with a lightweight browser map and eventually automate permitted daily updates. Also make the records exportable to a spreadsheet.

The initial use case is monitoring International City, JVC and other relevant Dubai communities, with the option to compare a private portfolio later. The public map and private owner records must remain distinct.

## Original questions and decisions

1. **API or whole CSV?** DLD offers a public Rents download and a formal API gateway. An undocumented data endpoint is not sufficient evidence of a licensed automation right. Ship a CSV importer first, design a feed adapter for a future authorized source.
2. **Daily updates without upsetting RERA?** Aim for once per day at low volume, only where authorized. Don't bypass CAPTCHA or assume a daily query is automatically permitted. Use cached incremental ingestion, overlapping periods to capture corrections, rate limits and a documented agreement before unattended automation.
3. **Which emirates?** DLD/Ejari transactions cover **Dubai only**. Other UAE emirates have separate authorities and are out of scope for V1. The project is meant to expand to other cities in the region later, each with its own source adapter.
4. **Annual rent and address?** Yes, `Annual Amount` and broad area/project fields; **no guaranteed per-unit street address, GPS or verified building location**. Do not imply exact addresses.
5. **Map overlay?** Use OpenStreetMap/Leaflet; aggregate transaction values by community for accurate high-level presentation; verified GIS polygons are a longer-term goal.
6. **Source control and hosting?** Keep code, README and design rationale in `dubai_map` (originally written as `dubai_rent`); prepare GitHub Pages deployment and provide the expected Pages URL, explicitly marking it unverified until deployment succeeds.

## Intended user experience

- Full Dubai basemap with zoom/pan, mobile-friendly controls and clear attribution.
- Show annual AED rent visually, by community and eventually project or building **where geolocation is verified**.
- Community heat map colored by median annual rent or AED/m², adjustable legend and sample sizes.
- Search by area/project and filter by registration dates, annual rent band, bedroom count, property size, type, and (if verified) new contract vs renewal.
- Click to inspect count, median and individual registered transaction details.
- List/table with matching rows; download CSV for Excel or Google Sheets.
- Show latest available DLD registration date, ingestion timestamp, source licence, number of transactions, unmatched locations and location accuracy.
- Do not show fictional sample rents as live results.

## Data model

Core fields from the public Rents dataset (exact headers can change): `Registration Date`, `Start Date`, `End Date`, `Version`, `Area`, `Annual Amount`, `Contract Amount`, `Property Size (sq.m)`, `Number of Rooms`, `Property Type`, `Property Sub Type`, `Usage`, `Master Project`, `Project`; also the portal has nearest metro/mall/landmark and other optional columns.

Preserve source field names, raw data, download time, source URL and normalized values. Expose annual rent explicitly as AED/year; never substitute total Contract Amount. Validate room-count semantics before labelling them bedrooms. A verified definition of Version is required before categorizing new versus renewal.

Each normalized record should eventually carry:
- `source`, `source_record_id` (if available), `record_hash`, `registration_date`, `ingested_at`, `updated_at`;
- annual rent, total contract amount, dates, type, rooms, area, size;
- `community_id`, `project_id` if known;
- `location_method` (area centroid, verified project point, verified building point), `location_accuracy`, `geography_source`;
- deduplication version and correction history.

## Geolocation policy

**Never plot a guessed apartment address as an actual rental location.** The MVP has a hand-maintained list of approximate community centers. These are visual reference locations, *not* exact properties. Individual-marker mode deliberately spreads markers so they don't overlap. Such points are artificial and must be labelled as such. Unmatched areas remain in the table and the unmatched counter.

Preferred V2 is an authorized, licensed Dubai community polygon GeoJSON dataset linked by normalized community codes. Use choropleth/aggregate areas and show sample counts. A later project-level overlay should only appear when a verified GIS match exists. Never interpolate an exact unit from anonymized public records.

## Daily refresh architecture (future)

```text
Authorized DLD transaction endpoint / allowed official export
                |
       Scheduled ingestion (Dubai time)
                |
     Validate + normalize + reconcile
                |
    Database / versioned permitted dataset
                |
        Sanitized CSV/JSON feed
                |
     GitHub Pages browser map & table
```

- Schedule **once daily**, not aggressive scraping.
- Fetch small rolling windows including recent and prior months for late records and corrections.
- Respect licence, token authorization, CAPTCHA, rate limits, pagination and outages.
- Use stable IDs if available; otherwise conservative composite keys, hashes, replacement of overlapping windows and audit logs.
- Exponential backoff on throttling; do not automatically evade access restrictions.
- No secrets in public JavaScript, GitHub history, logs or static site.
- Make it clear if an API/permission is unavailable and maintain manual CSV import as fallback.
- Browser opt-in refresh on *page open* is not equivalent to an unattended daily refresh.

## Implemented on 2026-11-09

- `index.html`: responsive dark single-page UI, Leaflet/OpenStreetMap, local CSV parser/importer, search and numeric/date filters, median/count stats, community bubbles, artificial-position point display, data table and CSV export.
- Optional CORS HTTPS authorized feed input with saved URL and on-open refresh after 24 hours.
- `.github/workflows/pages.yml`: Actions workflow for publishing static content to Pages.
- `README.md` and this design log.

**Not implemented or verified:** Actual DLD transaction load, schema against a freshly downloaded file, a live DLD API integration, unattended daily update, precise building mapping, official geographic polygons, private portfolio integration, or confirmation GitHub Pages is enabled/published.

## Decisions on 2026-11-09 (second pass)

- **Repo name is `dubai_map`.** All docs and URLs now use it; the old `dubai_rent` name was never a real repo.
- **Source: Ejari rent contracts** (`dld_rent_contracts` on Dubai Pulse), not the RERA Rental Index.
- **Once-daily, well-behaved pull.** GitHub Actions at 05:17 Kuwait time. The collector refuses a second API call on the same Dubai day, uses one token per run, a 2-day window, 1,000-row pages with 4 s pauses, a 30-page cap, bounded waits on 429/503 and then stops until tomorrow. Credentials live only in GitHub Secrets.
- **Storage:** monthly gzip CSV partitions in `data/contracts/`, deduplicated on `contract_id` + `line_number` (hash key for website exports without an id). Only small aggregate JSON is published to Pages.
- **Manual fallback:** CSVs dropped in `data/inbox/` are imported by the same workflow without calling the API.
- **Map:** community bubbles from precomputed 12-month stats; individual "spread" markers removed because their positions were artificial. The browser CSV importer and the in-browser feed were removed; ingestion now happens server-side.
- **Fixed:** the Leaflet stylesheet had an invalid SRI hash, so browsers blocked it and the map rendered broken.
- **Matching:** official DLD area names first (`field=area`), then marketing names in master project/project (`field=any`). Unmatched areas are reported in `meta.json`.
- **Not verified yet:** the exact Dubai Pulse endpoint for this dataset and its filter syntax. Both are configurable (`EJARI_API_URL`, `EJARI_FILTER`) and the first real run reports its status in `meta.json`.

## Decision on 2026-11-09 (third pass): fallback source

The DLD website export is CAPTCHA-gated and the Dubai Pulse API needs a key, so the map had no data. Added **Dubai Data** (datadubai.ae) community aggregates as a fallback: same Ejari source, trailing-12-month medians per community and bedroom count, CC BY 4.0, mirrored on GitHub. Fetched from GitHub with ETag conditional requests. `build.py` uses it when fewer than 1,000 own contracts exist; the page switches to a community × unit table. Rejected: scraping Property Finder / Bayut / DXBinteract pages (terms of use, fragile), paid third-party APIs, and anything that works around the DLD CAPTCHA.

## Decision on 2026-11-10 (fourth pass): rents as text labels

The owner found the sized/coloured circles confusing. Replaced with **text labels** showing the rent. Labels that would overlap at the current zoom merge into **one label with a single number**: the contract-weighted average of the group, marked "avg" with the community count. Merging is iterative (merge any overlapping pair, recompute the position, repeat), so no labels overlap; verified at zoom 9–15 on 1350 px and 390 px widths. Clicking a group fits its bounds; at max zoom it lists the members. The side panel's confusing "typical row" median was replaced by **Average rent in view**, recomputed on pan/zoom. Rejected: Leaflet.markercluster (count bubbles, not rent averages) and size-scaled markers.

## Decision on 2026-11-15 (fifth pass): DLD open data as the main source, with backups

Proposed by a collaborator, for the owner to review on the `mobile-redesign` branch.

- **Main source: DLD's open-data service** (`gateway.dubailand.gov.ae/open-data/rents`), the service behind DLD's public Real Estate Data page. Free, no key, updated daily, contract level. Another public project ([dubai-property-monitor](https://github.com/GusCurrie/dubai-property-monitor)) has pulled it daily since early 2026. It serves contracts from January 2026 onward, so history is back-filled one month per day.
- **This revisits decision 1 above** ("an undocumented data endpoint is not sufficient evidence of a licensed automation right"). Reasons: the data is DLD open data; the service is not CAPTCHA-gated (the CAPTCHA is on the website's file export, which we still never touch); and we keep the same rules as for Dubai Pulse: one run a day, sequential requests, page cap, honest User-Agent, stop on errors. A `DLD_DISABLED` switch turns it off at once if DLD objects.
- **Backups:** Dubai Pulse API (only on days the main source fails, if keys exist); Dubai Data medians from Hugging Face, then GitHub; manual inbox CSV.
- **Map switches to own contracts** only after 300 days and 1,000 contracts of history, so a few weeks of data is never shown as "last 12 months".
- **Homes only:** labour camps, shops, offices and whole buildings are excluded from map statistics.
- **Storage:** daily files instead of monthly ones, so each daily commit stays small.
- **Rejected:** listing portals (asking prices, terms of use), paid scrapers, CAPTCHA workarounds, and the multi-GB Dubai Pulse full CSV (last updated January 2026).
- **Tested offline only:** against a mock of the service loaded with real rows that service returned (saved in the public project above). The first live run happens in GitHub Actions; `meta.json` → `sources` reports how it went.
- **Placing areas (same day, later):** DLD area names are Dubai Municipality communities, so every area is placed at a point inside its official DM boundary (`dm_communities.csv`, from two copies of DM's open data that agree), with 68 reviewed spelling aliases, and OpenStreetMap for brand-new areas (accepted only after automatic checks). Placed share of 2026 home contracts went from 53% to 99.6%.
- **Property types:** homes (default), flats, studios, villas, commercial, everything. Land and bulk leases (over 10,000 AED per m² a year, e.g. 18 m² units each carrying a 3 million AED staff-housing contract) count only under "everything".
- **Design:** rebuilt around Dubai road signs (sign blue, condensed lettering, yellow warning sign) instead of a generic dark dashboard. GSAP, Lenis, and React Bits Counter/SplitText ported to plain JS, so still no build step.

## Decision on 2026-11-15 (sixth pass): licences checked; DLD service off until DLD agrees

- **DLD open-data service is now off by default.** DLD's website terms allow its materials only for personal, noncommercial use unless DLD agrees in writing, and no separate open-data licence covers the service behind its Real Estate Data page. Republishing that data publicly needs DLD's written permission. Code stays (tested); set `DLD_ENABLED=1` once permission is in hand.
- **Recommended daily source: Dubai Pulse API**, published under Dubai's open-data licence (free key). Dubai Data (CC BY 4.0) stays the fallback.
- **Fonts self-hosted** (SIL OFL), so visitors' addresses aren't sent to a font service.
- **OSM tile policy:** exact HTTPS tile URL, linked attribution, "Report a map problem" link.
- **Credits** for every source and library on the page and in the README's "Licences and terms" table.
- **Dark mode:** follows the device setting until the visitor picks one; all text meets WCAG AA contrast in both themes.

## Decision on 2026-11-15 (seventh pass): data integrity fixes

- **One contract, two sources, stored once.** Dubai Pulse rows carry a contract id; DLD-service and website rows don't, so the same contract got two keys. `store.merge` now pairs id rows and id-less rows one to one on fields every source has (start, end, yearly rent, area, size). The id row wins and remembers the hash key it replaced (`alias`), so later re-pulls of the id-less copy are recognised. Twin contracts (identical units, same day) stay separate because each row pairs at most once.
- **Coverage is counted week by week.** The switch to own contracts needs contracts in at least 43 of the last 52 weeks, not 300 days since the oldest record (one old import used to count as a full year).
- **Missing fields are not a home.** A row needs residential usage, or a flat/studio/villa sub type when usage is missing, to count in the homes median; otherwise it is "other".
- **No shrinking.** `build.py` refuses to publish if contracts, mapped contracts or areas fall more than 30% versus the last build in the same mode, and keeps the previous files. Override: `ALLOW_SHRINK=1` (the "allow shrink" box on the daily workflow).

## Decision on 2026-11-15 (eighth pass): remaining review items

- **Dates:** slash dates are day first unless impossible or followed by an AM/PM time (the US form .NET services send); impossible dates (month 15, 31 February) are rejected instead of stored.
- **Dubai Pulse window:** start dates from 3 days back to 14 ahead (contracts registered before they start), plus one 6-day slice of the last 60 days per run, cycling every 10 days, for late registrations. 60-page cap shared by both. An expired token retries the same page; rows fetched before a stop or the page cap are kept.
- **No timestamp-only commits:** `build.py` writes nothing when the data is unchanged apart from `generated_at`, so quiet days make no commit and no redeploy. "Updated" on the page now means the data last changed.
- **Bot pushes** rebase and retry up to three times if someone pushed meanwhile.

## Decision on 2026-11-15 (ninth pass): structure

- **Data on its own branch.** Generated data (contracts, the Dubai Data mirror, computed points, state, page JSON) moved from `main` to a `data` branch, like Flattery's catalog. `main` keeps code and hand-kept inputs, so its history is readable and the daily job no longer writes to it (except removing imported inbox files). `scripts/data-branch.sh` loads and saves; saves only add or update, and retry on top of a concurrent save.
- **Deploy only on change.** Data jobs call the Pages workflow directly, only when the save changed something. (Before, Pages ran after every daily job through `workflow_run`, even on quiet days.) Pages now fails instead of deploying a page without its data.
- **Shared plumbing.** `net.py` (one User-Agent, bounded retries, `StopForToday`, `AuthError`, `NotModified`) and `state.py` replace four copies. Paths are looked up when used, so tests only move `store.DATA`.
- **Structured source state:** `ok`, `partial`, `failed`, `off`, `no_key`, `standby`, `not_run` next to the wording the page shows; code compares the state, never the wording. Old state files are read and converted.
- **`build.py` split:** `kinds.py`, `places.py`, `output.py` (with one area-record layout for both modes).
- **Left for later on purpose:** the front-end split (`index.html` into script, styles and a testable module), self-hosting Leaflet/GSAP/Lenis and faster label merging. Another collaborator was working on the page at the time.

## Decision on 2026-11-16: Dubai Data's daily pages instead of its weekly export

- The weekly export stalled (last: data through 29 Oct, published 2 Nov) while Dubai Data's site kept rebuilding daily (data through 13 Nov on 16 Nov). The map showed 17-day-old rents.
- `fetch_datadubai.py` now reads the site's static JSON (`/rents.json`, `/communities/<slug>.json`) once a day and writes the same CSVs the build already reads, so nothing downstream changed. The site offers this JSON for reuse with no key, robots.txt allows it, and the licence is the same CC BY 4.0.
- Polite: only when `rents.json` shows newer data; 1 request/s; honest User-Agent; at most once a day. All-or-nothing, with the weekly export as fallback.
- Tested end-to-end with all 102 real community pages collected on 16 Nov: data through 13 Nov, rents within -9%..+11% of 29 Oct, build and data checks pass.
- Stale warning now at 7 days for every source.

## Decision on 2026-11-16 (tenth pass): built for return visits that are worth it

The recurring need is "what do people actually pay for a home like mine?", which matters most around a move or a renewal. The aim is useful, voluntary return visits, not time on the page.

- **Core action first:** a "Check a rent" card at the top (area, home, optional rent). Area search accepts nicknames, DLD names and typos (offered as "did you mean", never silently accepted). The home defaults to the area's most common unit, the fairest basis for comparisons.
- **One next step:** each result has one primary button in order of value: compare with my rent → save → renewal reminder → map. Everything else is a plain link. Clear stopping point; no feed, no autoplay.
- **Rewards are facts:** how your rent compares (with the caveat that half pay more and half less), the same home for less within 12 km (30+ contracts), rank among areas, the trend when contract data exists. Area-to-area comparisons only for a specific unit, never "all homes" (different mixes). No badges, points or streaks.
- **Triggers:** reminders are calendar files (renewal: 30/60/90 days before; market check: never/3/6/12 months). No push notifications: a static site has no server, and calendar reminders are under the visitor's control. On return, a "new figures" note shows only when the data moved on, with changes for saved areas; it can be switched off.
- **Personal value, private:** My areas (with change since saved), recent checks, the last check and map view resume. Stored only in localStorage (`rentAtlas`), cleaned on read, downloadable/importable/deletable. Works, minus remembering, when storage is blocked.
- **Empty results and errors:** suggestions for unknown areas, units with figures when a unit has too few contracts, a retry button when data fails to load.
- **Code:** `assets/app/insights.js` (pure logic, tested in Node), `assets/app/companion.js` + `.css`; `index.html` only gains a placeholder, two script tags, a stylesheet and the ready/error events.

## Decision on 2026-11-16 (eleventh pass): the rent check is one line on phones

The rent check card above the map pushed the map from 43% to 84% of the first phone screen, undoing a same-day change that brought it up. On phones (≤ 860 px) the card now starts as one line (area + Check, placeholder "Check a rent: type an area"), opens when tapped or when a check runs, and folds back with "Close". A resumed check stays folded with its area filled in. Map now starts at 51% of the first screen. Desktop unchanged. Rejected: hiding the check on phones (it is the main action) and moving it below the map (out of sight).

## Decision on 2026-11-16 (twelfth pass): the owner's source list, and three pulls a day

The owner listed 12 sources to pull from and asked for cron-job.org to run the pull three times a day. Each source was probed once from GitHub Actions (this workspace can't reach them):

- **Dubai Pulse API (sources 2–4):** `apis.data.dubai` is a new host for the same gateway (`SDG-DDADS-OpenAPI`); both hosts return 401 without a key. The collector now tries `apis.data.dubai/open/dld/dld_rent_contracts-open-api` first and falls back to `api.dubaipulse.gov.ae` only when the first is unreachable (never after a refusal). Still waiting for the key.
- **DLD website (1), Rental Index (5), Rental Performance Index (6):** CAPTCHA-gated export; an allowed-increase calculator; figures from 2022 with a "no commercial purposes" clause. Not automated.
- **Dubai Data (7, 8):** already in use.
- **dubairealestatedata.com (9, 10)** and **continentalclub.ae (11):** CC BY 4.0 figures (commercial reuse allowed with credit), markdown pages robots.txt allows. Added as **cross-checks**, compared with our medians and listed on the page, never shown instead of ours: the first is independent (built from Dubai Pulse's bulk data, new contracts only); the second is Dubai Data's publisher, so it checks our import. Rejected: putting their numbers on the map (different measures; the first only covers 30 areas).
- **overit.ae (12):** no rent figures; content signals allow reference use only.
- **Three pulls a day:** `17 2,10,18 * * *` UTC (05:17, 13:17, 21:17 Kuwait), started by cron-job.org through `workflow_dispatch` (as for Flattery), GitHub's schedule as the backup. "Once per Dubai day" became "at least 6 hours apart" per source; late-registration slices, back-fill and the daily cross-check still run once a day. Run timestamps stay out of `meta.json`, and the site redeploys only when a file the page loads changed, so quiet runs cost one small commit of source state and no deploy.

## Decision on 2026-11-16 (thirteenth pass): older districts from Continental Club

The owner asked to use continentalclub.ae to add the districts Dubai Data doesn't publish. `collector/ccp_areas.py` adds every official DLD area from its `rents.md` that none of our areas already covers (56 areas, ~227k contracts: Karama, Al Murqabat, Naif, Al Qusais, Mankhool, Al Nahda, Hor Al Anz, Oud Metha…), placed at Dubai Municipality community points (55 of 56; Al Twar Fifth isn't published by DM yet and waits for the weekly OSM job). Dubai Data mode only; per-contract data replaces it.

- **Headline figure:** the source gives a median per unit size and one area total, no all-homes median and no count per unit size. The map label is the 1-bedroom median (studio, then larger, if missing), and the popup and rent check say exactly that. Rejected: averaging the unit medians (overstates districts of mostly small homes; on JVC it gives 91k against an all-homes median of 66k and a 1-bedroom median of 70k).
- **No invented counts:** unit counts stay empty; the rent check offers no "All homes" for these areas and says the source gives no count per home type; comparisons use the area total as the trust threshold.
- **Credit:** on the page's source list, in the footer line and in each popup (CC BY 4.0). These areas are never compared with the same source's cross-check.
- Result on 16 Nov: 158 areas (was 102), ~534k contracts, 3 not yet placed.

## Decision on 2026-11-16 (fourteenth pass): what MCP-Dubai taught us about the gateway

The owner pointed to [MCP-Dubai](https://github.com/mahdi-salmanzade/MCP-Dubai) (MIT), an open-source client for the same data.dubai gateway. Read, not copied; adopted:

- Sign-up is at **data.dubai** (Dubai Pulse's portal was retired in Dec 2025 to Jan 2026); the dataset to request is `dld_rent_contracts-open-api`, granted per dataset (403 otherwise). README updated; a 403 now says exactly that.
- **Token from `apis.data.dubai` first**, the old host as fallback.
- **Pages of 500 rows**, the gateway's maximum. Our 1,000-row requests would have come back short and been taken for the last page, silently dropping the rest of every window. Also stop at the reported `total`, and stop if a page repeats (offset ignored).
- The rooms field is `no_of_rooms` (alias added).
- Only equality filters are documented, so our date-range filter is unconfirmed: if the gateway refuses it (400), the collector reads `order_by=contract_start_date DESC` and stops once past the window.
- Not adopted: everything else (air quality, prayer times, etc.) is unrelated to rents.

## Decision on 2026-11-16 (fifteenth pass): getting the key from outside the UAE

- **The block:** data.dubai's web firewall rejects the owner's browser (in Kuwait) and GitHub's servers alike with "Request Rejected", so registration can't be done from here. The API gateway `apis.data.dubai` is not blocked (it answers 401 without a key from GitHub), so once a key exists the scheduled pulls need no change.
- **Chosen:** ask Digital Dubai support (help@digitaldubai.ae, 600 56 0000) for registration and for whether developers outside the UAE can get access, quoting the firewall's support ID. Sent 16 Nov; waiting.
- **Rejected:** a VPN to look like a UAE visitor. The block is deliberate on a government portal, and access obtained that way could later count against the key.
- **Meanwhile:** the site runs on Dubai Data (communities) and Continental Club (older districts), three pulls a day, cross-checked against dubairealestatedata.com.

## Decision on 2026-11-16 (sixteenth pass): one measure on the map, a schedule that stays on, keyboard labels

From the second critique:
- **One measure.** Adding the older districts put two measures side by side: Dubai Data's all-homes medians (typical ~100k) and Continental Club's 1-bedroom medians (typical ~50k), in the same colours, merged labels and "Average in view". Now the map **starts on 1-bedroom**, which nearly every area has from both sources; "All units" shows only areas with an all-homes median and the legend says how to see the others. In averages, an area whose source gives no count per unit is weighted by its area total divided by its number of units (stated in the code). Rejected: a mixed view with different label styles (merged labels would still average different measures).
- **Schedule kept on.** GitHub disables scheduled workflows after 60 days without repository activity; with data commits on the `data` branch, `main` can be quiet that long, and a disabled workflow can't be dispatched by cron-job.org. Both scheduled workflows now re-enable themselves on every run (Flattery's approach).
- **Keyboard.** Map labels are buttons with a spoken name; Enter or Space opens a breakdown or zooms into a group. (Open since the first critique.)

## Decision on 2026-11-16 (seventeenth pass): alerts and a browser check

From the second critique (items 2 and 4):
- **Freshness check** every 6 hours (`scripts/check_fresh.py`, pure rules with unit tests). It fails, and GitHub emails the owner, on: data over 10 days old; latest pull over 14 h old or not successful; the live site more than 2 h behind the saved data, or unreachable; a source in state `failed`; cross-check agreement below 50% (dubairealestatedata.com) or 70% (continentalclub.ae) with at least 5 matches. It keeps its own schedule switched on.
- **Browser check in CI** (`tests/ui-check.mjs`, Chromium via Playwright, axe-core), on every push and pull request against the real data: rent labels shown, no overlaps (start and zoom 13), no sideways scrolling, International City named at zoom 13, the phone map in the top 60% of the first screen, Enter on a label opens it, the rent check answers "jvc", no script errors, no serious/critical WCAG 2.1 AA problems in light and dark mode. Map tiles are not loaded during the check.
- Its first run found three real problems, fixed: the keyboard labels' spoken names didn't match their visible text (WCAG 2.5.3; they now use the visible text), the rents table couldn't be scrolled by keyboard (now a focusable, named region), and the dark-mode "Download CSV" button had too little contrast.

## Decision on 2026-11-16 (eighteenth pass): map pane, zoom controls, rent dial

The owner found the map reads better tall than wide.
- **Two panes from 1100 px:** a CSS grid with the map pane (`position: sticky`, full window height) on the right and everything else in a scrolling left pane (`minmax(420px, 34vw)`). The markup is now `.layout > .pane + .mapPane`; below 1100 px `.pane` uses `display: contents` and `order` keeps the old reading order (title, rent check, filters, warning, map, figures, table), so phones are unchanged except that the map starts higher (38% of the first screen, from 51%).
- **Zoom:** 40 px + / − buttons and an "All Dubai" control (fits all placed areas, leaving out far-off Hatta). Rejected: fitting all of Dubai on first load; at common laptop widths it lands on zoom 10, where 19 readable labels merge into 8 groups.
- **Rent dial:** a CSS conic-gradient pie next to every rent figure, filling to 100% at AED 100k (most medians sit below that; higher rents show a full dial). Decorative (`aria-hidden`); the number stays the information. Only for rents, not counts, yields or AED/m².
- The browser check now also covers: the map pane is full height on the right and stays put while the left pane scrolls, labels show the dial, + zooms in, "All Dubai" brings the city back.

## Decision on 2026-11-16 (nineteenth pass): shaded labels, a compact left pane, versioned assets

- **Shaded labels:** each rent label's box fills from the left by rent / AED 100k (capped), a second cue next to the dial. Light fill on white labels, a darker blue on group labels. axe skips gradient backgrounds, so contrast was computed by hand: the small area names get stronger colours on rent labels (light 5.98:1, groups 4.97:1, dark 5.97:1).
- **Compact left pane (from 1100 px):** smaller band, the rent check without its explanation line and in two rows, compact filters, tighter spacing. At 1440 × 900 the filters end at 682 px instead of 1,050 (975 instead of 1,404 with a result shown); the left pane is 16% shorter.
- **Versioned assets:** the owner's browser mixed the new page with a cached old `companion.css`, squashing the rent check. Page assets now carry `?v=__BUILD__`, replaced with the commit by the Pages job (as in Flattery).

## Decision on 2026-11-16 (twentieth pass): a rent check moves the map

The owner checked "marina" and expected the map to go there. In the two-pane layout (map always beside the check) a check now flies the map to the area (zoom 14) and opens its breakdown, also when its label is merged with neighbours at that zoom. Not on narrower screens, where the map is further down the page and jumping there would interrupt reading the result ("Show on the map" does it), and not for a check restored from a previous visit (the saved map view wins). Reduced-motion users get a jump instead of a flight. The browser check covers it.

## Decision on 2026-11-16 (twenty-first pass): a tighter left pane

The owner asked for a left pane that is "more space conservative without losing neatness and info". Nothing was removed, only made smaller on wide screens (1100 px and up): a shorter header, a smaller rent-check result, and filters in two rows instead of three (search and unit; labels, min and max). The facts, the table and the about text also got smaller. The result's secondary links ("Save to My areas · Show on the map · Dubai Data page") now wrap as one group, so a separator dot is never left dangling at the end of a line. On a 1440 × 900 screen the filters end at 504 px instead of 682, or 716 instead of 975 with a rent-check result. Phones are unchanged. Small labels stay at 11.5 px or more, in the same colours that already pass WCAG AA.

## Decision on 2026-11-16 (twenty-second pass): "fix it all" after the third critique

1. **Unplaced busy areas.** Al Twar Fifth (2,480 contracts), Al Aryam and Al Waha Villas arrived with the older districts after the weekly geocode job's only run, and that job then missed its schedule. Coordinates were not guessed: the daily pull now looks up newly unplaced areas on OpenStreetMap itself (at most 10 a run; a look-up with no believable result is recorded and retried after a week), the name check ignores words like "Villas", and OpenStreetMap points load even without the Municipality file. The freshness check fails when an area with 1,000+ contracts stays unplaced, so it is noticed.
2. **Labels.** After merging, a group of up to three areas splits again when each label fits at its own point or just beside it, joined by a thin line; labels step out from under the zoom buttons and legend. At zoom 14, merged labels went from 12 to 1. The rules live in `assets/app/labels.js`, which has no DOM and is unit-tested; merging no longer restarts its scan after every merge.
3. **Ranges.** No open source publishes rent ranges (Dubai Data's ranges are for sale prices). The rent check says so; contract-level builds now give a range per home type and the check shows it, with which quarter the tenant's rent falls in.
4. **Sharing.** Deploy writes one small page per area (`a/<slug>/`) with that area's figure in its title and preview tags, forwarding to the map with the area checked; the main page has preview tags and a share image (`assets/share.png`, drawn by `scripts/share_image.mjs`, no made-up figures). The description no longer claims daily updates: the published figures are weekly.
5. **Measurement.** GoatCounter, the same snippet and dashboard as Flattery (no cookies, nothing stored in the browser, skipped on localhost). Rent checks, saves and shares count as events with the area name. README and the page's privacy note say so.
6. **Arabic.** `assets/app/i18n.js`: `T()` keyed by the English text (missing entries fall back to English), Arabic plurals by the last two digits, Arabic home-type names (stored values stay English, so saved areas and links keep working), and a عربي / English button. The language is chosen before first paint from a `?lang=` link, the saved choice, or the device. CSS uses logical properties so the page mirrors; the map stays left to right. Area names stay in English as registered in Ejari (search matches them; translating 158 names by hand would invite errors; DLD's own Arabic names can come with contract-level data). Tests check that every key has a translation with the same placeholders, and the browser check opens the Arabic page on desktop and phone.
7. **Cross-check.** Dubai Real Estate Data publishes apartments only and was compared with our all-homes median, which includes villas. Dubai Data labels every bedroom row "apartments", but in villa communities its 3+ bedroom rows are mostly villas (Al Furjan: 652 four-bedroom rentals, 68 four-bedroom sales). The comparison now uses our studio-to-2-bedroom figure: 10 of 13 agree, against 9. Sobha Hartland's gap (+37%) is a boundary difference. The rent check notes that 3+ bedroom figures may include villas.
8. **Front-end split.** `index.html` is markup only; styles, page script, label placement and translations are separate files. Leaflet, GSAP and Lenis are served from `assets/vendor/`, byte-identical to the CDN files (their integrity hashes match), so no visitor request goes to a library CDN.
9. **Old branches.** All merged except `phone-map-first` (superseded by later phone layout work) and `probe-sources` (one-off source probes). Deleting branches was not allowed from the session; the owner deletes them on GitHub.

## Decision on 2026-11-16 (twenty-third pass): the rules written down in one place

The owner asked for the conversation, design decisions, business rules "and anything important" to be in the repo. Three changes:

- **`docs/BUSINESS_RULES.md` (new):** every rule the site and its jobs follow, with the value in force and the file that applies it. Covers what counts as a rent, which data is published, polite fetching, placing areas, the map, the rent check, freshness and alerts, sharing, language and privacy, accessibility. Every threshold was read from the code, not from memory. It must change together with the code.
- **`CLAUDE.md` (new):** what a future coding session needs first: commands, layout, and the rules that bite. These include the data branch, deploy on push to main, the parallel editor on `index.html`, translations, logical CSS, no guessed coordinates, DLD permission, and keeping personal details out.
- **`docs/DESIGN_GOALS.md`:** brought up to date (158 areas, about 534k contracts; daily OpenStreetMap look-ups; self-hosted libraries; visit counting; honest ranges) and a goal 10, "Reach the people who need it" (Arabic, sharing, accessibility, phones).

## Decision on 2026-11-16 (twenty-fourth pass): one language on the base map

The owner: "the map is a mix of arabic and english, lets have a localization button on the map to choose the language of the different map landmarks". The OpenStreetMap tiles are finished pictures with each name printed as tagged locally (in Dubai, Arabic, English or both), so they can't change language.

- **Chosen:** vector tiles from OpenFreeMap (OpenStreetMap data in the OpenMapTiles schema; free, no key, no usage limits, commercial use allowed), drawn with MapLibre GL through its Leaflet plugin, so the rent labels, controls and tests stay on Leaflet. A tile over Dubai Marina showed English names on every place and Arabic on 10 of 11 places and about half the streets; shops are mostly English only and fall back to their own name.
- **Button:** English · عربي · Both, top right on the map. It starts in the page's language and is remembered; Both is the style's own Latin-plus-local names.
- **Arabic on the map** needs the right-to-left text plugin (shaping and order); served from the site with the other libraries.
- **Weight:** MapLibre is 1 MB, so it loads after the rent data; the labels never wait for it. Without WebGL, or when the style can't load within 12 seconds, the classic OpenStreetMap tiles come back and the button hides.
- **Rejected:** Wikimedia's tiles (a `lang` parameter, but only for Wikimedia sites); CARTO and Esri (English-leaning labels, no Arabic, usage terms); keyed services (MapTiler, Stadia, Thunderforest) for a free public site.
- **Tests:** the browser check serves a tiny local map style (no dependency on OpenFreeMap) and checks the button switches the names, is remembered, starts in Arabic on the Arabic page, the fallback hides it, and no rent label sits under it.
- To check the result, the session's network was allowed to reach tiles.openfreemap.org (owner approved).

## Decision on 2026-11-16 (twenty-fifth pass): pictures of the place, legally

The owner asked for images of properties "taken either from google maps or from google images when clicked", especially on drilling down. Pictures in Google Images belong to their photographers and Google's terms don't allow lifting them from results, so three legitimate options were offered; the owner chose the first two:

1. **Links (done):** each area breakdown links to Google Maps (search for the area), Street View (at the area's point) and Google Images (search), in a new tab. Google's Maps URLs need no key.
2. **Free photos inside the breakdown (done):** Wikimedia Commons' geosearch for files within 1 km of the point; JPEG only, titles that look like maps, logos, plans, diagrams, signs or routes left out; up to 4, each with author and licence, linked to its file page. Fetched only when a breakdown opens, once per point per visit, and nothing shows when nothing qualifies. Checked on real data: Dubai Marina had 20 candidates (credited photos of the marina and JBR), Arjan mostly racetrack diagrams, which the filter drops. Thumbnails come from thumb.wikimedia.org.
3. **Street View inside the breakdown (not done):** the Maps Embed API is free but needs the owner's Google Cloud key (billing enabled, restricted to the site). Ready when the key is.

Points are area references, not buildings, so photos show the area. Building-level photos could later use Dubai Data's project coordinates. The browser check uses a stand-in Commons answer and image (one photo, one diagram, one map) to test the filter and credits without calling Wikimedia. The session's network was allowed to reach commons.wikimedia.org and upload.wikimedia.org to check real answers (owner approved).

## Decision on 2026-11-16 (twenty-sixth pass): a broken data check fixed, two areas placed from official points

Running "Place unplaced areas" by hand showed two things.

- **A bug from the twenty-second pass:** the geocoder records a failed look-up as a row without coordinates, but the data check (`tests/test_data.py`) read every row as a point and failed, so nothing was saved. The daily pull runs the same look-up and check, so it would have stopped publishing. The check now skips rows without coordinates (a bad point still fails).
- **Al Aryam and Al Waha Villas** are Dubai Data communities that Dubai Data records as lying wholly in one DLD area (Al Yelayiss 1, Wadi Al Safa 7). A community with no point of its own and at least 90% in one DLD area now takes that area's official Municipality point. Independent agreement: OpenStreetMap's "فيلات الواحة" (Al Waha Villas) lies 1.2 km from the Wadi Al Safa 7 point.
- **Name check:** OpenStreetMap often tags Dubai places in Arabic only, so the geocoder now asks for English names and compares the English name too.
- **Al Twar Fifth** (2,480 contracts) stays unplaced: the Municipality list stops at Al Twar Fourth and OpenStreetMap has no such place. No guessing; the freshness check flags it until someone adds a reviewed point or alias (`data/area_locations.csv` or `data/dld_dm_aliases.csv`).

## Decision on 2026-11-16 (twenty-seventh pass): phones and fold phones, especially drilling down

The owner asked for a more phone-friendly page "including the wallet sized screen like the samsung fold" and "especially when drilling down a price and seeing the property related photos". Measured first: at 320 and 344 px the area pop-up (351 px) ran off the screen, covered the map buttons and left the photos as small thumbnails at the bottom.

- **Bottom sheet at 860 px and narrower:** the breakdown slides up from the bottom, full width (capped at 640 px and centred on fold inner screens and phones held sideways), at most 80% of the screen high, scrolling on its own. It closes with ×, a swipe down, Escape or a tap on the map. The Leaflet pop-up stays open but hidden and its content moves into the sheet, so photos and "Check a rent here" keep working without changes; closing one closes the other.
- **Pictures first on phones:** photos (a swipeable row, about three quarters of the width each, 150-170 px high) and the Google links (large chips) sit right under the area's name, before the figures.
- **Photo viewer on every screen:** tapping a photo opens it full screen at 960 px with its title, author, licence and Commons link; arrows, swipes and the keyboard move between photos (direction follows the language); Escape or × closes it. Previously a tap left the site.
- **Narrow screens:** map buttons shrink to 36 px (32 px at 400 px and below), the title to 30 px at 400 px and below.
- **Checked** at 320 × 640, 344 × 882, 390 × 844, 690 × 830 (fold open) and 844 × 390 (sideways), English and Arabic. The browser check now covers the sheet, the viewer and the 320 and 344 px screens (no sideways scrolling, sheet fits, axe with the sheet open).

## Decision on 2026-11-16 (twenty-eighth pass): interface rules and lessons learned written down

The owner asked for design ideas, lessons learned, the conversation, business rules and interface rules to be saved in the repo. New: `docs/INTERFACE_RULES.md` (principles, breakpoints, colour and type, labels, controls, the rent check, the area breakdown and sheet, photo viewer, language and direction, motion, states, accessibility, assets, each with its value and file) and `docs/LESSONS_LEARNED.md` (each problem hit while building, what it taught and the rule now followed). Writing the interface rules found one gap: the map language buttons were 30 px high at 400 px and below, under the 32 px touch target the rules state; now 32 px. Design ideas stay in DESIGN_GOALS.md ("Ideas on the table"); data rules in BUSINESS_RULES.md. All are linked from the README and CLAUDE.md.

## Decision on 2026-11-17 (twenty-ninth pass): the live Dubai Data files carry the top-area share too

Checking the pulls the morning after: every pull ran on time and succeeded, but Al Aryam and Al Waha Villas were unplaced again. The twenty-sixth pass placed them using Dubai Data's `share_in_top_area`, which the weekly export has but the files rebuilt from Dubai Data's live pages did not. The live fetcher now computes it from each community page's per-area breakdown (top area's transactions ÷ all). It takes effect at Dubai Data's next daily update (the fetcher rewrites its files only when the data date moves). The 90% rule stays strict. The freshness check's one failure overnight was the expected Al Twar Fifth alert.

## Decision on 2026-11-17 (thirtieth pass): the brand palette for text, the price key for prices, scaled to the top price

The owner gave two palettes: a brand palette for text (Ink Black #141414, Cream #F7F2E9, Gold #B98A2F, Taupe #8B8378, Soft White #EDE6D8, with their roles) and a six-step price key (deep purple to yellow, low to high), and asked that the top of the price scale be the top price pulled.

- **Brand palette:** cream paper, ink type, an ink header framed in gold with the highlighted words in gold, ink primary buttons (gold in dark mode, with ink type), links underlined in gold, gold focus rings, the stale-data warning as ink on gold, soft-white panels. Dark mode: ink paper, cream type, gold actions.
- **Contrast kept at WCAG AA:** brand taupe and gold are too light for small text on cream (3.4:1 and 2.8:1), so secondary text uses a deeper taupe (#655E54, 5.7:1) and gold as text on cream a deeper gold (#7D5C1C, 5.5:1). The brand shades stay for lines, frames, fills and text on ink. Label tints and small-text shades were computed against every price colour (light 25% tint with #4A443B, at least 5.5:1; dark 30% with #E3DBCD, at least 5.2:1; ink groups 35% with cream, at least 5.9:1).
- **Price key for prices only:** label edges, label shading (a tint of the price colour), dials and the legend ramp, sampled from the owner's image (#3E0751, #424483, #41768C, #51A686, #8FCF63, #F9E855). Each colour holds a sixth of the areas shown, so all six are used; the same key in light and dark. Never used for text.
- **Top price pulled:** dials and shading are now a rent's share of the dearest area shown (AED 279k for 1-bedroom today), named in the legend, instead of a fixed AED 100k. The rent check uses the dearest area for the home type checked.
- **Share image** redrawn in the brand palette. The collaborator's map styles (detailed by day, dark at night) are kept.

## Decision on 2026-11-17 (thirty-first pass): "golden note" for the site, blues for prices

The owner replaced both palettes: prices in a six-step blue scale (#EFF3FF lowest … #084594 highest) and the site in "golden note": Oxblood #521825 (primary field, 45%), Ivory #F6F1E7 (type and paper), Gold Leaf #C9A227 (icons and accents), Espresso #2B2118 (deep text), Warm Gray #8A7F72 (secondary text).

- **Roles:** oxblood for the header, primary buttons, selected states and group labels; ivory paper with espresso text; gold leaf for the header frame, highlighted words, link underlines and the warning sign; dark mode is espresso paper with ivory text and gold-leaf actions under the same oxblood header.
- **Contrast kept at WCAG AA:** warm gray (3.5:1) and gold leaf (2.2:1) are too light for small text on ivory, so text uses #655B51 (5.9:1) and #735B12 (5.8:1). Label tints recomputed for the blues: 35% in light with #4A3F35 (at least 4.75:1), 30% in dark with #E6DCCB (at least 4.56:1), 30% over oxblood with ivory (at least 5.2:1).
- **Lightest blue:** #EFF3FF is almost the label's ivory, so the cheapest areas barely tint; the figure carries the value, and the legend swatches are outlined so step 1 stays visible.
- The scale still tops out at the top price pulled. Share image redrawn. The night map style (cool blue-grey, from the parallel session) is unchanged.

## Decision on 2026-11-17 (thirty-second pass): a key that extreme areas can't stretch

The owner: remove edge cases that distort the key; the top 5% should not set the maximum nor the bottom 5% the minimum, but they keep the highest and lowest colours. The key now runs from the 5th to the 95th percentile of what is shown (for 1-bedroom today AED 38k to 120k, against a raw 35k to 279k). The six blues are equal price steps across that range; below it the palest, above it the deepest. Dials and shading are a share of the 95th percentile, full above it, so a typical 70k area now fills about 58% instead of a quarter. The legend reads "≤ AED 38k … ≥ AED 120k" and names the dial's top. The rent check uses the same trimmed scale for the home type checked. Applies to every measure the labels can show.

## Decision on 2026-11-17 (thirty-third pass): group labels follow the price key too

The owner spotted brown/dark prices that didn't follow the key: the merged "N areas" labels, which had an oxblood background from the thirty-first pass. Every price now follows the key: group labels are ivory with the same price-colour tint, edge and dial as single ones, and a gold stacked-card outline plus "avg" marks them as several areas. Oxblood stays for the header, buttons and selected states. Rule: anything showing a price uses only the price key for its colour.

## Decision on 2026-11-17 (thirty-fourth pass): price labels look the same in dark mode

The owner: in dark mode the price labels don't follow the price key. They were dark cards with a 30% tint, which turned the blues into greys and browns on the dark map. In dark mode price labels now stay light ivory cards with the same 35% tint, dial and edge as in light mode, so each price shows exactly its key colour, in both themes, against any map. Text contrast is the light-mode values (espresso on every tint, at least 4.75:1). Leader lines and dots are light too. Rule: prices look the same in both themes; only the page around them changes.

## Decision on 2026-11-17 (thirty-fifth pass): rent, sale price and yield views

The owner asked for rent, sale price and gross yield buttons on the map, the key following the value, with the 5% edge rule. A **Rent · Sale price · Yield** switch sits on the map (top right), kept in step with the "Labels show" menu. Each view recolours the labels with the same blue scale, its own key trimmed to the 5th-95th percentile (today, 1-bedroom: rent AED 38k-120k, sale AED 660k-2.75M, yield 5.2%-8.6%), its own legend title and ends, dial top and headline ("Average sale price in view"). Sale prices per bedroom count now come through the build from Dubai Data (`by_unit.sale`); for Flats and Studios a rent-contract-weighted "typical" sale price, as for rents. The 56 older districts have rents only, so they appear in the rent view only. A view without data is hidden.

## Decision on 2026-11-17 (thirty-sixth pass): renamed to Dubai Real Estate Atlas

The owner renamed the site "Dubai Real Estate Atlas" (Arabic: أطلس دبي العقاري), which fits now that it shows sale prices and yields as well as rents. Changed everywhere a person sees it: page title, header, link previews and share text, area preview pages, calendar reminders, the export file name, the share image, the deploy workflow's name and the docs. Kept on purpose: the browser storage key (`rentAtlas`, so visitors keep their saved areas) and the calendar reminder IDs (so existing reminders aren't duplicated). The longer title gets its own row under the language and theme buttons at every width. The repository and site address (`dubai_map`) are unchanged.

## Decision on 2026-11-17 (thirty-seventh pass): the fourth critique, all nine done

1. **Thin figures:** 11 bedroom figures rest on fewer than 10 contracts. They stay on the map but get a dashed edge and outline and an italic figure (no fading, so contrast is unchanged), italic rows in breakdowns and area pages, and a legend note.
2. **Rent-only areas:** in the sale and yield views the legend says the 56 older districts have rents only.
3. **The table and rent check follow the view:** title, subtitle and sort change with the view; a sale price column (also in the CSV); the rent check adds the median sale price for owners.
4. **Sale price trend:** the weekly export's `community_monthly.csv` (always taken from the export, like projects.csv) gives a 24-month line of sale price per sq ft and the change on a year ago in each breakdown (90 areas with a line, 70 with a change).
5. **No alert fatigue:** unplaced busy areas are listed in the freshness run's summary as known issues; they no longer fail it (and email) every 6 hours.
6. **Pale blue visible:** label edges and dials use the price colour darkened a little; the legend keeps the owner's exact colours.
7. **MapLibre on demand:** it loads only when the map is on or near the screen. On a typical phone the map is on the first screen, so it still loads; it waits when the map is out of sight.
8. **Area pages:** real pages with each area's figures, trend and sources, and a button to the map, instead of an instant redirect; `sitemap.xml` lists them. A shared link now opens the area's page, one tap from the map. English only for now.
9. **Community outlines:** the placement job now also saves the Municipality outlines (simplified to about 40 m); the build gives each area the outlines of its DLD areas (`outlines.json`, 30 KB); the page shades them in the area's price colour for the current view. 111 of 155 placed areas have an outline: official boundaries don't separate sub-communities (JLT and DMCC share Al Thanyah Fifth), so a shared outline goes to the busiest.

Data rebuilt after merging (daily pull for the trend file, placement job for the outlines), as the last lesson says.

## Prioritized next work

**Status on 2026-11-16:** P0 is done (Dubai Data fallback, live Pages deploy, data checks and fixtures). P1 is built and tested; the daily feed waits for the Dubai Pulse key (DLD's own service is off until DLD agrees in writing). P2 item 6 is partly done: every area sits at a point inside its official Dubai Municipality community; shaded outlines are next. P2 item 7 is partly done (per-bedroom medians, rent dial and shading; ranges and trends wait for contract-level data). P3 item 10 is done: tests (Python, Node, Chromium + axe), phone layout, accessibility in light, dark and Arabic, and the front-end split with self-hosted libraries. Since 16 Nov the site is also in Arabic, shares with link previews, shows photos near each area and lets the visitor pick the base map's language.

**P0: working verified data**
1. Download one DLD Rents CSV through official allowed flow and test every column.
2. Add source metadata, loading feedback, quality checks and fixtures without publishing confidential data.
3. Confirm GitHub Pages Settings = GitHub Actions, verify deployment URL and check browser errors.

**P1: daily authorized feed**
4. Obtain DLD permission/licence and a suitable documented source, or document acceptable manual process.
5. Build secure collector with idempotent daily update, correction windows, logs and last-updated indicator.

**P2: geographically accurate analytics**
6. Acquire licensed Dubai community boundaries and add area-normalized joins.
7. Implement choropleth heat map, AED/m², per-bedroom/per-type median, distribution and trend lines.
8. Add verified project geocoding and accuracy display.

**P3: owner intelligence**
9. Compare privately held unit rents against real neighborhood transactions; owner portfolio details stay private and off the public repository.
10. Large-file scaling, caching, accessibility, improved mobile experience and QA.

## Explicit constraints

- Do not guess map coordinates: points come from Dubai Municipality, Dubai Data, reviewed aliases or OpenStreetMap results that pass the checks.
- Do not copy or embed images from Google Images or Google Maps; link out instead, and show only freely licensed photos with their author and licence.
- Every visible text needs an Arabic translation; area names stay as registered in Ejari.
- Count visits and features only (GoatCounter, no cookies); never anything personal.
- Do not conflate DLD open transaction records with the RERA Rental Index.
- Do not publish invented dates, prices, listings or exact locations.
- Do not promise API service reliability or permission without verification.
- Never expose owner or tenant personal data or API tokens in this public repository.
- State whether something is *implemented*, *planned* or *unverified*.

## Reference URLs

- DLD open data: https://dubailand.gov.ae/en/open-data/real-estate-data/
- DLD gateway: https://dubailand.gov.ae/en/eservices/api-gateway/
- Leaflet: https://leafletjs.com/
- OSM copyright: https://www.openstreetmap.org/copyright

## Decision on 2026-11-17 (thirty-eighth pass): breakdown clear of the buttons, a tighter table, scaled trends

1. **Breakdown hidden under buttons:** Leaflet draws its controls above pop-ups, and its automatic pan only kept 5 px from the map's edge, so a breakdown opened near the top could sit under the language and view buttons. The pan margins now come from the measured controls and legend; the map pans the breakdown into the clear space. A browser check opens one near the buttons and counts overlaps (0).
2. **Rents table:** a whole column for the DLD area plus no wrapping left a wide gap in the middle and cut off the figures. The DLD area is now a small second line under the area name, and names, unit and headers wrap.
3. **Table at 1,100 px:** the side pane is 20 px wider at its narrowest (440 px), and in it the table uses 12 px figures and 6 px padding, so all six columns fit with no sideways scroll at any two-pane width.
4. **Trend scales:** both trend lines show their lowest and highest value and the first, middle and last month.

## Change log

- 2026-11-17: Breakdowns no longer open under the map's buttons; the rents table fits (at 1,100 px too); trend lines have scales.

- 2026-11-17: Fourth critique: thin figures marked, view-aware table, sale trend, community outlines, real area pages with a sitemap, quieter alerts, visible pale blues, MapLibre on demand.

- 2026-11-17: Renamed to Dubai Real Estate Atlas.

- 2026-11-17: Rent, sale price and yield views on the map, each with its own trimmed key.

- 2026-11-17: Dark mode price labels stay light cards so prices match the key in both themes.

- 2026-11-17: Group labels coloured by the price key; a gold stacked-card outline marks them.

- 2026-11-17: Price key trimmed to the 5th–95th percentile; extremes keep the end colours.

- 2026-11-17: "Golden note" palette (oxblood, ivory, gold leaf, espresso, warm gray) for the site; six blues for prices.

- 2026-11-17: Brand palette (ink, cream, gold, taupe, soft white) for text and surfaces; six-step price key for prices; dials and shading scaled to the top price pulled.

- 2026-11-17: Live Dubai Data files now include the top-area share, so Al Aryam and Al Waha Villas stay placed.

- 2026-11-16: README rewritten for readers (what you can do first, the engine room after); outdated figures fixed; licences table completed.

- 2026-11-16: docs/INTERFACE_RULES.md and docs/LESSONS_LEARNED.md added; map language buttons 32 px on small screens.

- 2026-11-16: Phones and fold phones: area breakdown as a bottom sheet with photos first, full-screen photo viewer, smaller map buttons; checked down to 320 px.

- 2026-11-16: Fixed the data check that rejected recorded failed look-ups; Al Aryam and Al Waha Villas placed at their DLD areas' official points; geocoder compares English names.

- 2026-11-16: Area breakdowns link to Google Maps, Street View and Google photos, and show credited photos taken nearby (Wikimedia Commons).

- 2026-11-16: Base map in vector tiles (OpenFreeMap) with a map language button: English, Arabic or both.

- 2026-11-16: docs/BUSINESS_RULES.md and CLAUDE.md added; design goals brought up to date (goal 10: reach).

- 2026-11-16: Critique fixes: new areas placed daily from OpenStreetMap, labels split when zoomed in, honest ranges, area share pages, GoatCounter, Arabic, like-for-like cross-check, front-end split with self-hosted libraries.

- 2026-11-16: Tighter left pane on wide screens.

- 2026-11-16: A rent check flies the map to the area in the two-pane layout.

- 2026-11-16: Label boxes shaded by rent; compact left pane; versioned page assets.

- 2026-11-16: Two-pane layout on wide screens (map full height on the right), zoom controls with All Dubai, AED 100k rent dial.

- 2026-11-16: Freshness check every 6 hours; browser check (Playwright + axe) in CI; three accessibility fixes it found.

- 2026-11-16: Map starts on 1-bedroom (one measure across sources); workflows keep their schedule on; keyboard-usable map labels.

- 2026-11-16: data.dubai sign-up blocked from outside the UAE; Digital Dubai support contacted; docs updated.

- 2026-11-16: Dubai Pulse client fixes from MCP-Dubai's documentation: data.dubai sign-up, 500-row pages, total/repeat guards, date-filter fallback, 403 message.

- 2026-11-16: Older districts (56 DLD areas) from Continental Club Property; small merged labels name their busiest area.

- 2026-11-16: Three pulls a day (cron-job.org + GitHub backup, 6-hour gap per source); Dubai Pulse via apis.data.dubai with fallback; cross-checks against dubairealestatedata.com and continentalclub.ae; review of the owner's 12 sources.

- 2026-11-16: Rent check folds to one line on phones; design goals, decision log and conversation log brought up to date.

- 2026-11-16: Check a rent, My areas, calendar reminders, what's new on return, resume.

- 2026-11-16: Dubai Data from its daily JSON pages (weekly export as fallback); stale warning at 7 days.

- 2026-11-15: Data moved to the `data` branch; deploy only on change; shared net/state modules; build.py split; structured source state.

- 2026-11-15: US-date fix, wider Dubai Pulse window with late-registration slices, no timestamp-only commits, push retry.

- 2026-11-15: Cross-source de-duplication, week-based coverage check, stricter homes rule, no-shrink guard.

- 2026-11-15: DLD open data as main daily source with backups; mobile-first redesign; stale-data warning; tests.

- 2026-11-10: Text rent labels with overlap-free merging into average labels; "Average rent in view" stat; added DESIGN_GOALS.md and CONVERSATION.md.
- 2026-11-09: All 102 Dubai Data communities placed (11 via manual OSM geocoding job).
- 2026-11-09: Dubai Data (CC BY 4.0) community medians as fallback source; real rents live.

- 2026-11-09: Renamed docs to `dubai_map`; added daily Ejari collector, aggregate builder, inbox import, rebuilt map page around precomputed data; fixed Leaflet CSS integrity hash; Pages enabled.

- 2026-11-09: Built initial map and stored first README/decisions.
- 2026-11-09: Added GitHub Pages Actions workflow. Activation and deployment not verified.
- 2026-11-09: Expanded design specification and README to capture full scope, roadmap, access/legal constraints, geography confidence and accurate implementation status.

## Decision on 2026-11-16: language switch and a better base map

Asked by the collaborator: "add an English and Arabic section so we can switch languages" and "a different map that is better quality".
- **Language:** the header button only showed the other language (عربي or English), so it read as a label, not a switch. Now a two-part switch, **English | عربي**, with the current language filled white. Same behaviour as before (`T.set`, `?lang=`, remembered).
- **Base map:** OpenFreeMap's **Liberty** style replaces Positron by day: roads, water, parks, buildings and motorway numbers in colour, with English and Arabic names. At night OpenFreeMap's **Dark** style replaces the inverted, greyed Positron; it is near-black with sea and land almost the same, so `tuneDark` lifts water to navy and roads to grey. Switching the theme reloads the style and keeps the chosen name language. Same provider, no key, same licence and attribution.
- **Considered and rejected:** satellite imagery (Esri needs an account and key; free Sentinel-2 mosaics are non-commercial / share-alike), MapTiler and Stadia (keys), Fiord (blue land clashes with the blue rent labels).
- **Checked:** all tests; Liberty and the tuned Dark viewed over Dubai with the real tiles; the switch at 320 px, 375 px and desktop in both languages.
