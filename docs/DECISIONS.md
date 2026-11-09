# Dubai Rent Atlas: design notes, goals and decision log

**Last updated:** 2026-11-09  
**Repository:** `jamalxcode/dubai_rent`  
**Planned public site:** https://jamalxcode.github.io/dubai_rent/

## The idea

Create a practical, visual rental-market intelligence tool showing **real annual rents registered with the Dubai Land Department (Ejari / RERA)** over a map of Dubai. A user can see what tenants actually pay, not just what agents advertise. Start with a lightweight browser map and eventually automate permitted daily updates. Also make the records exportable to a spreadsheet.

The initial use case is monitoring International City, JVC and other relevant Dubai communities, with the option to compare a private portfolio later. The public map and private owner records must remain distinct.

## Original questions and decisions

1. **API or whole CSV?** DLD offers a public Rents download and a formal API gateway. An undocumented data endpoint is not sufficient evidence of a licensed automation right. Ship a CSV importer first, design a feed adapter for a future authorized source.
2. **Daily updates without upsetting RERA?** Aim for once per day at low volume, only where authorized. Don't bypass CAPTCHA or assume a daily query is automatically permitted. Use cached incremental ingestion, overlapping periods to capture corrections, rate limits and a documented agreement before unattended automation.
3. **Which emirates?** DLD/Ejari transactions cover **Dubai only**. Other UAE emirates have separate authorities and are out of scope for V1.
4. **Annual rent and address?** Yes, `Annual Amount` and broad area/project fields; **no guaranteed per-unit street address, GPS or verified building location**. Do not imply exact addresses.
5. **Map overlay?** Use OpenStreetMap/Leaflet; aggregate transaction values by community for accurate high-level presentation; verified GIS polygons are a longer-term goal.
6. **Source control and hosting?** Keep code, README and design rationale in `dubai_rent`; prepare GitHub Pages deployment and provide the expected Pages URL, explicitly marking it unverified until deployment succeeds.

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

## Prioritized next work

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

- 2026-11-09: Built initial map and stored first README/decisions.
- 2026-11-09: Added GitHub Pages Actions workflow. Activation and deployment not verified.
- 2026-11-09: Expanded design specification and README to capture full scope, roadmap, access/legal constraints, geography confidence and accurate implementation status.
