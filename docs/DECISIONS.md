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

## Prioritized next work

**Status on 2026-11-10:** P0 items 1–3 are done via the Dubai Data fallback and a live Pages deploy. P1 is built and waiting for the Dubai Pulse key. Next up: P2 item 6 (community polygons).

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

- 2026-11-15: Cross-source de-duplication, week-based coverage check, stricter homes rule, no-shrink guard.

- 2026-11-15: DLD open data as main daily source with backups; mobile-first redesign; stale-data warning; tests.

- 2026-11-10: Text rent labels with overlap-free merging into average labels; "Average rent in view" stat; added DESIGN_GOALS.md and CONVERSATION.md.
- 2026-11-09: All 102 Dubai Data communities placed (11 via manual OSM geocoding job).
- 2026-11-09: Dubai Data (CC BY 4.0) community medians as fallback source; real rents live.

- 2026-11-09: Renamed docs to `dubai_map`; added daily Ejari collector, aggregate builder, inbox import, rebuilt map page around precomputed data; fixed Leaflet CSS integrity hash; Pages enabled.

- 2026-11-09: Built initial map and stored first README/decisions.
- 2026-11-09: Added GitHub Pages Actions workflow. Activation and deployment not verified.
- 2026-11-09: Expanded design specification and README to capture full scope, roadmap, access/legal constraints, geography confidence and accurate implementation status.
