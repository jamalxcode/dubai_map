# Product notes and decisions

Date: 2026-11-09

## User request and conversation context

Goal: obtain the latest **actual registered Dubai rental contracts** from the Dubai Land Department (RERA/Ejari), analyze annual AED rental amounts in spreadsheet form, and overlay the transactions onto an interactive Dubai map. Store code, implementation notes, comments and README in repository `dubai_rent`.

Questions asked during planning:
1. Is there an API, or must the whole CSV be downloaded?
2. Can data be refreshed daily without DLD/RERA objections?
3. Which emirates are covered?
4. Does each transaction contain annual rent and an address?
5. Build the interactive rental map in GitHub.

## Verified facts and boundaries

- The **DLD Real Estate Data / Rents** public webpage exposes `Annual Amount`, `Contract Amount`, `Registration Date`, `Area`, `Project`, `Master Project`, `Number of Rooms` and `Property Size (sq.m)`.
- Published rentals cover the **Emirate of Dubai**, not all UAE emirates.
- The public rent table does not provide transaction-specific street address, verified building coordinate or tenant identity.
- Public DLD portal uses CAPTCHA for querying. We cannot assume undocumented calls are authorized for automated daily access.
- Formal DLD API Gateway exists, but suitability, eligibility and fees for the particular transaction feed must be checked directly with DLD.
- Default map displays community-scale approximations; never imply precise rental address.
- Do not invent sample rents in the live interface.

## Implemented MVP

- Single-file `index.html` with Leaflet and OSM tiles.
- Responsive dark layout.
- Local CSV import, basic header normalization, robust quoted CSV parser.
- Filter controls: community/project search, area, rooms, min/max rent, registration date.
- Aggregate median and count per community, plus point-display mode.
- Tabular view, export complete filtered CSV, unmatched-geography counts.
- Optional CORS-enabled licensed JSON/CSV feed; saved URL and opt-in fetch on page opening every >=24 h.

## Important limitations

- No live DLD API connected and no data harvested.
- No back-end, unattended job, GitHub Actions scheduler or access-token storage.
- Browser data is transient; re-import after reload unless licensed feed configured.
- Geographic coordinate catalog is a small manually curated approximation and not official geospatial data.
- Filtering is all in-memory; very large CSV datasets may be slow.
- Date normalization assumes day-first for slash/dash day/month/year dates; API ISO dates accepted.
- No geocoding service integration or official RERA Rental Index values (this displays registrations, not official permitted-increase calculations).
- Repo is public: private owner rent ledger should remain separate.

## Recommended next milestones

1. Test importer using an actual authorized DLD rents CSV and reconcile schema.
2. Obtain explicit authorization and documented transaction endpoint or accepted export process.
3. Add an authenticated back-end collector with daily scheduled updates, incremental windows, backoff, cache and immutable audit records.
4. Acquire licensed community polygon data and add project-level geocoding with source/confidence fields.
5. Add robust unit-type comparisons: annual AED/sq.m, median per bedroom type, new vs renewal only where a verifiable version mapping exists.
6. Add multi-year history, rent distribution, legend filters, weighted clustering.
7. Create separate secure owner portfolio overlay, not committed to public GitHub.
8. Add tests using synthetically generated fixture data clearly labeled as test data.

## Public source links

- https://dubailand.gov.ae/en/open-data/real-estate-data/
- https://dubailand.gov.ae/en/eservices/api-gateway/
- https://www.openstreetmap.org/copyright

## Change log

- 2026-11-09: Initial interactive DLD rental map MVP; explicit transparency about missing live feed and map precision.
