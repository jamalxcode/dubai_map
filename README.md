# Dubai Rent Atlas

Interactive Dubai rental map using **actual Dubai Land Department (DLD / Ejari) registered rental transactions**, not advertised asking rents.

**Expected site URL after Pages deployment:** https://jamalxcode.github.io/dubai_rent/  
**Repository:** https://github.com/jamalxcode/dubai_rent

## Status (9 November 2026)

- **Built:** static responsive Leaflet/OpenStreetMap map, browser CSV importer, annual-rent filters, community bubbles, illustrative-position individual markers, median statistics, transaction table and filtered CSV export.
- **Built:** optional authorized CORS HTTPS CSV/JSON feed with opt-in refresh on the next page opening after 24 hours.
- **Committed:** GitHub Actions Pages deployment workflow.
- **Not confirmed:** GitHub Pages enabled or deployment successful.
- **Not implemented:** live DLD API integration, truly unattended daily refresh, official GIS polygons, building-level locations, and an owner portfolio overlay.
- **No real rental transactions are bundled.** The app starts empty by design.

## Vision

Make an intuitive map to discover **how much people actually pay annually to rent across Dubai**. Show recent Ejari registrations and renewal patterns, compare neighborhoods and property types, and export data to spreadsheets. Prioritize registered amounts, provenance, transparency, historical comparisons and useful portfolio benchmarks. Scope is **Dubai Emirate only**.

See [full design notes and decision log](docs/DECISIONS.md).

## Launch

**Online:** Once Pages is enabled, use https://jamalxcode.github.io/dubai_rent/.

**Configure Pages:** Visit [Pages settings](https://github.com/jamalxcode/dubai_rent/settings/pages) and choose **GitHub Actions** under Build and deployment. Check [Actions](https://github.com/jamalxcode/dubai_rent/actions) for successful deployment.

**Local:**
```sh
git clone https://github.com/jamalxcode/dubai_rent.git
cd dubai_rent
python3 -m http.server 8080
```
Open http://localhost:8080. An internet connection is required for Leaflet CDN and OpenStreetMap tiles.

## Getting real registered rent data

1. Visit [DLD Real Estate Data](https://dubailand.gov.ae/en/open-data/real-estate-data/), choose **Rents** and select the date range.
2. Follow the portal's access requirements, including CAPTCHA when shown, and export a CSV.
3. On the website, import the file using **DLD rental CSV**.
4. Filter by area, project, bedroom count, annual AED amount and registration date. View community bubbles or transaction markers; export your filtered selection.

The public DLD rental data includes **Annual Amount** (AED/year), Contract Amount, registration/start/end dates, Area, Project/Master Project, property size and room count, subject to availability. Annual Amount should not be confused with total Contract Amount. No tenant names, unit numbers or precise transaction address are promised.

## Geography: important accuracy warning

Public transaction rows generally lack authoritative per-contract GPS coordinates or unit addresses. The MVP uses a small hand-curated dictionary of **approximate community centers**. Individual-marker mode spreads markers near those centers solely to make multiple records visible: **these marker positions are not rental-property locations**. Unmatched locations stay in the table but are not mapped. Future enhancements should use permitted and verified community polygons and verified building locations with a displayed location-confidence level.

## Refresh strategy

**Today:** Manual CSV and optional feed. The browser can fetch a CORS-enabled, authorized HTTPS CSV/JSON source. Opt-in auto-refresh runs only when a user next opens the page and at least 24 hours have passed since the previous successful fetch. This is **not** a background scheduler.

**Planned:** First verify DLD authorization, contract-feed availability, API terms and licence. Then implement a separate secure scheduled collector, once daily, with limited incremental date windows, overlap for late registrations/corrections, deduplication, retries/backoff, logging, freshness indicators and approved sanitized hosting. Never bypass CAPTCHA or access controls or assume undocumented endpoints are licensed.

## Roadmap

1. Validate importer against real DLD CSV, update field mapping and add tests.
2. Confirm licensed API or allowed automated export method.
3. Implement reliable daily ingestion, cache, corrections and audit trail.
4. Introduce verified GIS community polygons and provenance-aware location matching.
5. Add AED/m², medians by area, rooms/property type, time series, validated new/renewal separation and heat-map legend.
6. Add secure, separate comparison with owner's Dubai properties without publishing private contracts.
7. Optimize large datasets and add data-quality statistics and mobile usability improvements.

## Files

- `index.html`: map application.
- `.github/workflows/pages.yml`: Pages deployment.
- `docs/DECISIONS.md`: full design rationale, requirements, limitations and milestone plan.
- `README.md`: this overview.

## Privacy, licence and attribution

This is an independent tool, **not** an official RERA/DLD service. Repository is currently **public**. Do not commit credentials, tenant details, private owner rental contracts or restricted DLD data. Respect DLD terms, allowed distribution and rate limits. Tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright); mapping via [Leaflet](https://leafletjs.com/).

Official sources: [DLD real-estate data](https://dubailand.gov.ae/en/open-data/real-estate-data/) and [DLD API Gateway](https://dubailand.gov.ae/en/eservices/api-gateway/).
