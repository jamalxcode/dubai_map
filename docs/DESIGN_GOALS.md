# Dubai Rent Atlas: design goals

**Last updated:** 2026-11-16 (Kuwait time)
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

- 🔶 **Three pulls a day** (05:17, 13:17, 21:17 Kuwait), changed by the owner on 16 Nov from one a day. Each source waits at least 6 hours between pulls, so duplicate starts do nothing, and the heavier extras still run once a day. (Before: at most one pull per Dubai day.)
- ✅ Small window, paced pages, a page cap, bounded waits on "slow down", then stop until tomorrow.
- ✅ Honest User-Agent pointing at this repo. No CAPTCHA workarounds, no scraping listing portals, no identity rotation.
- ✅ The Dubai Data mirror is fetched with conditional requests, so an unchanged file costs nothing.
- ✅ Every candidate source is checked for terms and robots.txt before it is used; CAPTCHA pages, calculators and sources that forbid reuse are left alone (see README, "Sources reviewed").
- 🔶 OpenStreetMap is only a last resort, for areas Dubai Municipality hasn't published. Since 15 Nov a weekly job accepts a point only after automatic checks (inside Dubai, a place rather than a shop or road, a close name match), at 1 request per second; anything else is listed for a person. (Before: every result was reviewed by hand.)
- ✅ All collectors share one polite HTTP module (`collector/net.py`): one User-Agent, bounded retries, stop for today.

## 4. Work today, get richer later

- ✅ **Now:** community medians from Dubai Data (datadubai.ae, CC BY 4.0), derived from the same Ejari feed. About 304k contracts in 102 communities over the last 12 months, all placed on the map.
- 🔶 **Later, automatically:** once a Dubai Pulse API key is in GitHub Secrets, the build switches to per-contract data (trends, AED/m², new vs renewal, top buildings, last-30-days table). No code change is needed. It switches only when our own contracts cover at least 43 of the last 52 weeks (and 1,000 home contracts), so a few weeks of data are never shown as "last 12 months". Blocked on the key.
- ✅ A build never publishes a catalog more than 30% smaller than the last one; the previous files stay live and the run fails so someone looks.
- ✅ Manual fallback: drop a DLD CSV into `data/inbox/` and it gets imported.

## 5. Honest geography

- ✅ Points are **approximate community reference points**, never buildings or units. The page says so.
- ✅ Points were cross-checked against project coordinates in the dataset and against OSM.
- ✅ Every DLD area is placed at a point inside its official Dubai Municipality community.
- ⏳ Community outlines (Dubai Municipality polygons) to shade areas properly.
- ⏳ Building-level points only where the match is verified, with the confidence shown.

## 6. Coverage

- 🔶 Dubai master-planned communities are covered. Older districts (Deira, Bur Dubai, Karama…) need the per-contract feed.
- ⏳ **Other cities in the region**: the project is meant to expand beyond Dubai. Each emirate or country has its own registry (e.g. Abu Dhabi, Sharjah), so a new city means a new source adapter plus its own location file, with the same label UI. The collector and build steps are kept per source to allow this.

## 7. Simple, cheap, owned

- ✅ Static site on GitHub Pages. No server, no database, no paid services.
- ✅ Daily work runs in GitHub Actions. Standard-library Python only.
- ✅ Only small JSON files are published. Generated data (contract archive, source mirrors, page JSON) lives on the `data` branch; `main` holds code and hand-kept inputs.
- ✅ Times are shown in Kuwait time.
- ✅ Secrets live only in GitHub Secrets. No personal, tenant or owner data in the public repo.
- ✅ What visitors save (areas, checks, settings) stays in their own browser and can be downloaded or deleted.

## 8. Useful outputs

- ✅ Table of community × unit type with median rent, contract count and gross yield, plus CSV export.
- ✅ The source and its freshness are shown on the page ("data through" date, last refresh).
- ⏳ Trends, year-on-year change, rent vs sale price.
- ⏳ Private comparison of the owner's own units against the market, kept outside this public repo.

## 9. Worth coming back to, not time spent

Set on 16 Nov from six engagement principles. The test is genuine usefulness and voluntary return visits, never maximum time on the page.

- ✅ **The need:** "what do people actually pay for a home like mine?", most often around a move or a renewal.
- ✅ **Effortless core action:** "Check a rent" is the first thing on the page (one line on phones, so the map stays high). Nicknames, official DLD names and typos all find the area; the home defaults to the area's most common unit.
- ✅ **One next step:** each result has one primary button (compare with my rent → save → renewal reminder → map); the rest are plain links.
- ✅ **Rewards are facts:** how your rent compares (with the caveat that half pay more and half less), the same home for less nearby, rank among areas, the trend when contract data exists. Area-to-area comparisons only for the same kind of home. No badges, points, streaks or chance.
- ✅ **Relevant triggers under the visitor's control:** renewal and market-check reminders go into their own calendar (lead time and frequency chosen by them; delete the event to stop). A "new figures" note on return only when the data moved on, and it can be switched off. No push notifications.
- ✅ **Clear stopping points:** no feeds, autoplay or endless scroll. Empty results and errors offer a way forward (suggestions, units with figures, retry).
- ✅ **Value that accumulates:** My areas (with change since saved), recent checks, the last check and map view resume. Nothing is lost by staying away.
