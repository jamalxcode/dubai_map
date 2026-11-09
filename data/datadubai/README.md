---
license: cc-by-4.0
language:
- en
pretty_name: Dubai Real Estate — DLD open data, cleaned and aggregated
tags:
- real-estate
- dubai
- uae
- property-prices
- rental-yield
- housing
- open-data
size_categories:
- 10K<n<100K
configs:
- config_name: market_monthly
  data_files: data/market_monthly.csv
- config_name: market_yearly
  data_files: data/market_yearly.csv
- config_name: market_bedrooms
  data_files: data/market_bedrooms.csv
- config_name: communities
  data_files: data/communities.csv
- config_name: community_monthly
  data_files: data/community_monthly.csv
- config_name: community_yearly
  data_files: data/community_yearly.csv
- config_name: community_bedrooms
  data_files: data/community_bedrooms.csv
- config_name: rents_by_community
  data_files: data/rents_by_community.csv
- config_name: yields_by_community
  data_files: data/yields_by_community.csv
- config_name: areas
  data_files: data/areas.csv
- config_name: developers
  data_files: data/developers.csv
- config_name: projects
  data_files: data/projects.csv
---

# Dubai Real Estate — DLD open data, cleaned and aggregated

Registered property sales, rent contracts and the project registry of the
**Dubai Land Department (DLD)**, cleaned and aggregated by
[Dubai Data](https://datadubai.ae) — the same numbers that are published on the portal,
exported from its nightly build.

- **Data through:** 2026-10-29 (DLD publishes with a lag of a few working days)
- **Updated:** weekly from the portal's nightly build
- **Methodology:** https://datadubai.ae/methodology/ — outlier trimming, minimum samples, how yields are computed
- **Sources and row counts:** https://datadubai.ae/sources/
- **Every row links back** to its page on the portal (`url` column) with charts, context and the latest figures.
- **Mirrors:** [Hugging Face](https://huggingface.co/datasets/datadubai/dubai-real-estate-dld) ·
  [GitHub](https://github.com/datadubai/dubai-real-estate-dld) — identical files.

## Files

| File | Rows | What it holds |
|---|---:|---|
| `data/market_monthly.csv` | 120 | Dubai-wide monthly medians: price per sqft (median, q1, q3), median price, number of registered sales. Built homes, outliers trimmed per the methodology. |
| `data/market_yearly.csv` | 17 | Dubai-wide yearly totals since 2010: sales count, median price, median price per sqft, total registered value (AED). |
| `data/market_bedrooms.csv` | 6 | Last 12 complete months by bedroom count: median price, price per sqft, size, annual rent and gross yield. |
| `data/communities.csv` | 111 | 113 master communities, last 12 complete months: sales, median price and price per sqft, year-on-year change, off-plan share, data quality flag. |
| `data/community_monthly.csv` | 5,722 | Monthly price-per-sqft medians and IQR for every community (5 years). |
| `data/community_yearly.csv` | 1,403 | Yearly sales and medians for every community since 2010. |
| `data/community_bedrooms.csv` | 418 | Community × bedroom count: median price, price per sqft, annual rent, gross yield. |
| `data/rents_by_community.csv` | 102 | Ejari rent contracts, last 12 months: contracts and median annual rent (AED) per community. |
| `data/yields_by_community.csv` | 75 | Gross rental yield per community, computed inside property-class × bedroom segments (never as the ratio of two community-wide medians). |
| `data/areas.csv` | 97 | DLD land-registry areas: sales, medians, off-plan share. |
| `data/developers.csv` | 367 | Developers active in the DLD project registry: projects, units, sales, medians. Company records only — no contact details. |
| `data/projects.csv` | 770 | Registered projects: developer, status, construction completion %, completion date, units, escrow bank, and sales medians. Coordinates only where the registry has a real point. |

## Notes on the numbers

- Medians, not averages; price per sqft uses built homes only; outliers outside P1–P99 are removed.
- A figure is published only when the sample is large enough; `quality` marks thin samples.
- Gross yield = median annual rent / median price **within the same property class and bedroom count**,
  then the median across segments for a place — dividing two place-wide medians would mix villas with studios.
- Sales data: DLD transactions (2010 →). Rents: Ejari contracts (2023 →). Projects: DLD project registry.

## License and attribution

Aggregates are released under **CC BY 4.0**. Please cite:

> Dubai Data (datadubai.ae), Continental Club Property — based on Dubai Land Department open data, data through 2026-10-29.

Source data © Dubai Land Department, published as open data. This dataset is not an official DLD product.
