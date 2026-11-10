# Dubai Rent Atlas: design goals

**Last updated:** 2026-11-10 (Kuwait time)
**Site:** https://jamalxcode.github.io/dubai_map/
**Status key:** ✅ done · 🔶 partly done · ⏳ planned

These are the goals the owner set while building the project (see [CONVERSATION.md](CONVERSATION.md)), plus the rules that follow from them. When a change conflicts with a goal here, the goal wins unless this file is updated first.

## 1. Show real rents, not asking prices

- ✅ Use **Ejari rent contracts** registered with the Dubai Land Department: what tenants actually pay.
- ✅ Annual rent in AED. Never substitute the total contract amount.
- ✅ Do not mix this up with the RERA Rental Index (the allowed-increase calculator). It is a different thing.
- ✅ Never show invented or sample rents as if they were real.

## 2. Readable at a glance: rents as text, one number per group

- ✅ The rent is written **as text on the map** (e.g. "AED 67k · Jumeirah Village Circle"). No sized or coloured circles to decode.
- ✅ When communities are too close to read separately, they merge into **one label with one number**, the average rent of the group, weighted by number of contracts (e.g. "AED 75k avg · 22 communities").
- ✅ Labels never overlap at any zoom. Merging repeats until they don't. Tested on desktop and phone widths.
- ✅ Clicking a group zooms in until it splits. Clicking a single community shows its unit-by-unit breakdown.
- ✅ One headline number for the screen: **Average rent in view**, updated as you pan and zoom.
- ✅ The unit-type filter (studio, 1-bed…) and the measure selector (rent, gross yield, contract count) drive the labels and the headline number.
- 🔶 The thin coloured edge on a label is a secondary cue (price band). The text carries the information.

## 3. Be a good citizen with data sources: never get blocked

- ✅ At most **one pull per day** from DLD/Ejari (05:17 Kuwait time). Re-runs the same day do not contact the API.
- ✅ Small window, paced pages, a page cap, bounded waits on "slow down", then stop until tomorrow.
- ✅ Honest User-Agent pointing at this repo. No CAPTCHA workarounds, no scraping listing portals, no identity rotation.
- ✅ The Dubai Data mirror is fetched with conditional requests, so an unchanged file costs nothing.
- ✅ OpenStreetMap geocoding runs only by hand, at 1 request per second, and the results are reviewed by a person.

## 4. Work today, get richer later

- ✅ **Now:** community medians from Dubai Data (datadubai.ae, CC BY 4.0), derived from the same Ejari feed. About 304k contracts in 102 communities over the last 12 months, all placed on the map.
- 🔶 **Later, automatically:** once a Dubai Pulse API key is in GitHub Secrets, the build switches to per-contract data (trends, AED/m², new vs renewal, top buildings, last-30-days table). No code change is needed. Blocked on the key.
- ✅ Manual fallback: drop a DLD CSV into `data/inbox/` and it gets imported.

## 5. Honest geography

- ✅ Points are **approximate community reference points**, never buildings or units. The page says so.
- ✅ Points were cross-checked against project coordinates in the dataset and against OSM.
- ⏳ Community outlines (Dubai Municipality polygons) to shade areas properly.
- ⏳ Building-level points only where the match is verified, with the confidence shown.

## 6. Coverage

- 🔶 Dubai master-planned communities are covered. Older districts (Deira, Bur Dubai, Karama…) need the per-contract feed.
- ⏳ **Other cities in the region**: the project is meant to expand beyond Dubai. Each emirate or country has its own registry (e.g. Abu Dhabi, Sharjah), so a new city means a new source adapter plus its own location file, with the same label UI. The collector and build steps are kept per source to allow this.

## 7. Simple, cheap, owned

- ✅ Static site on GitHub Pages. No server, no database, no paid services.
- ✅ Daily work runs in GitHub Actions. Standard-library Python only.
- ✅ Only small JSON files are published. The raw contract archive stays in the repo.
- ✅ Times are shown in Kuwait time.
- ✅ Secrets live only in GitHub Secrets. No personal, tenant or owner data in the public repo.

## 8. Useful outputs

- ✅ Table of community × unit type with median rent, contract count and gross yield, plus CSV export.
- ✅ The source and its freshness are shown on the page ("data through" date, last refresh).
- ⏳ Trends, year-on-year change, rent vs sale price.
- ⏳ Private comparison of the owner's own units against the market, kept outside this public repo.
