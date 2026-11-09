# Dubai Rent Atlas

An interactive, browser-based Dubai rental intelligence map based on **actual registered DLD / Ejari rental transaction data**, not advertised listing prices.

## Current state (2026-11-09)

**MVP implemented.** Static browser application with Leaflet, OpenStreetMap, CSV import, filters, map visualization, table, and filtered CSV export. **No real transactions are bundled**. No live API has been authorized or connected. No unattended server-side daily refresh is configured.

## Launch

1. Open `index.html` in a modern browser. Internet access is needed for Leaflet and OpenStreetMap tiles.
2. Go to the [official DLD real-estate data portal](https://dubailand.gov.ae/en/open-data/real-estate-data/) and select **Rents**.
3. Choose registration dates, complete the site's required CAPTCHA, then download **CSV**.
4. Use **DLD rental CSV** in the left pane. Filter by area, rent, bedroom count and registration date.
5. Switch between community bubble and individual marker displays. Export filtered CSV when needed.

To serve locally:

```sh
python3 -m http.server 8080
```

Open http://localhost:8080.

## Data schema

The portal currently publishes the following rental headers:

`Registration Date`, `Start Date`, `End Date`, `Version`, `Area`, `Contract Amount`, `Annual Amount`, `Is Free Hold?`, `Property Size (sq.m)`, `Property Type`, `Property Sub Type`, `Number of Rooms`, `Usage`, `Nearest Metro`, `Nearest Mall`, `Nearest Landmark`, `Parking`, `No of Units`, `Master Project`, `Project`.

The importer is tolerant of selected normalized API-style field names. It requires a non-empty Area and positive Annual Amount. It parses quoted CSV cells, escaped quotes and line breaks. For alternate column names, update the `normalize()` mapping in `index.html`.

## Geographic precision

**The public rental feed does not contain verified individual contract street addresses or lat/lon.** The included `LOCATIONS` dictionary contains a limited set of approximate community centers for visualization, not authoritative DLD GIS boundaries or building coordinates. A record without a match remains in the table and is included in summary statistics, but not plotted. Individual point mode spreads multiple markers for visual legibility: **those positions are artificial and must never be interpreted as rental unit coordinates**.

Suggested production upgrade: obtain licensed official community polygon boundaries, normalize DLD community codes/names, and render choropleth aggregations with confidence labels. Only add building coordinates after matching verified reference data.

## Data feeds and daily updates

The optional **Authorized feed** input accepts a CORS-accessible HTTPS endpoint serving an array of JSON records, `{records: [...]}`, `{data: [...]}`, or a DLD-shaped CSV. This is **not** a direct integration with the DLD site. A browser can fetch it manually; the opt-in refresh-on-open runs only when the page opens and the previous successful fetch was at least 24 hours ago. It does **not** perform an unattended daily fetch while the browser is closed.

**Do not automate CAPTCHA or access-control bypass.** Confirm API terms/licensing with DLD before scheduling a data harvester. For truly unattended daily updates, add a separate licensed collector and publish sanitized permitted records to an HTTPS feed. Cache, track freshness, deduplicate, retain correction history, and observe rate limits.

## Security and privacy

- Never put DLD API tokens, usernames, private contracts, or sensitive tenant data in the public GitHub repository.
- This repository is currently **public**. Import is browser-local; records are not uploaded by this application.
- Only save the optional feed URL and refresh settings in local browser storage.
- A commercial or government feed may require authenticated server-side proxy; do not embed credentials in client JavaScript.
- Map tiles and Leaflet code load from third parties. Review their terms and privacy implications before public deployment.

## Design notes

See [docs/DECISIONS.md](docs/DECISIONS.md) for user requirements, sources, trade-offs and roadmap.

## Sources

- [DLD Real Estate Data](https://dubailand.gov.ae/en/open-data/real-estate-data/)
- [DLD API Gateway](https://dubailand.gov.ae/en/eservices/api-gateway/)
- [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)
- [Leaflet](https://leafletjs.com/)

This independent visualization is **not** an official DLD or RERA service.
