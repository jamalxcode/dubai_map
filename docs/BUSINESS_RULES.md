# Dubai Rent Atlas: business rules

**Last updated:** 2026-11-16 (Kuwait time)

Every rule the site and its jobs follow, with the value in force and the file that applies it.
Keep this file in step with the code: a change to a threshold here needs the same change there,
and the reverse. The reasons behind the rules are in [DECISIONS.md](DECISIONS.md); the goals
they serve are in [DESIGN_GOALS.md](DESIGN_GOALS.md).

## 1. What counts as a rent

| Rule | Value | Where |
|---|---|---|
| Figure shown | Yearly rent in AED from registered Ejari contracts. Never the total contract amount, never asking prices, never the RERA index | `collector/store.py`, page text |
| Homes (default view) | Flats (flat, penthouse, apartment), studios, villas (villa, townhouse, Arabian house…) with residential usage | `collector/kinds.py` |
| Left out of Homes | Shops, offices, warehouses (Commercial); labour camps, staff accommodation, whole buildings, land (only under Everything) | `collector/kinds.py` |
| Bulk leases | A row above AED 10,000 per m² a year is a whole-building lease spread over units: never counted as a home | `kinds.BULK_AED_PER_SQM` |
| Duplicates | One contract counted once, even when it arrives from several sources (fingerprint of its fields) | `collector/store.py` |
| Median | The middle contract (half pay more, half less). Ranges (middle half: 25th to 75th percentile) only from contract-level data | `collector/build.py` |
| "Typical" | Where only per-bedroom medians exist (Dubai Data flats), the contract-weighted average of those medians, labelled "typical", not "median" | `build.aggregate_type` |
| Older districts | Continental Club Property gives a median per unit size and one contract total per area, but no count per unit size. These areas have no all-homes median | `collector/ccp_areas.py` |

## 2. Which data is published

| Rule | Value | Where |
|---|---|---|
| Source order | Dubai Pulse API (needs a key) → DLD open-data service (off until DLD agrees in writing) → Dubai Data community medians (CC BY 4.0) + Continental Club Property for the older districts (CC BY 4.0) | `collector/fetch_*.py`, `build.py` |
| Switch to our own contracts | At least 1,000 home contracts in the last 12 months **and** contracts in at least 43 of the last 52 weeks; otherwise community medians | `build.MIN_OWN_CONTRACTS`, `MIN_HISTORY_WEEKS` |
| Never shrink | A build more than 30% smaller than the last (contracts or areas, same mode) is not published; the previous files stay live and the run fails. `ALLOW_SHRINK=1` overrides when the drop is real | `output.MAX_DROP` |
| No empty commits | Data is saved only when a file the page loads changed; a timestamp alone is not a change | `output.same_data`, `scripts/data-branch.sh` |
| Where data lives | Generated data on the `data` branch; `main` holds code and hand-kept inputs | `scripts/data-branch.sh` |
| Table size | Contract mode: newest 30 days, at most 8,000 home rows (plus a third as many others) | `build.LATEST_DAYS`, `LATEST_CAP` |

## 3. Being a polite client

| Rule | Value | Where |
|---|---|---|
| Pull times | 05:17, 13:17, 21:17 Kuwait, started by cron-job.org, with GitHub's schedule as a backup | `.github/workflows/daily-ejari.yml` |
| Gap between pulls | At least 6 hours per source; an earlier start does nothing | `state.MIN_HOURS` |
| Heavier extras | Cross-check pages at most once every 24 hours; the Dubai Pulse refresh slice once a day | `fetch_crosscheck.MIN_HOURS`, `fetch_ejari.py` |
| Retries | Only on 429 and 5xx; at most 3 tries; waits honour Retry-After, capped; then stop until the next pull | `collector/net.py` |
| Identity | One honest User-Agent naming this repo. No CAPTCHA workarounds, no listing portals, no identity rotation, no VPN | `collector/net.py` |
| Dubai Pulse paging | 500 rows a page, 4 s apart, at most 120 pages; stops at the reported total or a repeated page | `fetch_ejari.py` |
| Dubai Data | Conditional requests (unchanged files cost nothing), 1 s between pages; fewer than 50 communities means the source is broken | `fetch_datadubai.py` |
| OpenStreetMap | At most 1 request a second, at most 10 look-ups per daily pull (40 weekly), results cached; a failed look-up is retried after 7 days | `collector/geocode_missing.py` |
| Base map | Vector tiles from OpenFreeMap (free, no key, attribution shown), loaded after the page; fallback when there is no WebGL or the style can't load within 12 s: OpenStreetMap's tiles at their policy URL with visible attribution, no bulk or offline use | `assets/app/atlas.js` |

## 4. Placing areas on the map

First match wins:

1. Hand-checked points (`data/area_locations.csv`).
2. Dubai Data's DLD-area → community table at hand-checked points (`data/community_locations.csv`).
2b. A Dubai Data community with no point of its own and at least 90% of its contracts in one DLD area (Dubai Data's `top_area`, `share_in_top_area`): that area's official point (`build.top_area_point`). E.g. Al Waha Villas → Wadi Al Safa 7.
3. Dubai Municipality communities: one point guaranteed inside each official boundary (`data/dm_communities.csv`), with reviewed DLD spellings (`data/dld_dm_aliases.csv`).
4. OpenStreetMap, accepted only when the result is inside Dubai, is a place (suburb, neighbourhood, residential…, never a shop or road) and its name (or its English name in OpenStreetMap, asked for in English) matches at 0.75 or better, ignoring "Al", "Dubai", "Villas", "Community", "Area" and ordinal words (`data/osm_area_points.csv`).

A point is a reference for the area, never a building; the page says so. Coordinates are never guessed by hand without a source. An area with 1,000 or more contracts that stays unplaced fails the freshness check.

## 5. The map

| Rule | Value | Where |
|---|---|---|
| Starting view | 1-bedroom apartments, the one measure every area has | `atlas.js fillUnits` |
| "All units" | Only areas with an all-homes median; per-unit-only areas (older districts) appear once a unit is picked | `atlas.js areaValue` |
| Merging | Labels that would overlap merge into one, showing the contract-weighted average (the total for counts) at the weighted centre; the busiest merge first | `assets/app/labels.js` |
| Splitting | A merged label of up to 3 areas comes apart when each label fits at its own point or just beside it (a thin line joins a moved label to its point) | `labels.js MAX_SPLIT` |
| Controls | Labels step out from under the zoom buttons and legend | `labels.js` |
| Group names | 2–3 areas: the busiest area's name plus "+N"; more: "N areas" | `atlas.js groupName` |
| Never overlap | No two labels overlap at any zoom (browser-checked at the start, zoom 13 and zoom 14) | `tests/ui-check.mjs` |
| Rent dial and shading | Fill = rent ÷ the top of the key (the 95th percentile of what is shown; the rent check uses the 95th percentile for the home type checked); dearer areas show a full dial | `atlas.js share`, `priceKey` |
| Colour bands | Six blues (palest → deep navy, low → high) in equal steps between the 5th and 95th percentile of what is shown, so extreme areas don't stretch the key; below the 5th percentile: the palest, above the 95th: the deepest. Legend ends read "≤" and "≥" | `atlas.js scaleFor` |
| Base map names | English: `name:en`, else `name_en`, else Latin, else the local name. Arabic: `name:ar`, else the local name. Both: the map style's own (Latin and local script). Starts in the page's language; the visitor's choice is remembered (`mapLang`). Road numbers are left alone | `atlas.js NAME_FIELD` |
| Rent check moves the map | Wide screens (1,100 px and up): fly to the area at zoom 14 and open its breakdown. Not on narrower screens, not for a resumed check | `companion.js` |

## 6. The rent check

| Rule | Value | Where |
|---|---|---|
| Finding the area | Exact name, nickname (JVC, JLT…), official DLD name, or a close spelling; several matches are offered to choose from | `insights.js searchAreas` |
| Default home | The area's most common unit; "All homes" only where an all-homes median exists | `companion.js fillUnits` |
| Verdict | Within ±5% of the median reads "about the same"; otherwise "N% above/below" with the yearly difference | `insights.verdict` |
| Quarter | With a range: below the 25th percentile "cheapest quarter", above the 75th "dearest quarter", else "middle half". Without one, the page says no range is published yet | `companion.js render` |
| Same home for less nearby | Same unit, within 12 km, at least 3% cheaper, at least 30 contracts; up to 3, ranked by saving per km | `insights.cheaperNearby` |
| Rank | Among areas with 30+ contracts for the same unit; needs at least 5 such areas | `insights.rankAmong` |
| Trend | Contract data only: first 3 vs last 3 months with 10+ contracts each; shown at ±3% or more | `insights.trend` |
| Comparisons | Area-to-area only for the same kind of home, never "all homes" against "all homes" | `insights.insights` |
| 3+ bedrooms | Noted that Dubai Data's figure may include villas and townhouses | `companion.js render` |
| One next step | Compare with my rent → Save → Renewal reminder → Show on the map; everything else is a plain link | `companion.js nextStep` |
| Saved data | Up to 30 saved areas and 8 recent checks, in the visitor's browser only; downloadable, importable, deletable | `insights.js MAX_SAVED`, `MAX_HISTORY` |
| Reminders | Calendar files (.ics) only: renewal 30/60/90 days ahead; market check every 3, 6 or 12 months. No push messages | `companion.js`, `insights.ics` |
| "New figures" note | Only for a returning visitor, only when the data date moved on, and it can be switched off | `insights.whatsNew` |

## 7. Freshness and alerts

| Rule | Value | Where |
|---|---|---|
| Yellow warning on the page | Data more than 7 days behind | `atlas.js staleness` |
| Freshness check | Every 6 hours; fails (GitHub emails the owner) when: data more than 10 days old; no successful pull in 14 hours or the last one failed; the live site more than 2 hours behind the saved data; a source fails; a cross-check falls below its floor; an area with 1,000+ contracts is unplaced | `scripts/check_fresh.py` |
| Cross-checks | Agreement = within 15%. Floors: Dubai Real Estate Data 50%, Continental Club Property 70%, judged only with 5+ matched figures | `crosscheck.TOLERANCE`, `check_fresh.CROSSCHECK_FLOOR` |
| What is compared | Dubai Real Estate Data (apartments only) against our studio-to-2-bedroom figure; Continental Club against the same unit size for a DLD area that maps to exactly one of ours. A source is never compared with itself | `collector/crosscheck.py` |
| Schedules stay on | Every scheduled workflow re-enables itself (GitHub turns off quiet ones after 60 days) | workflows |

## 8. Sharing, language and privacy

| Rule | Value | Where |
|---|---|---|
| Area links | `a/<slug>/` per area, slug = name lower-cased, accents dropped, anything else → "-". Two areas with the same slug stop the deploy | `scripts/share_pages.py`, `companion.js slug` |
| Preview figure | 1-bedroom median where known, else the area's own headline figure | `share_pages.headline` |
| Share image | No made-up figures | `scripts/share_image.mjs` |
| Language | `?lang=` link (remembered) → saved choice → device language; Arabic reads right to left, the map stays left to right | `index.html`, `assets/app/i18n.js` |
| Translations | Keyed by the English text; a missing entry shows English. Every key must have Arabic with the same placeholders (tested) | `i18n.js`, `tests/i18n.test.mjs` |
| Names in Arabic | Area names stay as registered in Ejari (English); home types are translated for display but stored in English | `i18n.js T.unit` |
| Numbers | Western digits in both languages, as on Ejari contracts; AED kept as "AED" | `i18n.js` |
| Counting visits | GoatCounter: no cookies, nothing stored in the browser, skipped on localhost. Events: rent check, save, share, with the area name. Nothing personal | `index.html`, `companion.js count` |
| See the place | An area's breakdown links to Google Maps (search), Street View (at the point) and Google Images (search), opening a new tab; Google allows these links without a key. No Google images are copied or embedded | `atlas.js popup` |
| Photos nearby | Up to 4 freely licensed photos from Wikimedia Commons taken within 1 km of the point: JPEG only, no maps, logos, plans, diagrams, signs or routes; each shows its author and licence and links to its page. Asked only when a breakdown opens, once per point per visit; none found or no answer: nothing shown. A photo that fails to load is dropped | `atlas.js loadPhotos`, `commonsPhotos` |
| Third parties | Fonts and libraries served from this site; only the base map (OpenFreeMap, or OpenStreetMap as fallback), photos near an area (Wikimedia Commons, when a breakdown opens) and the counter load from elsewhere | `assets/vendor/`, `assets/fonts/` |
| Secrets | GitHub Secrets only. No personal, tenant or owner data in the public repo | — |

## 9. Accessibility and layout

The full interface rules (layout, colour, type, labels, controls, sheets, motion) are in [INTERFACE_RULES.md](INTERFACE_RULES.md); the essentials:


- WCAG 2.1 AA in light, dark and Arabic, checked with axe-core on every push (`tests/ui-check.mjs`).
- Text on shaded labels uses colours checked by hand for 4.5:1, because axe can't measure text on a gradient.
- Map labels are keyboard buttons; their spoken name is their visible text.
- No sideways scrolling on phones, down to 320 px wide (small phones, fold phone covers). On phones the map starts in the top 60% of the first screen.
- 860 px and narrower (phones, fold phones open or closed): an area's breakdown is a bottom sheet, full width up to 640 px, at most 80% of the screen high, photos and Google links first; it closes with ×, a swipe down, Escape or a tap on the map. Wider screens keep the pop-up.
- Photos open in a full-screen viewer (all screens) at 960 px, with author, licence and a link to the photo's Commons page; swipe or arrows for the others.
- Map buttons shrink on narrow screens (36 px at 860 px and below, 32 px at 400 px and below).
- Page assets carry `?v=__BUILD__`, replaced with the commit on deploy, so a browser never mixes a new page with old files.
