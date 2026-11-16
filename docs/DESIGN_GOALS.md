# Dubai Rent Atlas: design goals

**Last updated:** 2026-11-16 (Kuwait time)
**Site:** https://jamalxcode.github.io/dubai_map/
**Status key:** ✅ done · 🔶 partly done · ⏳ planned

These are the goals the owner set while building the project (see [CONVERSATION.md](CONVERSATION.md)). The exact rules and thresholds that implement them are in [BUSINESS_RULES.md](BUSINESS_RULES.md) (data) and [INTERFACE_RULES.md](INTERFACE_RULES.md) (the page); what we learned on the way is in [LESSONS_LEARNED.md](LESSONS_LEARNED.md). When a change conflicts with a goal here, the goal wins unless this file is updated first.

## 1. Show real rents, not asking prices

- ✅ Use **Ejari rent contracts** registered with the Dubai Land Department: what tenants actually pay.
- ✅ Annual rent in AED. Never substitute the total contract amount.
- ✅ Do not mix this up with the RERA Rental Index (the allowed-increase calculator). It is a different thing.
- ✅ Never show invented or sample rents as if they were real.

## 2. Readable at a glance: rents as text, one number per group

- ✅ The rent is written **as text on the map** (e.g. "AED 67k · Jumeirah Village Circle"). No sized or coloured circles to decode.
- ✅ When communities are too close to read separately, they merge into **one label with one number**, the average rent of the group, weighted by number of contracts (e.g. "AED 75k avg · 22 communities").
- ✅ Labels never overlap at any zoom. Merging repeats until they don't. Tested on desktop and phone widths.
- ✅ Zoomed in, areas keep their own names: a group of two or three comes apart when there is room, one label moved beside its point with a thin line (at zoom 14, merged labels went from 12 to 1). Labels keep clear of the zoom buttons and legend.
- ✅ Clicking a group zooms in until it splits. Clicking a single community shows its unit-by-unit breakdown.
- ✅ One headline number for the screen: **Average rent in view**, updated as you pan and zoom.
- ✅ The unit-type filter (studio, 1-bed…) and the measure selector (rent, gross yield, contract count) drive the labels and the headline number.
- 🔶 Secondary cues only: a thin coloured edge (price band), a small dial and a shaded box that fill as the rent approaches AED 100k. The text carries the information.

## 3. Be a good citizen with data sources: never get blocked

- 🔶 **Three pulls a day** (05:17, 13:17, 21:17 Kuwait), changed by the owner on 16 Nov from one a day. Each source waits at least 6 hours between pulls, so duplicate starts do nothing, and the heavier extras still run once a day. (Before: at most one pull per Dubai day.)
- ✅ Small window, paced pages, a page cap, bounded waits on "slow down", then stop until tomorrow.
- ✅ Honest User-Agent pointing at this repo. No CAPTCHA workarounds, no scraping listing portals, no identity rotation.
- ✅ The Dubai Data mirror is fetched with conditional requests, so an unchanged file costs nothing.
- ✅ Every candidate source is checked for terms and robots.txt before it is used; CAPTCHA pages, calculators and sources that forbid reuse are left alone (see README, "Sources reviewed").
- 🔶 OpenStreetMap is only a last resort, for areas Dubai Municipality hasn't published. A point is accepted only after automatic checks (inside Dubai, a place rather than a shop or road, a close name match), at 1 request per second; anything else is listed for a person. Since 16 Nov the daily pull also looks up newly unplaced areas (at most 10, a failure retried after a week), and the freshness check flags a busy area that stays unplaced. Coordinates are never guessed. (Before: every result was reviewed by hand; then a weekly job only.)
- ✅ All collectors share one polite HTTP module (`collector/net.py`): one User-Agent, bounded retries, stop for today.

## 4. Work today, get richer later

- ✅ **Now:** community medians from Dubai Data (datadubai.ae, CC BY 4.0) for 102 communities, plus Continental Club Property (CC BY 4.0) for 56 older DLD areas: about 534k contracts over the last 12 months, 99.5% of them on the map.
- 🔶 **Later, automatically:** once a Dubai Pulse API key is in GitHub Secrets, the build switches to per-contract data (trends, AED/m², new vs renewal, top buildings, last-30-days table). No code change is needed. It switches only when our own contracts cover at least 43 of the last 52 weeks (and 1,000 home contracts), so a few weeks of data are never shown as "last 12 months". Blocked on the key: data.dubai's sign-up page rejects visitors from outside the UAE, so the owner asked Digital Dubai support for access on 16 Nov. The collector is ready (and tested against the gateway's documented behaviour); nothing else is needed once the key arrives.
- ✅ A build never publishes a catalog more than 30% smaller than the last one; the previous files stay live and the run fails so someone looks.
- ✅ Manual fallback: drop a DLD CSV into `data/inbox/` and it gets imported.

## 5. Honest geography

- ✅ Points are **approximate community reference points**, never buildings or units. The page says so.
- ✅ Points were cross-checked against project coordinates in the dataset and against OSM.
- ✅ Every DLD area is placed at a point inside its official Dubai Municipality community.
- ⏳ Community outlines (Dubai Municipality polygons) to shade areas properly.
- ⏳ Building-level points only where the match is verified, with the confidence shown.

## 6. Coverage

- 🔶 Dubai master-planned communities are covered (Dubai Data), and since 16 Nov the older districts too (Deira, Bur Dubai, Karama, Al Qusais…: 56 official DLD areas from Continental Club Property, median by unit size). The per-contract feed will replace both once the Dubai Pulse key is in.
- ⏳ **Other cities in the region**: the project is meant to expand beyond Dubai. Each emirate or country has its own registry (e.g. Abu Dhabi, Sharjah), so a new city means a new source adapter plus its own location file, with the same label UI. The collector and build steps are kept per source to allow this.

## 7. Simple, cheap, owned

- ✅ Static site on GitHub Pages. No server, no database, no paid services, no build step. `index.html` is markup; scripts and styles are separate files under `assets/app/`.
- ✅ Daily work runs in GitHub Actions. Standard-library Python only.
- ✅ Only small JSON files are published. Generated data (contract archive, source mirrors, page JSON) lives on the `data` branch; `main` holds code and hand-kept inputs.
- ✅ Times are shown in Kuwait time.
- ✅ Secrets live only in GitHub Secrets. No personal, tenant or owner data in the public repo.
- ✅ What visitors save (areas, checks, settings) stays in their own browser and can be downloaded or deleted.
- ✅ Fonts and libraries are served from this site (`assets/vendor/`, `assets/fonts/`); only the base map tiles (OpenFreeMap, free and keyless) and the visit counter load from elsewhere.
- ✅ Visits and feature use are counted with GoatCounter (no cookies, nothing personal), so the owner can tell what earns its place.

## 8. Useful outputs

- ✅ Table of community × unit type with median rent, contract count and gross yield, plus CSV export.
- ✅ The source and its freshness are shown on the page ("data through" date, last refresh).
- 🔶 Honest about what isn't known: the rent check says when no range is published; ranges (middle half) and "which quarter you're in" appear with contract-level data. 3+ bedroom figures carry a note that they may include villas.
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

## 10. Reach the people who need it

Set on 16 Nov after the third critique.

- ✅ **Arabic:** the whole interface in Arabic, right to left, from a button, a `?lang=ar` link or a phone set to Arabic. Area names stay as registered in Ejari (what search matches); Arabic names to follow from DLD's own data.
- ✅ **Sharing that works where rents are discussed:** each area has its own link whose preview (WhatsApp, X, iMessage) shows its rent; "Share" on a result opens the phone's share sheet or copies the link.
- ✅ **Accessible:** WCAG 2.1 AA in light, dark and Arabic, checked on every push; labels work by keyboard.
- ✅ **Phones first:** the map stays high on the first screen; no sideways scrolling down to 320 px (fold phone covers, small phones). Drilling into an area opens a bottom sheet with the photos first, large and swipeable, and a full-screen photo viewer.
- ✅ **See the place:** an area's breakdown links to Google Maps, Street View and Google photos, and shows freely licensed photos taken nearby (Wikimedia Commons), each credited. Nothing is copied from Google; where no free photo exists, only the links show.
- ✅ **One language on the map:** a button on the map (English · عربي · Both) sets the language of the base map's place and street names, instead of the mix the classic tiles print. Starts in the page's language, remembered.
- ⏳ Arabic area names for the rent labels; other cities (goal 6).

## Ideas on the table

Discussed with the owner, not built yet. What each needs:

| Idea | Needs | Status |
|---|---|---|
| Contract-level data: ranges, trends, AED/m², new vs renewal, busiest buildings | Dubai Pulse API key (owner asked Digital Dubai support on 16 Nov) | ⏳ waiting; the code is ready |
| Street View inside an area's breakdown | Owner's Google Maps Embed API key (free, billing switched on, restricted to the site) | ⏳ waiting for the key |
| Building-level drill-down (photos and Street View at a project) | Dubai Data's project coordinates (105 of 723 projects have a real point) | ⏳ planned |
| Arabic area names on the rent labels | DLD's own Arabic names (contract-level data) | ⏳ planned |
| Community outlines shaded under the labels | Dubai Municipality community polygons | ⏳ planned |
| Al Twar Fifth on the map | A reviewed point or alias (not in Municipality data or OpenStreetMap) | ⏳ flagged by the freshness check |
| Other cities in the region | A source adapter and location file per registry | ⏳ later |
| Private comparison of the owner's own units | Kept outside this public repo | ⏳ later |

