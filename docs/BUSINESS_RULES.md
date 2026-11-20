# Dubai Real Estate Atlas: business rules

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
| OpenStreetMap | At most 1 request a second, at most 10 look-ups per daily pull (40 weekly), results cached; each area is searched under its DLD name and, where different, with ordinals as numbers ("Al Twar Fifth" → "Al Twar 5"); a failed look-up is retried after 7 days, or at once when it gains a name it wasn't searched under | `collector/geocode_missing.py` |
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
| Map views | Rent (median yearly rent), Sale price (median sale price, from DLD sales), Gross yield (Dubai Data's, within property class and bedroom count). Per bedroom count where a unit is picked; for Flats/Studios a contract-weighted "typical" of the bedroom figures. Each view has its own key, trimmed to the 5th-95th percentile of its values. Older districts (Continental Club) have rents only, so they show in the rent view only | `atlas.js VIEWS`, `areaValue`; `build.py aggregate_type` |
| "All units" | Only areas with an all-homes median; per-unit-only areas (older districts) appear once a unit is picked | `atlas.js areaValue` |
| Merging | Labels that would overlap merge into one, showing the contract-weighted average (the total for counts) at the weighted centre; the busiest merge first | `assets/app/labels.js` |
| Splitting | A merged label of up to 3 areas comes apart when each label fits at its own point or just beside it (a thin line joins a moved label to its point) | `labels.js MAX_SPLIT` |
| Controls | Labels step out from under the zoom bar, the view bar and the legend; label boxes are measured as drawn | `labels.js`, `atlas.js labelBox` |
| Group names | Every merged label: the busiest area's name (cut at 22 letters) plus "+N" others | `atlas.js groupName` |
| Statistic wording | The header's **price dial**: the contract-weighted median of the areas on screen (half the contracts are in areas below it), with the lowest and highest area in view at the two ends; "typical" stays for the legend and merged labels (contract-weighted averages); "median" in breakdowns and the table. Counts (contracts, places to stay) get no dial | `atlas.js viewStat`, `setDial` |
| Yields | One decimal everywhere (7.0%) | `atlas.js pct`, `companion.js`, `share_pages.py` |
| Home picker | All homes, each home size (from the homes data), then other property types with data ("Flats, any size"); studios are a size, not offered again as a type | `atlas.js buildHome` |
| Table finder | Filters the table's rows by area, DLD area, master project or building; never the map | `atlas.js draw` |
| One home choice | The rent check has no home field: it uses the map's Home picker (a size, else all homes); when the area lacks that home it checks the area's most common one and the map follows; a home picked on the map re-checks the area | `atlas.js setMapHome`, `companion.js pickUnit` |
| Usage counts | GoatCounter events by feature name only, at most with the choice made (view, home size, sort column): views, names button, home, All Dubai, Near me, sort, legend fold, CSV, table finder and rent range (once a visit each), a shared map link opened from elsewhere; plus the rent check's check, save and share. Never what was typed, never a position | `atlas.js countUse`, `companion.js count` |
| Area rank | "Dearer than X% of N areas" = the share of areas (with 30+ contracts for that home) whose median is lower | `insights.js rankAmong` |
| Rent history | One snapshot per publication (data-through date) of every area's medians, after a successful build; older districts left out | `history.py`, `build.py` |
| Change shown | Against the snapshot at least 330 days back if any, else the oldest at least 28 days back; none before that | `history.baseline` |
| Unconfirmed jump | More than 40% since the previous publication, from 30+ contracts: dashed and noted until the next publication stays close (no stored state) | `history.annotate`, `atlas.js` |
| Changes listed | Moves of 5% or more (30+ contracts), up to 40, plus jumps, new and gone areas | `history.changes` |
| Sources differ | A cross-check figure more than 15% from ours is shown in the area's breakdown with the source's figure | `crosscheck.gaps` |
| Late timer runs | A scheduled run steps aside when a pull succeeded in the last 3 hours | `daily-ejari.yml` guard |
| Live page retry | Failed community pages get one more try after 30 s; not after HTTP 429 or 403 | `fetch_datadubai.fetch_live` |
| Industrial zones | An area whose own name contains "Industrial" is flagged `staff` (mostly staff accommodation): noted in its breakdown and the rent check, left out of "same home for less nearby" and the rank. A residential community inside an industrial DLD area is not flagged | `build.py STAFF`, `insights.js` |
| Backup source | Dubai Data's figures more than 10 days old and Continental Club's at most 10: every area from Continental Club, `meta.backup` set, warning sign on the page, no main-series snapshot; the size guard doesn't compare across the switch | `build.backup_reason`, `output.shrink_problem` |
| Source columns | Each Dubai Data file must keep the columns the build reads, or the run stops naming the missing one | `build.REQUIRED` |
| Older districts' history | Their own snapshot series by Continental Club's date; jumps judged with the area's contract count | `history.py` (series "ccp") |
| Alerts as issues | One issue per problem (key: the sentence without numbers, dates and links), closed with a note when gone | `check_fresh.sync_issues` |
| Week of pulls | Fewer than 80% of the last 7 days' pulls succeeding is a problem | `check_fresh.MIN_WEEK_SUCCESS` |
| Status counts | Written by each build to `status.json`: totals; Dubai Data communities read / used / without a median, bedroom rows with a median; Continental Club DLD areas read / used / already covered by Dubai Data; cross-check rows; unplaced areas, unconfirmed jumps, figures where sources differ | `build.status_counts` |
| What a pull read | Dubai Data: live result, pages read, export files updated; cross-checks: rows; Dubai Pulse: rows, new, updated; logged per pull in `runs.jsonl` | collectors' `state.json`, `run_log.pulled` |
| Hidden labels | A label under a button or the legend steps aside (beside its point, two label-steps out, else the nearest free position within a label's width and three heights); with no free spot it joins its nearest neighbour within 1.5 times the two labels' widths whose joined label then has a free spot; else it is hidden, never drawn on a control | `labels.js` rule 3 |
| Display names | All-capitals names in title case, acronyms kept; registered names for search, links and storage | `i18n.js T.place`, `share_pages.place` |
| Table order | Clicked header (descending first, Area A–Z), else the view's column; areas with no figure last | `atlas.js table` |
| Map links | `home`, `view`, `at` (lat, lng, zoom; only accepted near Dubai) in the address | `atlas.js writeURL`, `readURL` |
| Near me | Dubai box 24.6–25.45 °N, 54.85–56.4 °E (Hatta included); outside it, a note and no move | `atlas.js` |
| Labels inside the map | A label whose point is on screen is kept fully inside the map's edges from the start of placement; labels are placed again after a pan, except while a breakdown is open | `labels.js` (rule 0), `atlas.js` |
| Never overlap | No two labels overlap at any zoom (browser-checked at the start, zoom 13 and zoom 14) | `tests/ui-check.mjs` |
| Price badges | Each label's figure sits on its band's blue; espresso type on bands 1–4, ivory on 5–6. The rent check shows the same colour as a chip, from the key for the home type checked | `atlas.js scaleFor`, `INK`, `priceKey` |
| Colour bands | Six blues (palest → deep navy, low → high) in equal steps between the 5th and 95th percentile of what is shown, so extreme areas don't stretch the key; below the 5th percentile: the palest, above the 95th: the deepest. The legend writes a value at all seven step edges | `atlas.js scaleFor` |
| Base map names | English: `name:en`, else `name_en`, else Latin, else the local name. Arabic: `name:ar`, else the local name. Both: the map style's own (Latin and local script). Names follow the page language; the A+ع button shows both, remembered (`mapBoth`). Road numbers are left alone | `atlas.js NAME_FIELD` |
| Thin figures | A figure from fewer than 10 contracts (where the source gives a count) is still shown, with a dashed outline and an italic figure on the map, italic rows in the breakdown and on area pages, and a legend note | `atlas.js THIN` |
| Community outlines | Each map area is shaded inside the official Dubai Municipality outlines of its DLD areas, in its price-key colour for the current view; a DLD area shared by several map areas goes to the busiest (official boundaries don't separate sub-communities, so 44 of 155 areas have no outline of their own) | `build.area_outlines`, `dm_communities.write_outlines`, `atlas.js drawOutlines` |
| Sale price trend | Monthly sale price per sq ft, last 24 months with at least 5 sales (Dubai Data community_monthly); year-on-year change = mean of the last 3 months against the same 3 months a year before | `build.sale_trends` |
| Rent check moves the map | Wide screens (1,100 px and up): fly to the area at zoom 14 and open its breakdown. Not on narrower screens, not for a resumed check | `companion.js` |

| Budget mode | A yearly rent range (Min, Max, either optional, swapped if reversed) on the chosen home's rent median; areas outside it, or without a rent figure for that home, lose their labels and leave the averages; colours keep the whole map's scale | `atlas.js draw`, `budgetNote` |

| Metro and Tram | Lines and stations from OpenStreetMap (weekly). "Near Metro / Tram": an area counts when a station is within 800 m (10-minute walk) or 1,600 m (20-minute walk) in a straight line of its official outline (or of its point without one); combined with the budget. "Lowest near a station": the station whose areas within the walk have the lowest contract-weighted figure among those left on the map. A station's breakdown lists the areas within the walk with their figure and distance | `collector/transit.py`, `transit.js`, `atlas.js` |

| Hotels | Places to stay from OpenStreetMap (ODbL), weekly: `tourism` = hotel, apartment (hotel apartments), hostel, guest_house or motel (as guest house), with a name, inside Dubai (within Dubai Municipality's official community outlines, or 300 m of one, for piers, islands and coasts; the search box alone reaches Sharjah and Ajman), not marked disused, and taking guests (staff housing and camps never; an "... accommodation" only when it is for travellers, e.g. a backpackers' hostel; a "hotel apartment" named like a residential building, a tower, building, residence or complex, only with a star rating or a hotel word such as hotel, suites, inn); without the outlines file, the box as before; one place mapped twice (same name within about 150 m) counts once; stars only from 1 to 7. Not saved if fewer than 300 come back. Each place goes to the area whose official outline holds it, else the nearest area point within 1.5 km, else none (`Transit.assign`). Groups of labels add their hotels. Nightly prices come from Xotelo (the row below); a hotel's breakdown also links to Google Maps and a Booking.com search. Official figures (DET average daily rate, occupancy) are city-wide, monthly, from Dubai Pulse, asked at most once every 20 hours with a 20-second wait; a rate outside AED 100–5,000 a night or occupancy outside 0–100% is left out; the state (`ok`, `no_key`, `failed`) is recorded in `state.json`; shown only when that file exists | `collector/hotels.py`, `collector/hotel_stats.py`, `transit.js assign`, `atlas.js` |

| Night prices (no per-hotel source) | DET's official average daily rate, monthly, all of Dubai: the dial's figure is the latest month, its ends the lowest and highest of the last 12 months; a partner's price widget (link in `assets/app/partners.js`, placeholders {name} {lat} {lng} {checkin} {checkout} {lang}, check-in 14 days ahead for one night, https only) loads in a hotel's card only when tapped | `atlas.js viewStat`, `hotelPrice`, `priceWidget`; `assets/app/partners.js` |
| Holiday homes | Xotelo's Dubai list (read once a day): the places it files as condominiums, villas or cottages (holiday homes and serviced apartments), inside Dubai's map box, each once, leaving out any already priced as a hotel (`hotel_prices.json` keys), so none shows in both views; at least 100, else the last prices stay. Each pull prices up to 50, never asked first and then those asked longest ago, exactly as hotels (one unit, 2 adults, nights 14 and 19 days ahead, lowest offer not under 60% of the median, USD × 3.6725). Only priced places are saved; prices older than 10 days dropped (and hidden by the page). Their own view, **Holiday homes**, shown once the file has a price: an area's figure is the median of its places, its card the typical price, the range and the list; no rent budget or thin marks. "Needs you": failing, or not refreshed for 48+ hours | `collector/holiday_homes.py`, `atlas.js loadHomes`, `homesBy`, `homeSection`, `status.js` |
| Hotel and holiday home price history | After each pull's build, every place with a current price (checked in the last 10 days) is put in its area by the page's rule (the outline of a placed area that holds it, else the nearest area point within 1.5 km) and each area's median a night is saved with how many places it rests on, plus Dubai's median, for hotels and holiday homes: one entry a day in `stay_history.json` (a later pull the same day replaces it), never deleted. Prices refresh on a rolling basis, so a day's figure is a smoothed median of the last few days. An area card draws the series once it has 3 days, and a change only against a day at least 28 days earlier with at least 3 places on both days. "Needs you" when no day was added for 48 hours | `collector/stay_history.py`, `atlas.js stayTrend`, `status.js` |
| Places-to-stay views (page) | An area with fewer than 3 priced places is thin (dashed) and left out of the dial's ends and of "Cheapest area" when sturdier areas exist; the nightly budget filters areas by their typical price a night, kept apart from the rent budget; a Tripadvisor rating shows only from 5 reviews; hotels without a price are drawn only from zoom 14 once any hotel has one | `atlas.js STAY_THIN`, `stayPanel`, `swapRange`, `MIN_REVIEWS`, `UNPRICED_ZOOM` |
| Google Hotels prices (SerpApi) | Needs `SERPAPI_KEY` (free plan, 250 searches a month). Two searches a pull (hotels, vacation rentals), one night 14 days ahead, 2 adults, AED, the place searched rotating through 24 Dubai areas; at most every 6 hours; stops at 240 searches a calendar month (a search that fails still counts). Hotels matched to our places with the Xotelo rules and used only where Xotelo has no current price; vacation rentals added to Holiday homes unless they match one of Xotelo's holiday homes. The rate before taxes and fees where given, else the lowest shown; AED 50–60,000 only; places outside Dubai's box dropped; prices older than 10 days dropped; failures keep the last prices. "Needs you" until the key is set, and when it fails | `collector/serp_stays.py`, `atlas.js attachPrices`, `loadHomes`, `status.js` |
| Hotel pull checks (status page) | "Needs you" lists: places to stay not refreshed for more than 15 days (the weekly job); hotel prices not refreshed for more than 48 hours while the source isn't already failing; fewer than 300 places matched to Xotelo when 500+ are on the map; fewer than a quarter of matched hotels priced once all have been asked; Xotelo failing; DET failing with the key set | `assets/app/status.js hotels`, `needs` |
| Hotel prices | Xotelo (free, no key; the rates booking sites show on TripAdvisor; chosen by the owner on 19 Nov because LiteAPI's live key needs a payment card bookings could be charged to). On each pull: Xotelo's Dubai list once a day (at least 500 hotels, else the last prices stay), our places matched within 250 m by name (word overlap 60%, or one name inside the other with 2+ words; within 80 m, 34%), each of theirs used once; then up to 100 matched hotels, never asked first and then those asked longest ago, are priced for one room, 2 adults, one night, 14 and 19 days ahead (3 requests at a time). A night's price is the lowest offer not under 60% of that night's median offer, USD × 3.6725 = AED, AED 50–60,000 only; a hotel's price is the average of its nights (1 or 2), with its lowest and highest and the date checked. Prices older than 10 days are dropped (the page hides them too). Nothing saved when more than half the requests fail, or when fewer than 20 places match after 20 or more did; then the last prices stay. An area's figure is the median of its hotels' prices and its card gives the lowest to the highest; groups of labels average by priced hotels. Without prices the view counts places | `collector/hotel_prices.py`, `atlas.js attachPrices`, `hotelsBy`, `hotelSection`, `areaValue` |

| Compare | Two areas for the chosen home: cheaper by the difference as a share of the dearer; within 3% is "about the same"; per home size the lower rent is marked the same way; better = lower rent and sale price, higher yield; distance between the areas' points; suggested second areas are the 3 nearest with a figure for the chosen home | `insights.compare`, `atlas.js renderCompare` |

### Added from the keybox.ae ideas (20 Nov)

| Rule | Value | Where |
|---|---|---|
| Per sq ft | Sale price per sq ft: a Total / Per sq ft switch in the key on the Sale price view (hidden view `sale_psf`, the area's `sale_psf`) | `atlas.js` |
| Currency | AED by default; USD at the peg (3.6725); EUR and GBP only when `fx.json` has them. Converted for display only (labels, dial, key); stored and checked in AED; remembered (`localStorage` `cur`) | `atlas.js setCurrency`, `collector/fx.py` |
| Near | Beach or golf course within 1.5 km, a park within 800 m, a mall within 1.5 km, 10+ schools within 2 km, in straight line from the area's reference point. Hidden until `lifestyle.json` loads | `atlas.js LIFE_RULES`, `collector/lifestyle.py` |
| 3D | Only where WebGL works; same base map and price colours; up to 60 price labels | `fun.js open3d` |
| Busiest market | The fact strip names the area with the most contracts (industrial zones left out) | `fun.js` |

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
| Freshness check | Every 6 hours; fails (GitHub emails the owner) when: data more than 10 days old; no successful pull in 14 hours or the last one failed; the live site more than 2 hours behind the saved data; a source fails; a cross-check falls below its floor. Known slow issues (an area with 1,000+ contracts the map can't place) are listed in the run summary but don't fail it | `scripts/check_fresh.py` |
| Cross-checks | Agreement = within 15%. Floors: Dubai Real Estate Data 50%, Continental Club Property 70%, judged only with 5+ matched figures | `crosscheck.TOLERANCE`, `check_fresh.CROSSCHECK_FLOOR` |
| What is compared | Dubai Real Estate Data (apartments only) against our studio-to-2-bedroom figure; Continental Club against the same unit size for a DLD area that maps to exactly one of ours. A source is never compared with itself | `collector/crosscheck.py` |
| Schedules stay on | Every scheduled workflow re-enables itself (GitHub turns off quiet ones after 60 days) | workflows |

## 8. Sharing, language and privacy

| Rule | Value | Where |
|---|---|---|
| Area pages | `a/<slug>/` per area: a real page with the area's figures (every home type: rent, contracts, sale price, yield), its trend and sources, and a button to the map (no automatic redirect); listed in `sitemap.xml`. Slug: slug = name lower-cased, accents dropped, anything else → "-". Two areas with the same slug stop the deploy | `scripts/share_pages.py`, `companion.js slug` |
| Site pages | `stats/`, `areas/`, `yields/`, `rents/<home>/`, `rents/1-bedroom-under-<n>/` (AED 50k, 60k, 75k, 100k), all from published files; rankings leave out figures from fewer than 10 contracts and industrial zones; each links to the map with the same view, home and budget | `scripts/site_pages.py` |
| Feed | `feed.xml`: one item per publication, moves of 5% or more from 30+ contracts between consecutive history snapshots | `site_pages.py` |
| Questions and answers | Area pages and the stats page carry questions answered from their figures, also as schema.org FAQPage; a question without a figure is left out | `share_pages.faqs`, `site_pages.py` |
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
- Price badges: type colour per band, checked by hand for 4.5:1 (5.0:1 at the lowest).
- Map labels are keyboard buttons; their spoken name is their visible text.
- No sideways scrolling on phones, down to 320 px wide (small phones, fold phone covers). On phones the map starts in the top half of the first screen.
- 860 px and narrower (phones, fold phones open or closed): an area's breakdown is a bottom sheet, full width up to 640 px, at most 80% of the screen high, photos and Google links first; it closes with ×, a swipe down, Escape or a tap on the map. Wider screens keep the pop-up.
- Photos open in a full-screen viewer (all screens) at 960 px, with author, licence and a link to the photo's Commons page; swipe or arrows for the others.
- Map buttons shrink on narrow screens (36 px at 860 px and below, 32 px at 400 px and below).
- Page assets carry `?v=__BUILD__`, replaced with the commit on deploy, so a browser never mixes a new page with old files.
