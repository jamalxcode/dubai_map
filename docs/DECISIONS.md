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

## Decision on 2026-11-17 (thirty-ninth pass): the interface critique, all seven done

1. **One control per job.** The map's names follow the page language; the old English · عربي · Both group became one **A+ع** button in the map's bar (both scripts). The "Labels show" menu is gone (the map bar is the only view picker; the contract-count view went with it). The "Community or building" box is gone: the rent check is the area search, and a **Find in the table** box above the table filters the table only. Homes / Flats / Studios and the Unit menu became one **Home** picker (all homes, each size, "Flats, any size"); the note about villas and commercial coming later is gone. The phone filter sheet and its Filters button went too: the picker and rent range fit on one row.
2. **Price at a glance.** Each figure sits on a badge in its band's blue (espresso or ivory type, 5.0:1 or more), instead of a faint tint, an edge and a dial. Merged labels always name their busiest area and count the rest ("JLT +12"), never "13 areas". The dial is gone (also from the header and the rent check, which shows a colour chip). The legend has a value at every step edge.
3. **One word: "typical"** for the headline, the legend and merged labels (contract-weighted averages of medians); "median" stays where a figure is exactly one median. Yields always show one decimal.
4. **Phone:** no tagline in the header, the rent check on one line, the home picker and rent range on one row, the legend folded: the map starts about 45 px higher (at 351 px on a 390 × 800 screen). One bar on the map instead of two rows.
5. **Dark mode:** price labels stay ivory cards but smaller (15 px figures), with a thin dark edge and no gold stack.
6. **Wording:** "Placed on the map 531,593" became "On the map 99.4% of these contracts, in 155 areas"; "Data: Weekly" became "Last updated 17 Nov, 09:00, Kuwait time; new data is looked for three times a day". With one home size picked the table drops its unit column and names it in the subtitle.
7. **Small items:** the legend folds to its colour bar (remembered; phones start folded); All Dubai is the third button of the zoom bar; label boxes are now measured from a hidden label drawn with the same styles (the old estimate let a label slip under the map's buttons).

## Decision on 2026-11-17 (fortieth pass): the second interface critique, all ten done

1. **One home choice:** the rent check's Home list and the map's Home picker stay in step (a check sets the map; the map re-checks the area), with the same long names ("1-bedroom apartments"). On wide screens the filters moved above the rent check, right under the header.
2. **The breakdown leads with the label's figure:** with a home picked, its median, yield and sale price come first, its row is highlighted, and all-homes figures follow in a smaller block. The 1-bed label said 40k while the breakdown opened at 36,686 for all homes.
3. **A shorter check result:** the fixed "no range yet" and "half pay more" paragraphs fold under "What does this mean?"; "Cheaper than 33% of areas" became "Dearer than 64% of 126 areas…" (the share with a lower median); the rent is written 85,000 as you type.
4. **Table on phones:** short headers (Rent, Contracts, Sale price, Yield, "AED" in the subtitle); at 600 px and below only the area, the view's figure and contracts (no sideways scroll at 390 px). The CSV keeps every column.
5. **Sources once:** a plain list of the sources in use; the collectors' status under a folded "Data health"; the footer's repeat removed.
6. **Key figures:** contracts, share on the map, areas on the map in big type; freshness in one small line.
7. **Rent range:** one label over Min – Max, so the phone row no longer wraps its labels.
8. **Map credits on phones:** behind an "i" button, one tap to read them (still linked, as the licences ask).
9. **Labels inside the map:** a label whose point is on screen starts inside the edges (rule 0 in labels.js, tested), so crowded edges merge instead of cutting labels; labels are placed again after a pan (not while a breakdown is open), which also keeps them clear of the buttons after the map moves.
10. **Breakdown polish:** its tip sits above the label so the label stays visible; the × is 32 px.

## Decision on 2026-11-17 (forty-first pass): the third interface critique, all ten done

1. **No label under a button:** a label with no free spot near its point (now two label-steps out) joins its nearest neighbour and merging runs again (labels.js rule 3, tested). Labels were hiding under the map bar and legend on phones in both languages; the start of every run (and the Arabic runs) is now checked.
2. **One ellipsis:** names are shortened once in the script; the CSS cut is gone.
3. **Key figures line up** (CSS subgrid).
4. **Names in capitals** show in title case on labels, breakdowns, the table, the rent check and area pages; the registered spelling stays for search, links and storage.
5. **All homes table:** an area's name shows once over its units.
6. **Wide All homes key:** a note says sizes are mixed and points to the picker (kept the visitor's choice rather than switching it for them).
7. **Sortable table headers** (`aria-sort`, arrows).
8. **Map links:** home, view and position live in the address.
9. **Near me** in the zoom bar.
10. **Sources:** "Figures from" and "Checked against".

## Decision on 2026-11-17 (forty-second pass): the fourth interface critique, and counting use

1. **Near me fits:** the zoom bar is as wide as its widest button at every size (phone rules had fixed the width).
2. **One Home control, really:** the rent check's own Home list is gone; it uses the map's picker, and "Other homes here" links under the result switch both.
3. **Tablet header:** the compact header at 861–1,099 px.
4. **Freshness wording:** "checked for new data three times a day".
5. **Phone check result:** nearby, rank and owner figures fold under "More about this area".
6. **Counting use:** GoatCounter events for the map views, names button, Home picker, All Dubai, Near me, table sorting, legend folding, CSV, table finder and rent range, and shared map links opened from elsewhere, by feature name only. The plan: after a few weeks, remove what nobody uses rather than polishing further.

## Decision on 2026-11-17 (forty-third pass): breakdowns taller than the map

The owner saw a breakdown cut off at the top of the map and under the Rent / Sale price / Yield bar. A full breakdown (all homes, trend, six units, photos) is about 510 px tall: on shorter maps it didn't fit between the buttons and the legend, so Leaflet's pan couldn't clear both, and photos arriving after it opened made it taller still. Now the card's height is capped at the clear space (its content scrolls), and it re-fits once the photos load. A browser check opens one near the buttons at four window sizes; it failed at all four before the fix.

## Decision on 2026-11-17 (forty-fourth pass): a better data pull

1. **Our own rent history:** each publication's medians are kept (`history.py`, `data/history/`), so the site can show rent change over time instead of only the latest figures. Dubai Data replaces its medians each time; without this the past was lost.
2. **A guard per area:** a median moving more than 40% since the previous publication is marked as unconfirmed (dashed, with a note) until the next publication stays close. Marking rather than holding back keeps the figure honest and visible; the confirmation needs no stored state.
3. **Sources that differ** are shown in the area's breakdown, not only in "Data health".
4. **What changed:** `changes.json` and a summary on each run's GitHub page; the rent check's "since your last visit" adds a citywide line.
5. **Schedule:** late GitHub timer runs step aside after a recent successful pull; Dubai Data's publication times are logged.
6. **Retry:** failed live pages get one more try, so one hiccup doesn't throw away a fresh publication.

After merging, the pull was started by hand so the new fields went live (guard, pull and deploy jobs all succeeded), and Tests were rerun against the rebuilt data branch (passed). That run saved the first snapshot (`history/2026-11-16.json`) and the first `changes.json` (nothing to compare yet), and found 11 areas where a cross-check source differs by more than 15% (La Mer, Uptown Mirdif and Sobha Hartland among them).

## Decision on 2026-11-17 (forty-fifth pass): data pull, second review

1. **Industrial zones** (mostly staff accommodation) were showing as the cheapest homes and being suggested as "the same home for less". They are flagged by their own name (not their DLD area: Downtown Jabal Ali sits in Jabal Ali Industrial Second and is residential), noted, and left out of comparisons. Nine areas today.
2. **Backup source:** if Dubai Data is stuck for more than 10 days while Continental Club is current, the map is rebuilt from Continental Club alone, with a warning sign; it switches back by itself. A current map with fewer areas beats a stale one.
3. **Older districts' history:** their own snapshot series by Continental Club's date.
4. **Alerts as GitHub issues:** opened and closed by the freshness check, keyed by the problem without its numbers, so one outage is one issue.
5. **Run log** (`runs.jsonl`) and publication hours in the run summary; a week below 80% successful pulls is a problem. The page doesn't show the run log: it would change every run and trigger a deploy each time.
6. **Column checks** on Dubai Data's files: a renamed column stops the run with its name.

After merging, the pull was started by hand (guard, pull and deploy succeeded): it saved the first older-districts snapshot (`history/ccp/2026-11-15.json`), the first `runs.jsonl` line and the `staff` flags. Tests were rerun on the rebuilt data (passed), and the freshness check was run once with its new issue permission: all fine, no issue opened.

## Decision on 2026-11-17 (forty-sixth pass): a data status page

The owner asked for an update status page at its own address, with counts of total entries, what the last pull brought, what is rejected or pending and what is used. `status/` reads the data branch (`status.json`, `state.json`, `runs.jsonl`) and GitHub's public API live in the browser, so it shows the current state between deploys without redeploying the site on every pull. The collectors now record what each pull read; the build writes the counts. "Rejected" is shown as "Left out" with the reason for each kind (no median, already covered by Dubai Data, industrial zones kept out of comparisons), and "pending" as "Waiting".

## Decision on 2026-11-18 (forty-seventh pass): tap an area to set it apart

The collaborator: "if you click on the area it zooms in and also shows the data, kind of isolating it so you can see the area better".
- **Tap one area's label** (or Enter on it, or "Show on map" from the rent check): the map flies to the area's official outline (`focusArea` in atlas.js), darkens everything outside it (a mask with the outline cut out, 42%), rings the outline in gold leaf, marks its label, and opens its breakdown once the map has arrived. Room is left for the breakdown: above the area on a computer, above the bottom sheet on a phone. Without an outline it zooms to the area's point.
- **Back to the whole map:** closing the breakdown (×, Escape, a tap on the map, swiping the sheet down) or zooming by hand. Changing the home or view keeps the area in focus and reopens its breakdown with the new figures.
- **Groups** keep zooming in until their areas separate (now a smooth flight). Other labels keep full contrast (dimming them failed WCAG contrast); the darkened map does the isolating.
- Counted as `area-focus` (feature name only).
- **Tests:** the browser check confirms Enter on a label sets the area apart; axe now waits for label animations to finish (a fade-in caught mid-way read as low contrast); the address check accepts the whole of Dubai (24.x to 25.x N).

## Decision on 2026-11-18 (forty-ninth pass): a tab to give the map the whole window

The collaborator: "I want to be able to move this [the side panel] to the left … with a little arrow that can make the map full screen".
- **Computers (two panes):** a tab with an arrow on the map's edge next to the panel; it hides the panel so the map fills the window and brings it back. Remembered on the device, since someone who prefers the big map wants it next time too.
- **Phones and tablets (one column):** the same tab is a full-screen toggle (corner icon); full screen covers the page, the area sheet still opens above it, and Escape or the tab ends it. Not remembered: opening the site straight into a full-screen map would hide the rent check and the rest.
- The map keeps its centre while it resizes; labels avoid the tab like the other controls. Arabic: the tab is on the right, where the panel is, and its arrow mirrors.
- Counted as `map-wide` / `map-narrow`.
- **Motion, second version** (the collaborator: "the whole screen kind of jitters"): the first version resized the map every frame. Now the map is resized once and only transforms move (see interface rules); measured at one map resize per toggle, no gap between panel and map, centre and scroll position kept.
- **Motion, first version** (asked for: "a smooth animation … gsap, lenis, react bits"): GSAP, already on the page. The panel's grid column is tweened and the panel slides with it while the map re-measures every frame around a fixed centre, so the map visibly grows into the space rather than jumping; labels are placed once at the end. On phones a clip-path reveal from the map's box (Lenis paused while full screen). Reduced motion: instant.

## Decision on 2026-11-18 (fiftieth pass): budget mode

The collaborator chose "Budget mode: type your budget, and the areas you can afford light up". The page already had a "Rent range" (Min – Max) that filtered only the table, so on the map it did nothing (a screenshot showed 3333 – 3000 with the map unchanged). One control per job: the range became the budget, renamed **Yearly rent budget (AED)**, and now drives the map too.
- Areas whose rent for the chosen home is in range keep their labels, count in the figure at the top and light up (gold-leaf edge, stronger fill: cheap areas are the palest blues, so colour alone did not stand out); the rest turn grey and lose their labels (dimmed labels would fail contrast).
- The price colours keep the whole map's scale, so a 58k area is the same blue with or without a budget.
- The budget is on rent in every view (sale price and yield views show the same areas).
- A line under the filters: "59 of 127 areas fit your budget (up to AED 60,000 a year, 1-bedroom apartments)", or none fits with a hint; Min above Max is swapped and said so.

## Decision on 2026-11-18 (forty-seventh pass): Al Twar Fifth as "Al Twar 5"

The owner found that maps write the area as "Al Twar 5" (الطوار الخامسة). An alias in `dld_dm_aliases.csv` can't help: it points a DLD name at a Dubai Municipality community, and DM's list stops at Al Twar Fourth. Instead the OpenStreetMap look-up now also searches ordinals as numbers, and an area gains a retry at once when it has a name it wasn't searched under. The same checks apply (inside Dubai, a place not a shop or road, a close name match), so no point is guessed. Nominatim can't be reached from a session, so the result comes from the "Place unplaced areas" run on GitHub.

Result (run of 18 Nov): "OK Al Twar Fifth -> Al Twar 5 (suburb) 25.2694, 55.3877", between Al Twar First and Al Twar Second as expected. Al Aryam and Al Waha Villas are placed too, so no area is off the map: 534,974 of 534,974 contracts are on it.

## Decision on 2026-11-18 (forty-eighth pass): "Needs you" on the status page

The status page's list of waiting areas is what got Al Twar Fifth fixed: the owner saw it and found the other name. So the page now opens with **Needs you**: every unresolved issue a person can fix, each with why it matters, what to do and a link (areas without a map point, Dubai Data stopped, failing sources, a failed pull, open alerts, the Dubai Pulse key, DLD's permission, old branches). Things that resolve themselves (unconfirmed jumps, sources that differ) stay under "Waiting". The rule is in CLAUDE.md: any new human-fixable condition goes on this list.

Merged and deployed on 18 Nov (Tests passed). With today's data the list should hold three items: the Dubai Pulse key, DLD's permission, and the six old branches; no area is waiting for a map point. Checked in the browser tests with stubbed GitHub answers; the live page can't be opened from a session.

## Decision on 2026-11-18 (fifty-first pass): Metro and Tram

The collaborator: "Metro: show the Metro lines, and filter to areas near a station … make it slightly unique … don't forget tram stations and tram lines".
- **Data:** OpenStreetMap (ODbL, already credited on the map): the route relations for metro and tram in Dubai and their stations, one Overpass request a week in "Place unplaced areas" (`collector/transit.py` → `data/transit.json` on the data branch, deployed with the page). Both directions and the Red Line's two services (Centrepoint–Expo City and –UAE Exchange) become one line; the closed Downtown trolley is left out; stations of lines not yet running (Blue Line) are left out until OpenStreetMap maps the line as running. Checked: 2 metro lines with 53 stations, the Tram with 11 stops (matches the network). The session can't reach OpenStreetMap, so a check workflow runs the collector on GitHub when it changes and prints the result in its log.
- **On the map:** a Metro button on the zoom bar. Colours took three rounds with the collaborator: OpenStreetMap's pure red, green and orange "doesn't really match the colors of the brand or the map"; per-line brand tones (oxblood red, sage, gold) still didn't; four styles were shown side by side, and the answer was "tram and metro have to be different colors but match it to the map's theme colors". So: **Metro in the brand's oxblood, Tram in its gold leaf**, each on an ivory casing; both Metro lines share the Metro colour and are named in the tooltip and breakdown. Stations are ivory dots ringed in their system's colour.
- **Zoom** (the collaborator: "when I zoom in the train line doesn't get smaller"): lines and dots kept the same size on screen at every zoom, so close up they covered the streets and the base map's own track. They now slim down from zoom 12 to half size at zoom 16. Then "make the stations a little smaller when I zoom out, it's way too big": dots are now small across the whole city (55% at zoom 10) and full size only at neighbourhood zooms (13–14).
- **Filter:** "Near Metro / Tram: Anywhere, 10-minute walk, 20-minute walk" (800 m / 1,600 m straight line to the area's official outline: an area counts when its edge is that close, not only its centre). Works with the budget.
- **What makes it ours:** each station has a rent: tapping one shows what the chosen home typically costs within the walk and which areas that covers; and the line under the filters names the cheapest station for that home ("Lowest near a station: Abu Hail (Green Line), typical AED 41k").
- **Tests:** `tests/test_transit.py` (merging, the trolley, one station per name, refusing a thin result), `tests/transit.test.mjs` (distances, areas near a station, rent near stations), a browser check when the file is present.

## Decision on 2026-11-18 (fifty-second pass): compare two areas

The collaborator asked for "a nice slick comparison side by side, a different tab or within the main, tell me what you think is better", then "make sure it is the same color and fits the theme well".
- **Within the main page, not a tab:** the map stays in view with both areas outlined, it starts from where the visitor already is (an area's breakdown or the rent check), the Home picker and filters carry over, and a link (`?compare=A|B`) gives it the shareability a separate page would have had.
- **Picking the second area:** tap any label, or one of the three nearest areas with figures for the chosen home.
- **Theme:** the page header's oxblood band and gold-leaf rule; A in gold leaf, B in oxblood (both theme colours, distinct from the blue price scale); ivory panel; the better figure in a row bold with a gold underline.
- **Logic** in `insights.compare` (Node-tested): cheaper by the difference as a share of the dearer, about the same within 3%, home sizes in reading order.
- **Tests:** a browser check opens a comparison from JVC and runs axe with it open. The accessibility check now also waits for the map to stop and a breakdown to finish fading in (an Arabic run caught a breakdown mid-fade after the rent check's fly-to).

## Decision on 2026-11-18 (fifty-third pass): the side panel and the comparison, cleaned up

The collaborator: "the panel really clumped up and messy … more professional and not AI slop", for both the side panel and the Compare panel.
- **Side panel:** six container styles had piled up (the header card, bare filters, a beige card holding more boxes, a black rule, figures, a beige table head), with fields of different heights and widths and uneven gaps. Now one system in `panel.css`: sections divided by hairlines, one heading, one field (40 px), one spacing scale, filters in a tidy grid, the rent check as a section on one row, the table without a box. Restraint over effects: one GSAP entrance on load and nothing else.
- **Compare:** the table of ruled rows with two-line labels became a "versus" sheet: the two areas face each other with their rent rolling up (our odometer, from React Bits' Counter), one plain sentence for the answer, then mirrored rows with bars from the centre so the difference reads without reading numbers. Short home-size names keep labels on one line.
- Lenis keeps the page's smooth scrolling; the comparison scrolls natively (`data-lenis-prevent`).

## Decision on 2026-11-18 (fifty-fourth pass): a Hotels view, from free sources only

The collaborator and a friend asked for a hotels option next to rent and sale price, updated three times a day, with nightly prices from several sources. Checked what is free and allowed: nightly prices from Booking.com, Agoda, Expedia, Google Hotels or Airbnb need a partner or affiliate agreement (or scraping, which their terms forbid), so the collaborator chose "1 and 4": OpenStreetMap's places to stay, and DET's official figures through Dubai Pulse, "where rent and sales are".
- **A fourth view in the map's bar**, Hotels: places to stay counted per area, every place as a gold-ringed dot, and a breakdown that links out (Google Maps, a Booking.com search) instead of showing a price we can't source. Plain ivory labels, since the blue scale means price.
- **Where a hotel belongs:** the official outline that holds it, else the nearest area point within 1.5 km (`Transit.assign`, tested). Groups of labels add hotels, not contracts (an early build added contract counts and showed "25,413 hotels").
- **Refresh:** OpenStreetMap weekly with Metro and Tram (hotels open and close slowly; Overpass asks for light use). DET figures are monthly, so they are tried on every pull but only change once a month.
- **DET is blocked for now:** Dubai Pulse refuses the CSV and the API from outside the UAE, the same wall as the rent contracts. The collector switches on by itself once `DUBAI_PULSE_KEY` / `_SECRET` are added; the status page's Dubai Pulse entry now names the hotel figures too.
- **Colours** ("keep the same theme the company colours already follow"): counts on oxblood badges with ivory type, gold-leaf dots ringed in oxblood and gold-leaf outlines, all from the palette; a first version used the Tram's darker gold and near-invisible ivory badges. Links in every map breakdown now take the page's link style instead of Leaflet's blue.
- **Credits:** OpenStreetMap in the legend and every hotel breakdown; "prices are set by the booking site, not this page".
- **Next, needing the owner:** live nightly prices per area need the Booking.com affiliate programme (deep links and widgets) and/or Agoda's affiliate API; both are free to join.
- **Checked:** 975 places from a run on GitHub (789 hotels, 73 hotel apartments, 63 hostels, 50 guest houses); Python tests for both collectors; browser checks for the view on desktop and phone (counts, key, no overlaps); English, Arabic and phone screenshots.

## Decision on 2026-11-18 (fifty-fifth pass): an area's breakdown no longer hides the area

The collaborator: "when we press on a highlighted area the pop-up kind of hides the highlighted area". The map flew to the area before the card existed, guessing its room, and the card hung from the label in the middle of the area: it covered up to half of it on computers, and on phones the sheet (up to 80% of the screen) left a sliver above it.
- **Card first, then fit:** the breakdown opens, its real size is measured, and the map fits the area into what is left (one move, not two). Photos loading later refit it.
- **Computers:** the card hangs from the area's top edge, or sits to its right when that shows the area larger (wide maps, tall areas); it is capped at 58% of the map's height.
- **Phones:** the sheet stops at 60% of the screen, like Compare, and scrolls inside; the area fits in the strip above it.
- **Checked:** a browser check fails if the card covers more than 3% of the area; Business Bay, Jumeirah Village Circle and a phone viewed before and after (covered 18%, 47%, 13% → 0%).

## Decision on 2026-11-18 (fifty-sixth pass): hotel prices, each hotel and each area

The collaborator: "each hotel should have an average price and the area should as well". No free source gives nightly prices without an account, and we don't invent or scrape them. Checked: Booking.com's Demand API is for approved affiliate partners and forbids using its content for price comparison; Amadeus closed its self-service APIs on 17 July 2026; LiteAPI (Nuitée) gives a free account whose rate searches are free under a reasonable look-to-book ratio. The collaborator chose LiteAPI.
- **What a price is:** the cheapest room for 2 adults, one night, on 4 sample nights over the next month (different weekdays), averaged per hotel. An area's figure is the median of its hotels (a few palaces would pull an average far up).
- **How often:** once a day, about 20 requests (batches of 200 hotels), to keep lookups light since the site never books.
- **Matching:** our OpenStreetMap places to LiteAPI's list by position and name, each once; unmatched places say they have no price yet.
- **Safety:** a sandbox key returns test prices, so a sandbox answer is never published and the status page says to use the live key; prices outside AED 50–60,000, other currencies and runs pricing fewer than 20 hotels are refused.
- **On the page:** with prices the Hotels view becomes a price view on the blue scale (prices are prices), the hotel card leads with its average, and every area breakdown gets a places-to-stay line. Without the key nothing changes.
- **Needs the owner:** a free LiteAPI account and its live key as the secret `LITEAPI_KEY` (listed under "Needs you").
- **Checked:** collector tests with LiteAPI faked (matching, averages, once a day, no key, sandbox, other currency, rejected key); browser checks with and without prices (made-up local prices, never published).

## Decision on 2026-11-18 (fifty-seventh pass): in the Hotels view, an area's card is about its hotels

The collaborator: "when I am in hotel mode and I click on one, the pop-up says 1-bedroom apartment 72,000 yearly; it should have the hotel's price". The card was the rent card in every view. In the Hotels view it now leads with the area's places to stay (typical price a night once prices exist, a list that opens each place, a Booking.com search for the area) and folds the rents under "Rents in this area". Until the LiteAPI key is added it says nightly prices are coming rather than showing nothing. Browser check added for desktop and phone.

## Decision on 2026-11-18 (fifty-eighth pass): hotel figures checked

The owner: "review the hotel pricing, they don't look correct". No hotel prices were live (LiteAPI's key isn't added, so no price file was ever published); what looked like prices were counts. Three fixes:
1. **Only places inside Dubai:** the places job's search box reached Sharjah and Ajman, so 136 of 975 places were outside Dubai (drawn on the map and counted in the key; about a dozen counted into border areas). Places are now kept only inside Dubai Municipality's official community outlines, or within 300 m of one (piers, islands, coasts: Atlantis, Burj Al Arab, Bulgari, the World Islands all stay).
2. **Only places that take guests:** 41 entries were staff housing, camps or residential towers tagged as holiday flats ("Emirates Crew Building 1–5", "Hilton Staff Accommodation", "Al Mamzar Tower 1"). Backpackers' hostels stay. On today's data: 975 places become 798.
3. **The figure at the top says it counts:** "809 places" with "no nightly prices yet" under it, instead of a bare 809 where prices usually go.
Prices still need the owner's LiteAPI live key (under "Needs you").

## Decision on 2026-11-18 (fifty-ninth pass): no LiteAPI key, by the owner's choice

LiteAPI only unlocks its live (real-price) key after a payment card is added, with authority to charge any booking made with the key. The atlas never books, but a leaked key could be used to book on the owner's card. The owner chose to skip it. So: the status page no longer asks for the key under "Needs you" (it says under "Waiting" that hotel prices are off by the owner's choice; a key that is added later but rejected or sandbox still shows there), and the Hotels view says nightly prices are on booking sites rather than "not yet". The price code stays: adding `LITEAPI_KEY` later switches prices on with no other change.

## Decision on 2026-11-18 (sixtieth pass): the price dial

The owner asked for an annual-rent dial for flats and a night-charge dial for hotels, "with min and max and median showing depending on the view", with two dial mock-ups. The header's big number became a dial: the median of the areas on screen (contract-weighted), placed between the lowest and highest area in view, whose figures sit at the two ends; its label and unit follow the view (yearly rent, sale price, yield; a night in the Hotels view once hotel prices exist). Kept in the site's palette (the price key's blues on the oxblood header, an ivory knob edged in gold leaf), not the mock-ups' navy. The headline changed from "typical" (an average) to "median", as asked; the legend and merged labels keep "typical". Hotel prices are off by the owner's choice, so the Hotels view keeps its count of places, with no dial.

Merged and deployed on 18 Nov (Tests passed; 175 browser checks). At the starting view the dial read 63,700 between 35k and 156k on a phone, and 60,000 between 35k and 279k on desktop, where one dear area stretches the range: shown as it is.

## Decision on 2026-11-18 (sixty-first pass): night prices through a partner widget and DET's official rate

The owner wants night prices showing but skipped LiteAPI (it needs a card). Of five ways offered they chose 2 (a booking partner's widget) and 4 (DET's official figures). Both are built and waiting on inputs only the owner can give:
- **Partner widget:** a hotel's card offers "Show live prices from {partner}" and loads the partner's own panel only when tapped (their scripts and prices stay theirs; nothing is stored). The link goes in `assets/app/partners.js`; until then "Needs you" asks for it, with the steps (free affiliate sign-up, create a widget, send the link).
- **DET:** the Hotels view's dial shows Dubai's official average room rate for the latest month, between the lowest and highest month of the past year, and each hotel's card gives that rate; it switches on by itself when the Dubai Pulse key brings `hotel_stats.json`.
Also fixed "1 places to stay" (now "1 place to stay"). Browser checks use stand-ins for DET's file and a partner.

Merged and deployed on 18 Nov (Tests passed; 180 browser checks). The owner was given the sign-up steps for an affiliate widget (Booking.com's, Expedia Group's or Travelpayouts' programme; create a hotel widget; send its code). The code takes a widget link; if the partner gives a script snippet instead, the card will be adapted to load that snippet on tap the same way.

## Decision on 2026-11-19 (sixty-second pass): are hotel prices being pulled? A check, and the gaps it found

Asked: "review hotel prices, make sure they are correct and being pulled". What the check found on 19 Nov:
- **No nightly price is pulled today, and none is shown as one.** All three sources wait on the owner: LiteAPI is off by their choice (no key; state `no_key`), the partner widget link in `assets/app/partners.js` is empty, and DET's figures need the Dubai Pulse key (the open CSV timed out from GitHub's runners). The page says so: hotel cards link to Google Maps and Booking.com, the Hotels view counts places, and no figure is invented.
- **The places are right:** 798 places to stay, all inside Dubai's outlines (or 300 m of one), staff housing left out (fifty-eighth pass).
- **Gap 1, silent source:** `hotel_stats.py` only logged; it never wrote `state.json`, so its failure didn't reach the run log, the status page or "Needs you". It now records `ok` (with the latest month), `no_key` (no Dubai Pulse access) or `failed` (the key is set but refused, or no believable month).
- **Gap 2, slow pull:** each pull waited about 4 minutes for Dubai Pulse's timeout. It now asks at most once every 20 hours (the figures are monthly), with one 20-second try for the CSV and two for the API (`--force` or `FORCE=1` to ask sooner).
- **Gap 3, no sanity bounds:** an average room rate outside AED 100–5,000 a night, or occupancy outside 0–100%, is left out of that month (a broken row or a different unit, not a Dubai rate).
- **Status page:** "The last pull" lists both hotel sources (DET and LiteAPI) with their state and DET's latest month; "Waiting" says the room rates wait for the Dubai Pulse key; "Needs you" lists DET when it fails with the key set (or asks for the key if only DET needs it). `run_log.py` records what each hotel source gave.
- **Checked:** Python tests (a refused download keeps the file and says why, the 20-hour wait, a good answer saved as `ok`, a refused key is `failed`, unbelievable rates left out), page tests and the browser checks (the status page shows seven sources, DET among them).

## Decision on 2026-11-19 (sixty-third pass): hotel prices from Xotelo

The owner wants hotel prices and ranges on the map, refuses LiteAPI (its live key needs a payment card that bookings made with the key could be charged to) and chose Xotelo: free, no key, the rates booking sites (Booking.com, Agoda, Trip.com, Expedia and others) show on TripAdvisor. Amadeus's free self-service API closed in July 2026, so there was no official free alternative.
- **Collector** (`collector/hotel_prices.py`, rewritten; same output shape, so the page's price view, dial and labels work unchanged): Xotelo's Dubai list once a day (2,600+ hotels), matched to our places with the existing name-and-position rules (527 of 798 in a live trial). Each pull asks up to 100 matched hotels, never asked first and then the longest ago, for one room, 2 adults, on two nights 14 and 19 days ahead, 3 requests at a time (about 6 minutes; Xotelo is a small free service, so no more). A night's price is the lowest offer not under 60% of the median offer (an official-site member rate a third of the others is not what most guests pay), converted at the AED peg.
- **Honesty:** prices older than 10 days are dropped by the collector and hidden by the page; a place without a price says it isn't listed on booking sites yet; when Xotelo fails the last prices stay, the status page says so, and "Needs you" asks for another source if it stays down.
- **Ranges:** an area's card gives "From AED … to … a night" across its priced hotels; a hotel's card its average and the range of its nights; the dial the median of the areas in view with the lowest and highest at its ends.
- **Removed:** LiteAPI (key, sandbox guard, "Needs you" item, status lines). **Kept:** the partner widget (live prices in the card on tap) and DET's official rate (with the Dubai Pulse key).
- **Checked:** Python tests with a fake Xotelo (matching, the 60% rule, rotation, list once a day, stale prices dropped, failures keep the file); a live trial (18 of 30 hotels priced: Atlantis about AED 1,960, Signature 1 Hotel about AED 190); browser checks with a priced file (labels are prices, dial, area range, hotel card, a 20-day-old price hidden). The hotel check workflow prices 15 hotels from GitHub's network.

Merged and deployed on 19 Nov (Tests passed). The first pull from GitHub priced 58 hotels (AED 142 to 6,788, median 312); by the third pull that day 194 were priced. The hotel check workflow's own trial priced nothing that first time because OpenStreetMap didn't answer it (no places list to price), so the real pull, which loads the saved list, was the proof that Xotelo answers from GitHub.

## Decision on 2026-11-19 (sixty-fourth pass): hotel pull figures on the status page

Asked: "add hotel pull stats to status page and if any intervention is needed". The status page gets a **Hotels** section read live from the data branch (`hotels.json`, `hotel_prices.json`, `state.json`): places on the map, how many Xotelo found, how many have a current price (and how many were asked or had no rooms), the price range and median, when prices last updated and the oldest price, DET's state and the partner panel. "Needs you" gains four hotel checks, each with what to do: places not refreshed for 15+ days, prices not refreshed for 48+ hours, fewer than 300 matched, under a quarter priced after every matched hotel was asked (with the existing Xotelo-failing, DET-failing and partner-widget items). On the first day it read 798 places, 527 found, 58 priced (AED 142 to 6,788, median 318). Checked: browser checks (seven figures, a 3-day-old price refresh listed under "Needs you", accessibility in English and Arabic); the DET test now runs without a price file, since DET's rate only shows when no hotel has a price.
Also answered: Travelpayouts gives no hotel price data any more (its Hotellook API closed on 20 Oct 2025); it is a widget and commission programme only.

Merged and deployed on 19 Nov. Live the same day: 798 places, 527 found on Xotelo, 58 then 120 priced; no hotel check in "Needs you" fired. Also on 19 Nov: the owner deleted all 13 old branches; the status page now keeps `rera-check` (parked work) off its old-branch list.

## Decision on 2026-11-19 (sixty-fifth pass): a Holiday homes view

Asked, of Xotelo's 325 "condominiums": "add these as their own tab". Xotelo files holiday homes and serviced apartments as condominiums (and a few villas and a cottage); OpenStreetMap mostly doesn't map them, so they were missing from the Hotels view.
- **Collector** (`collector/holiday_homes.py`): reads Xotelo's Dubai list once a day, keeps those kinds inside Dubai, each once, and leaves out any already priced as a hotel, so nothing shows twice (256 of them on the first run). Prices up to 50 a pull, with the hotel collector's own rules and code (`hotel_prices.fetch_rates`), so a full round takes about two days; only priced places are saved, prices older than 10 days dropped. About 3 minutes a pull, after the hotels, to keep the load on Xotelo modest.
- **Page:** a fifth view, **Holiday homes**, appears once the file has a price. It is a price view on the blue scale (labels, outlines, dial, key) with its own dots (espresso ringed in gold leaf), cards (kind, rating and reviews, average and range, Google Maps, Tripadvisor and Booking.com links) and area breakdowns (typical price, range, list). The places-to-stay views share one check (`STAY`): no rent budget, no thin marks, any home size.
- **Called "Holiday homes"** as the owner asked; each card says "Serviced apartment or holiday home", because many are serviced apartment buildings.
- **Status page:** an eighth source row and an eighth Hotels figure (priced of listed, asked so far); "Needs you" when it fails or hasn't refreshed for 48 hours. The hotel check workflow prices 10 from GitHub's network.
- **Checked:** Python tests with a fake Xotelo (kinds kept, duplicates and hotels left out, rows, rotation, old prices dropped, failures keep the file, a short list refused); a live trial (11 of 15 priced, e.g. RODA Amwaj Suites about AED 420 a night); browser checks (the view, its dots and no hotel dots, blue labels, dial and key, the area card, a home's card with its Tripadvisor link, accessibility).

Merged and deployed on 19 Nov. First pull: 256 candidates, 20 priced of 50 asked (AED 202 to 2,170, median 423; the rest had no units listed for the sample nights, common for apartments booked ahead); by the next pull 31.

## Decision on 2026-11-19 (sixty-sixth pass): hotel and holiday home price history

Asked: "add the hotel price history too". Xotelo only gives today's prices, so the site keeps its own record, as it does for rents.
- **Collector** (`collector/stay_history.py`, after the build): each area's median price a night and how many places it rests on, plus Dubai's median, for hotels and holiday homes, one entry a day in `stay_history.json`, never deleted. Areas are assigned with the page's own rule, ported to Python (checked: all 120 priced hotels land in the same area as on the page). Prices refresh on a rolling basis, so a day's figure is a smoothed median of the last few days, which suits a trend; a single night's price would swing with weekends and events.
- **Page:** an area's hotel or holiday home breakdown draws the series (from 3 days) and, once there are four weeks, the change since a day at least 28 days earlier, only when both days rest on 3 or more places, so one hotel coming or going can't make a trend. The legend carries Dubai's line. The file loads only when a places-to-stay view is drawn.
- **Status page:** the Hotels note says how many days of history there are; "Needs you" when no day was added for 48 hours (a missing day can't be filled in later).
- **First day:** 19 Nov, hotels 120 places (median AED 317) in 40 areas, holiday homes 20 (median AED 423) in 12.
- **Checked:** Python tests (the page's area rule, outlines of unplaced areas ignored, old prices left out, one entry a day, days kept when nothing is priced); browser check with 35 days of stand-in history (chart and "+9% since").

Merged and deployed on 19 Nov; the pull right after saved the first day on the data branch: hotels 194 places in 48 areas (median AED 334), holiday homes 31 in 16 (median AED 546). Trend lines from about 21 Nov, the four-week change from about 17 Dec.

## Decision on 2026-11-19 (sixty-seventh pass): Hotels and Holiday homes, critique and fixes

Asked: "critique the user interface, especially hotels and holiday homes", then "do it all". Fifteen points, all done:
- **Phone bugs:** with five views the bar ran over the zoom "+" at 375 px: it now gets the width beside the zoom buttons and scrolls, the chosen view in sight (`fitViewBar`). Long place names pushed an area's list past the phone sheet (414 px in a 375 px sheet): fixed table layout and wrapping names. Holiday home cards said "one room" (now "one unit") and "rated 4 of 5 (1 reviews)": ratings show only from 5 reviews (`MIN_REVIEWS`).
- **The side panel follows the view** (`stayPanel`): in Hotels and Holiday homes the home picker and the rent check step aside; the budget boxes become a **nightly budget** on each area's typical price (each mode keeps its own figures, `swapRange`, so a rent budget is never read as a price a night); the key figures become places with a price, Dubai's median a night and the cheapest area (from areas with 3+ places); the table becomes **Hotel / Holiday home prices by area** (typical, cheapest, dearest, places; cheapest first; names open the area; its own CSV).
- **Map:** with prices, priced hotels are solid gold dots and the ~600 without a price small hollow rings shown only from street level (zoom 14). Areas resting on fewer than 3 priced places are dashed (thin) and left out of the dial's ends, which had come from single hotels (158 and 2.5k before; 206 and 1,057 after). Labels give full figures ("AED 1,036", not "AED 1k a night"); the key says "a night". The legend keeps the colour key, the counts and the trend line; how prices are made, the credits and "history kept since" fold under **About these prices**; the visitor-facing "DET shows here once Dubai Pulse access is granted" note is gone (the status page tracks it).
- **Cards:** lists run cheapest first, priced before unpriced; "Hotel" no longer repeats under each name (only other kinds and ratings); each view's area card points to the other ("Holiday homes here: typically AED 1,036 a night · Show holiday homes"); hotels carry Tripadvisor ratings too (`hotel_prices.json` `info`); dates read as elsewhere ("19 Nov 2026"); a place's card names the nights priced ("Nights of 3 Dec and 8 Dec"); on phones the prices lead the sheet, photos and Google links below. The dial's caption is shorter ("Hotels in view · 48 areas · ends: cheapest and dearest area").
- **Checked:** browser checks for the panel (no home picker or rent check, nightly figures, the prices table cheapest first), the nightly budget (keeps 36 of 72 areas at the median; the rent view keeps its own budget), the view bar clear of the zoom buttons and the sheet list fitting at 320 and 375 px, the nights on a card, the hollow rings rule; all suites pass.

Merged and deployed on 19 Nov (Tests passed). Hotel ratings appear once the hotel list is next re-read (once a day), since that is when `info` is saved.

## Decision on 2026-11-19 (sixty-eighth pass): free price sources checked; Google Hotels through SerpApi

The owner sent a list of free sources and asked to get access to them for three pulls a day. Each was checked (three of their sites had to be allowed in the session's network first):
- **SerpApi (Google Hotels): usable**: free plan 250 searches a month, 50 an hour. Built (`collector/serp_stays.py`), waiting for the owner's key (`SERPAPI_KEY` secret).
- **Best Time To Book: not usable**: its site and API answer every automated request with a browser checkpoint (HTTP 429); getting past it would be a workaround the project rules out.
- **Inside Airbnb: no Dubai**: its download page covers about 37 countries, none in the UAE or the Gulf (nearest: Istanbul). CC BY 4.0, if Dubai ever appears.
- **SearchApi (100 requests in all), StayAPI (50 on signup), FlightPowers (10 a month): too few** for three pulls a day. **AirDNA:** market averages behind an account, no free API, its site may not be copied.
- **OpenStreetMap, Dubai Data, Dubai Municipality:** already used.

The SerpApi collector, built to switch on by itself when the key is added:
- **Budget:** two searches a pull (hotels, then vacation rentals), one night two weeks ahead, 2 adults, AED; counted per calendar month in `state.json` and stopped at 240 (a margin under 250); at most every 6 hours, so duplicate triggers cost nothing. Three pulls a day use about 186 a month. The place searched rotates through 24 areas, so the month covers the city instead of repeating "Dubai".
- **Use:** Google's hotels are matched to our places (the Xotelo matching rules) and used only where Xotelo has no current price; Google's vacation rentals join the Holiday homes view unless one of Xotelo's holiday homes is the same place. Prices before taxes and fees where given, as Xotelo's. Prices older than 10 days dropped; failures keep the last file. The price history counts them like the others.
- **Page:** a Google-priced card says "Lowest rate on Google Hotels … Night of 3 Dec" and "Price: Google Hotels, via SerpApi"; a Google rental links to its listing; the legends say where Google fills in.
- **Status page:** a source row, a Hotels figure (searches used of 240, priced counts), and "Needs you": "Add the SerpApi key" with the steps until it is set, then if it fails.
- **Checked:** Python tests with a fake SerpApi (no key, two searches in AED two weeks ahead, Xotelo first, rentals not twice, the monthly cap and a new month, six hours apart, a rejected key keeps the file); browser checks (a Google-priced hotel and its card, a Google rental in Holiday homes, the key asked for in "Needs you").

Merged and deployed on 19 Nov (Tests passed); the pull right after recorded `serp_stays` as waiting for its key ("Needs you" asks for it), and priced 273 hotels (from 194) and 40 holiday homes (from 31) from Xotelo.

## Decision on 2026-11-19 (sixty-ninth pass): the fifth interface critique

Asked: "critique the user interface", then "do it all, merge on main". Sixteen points:
- **Phones and Arabic:** in Arabic three of the five views sat off-screen in the map's bar, and in English the fifth read "Holic". On phones the views now leave the map for a row of chips just above it, all visible (wrapping), in both languages (`placeViews`). Area sheets lead with the figures (the Google links and photos follow), as the pop-up does. The compact area check runs the full width (the section had shrunk to its content and centred). The header caption is shorter.
- **Map:** group labels read "Al Nahda Second + 37 areas" (not "+37"; "+ 1 area" for two). Metro moved from the zoom stack to the map's top-right bar beside place names: one bar for layers, one stack for moving. Labels sit 4 px apart instead of 6 at the opening zoom, so a few more areas show before merging (no-overlap checks still pass).
- **Side panel:** "On the map: 100.0%" (useful while placing areas, not to visitors) is replaced; the three figures follow the chosen home and view: "Contracts for 1-bedroom apartments" in the areas shown, "Cheapest area" (from areas with 10+ contracts and not industrial; "Highest yield" in the yield view) and "Areas on the map" of those with figures. Sale prices in the table round to the thousand (the CSV keeps them exact).
- **About:** "Reading the map" explains the price views; the credits name OpenStreetMap places, Xotelo, Google Hotels via SerpApi and DET; "What this is not" says hotel prices are samples, not live booking prices; "Areas not on the map yet" shows only when there are some; the per-source "Data health" list is gone in favour of the status page link.
- **Small items:** photo captions read "Photo by {author}" (author and licence on hover and when opened); the dial's track is lighter on the oxblood band.
- **Checked:** new browser checks (all views as chips at 320 px in Arabic and 390 px in English, Metro out of the zoom stack, sheets leading with figures; key figures following the home; group label wording); every suite passes.

## Decision on 2026-11-20 (seventieth pass): the key moves to the bottom right

Asked (screenshot of the Hotels view): "move the bottom left key to the right, it covers less urban areas on the dubai map". Dubai's coast and city run from bottom left to top right, so the bottom-right corner is mostly desert. The key now sits there (`right:12px`, above the map credits on wide screens; `right:8px`, above the "i" credits button on phones). Labels already step out from under the key wherever it is (`labels.js` blocks). Checked: every browser check passes (no label under the key in English and Arabic, desktop and phone); measured on desktop (key 1106–1428 px, credits below it) and at 390 px (key clear of the "i" button).

## Decision on 2026-11-20 (seventy-first pass): what the figure is, in bold; switches for layers

Asked (screenshot of the header): "there's a blank space to the right, have the text boldly shown as it is important to see: AED A YEAR, MEDIAN SALE PRICE, GROSS A YEAR (ROI), AED A NIGHT, AED A NIGHT", and "the metro button is a toggle, have it look different" (read as Metro and the place-names button, both on/off layers).
- **Beside the dial:** the view's unit in large bold gold capitals ("AED A YEAR", "MEDIAN SALE PRICE", "GROSS A YEAR (ROI)", "AED A NIGHT") with one plain line naming the figure and the home ("Median yearly rent, 1-bedroom apartments"); in Arabic too. Hidden when the dial is (a count of places has no unit).
- **Switches:** Metro and A+ع carry a small track-and-knob switch and no longer fill like a chosen view, so layers and views look different.
- **Also:** on phones a million-dirham sale median ("1,108,000") ran past the dial's ring; such figures now get smaller type (checked inside the ring at 390 px and on desktop).
- **Checked:** every browser check passes (header heights included); screenshots of Rent, Yield, Hotels, Sale price on a phone, and Arabic.

Merged on 20 Nov. The first Deploy run failed in GitHub's own Pages publishing step (Tests had passed; nothing in our build); re-running the failed job published it.

## Decision on 2026-11-20 (seventy-second pass): share a card

Asked (screenshot of a hotel area card): "add a share link with a text before, that allows you to send the pop up cell to someone else to share and inform about a certain property; right now the share will be on the github page, in the future it will be moved to its own domain".
- **On every card** (area, hotel, holiday home): "Send this … to someone:" then **Share link**. Phones get the phone's share sheet (WhatsApp, Messages); computers get a line of text plus the link on the clipboard, so a pasted message says what it is before the link.
- **The link reopens that card** in the same view and for the same home (`?open=a:<area>`, `h:`/`s:` for a hotel or holiday home, keyed as in the data files). It waits for hotels and holiday homes to load; the resumed rent check and saved map position don't override it.
- **Own domain later:** the card links use the page's own address, so they follow the site with no change. When the domain moves: point it at GitHub Pages (a `CNAME` file and the DNS record), and set `SITE_URL` for `scripts/share_pages.py` and `scripts/check_fresh.py` (the area preview pages, sitemap and freshness check) and the two `og:` addresses in `index.html` (open item 7 in the conversation log).
- **Checked:** a browser check copies an area's link, finds the text and the link on the clipboard, opens the link in a new page and finds that area's card; a hotel link opens that hotel's card.

## Decision on 2026-11-20 (seventy-third pass): the price in the frame, not behind the number

Asked (screenshot of the Hotels view): "have the price border thicker and shaded, rather than the actual number highlighted; the border shows the heat or how cheap or expensive that property or average is; the number stays clear and easy to read".
- **Labels:** the figure loses its coloured badge and is plain espresso type; the card gets a 3.5 px border in the area's price-key colour and a light tint of it (17%), with a 1 px dark hairline outside so the palest blue still shows. Thin figures get a dashed frame (it was a dashed outline); groups a second frame behind in the same colour (it was gold). Hover and focus keep a gold ring outside.
- **Why it's better for reading:** the number's contrast no longer depends on the price colour (espresso on a light card in all six bands), so no figure has to switch to ivory type on the dark blues.
- **Trade-off:** the cheapest band (`#EFF3FF`) is nearly white, so cheap areas read as a plain card with a dark hairline; that is the key's own lightest step, and the legend shows the same.
- **Checked:** the label check now verifies each border is at least 3 px in exactly its key colour, with a transparent figure background and espresso type; every browser check passes, axe included; screenshots in light and dark.

## Decision on 2026-11-20 (seventy-fourth pass): an area's card is about the view it was opened in

Asked (screenshots of Damac Hills 2): "we are looking at sale price, and the text pop up talks about rent, which is confusing; when on sale price, focus on sale price; you can still talk about rent but make it clear that you are referring to annual rent", then "the same for rent view, focus on rent, mention sales, but not the main topic".
- **Sale price view:** the card leads with the sale median (the picked home's, then all homes with the change on a year ago), the sale price chart and a table by home size (sale price, annual rent, yield). Rent only appears as "Annual rent: median AED … a year", and the rent breakdown folds under "Annual rents in this area".
- **Yield view:** leads with the gross yield and its makings ("Annual rent AED 70,000 a year against a median sale price of AED 1,108,000"), the same table, rents folded.
- **Rent view:** rent only in the main lines (the yield and sale price parts are gone from them); sales get one small line ("Buying here: median sale price AED 1,050,000 · gross yield 6.3% (1-bedroom apartments, AED 1,108,000, 7.0%)") with "Show sale prices", which switches to the Sale price view; the sale chart moved to that view.
- **Also:** sale prices in cards round to the thousand, as in the table.
- **Checked:** browser checks for each view (what the card leads with, "annual rent" wording, the folded rents, the sales line and its button, no sale chart in Rent); every suite passes.

Merged and deployed on 20 Nov (Tests passed). Live figures that day: 534,699 contracts in 158 areas (data to 19 Nov); 374 hotels and 53 holiday homes priced; two days of price history; SerpApi still waiting for its key.

## Decision on 2026-11-20 (seventy-fifth pass): more fun, more engaging, from the data itself

Asked: "critique the user interface, how can it be made better? more fun, more engaging?", then "do it all, merge on main". Thirteen ideas, all built in `assets/app/fun.js` and `fun.css` (atlas.js gained only small hooks: `afterLabels`, `cardFact`, `rentOrBuy`, `stayFinder`, the Save as image button, the dots' zoom):
- **Quick wins:** "You" on the map after a rent check; the "Dubai right now" facts strip; labels counting up on a view change; Save as image on every card.
- **Bigger:** the budget slider on the map; Rent or buy in sale and yield cards; the 60-second tour; Find a hotel / holiday home; Guess the rent.
- **Polish:** three first-visit tips; a headline fact on area cards; hotel and holiday home dots from zoom 12.
- **Rules changed, with the owner's approval in "do it all":** design goal 9 now allows one game, Guess the rent, kept to the answer and how close the guess was (no score, points or streak); CLAUDE.md's one-control-per-job rule now has one exception, the budget slider, which mirrors the Max box both ways.
- **Problems found while building:** atlas.js's data (`HOTELS`, `HOMES`, `TRANSIT`) are page-level `let`s, not `window` properties, so fun.js reads them by name; Leaflet floats every control, so the slider moved above the map on phones floated beside the map and squeezed it to 133 px (unfloated); the slider appearing after labels were placed left one under it (labels are now re-placed when its size changes; on phones it leaves the map entirely); the tour and guess chips lost contrast in dark mode (a light highlight under light text; removed); the first tip didn't wrap on phones.
- **Checked:** new browser checks for each feature (facts and their taps, tips, Guess the rent's reveal with no score, the tour's steps and Escape, "You", the slider driving the Max box and the map, the headline fact, Rent or buy following its sliders, Save as image downloading a PNG, the stay finder and its rating filter, no script errors, axe); dot checks updated for zoom 12; every suite passes.

## Decision on 2026-11-20 (seventy-sixth pass): ideas from keybox.ae

Asked: "what features are useful for our map found on keybox.ae… list out the features so I can choose", then "do it all, merge on main". Eleven ideas, each built from data we already publish or from free, open sources (nothing copied from keybox.ae, no listing portals):
- **Pages written at deploy** (`scripts/site_pages.py`, after `share_pages.py`): a Market Stats page (`stats/`: headline figures, busiest rental markets, cheapest and dearest 1-bedroom areas, best yields, sale price per sq ft by month, what moved, hotel nights); an areas directory (`areas/`, sortable); landing pages for common searches (`rents/<home>/` for studios to 3-bedrooms, `rents/1-bedroom-under-<n>/` for AED 50k, 60k, 75k and 100k; `yields/`); an RSS feed (`feed.xml`) of each publication's moves of 5% or more from 30+ contracts, from our own history snapshots. Every page opens the map with the same view, home and budget (`?view=`, `?home=`, `?max=`), and all go in the sitemap. Figures from fewer than 10 contracts and industrial zones are left out of rankings.
- **Richer area pages:** questions and answers on every `a/<slug>/` page (1-bed, studio and 2-bed rent, sale price, yield, contracts), also as schema.org FAQPage, like the stats page; the button opens that area's card on the map (`?open=a:`).
- **Map:** a 3D view (MapLibre with tilted, raised OpenStreetMap buildings and the area outlines in price colours; shown only where WebGL works; Back to 2D or Escape returns to the same spot); Sale price per sq ft as a Total / Per sq ft switch in the key (hidden `sale_psf` view, so the view bar still has one Sale button); a currency switch (AED, USD at the peg, EUR and GBP from `fx.json`; labels, dial and key converted; remembered); the busiest market in the facts strip; a "Near" filter (beach, golf course, park, mall, schools) and a "Nearby" line on each card, from `lifestyle.json`.
- **New collectors:** `collector/fx.py` (European Central Bank rates through Frankfurter, free, no key, at most every 20 hours, in the daily pull) and `collector/lifestyle.py` (one Overpass query a week, in "Place unplaced areas": straight-line distance from each area's reference point to the nearest beach, golf course, named park and mall, and schools within 2 km; not saved under 200 places). Without either file the map hides the extra currencies or the Near filter.
- **Problem found while building:** the 3D overlay sat under Leaflet's zoom bar (z-index 1000), so Back to 2D couldn't be pressed; the overlay now sits at 1001. Up to 60 labels in 3D piled on each other, so the busiest is kept and one that would cover it is hidden until the view gives it room (rechecked as the map moves). The 3D button appears once MapLibre is in, widening the bar, so labels are placed again then. Seen but not changed here (it was on main already): on a phone in Sale price, a label at the top edge can still touch the view bar, and one at the bottom the map credits.
- **Checked:** Python tests for the site pages, feed and both collectors (stand-in data); browser checks for the currency switch, per sq ft, the Near filter (stand-in lifestyle file), the Nearby line, 3D open and close, no script errors; every suite passes.

## Decision on 2026-11-20 (seventy-seventh pass): the Burj Khalifa in 3D

Asked: "burj khalifah doesn't look right, fix it" (screenshot: a wide block with a thin spire on top). OpenStreetMap draws the tower as stacked tiers (building parts) that taper upward, plus one outline of the whole footprint; the map tiles mark that outline `hide_3d`, meaning "don't raise this when the parts are raised". The 3D view raised it anyway, so the full footprint went up as one fat block around the tiers. The building layer now skips features with `hide_3d` (`fun.js open3d`), which fixes every tiered building, not only the Burj. Checked by reading the tiles' building features around the tower and on screenshots.

## Decision on 2026-11-20 (seventy-eighth pass): no label under a map control

Asked: on a 375 px phone in Sale price, "Dubai Maritime City + …" sat under the view bar (Metro, 3D) and "Damac Hills 2" touched the map credits; re-placing the labels didn't help, and main had it before the keybox merge (noted in the seventy-sixth pass). Goal: no label on a control at any view on 320, 344 and 375 px; with nowhere to go, merge it or hide it.
- **Cause** (labels.js rule 3): a label with no free spot was merged into its nearest neighbour without checking the result, and only one stuck label was handled per round, six rounds in all. On a phone the legend takes about a quarter of the map, so the big New Dubai group pressed against it never got free and used every round, growing to 39 areas; the labels under the view bar and the credits never got a turn and were returned on the controls as they were. The browser check only looked at the opening view.
- **Rule now:** a stuck label first tries the spots beside its point and two label-steps out, then the nearest free position within a label's width and three heights. Failing that it joins its nearest neighbour (within 1.5 times the two labels' widths, so never an area across the map) for which the label then holding it, after the usual merging, finds a free spot. Failing that it is **hidden** (`hidden: true`; atlas.js doesn't draw it), so nothing is ever drawn under a control. Every stuck label gets its turn. Hidden labels are still returned, so every area stays in exactly one label.
- **What it looks like:** in Sale price on a 375 px phone, Maritime City and Mina Rashid join the Jumeirah Garden City group, and New Dubai (with Damac Hills 2, Town Square and Al Furjan) is one group, "Jumeirah Village Circle + 40 areas", beside the legend instead of under it. No label is hidden on the real data at 320, 344 or 375 px in any view.
- **Checked:** unit tests for the starvation case (eight hopeless labels before one that can join; fails on the old code), a label with nowhere at all (hidden), a stuck label joining a neighbour, and 30 random phone maps with the view bar, zoom, legend and credits; a browser check at 320, 344 and 375 px that switches through every view and finds no label's visible part on any `.leaflet-control` (it caught "Wasl 1 + 2 areas", "Damac Hills 2" and "Dubai Maritime City + 1 area" on the old code); every suite passes.

## Decision on 2026-11-20 (seventy-ninth pass): review round, one product

Asked: "review overall and critique it, how can it be made better?", then "do it all, merge on main". The review found the site had grown faster than it had been tidied: too many controls before the map, three different "typical rent" figures, and new pages that didn't match the rest. All five groups built:
- **Broken bits:** the desktop card's "Check a rent here" and "Compare" were half cut off at the bottom of a scrolling card; they are now pinned to its bottom edge. The tip line ran off phones: the facts strip, a flex item, grew to the width of its scrolling row (687 px on a 390 px screen); it may now shrink. Labels under the map's controls on phones were fixed in a parallel session ("no label under a map control", seventy-eighth pass), merged into this round.
- **One set of numbers:** "typical" on the stats pages is now the middle contract (each area's median weighted by its contracts), the figure the map's dial already showed, and the dial's footnote says "on screen", so the two match when the map shows all of Dubai and the page says so. Figures in sentences, lists and headline boxes keep three significant figures (AED 36,700, not 36,686), as the labels do; tables keep exact medians, as the area card does. Rankings (cheapest, dearest, best yields) take areas with 100+ contracts, so Bluewaters (64 contracts) no longer tops "dearest". The sale price chart's scale starts at 70% of its lowest month, with gridlines and a line saying the change in words.
- **Phones:** one "Near" picker (Metro or Tram station within a 10- or 20-minute walk, or a beach, golf course, park, mall or 10+ schools) instead of two; the exact Min/Max boxes fold away under the budget heading (the map's slider sets the maximum; a shared budget opens them); the dial's side copy goes on phones (the dial writes its unit); the facts strip moves below the map. The map starts about 120 px higher.
- **Generated pages:** one look for every page written at deploy (`scripts/page_kit.py`: Barlow, the golden-note palette, gold-underlined links, a dark mode, one header with Market stats, All areas, Best yields and the map, one footer); every page also in Arabic under `ar/` (right to left, linked both ways, in the sitemap); the main page's header links to the market pages (to the Arabic ones in Arabic); area pages put AED in the table heading and say "down 6.6% in a year (per sq ft)". The stats page gets "Rent over the past four weeks" and area pages a "since" line once our history is four weeks deep (mid-December), by the same base snapshot rule as the map's cards.
- **Lighter page and tidier card:** the Arabic tables (about 92 KB) moved from `i18n.js` to `i18n-ar.js`, downloaded only when the page is in Arabic (`i18n.js` writes it in right after itself, before the page scripts run; switching language reloads the page anyway). The desktop card folds "Busiest buildings" and "Details and sources" (what's nearby, other sources, the DLD note).
- **Checked:** Python tests for rounding, the weighted figure, the rankings floor, the chart note, the four-week section, Arabic pages and links; node tests for the Arabic tables loading only in Arabic; browser checks for the pinned card actions, the phone layout (map top, facts after the map, tip width, folded budget, no side copy), one Near list, header links in both languages and the Arabic download; every suite passes; screenshots of the stats pages in both languages, an area page on a phone and the desktop card.

## Decision on 2026-11-22 (eightieth pass): second critique

Asked: "critique the web app, how can we make it better?", then "do it all, merge on main".
- **One Dubai figure, for real:** the map's dial and the stats page still disagreed (AED 60,000 against 68,000 with all of Dubai on screen): 56 older-district figures (Continental Club) carry no count per home type; the map weighs each by a share of its area's contracts, the pages counted each as one. The pages now use the map's rule (`site_pages.weight`), so both say AED 60,000.
- **Places to stay:** ratings to one decimal (Google sent 3.2999997), at collection (`hotel_prices.rating1`) and on the page; hostels, dorms, capsules and shared rooms left out of holiday homes (`hotel_prices.shared_bed`; five of Google's 100 rentals, which topped "Find a holiday home" and pulled Mankhool's label down); Xotelo holiday homes asked per pull raised from 50 to 80 (only 23% had a price); the key's price history folds under "Price history"; tips in Hotels and Holiday homes talk about places to stay, not the Home picker.
- **Phones:** the map starts at 540 px instead of 671: the rent check comes after the map, Home and Near share a row with the budget fold as a slim line, the dial is smaller, the slider is one line. A one-row scrolling bar of views was tried and dropped: at 320–390 px "Holiday homes" fell off screen, and every view must stay in sight.
- **Labels at city zoom:** a merged label of more than 8 areas no longer shows an average over all of them ("Al Nahda Second + 52 areas: AED 53k" told nobody anything); it shows its busiest area's own figure at that area's point, named "Area · 52 more nearby" (`labels.js` lead, `LEAD` in atlas.js). Groups of up to 8 keep the weighted average; counts still add up.
- **Other sources:** an area whose figure another source puts more than 15% away says so right under its figures, not inside "Details and sources".
- **Found while checking:** since the SerpApi key went in, `serp_stays.json` prices some hotels, so the browser check that blocks Xotelo's prices to see DET's rate got Google's prices instead and failed; it now blocks both.
- **Found after merging:** the first pull on the new code left the hostels in Google's list: a scheduled pull still on the old code had just searched, so the new one skipped its search (at most one every few hours) and kept the file. `serp_stays.py` now rebuilds its rows from the places it holds on every pull, searching or not; `holiday_homes.py` rounds every row's rating, not only new ones.
- **Checked:** Python tests for the shared-bed rule and ratings; a label test for lead groups; browser checks for the phone layout (map top, rent check after the map), no label averaging more than 8 areas, tips, ratings and the folded history in Holiday homes; every suite passes.

## Decision on 2026-11-24 (eighty-first pass): Peaks, rent as a mountain range

Asked: "let's add a new view, where prices are shown as mountain ranges similar to attached, highest prices are peaks, and lower prices are sea level… add it as a new view" (an illustration of Dubai as red and green terrain).
- **What it is:** a sixth button in the view bar, "Peaks", opening a tilted MapLibre map over the 2D one (like 3D): each area's median yearly rent for the home picked becomes height, smoothed between areas (a Gaussian of about 1.3 km), so the dearest areas rise as peaks (3,600 m at the 95th percentile and up, a picture rather than a scale), the cheapest sit at sea level, and ground far from any area fades to sea level. The street map drapes over the terrain; the ground is tinted on the price key's blues and hill-shaded. The 8 dearest busy areas (100+ contracts, spread out) are named on their peaks, the 5 cheapest busy ones (300+ contracts) get a gold ring ("good value"), as in the owner's picture; a card that would cover another waits until the view gives it room. Tapping a name returns to the map on that area. A key says what heights mean and that they are a picture of the market, not one building's price.
- **How:** no new data and no outside service: `fun.js` builds a height grid (about 330 m) from `AREAS` and draws Terrarium terrain tiles on demand through a custom MapLibre protocol (`peaks://`), used for the terrain, a `color-relief` layer and a hillshade layer (MapLibre 5.24, already on the site). The camera starts inland looking towards the sea over the dearest areas.
- **Colours:** the owner's picture runs green to red; the site's rule keeps prices on the six-step blue scale (so every price picture reads the same way), so the peaks use the blues, deep navy at the top. Switching to green to red is a one-line change if the owner prefers it.
- **Kept as a button, not a metric:** "Peaks" is not an option of `#metric` (it shows rent for the home picked, and every other part of the page keeps working on the chosen view); `syncViews` now only manages buttons with a `data-m`.
- **Checked:** a browser check opens Peaks, compares heights (Palm Jumeirah 3,600 m, Abu Hail about 120 m, open sea 0), counts the named peaks and value rings, and returns with "Back to the map", with no script errors; the chips check counts metric buttons only; screenshots on desktop and an Arabic phone (the key trimmed on phones).

## Decision on 2026-11-24 (eighty-second pass): Peaks, lighter signs and a wider view

Asked: "make the signs less obstructive, and see through for the peak view so that more can be seen for overall Dubai terrain" (screenshot: big cards covering the peaks).
- **Signs:** smaller (figure 12.5 px, name 9.5 px), see-through (58% ivory with a light blur, a thin translucent edge), a shorter stem and a smaller gold ring; a sign comes up to full strength when hovered or focused. Seven named peaks and four value rings instead of eight and five.
- **View:** the camera starts further out and a little lower (zoom 10.5, pitch 62), centred further inland, so most of Dubai's terrain shows at once; the key is a little narrower and slightly see-through.
- **Checked:** the Peaks browser check and every suite pass; screenshots on desktop and an Arabic phone.

## Decision on 2026-11-24 (eighty-third pass): see-through map labels

Asked: "the see-through signs look very well in the peak view, let's give regular signs also a 50% transparency".
- **What changed:** the price labels' card (the light tint of their key colour) is now 50% transparent with a light blur (1.5 px), so streets and outlines show behind it; the thick price frame, the dark figure and the stacked frame for groups are unchanged. A label hovered, focused or in focus (its area open) goes back to full strength. The 3D view's labels share the style.
- **Dark mode:** 72% instead of 50%: at 50% the light card over the dark map turned mid-grey and the dark figures lost contrast; 72% keeps them clear and still lets the map through.
- **Checked:** every browser check, axe's contrast checks included, passes; screenshots in light and dark mode.

## Decision on 2026-11-24 (eighty-fourth pass): the side panel floats over the map

Asked: "have the left panel also transparent slightly to let the user know there is something behind it, but not too transparent where it becomes unreadable" (screenshot of the desktop page).
- **Layout (computers, 1100 px and up):** the map now fills the window and the side panel floats over its inline-start side (left in English, right in Arabic) instead of standing beside it; phones and tablets are unchanged. The panel is 72% solid with a 2 px blur (the streets and price colours show faintly behind it, every line of text stays crisp, light and dark mode alike); its oxblood header stays 94% solid, because its gold "actually pay" lost contrast at less. A soft shadow marks the panel's edge.
- **What follows the panel:** the zoom bar, the budget slider and the slide-away tab sit at its edge; the view bar's width, "All Dubai", the dial's "areas on screen", labels (the panel counts as a control, so none sits under it), 3D and Peaks' buttons, the tour, notes and the compare picker all use the part of the map the panel leaves open (`coverX`, `viewBounds`, `framePad` in atlas.js). A shared link saves and restores the centre of that open part (`visCenter`, `setVisView`), so a friend sees the same spot. Hiding the panel now just slides it off; the map no longer resizes.
- **Found while checking:** the panel's background, the tour box and the 3D "Back" button kept their old values because panel.css and fun.css load after atlas.css (the lesson "the later stylesheet wins a tie" again); the rules now live in panel.css or carry `.mapWrap` in front.
- **Checked:** the desktop layout check now asks for a full-window map with the panel floating over it, slightly see-through; the dial and "All Dubai" checks use the open part; every browser check, axe's contrast checks included, passes; screenshots in English, Arabic, light and dark mode.

## Decision on 2026-11-24 (eighty-fifth pass): more glass

Asked: "make the left panel more transparent but still readable and bottom right rectangle also transparent but readable also" (screenshot of Peaks).
- **Side panel (computers):** 58% solid (was 72%) with a stronger blur (6 px, a touch more colour) so the map shows clearly behind it while text reads as before; the header stays 94%.
- **Floating boxes:** the map's key, the Peaks key, the budget slider on the map, the tour box and the 3D how-to line share a new see-through tint (`--glass`: 60% ivory, 64% espresso in dark mode) with an 8 px blur; the view bar's buttons stay solid.
- **Checked:** every browser check, axe's contrast checks included, passes (the layout check now accepts 50% and up); screenshots in light and dark mode and in Peaks.

## Decision on 2026-11-24 (eighty-sixth pass): buses and boats

Asked: "add Dubai bus routes and lines in addition to the metro lines and stations and stops", then "add Dubai tram also and marine transport".
- **Source:** OpenStreetMap, where the Metro and Tram come from, was tried first and is far too thin for buses: about ten real Dubai bus routes are mapped (of 180-odd), most "bus routes" there are stop areas tagged wrongly, and one ferry route. The Roads and Transport Authority's own GTFS timetable feed (open data on Dubai Pulse) has everything: 182 bus routes, 15 marine routes (abras, water buses, water taxi, ferries, including Dubai to Sharjah), the Metro and the Tram, 2,819 stops with Arabic names. Dubai Pulse answers only from the UAE, so `collector/routes.py` downloads the Mobility Database's copy of the same feed (16 MB, weekly in "Place unplaced areas"); a newer copy committed as `data/inbox/rta_gtfs.zip` wins. The mirror's copy is dated 29 Aug to 31 Dec 2025, so every card says so and the status page asks for a newer copy once it has run out.
- **What's kept:** each route's most-run shape (one direction), simplified to about 12 m and stored as an encoded polyline; the stops its most-run trips serve, both directions; routes beyond Dubai (Abu Dhabi, Al Ain, Sharjah, Hatta) marked intercity. About 350 KB, loaded only when a layer is turned on. Checked before it replaces the file: 100+ bus routes, 1,500+ stops, 5+ marine routes, nothing outside the UAE.
- **On the map (`assets/app/routes.js`):** "Bus" and "Boats" switches beside "Metro". Buses: faint lines under the prices (intercity dashed), stops from street zoom; tapping a route picks it out (bold, its stops at any zoom), tapping a stop lists its buses and each number picks its route out. Boats: dashed lines on the water with their stations always shown, each card naming the abra, water bus or ferry. Arabic stop names in Arabic. The Tram was already on the map with the Metro (OpenStreetMap, same as before).
- **Phones:** five layer switches (Metro, 3D, Bus, Boats, A+ع) are compact pills beside the zoom buttons, never over them.
- **How it was checked without Overpass or the feed reachable from the session:** a check workflow (`routes-check.yml`) ran the collector on GitHub's runners and printed what it built; the collector was merged first, the weekly job published `routes.json`, and the map was built and tested against that real file.
- **Checked:** Python tests on a stand-in feed (polyline, most-run shape, stops of both directions, Arabic names, marine kinds, the safety check); browser checks for both layers, a stop's card and route pick, a marine station's card, the phone bar at 390 px and 320 px Arabic, and the status page's new item; every suite passes; screenshots on desktop and phone.

## Decision on 2026-11-24 (eighty-seventh pass): Peaks follows the view

Asked: "does Peaks apply to apartments, holiday homes, hotels? which one?" (answer: rent only, for the home picked), then "yes make it follow the view, merge on main".
- **What changed:** Peaks now draws the view the map is on: yearly rent (the home picked), sale price or sale price per sq ft, gross yield, a hotel night or a holiday home night (`peakMetric` in fun.js; the Hotels view counts places until prices exist, so then it falls back to rent). Each area weighs as in that view (its contracts, or its places with a price), and labels use the view's own wording (AED 145k, AED 3.3M, 9.3%, AED 2,216). The key's title, the "peaks are…" line and the footnote follow; yield has no gold value rings (its peaks are already the good news). Busy areas for names and rings: 100+ contracts (300+ for rings), or 3+ places with a price (5+ for rings) for nights.
- **Switching while open:** on desktop the map's view bar stays above the mountains, and picking another view (or home) redraws them from the same spot and angle.
- **Found while checking:** the camera picked its starting spot from areas with 100+ contracts, which no area has for nights, and failed (NaN position); it now uses the same busy rule as the names, falling back to every area.
- **Checked:** a browser run through every view with Peaks open (titles, scales, labels, rings, no errors); the Peaks browser check now switches to Hotels and Yield while open; every suite passes.

## Decision on 2026-11-25 (eighty-eighth pass): Peaks shows the street map and landmarks again

Asked: "the map and dubai landmarks are not showing when its on peak view, fix it" (screenshot: blue mountains on a blank ivory ground, no streets, sea or names).
- **Cause:** Peaks set a sky with fog (`setSky`, fog-ground-blend 0.85). On a real graphics card the fog covered the whole tilted ground in the sky's ivory, so only the coloured mountains showed through. Headless Chromium (software drawing) skipped the fog, so the browser checks never saw it.
- **What changed:** no sky or fog; the price colour and hill shading go in under the roads, buildings and names (before the first transportation, building or symbol layer), so streets, motorway numbers, the sea and place names (Dubai, Dubai International Airport, Jumeirah Bay Island, Sharjah, Ajman) sit on top of the mountains; the price colour is 60% (was 82%) so the ground shows through it. `window.peaksMap()` gives tests the MapLibre map.
- **Checked:** a GPU-emulated (SwiftShader) browser run waiting for every tile: streets, sea and labels draw over and around the peaks; the colour layer sits below the roads; the terrain still rises (the Palm about 3,600 m); every suite passes.

## Decision on 2026-11-28 (eighty-ninth pass): Street, walk the streets with the prices on signs

Asked: "add a google streetmap / gta pov view of the street with the different apartment and property prices shown".
- **What:** a street-level view (street.js), opened from the map's "Street" switch or "Walk the streets here" in an area's card. You stand on a street at eye level among the raised buildings, with street names on the roads; each nearby area has a sign with its rent a year and price to buy for each home type, and a panel says which area you are in with its full figures. Walk with the arrow keys or W A S D (Shift faster), the on-screen pad, or by clicking the street; drag to look around. "See the real street on Google Street View" opens Google's photos of the same spot and heading in a new tab.
- **Why not Google's imagery inside the page:** embedding Street View needs a Google Maps Embed (or JavaScript) API key with billing, which the owner hasn't set up (open item 5a); Google Maps links need no key and were already allowed. Photos can't be copied from Google. If the owner adds the key, the panel can show the real Street View photo for the spot.
- **Why a drawn street, not a game look:** the view is our own: OpenFreeMap's buildings and roads in the site's colours, at a driving camera height; it borrows the idea of a third-person street view, not any game's art or style.
- **Prices are area figures:** there are no per-building prices in the open data, so signs and the panel show each area's medians (Ejari contracts, registered sales) and say so; thin figures are italic, as elsewhere.
- **Found while building:** at zoom 20 the base map's one-way arrows overflow MapLibre's symbol buffers (console errors); they are hidden in Street, and road numbers spaced out. Logical insets follow an element's own direction, so the overlay takes the page direction while the map canvas stays left to right, and the pad is placed with physical sides.
- **After merging:** the 320 px Arabic check failed on main: the layer bar ran over the zoom column ("All of Dubai", "Near me" are wider in Arabic) and cut off its last switches. Street moved to the view bar after Peaks (a chip on phones), and on phones the layer bar now takes the room actually left beside the zoom column and scrolls. The overlap was older than Street: the check had measured before the 3D switch arrived; it now waits for it.
- **Checked:** a GPU-emulated browser in Dubai Marina, JVC, Business Bay and the Palm (light, dark, Arabic, 344 px phone); the browser check opens Street from a card, checks eye level, the panel, the signs, the Google link and the pad's labels, walks with the arrow keys and returns with Escape; every suite passes.

## Decision on 2026-11-29 (ninetieth pass): Google Street View photos inside the page

Asked: "how do i get google embed", then the owner made a Maps Embed API key (restricted to the site, Maps Embed API only) and added it as the repository secret `GOOGLE_MAPS_EMBED_KEY`.
- **What:** an area's card has "Street View photo" (folded; Google's frame for the area's point loads when opened), and Street shows "The real street (Google Street View)" for where you stand and the way you face, reloading as you walk (after 60 m or a 45° turn).
- **The key:** never in the repo. `assets/app/keys.js` holds a placeholder that the deploy replaces with the secret; local runs and tests keep the placeholder, so the photos stay off and the outside links remain. An Embed key is visible in the page by design; Google's website restriction is what protects it.
- **Referrer:** the key allows `https://jamalxcode.github.io/dubai_map/*`, but browsers send only the host to other sites by default, which the restriction would refuse; the frames ask for the full address (`no-referrer-when-downgrade`). The page test that bans referrer policies (OpenStreetMap needs the Referer) now allows only that one.
- **Cost:** Google lists the Maps Embed API at no charge; the owner can set a small budget alert in Google Cloud.
- **Checked:** the browser check uses a stand-in key and a stand-in Google page: the card's frame and Street's frame carry the key, the spot and the heading, and send the full address; every suite passes; after deploy, the live keys.js carries a key (checked without printing it).

## Decision on 2026-11-29 (ninety-first pass): Google Street View as Street's main view

Asked (with a screenshot of the photo in its side box): "i need the actual view to be a street view, not a side window, can we do that?" Offered: (A) Google's free embedded photo full screen, moved by our pad with a reload each step and blind to Google's own arrows, or (B) Google's Maps JavaScript panorama, which tells the page where you are and which way you face. The owner chose B.
- **What:** Street opens on Google's real panorama; you walk with Google's arrows. The price signs are drawn over the photo in each area's direction and turn with you; "You are in" changes as you walk into another area. The drawn street stays underneath, kept at the same spot, as the fallback and behind a "Drawn street" switch.
- **Cost:** Google counts one Dynamic Street View load each time Street starts on Google (5,000 a month free as listed on 29 Nov, then $14 per 1,000); walking inside it is free. The owner sets a daily cap in Google Cloud so a busy day can't run up a bill; past the cap Google refuses and the drawn street takes over.
- **Key:** the same key; the owner adds "Maps JavaScript API" to its allowed APIs. Until then Google calls `gm_authFailure` and the drawn street shows with a note. The script's own requests send only the site's host, so the key's website list also needs `https://jamalxcode.github.io/*`.
- **Checked:** a stand-in Google API in the browser check: the panorama fills the view, signs change as you turn, "You are in" follows a move to another area, a refusal hands over to the drawn street at the same spot, Escape returns; with Google unreachable the drawn street works as before; every suite passes.

## Decision on 2026-11-29 (ninety-second pass): Street, go to where a home type rents

Asked (with a screenshot of Street on Google in Downtown): "now i want to select for example the 2 bedroom, and get taken there via street view, can we do that?"
- **What there is to go to:** the open data has no prices or places per building and home type (Dubai Data's project list has real points for about 100 buildings, with sale prices for all homes together), so "there" is an area: tapping 2-bedroom lists the nearby areas where 2-bedroom apartments rent, with their figures, and picking one takes Street View there. Price signs take you to their area too.
- **One control per job:** tapping a home type sets the map's Home picker, so the map, the signs and the list all follow it.
- **Cost:** moving Google's panorama to another place reuses it, so no new load is counted.
- **Checked:** the stand-in Google API: tapping 2-bedroom sets Home, lists 8 nearby areas with rent, price to buy and distance, and going to the last moves the panorama and "You are in" there; every suite passes.

## Decision on 2026-11-29 (ninety-third pass): the API process written down

Asked: "save to repo convo, decisions and lessons learned and also api process".
- **What:** `docs/API_KEYS.md`: every outside service (Google Maps Embed and JavaScript APIs, SerpApi, Dubai Pulse, the cron-job.org token, the booking partner, the services without keys), its key's secret name, cost and status; the general process (get, restrict, add as a secret, say "added", check the log, fallback and cap); the Google steps exactly as the owner did them, the cost cap, and a symptom-to-fix table. Linked from the README's paper trail and owner's checklist, and from CLAUDE.md.
- **Lessons:** check the data's grain before "take me there"; write each key's process down while it is being set up.

## Decision on 2026-11-29 (ninety-fourth pass): Street tries Google again, and says why it couldn't

Asked (screenshot of the drawn street in International City, no switch, no note): "street view is not showing, it was showing before".
- **Found:** the deploys still wrote the key ("Street View photos on"). Street remembered a refusal from Google (`gm_authFailure`) for the rest of the visit: every later opening skipped Google, hid the switch and said nothing, which is what the screenshot shows.
- **What changed:** every opening of Street tries Google again; a refusal shows "Google refused the key; showing the drawn street." with Google's own reason code (read from its console message, e.g. RefererNotAllowedMapError, OverQuotaMapError), and the switch offers "Try Google again". The refusal and its code are counted (feature counts only), so it shows in GoatCounter.
- **Docs:** `docs/API_KEYS.md` lists each of Google's codes with its fix.
- **Checked:** the stand-in Google API: a refusal names its code and offers the retry, reopening Street starts Google again; every suite passes.

## Change log

- 2026-11-18: Night prices: a booking partner's widget in hotel cards (loads when tapped) and DET's official rate on the night dial; "1 place to stay".

- 2026-11-18: The header's figure is a price dial: median of what's on screen, lowest and highest area at the ends, following the view.

- 2026-11-18: Hotel prices off by the owner's choice (LiteAPI's live key needs a payment card); not asked for on the status page; wording points to booking sites.

- 2026-11-18: Hotels: only places inside Dubai and taking guests (975 → 798); the top figure says it counts places until prices exist.

- 2026-11-18: One calm system for the side panel; the comparison as a mirrored "versus" sheet with motion.
- 2026-11-18: Compare two areas side by side, over the map, in the theme's colours.
- 2026-11-18: Metro and Tram lines and stations, Near Metro / Tram filter, rent near each station.
- 2026-11-18: Status page opens with "Needs you": unresolved issues a person can fix, with what to do.
- 2026-11-18: OpenStreetMap look-up also searches ordinals as numbers ("Al Twar 5"); retried at once for a new name.
- 2026-11-18: Budget mode: the yearly rent range lights up the areas that fit on the map.
- 2026-11-18: Map edge tab: hide the side panel on computers, full-screen map on phones.
- 2026-11-18: Tap an area to zoom to its outline, darken the rest of the map and open its breakdown.
- 2026-11-17: Data status page at status/: totals, the last pull per source, in use, left out, waiting, recent pulls, open alerts.

- 2026-11-17: Industrial zones flagged and left out of comparisons; Continental Club backup when Dubai Data is stuck; older districts' history; alerts as GitHub issues; run log; column checks.

- 2026-11-17: README rewritten: shorter, current (home picker, map links, Near me, rent history, house rules), owner's checklist folded.

- 2026-11-17: Rent history snapshots, unconfirmed-jump marks, sources-differ notes, changes.json and run summaries, a guard for late timer runs, one retry for failed live pages, publication times logged.

- 2026-11-17: Added DATA_PIPELINE.md, how the data is pulled, organised, stored and published.

- 2026-11-17: Breakdowns never taller than the clear space on the map; re-fit after photos load.

- 2026-11-17: Fourth interface critique: Near me fits, the check uses the map's Home picker, compact tablet header, plainer freshness line, folded findings on phones, and feature-use counts.

- 2026-11-17: Third interface critique: no labels under buttons, single ellipsis, aligned figures, title-case names, grouped and sortable table, mixed-sizes note, map links, Near me, sources split.

- 2026-11-17: Second interface critique: one home choice for the check and the map, breakdown leads with the picked home, a shorter check result, a phone-sized table, sources once, a freshness line, a rent-range field, folding map credits on phones, labels kept inside the map.

- 2026-11-17: Interface critique: one control per job (Home picker, one map bar, names follow the page, table finder), price badges, "typical", one-decimal yields, a shorter phone header, softer dark labels, a folding legend with step values, All Dubai in the zoom bar.

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
