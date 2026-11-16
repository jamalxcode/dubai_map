# Dubai Rent Atlas: design notes, goals and decision log

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

## Prioritized next work

**Status on 2026-11-16:** P0 is done (Dubai Data fallback, live Pages deploy, data checks and fixtures). P1 is built and tested; the daily feed waits for the Dubai Pulse key (DLD's own service is off until DLD agrees in writing). P2 item 6 is partly done: every area sits at a point inside its official Dubai Municipality community; shaded outlines are next. P3 item 10 is partly done (tests, phone layout, accessibility checks); the front-end split (`index.html` into script, styles and a testable module, self-hosted libraries, faster label merging) is still open.

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

## Change log

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
