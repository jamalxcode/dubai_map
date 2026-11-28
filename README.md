# 🗺️ Dubai Real Estate Atlas

> **What does everyone else actually pay?**
> Not what the listing says. Not what the agent hopes. What tenants *actually pay*, from rent contracts registered with the Dubai Land Department.

**👉 [jamalxcode.github.io/dubai_map](https://jamalxcode.github.io/dubai_map/)** · [بالعربية](https://jamalxcode.github.io/dubai_map/?lang=ar)

Every rent in Dubai is registered in **Ejari**: over half a million contracts a year, area by area, studio to villa. This site turns them into a map you can read in two seconds, with the rent written right where the homes are, and then helps with the question you came with: *am I paying too much?* It also shows what homes **sell** for, the **yield** a landlord gets, and what a night in a **hotel** or **holiday home** costs, area by area.

Free, no ads, no account, no cookies. One static page, a few small data files, and a robot that refreshes them three times a day.

---

## ✨ What it does

### 🔍 Check a rent in five seconds
Type an area: "JVC", "marina", "Al Barsha South Fourth", even a typo. Add what you pay, if you like. You get:

- the **median yearly rent** for your kind of home, and how many contracts it comes from;
- **your verdict**: "21% above the median (AED 15,000 a year more)";
- **the same home for less nearby**: "Discovery Gardens, AED 60,000, 4.6 km away";
- **where the area ranks**: "dearer than 84% of 126 areas for a 1-bedroom".

One button for the next step (compare, save, set a reminder), and on a wide screen the map flies to the area by itself.

### 🗺️ Read the city at a glance
- **Prices are written on the map** in plain, easy type, on a card framed in its price colour: the thicker and deeper the blue frame, the dearer the area, from the palest blue (cheapest) to deep navy (dearest). The key has a value at every step and ignores the most extreme 5% at each end, so one palace-priced area can't wash out the rest.
- **Five views: Rent, Sale price, Yield, Hotels, Holiday homes.** One tap switches the labels, the colours, the key, the big number up top (with its unit in bold beside it: "AED A YEAR", "GROSS A YEAR (ROI)", "AED A NIGHT") and the side panel. On phones the views sit as chips above the map.
- **Metro and Tram** as an on/off layer, with a "near a station" filter and the rent near each station.
- **Buses and boats**: every RTA bus route and stop, and the abras, water buses and ferries, as two more layers; tap a stop for its buses, tap a number to see that route.
- **One Home picker** (all homes, studios, 1-bed, 2-bed… or flats of any size) and a rent range. That's all the filtering there is.
- **Labels never overlap**, and never hide under a button. Crowded areas merge into one label named after the busiest ("JLT + 12 areas"); zoom in and they come apart. Tests check this in English and Arabic, from 320 px phones to wide screens.
- **Official boundaries**, shaded in the same blues, and a big number up top: the typical rent of whatever is on screen, rolling like an odometer as you pan.
- **Honest about weak figures:** anything from fewer than 10 contracts, or a big jump not yet confirmed, is drawn dashed and says why.

### 📸 Drill down
Tap an area and the card is about the view you're in. **Rent:** every home size, contracts, the rent trend, with sales as one line. **Sale price:** the median sale price, a **24-month sale-price trend**, and sale price, annual rent and yield side by side. **Yield:** the gross yield and how it's made. Plus freely licensed **photos taken nearby** (each credited to its photographer) and one-tap links to **Google Maps, Street View and Google photos**. Where other sources disagree with ours by more than 15%, the card says so. On a phone it slides up from the bottom, figures first.

### 🏨 Hotels and holiday homes
- **What a night costs, area by area:** the typical price a night in each area's hotels, and separately in its holiday homes and serviced apartments, with the cheapest and dearest place, on the same blue scale.
- **Every place on the map:** solid dots have a price, hollow rings (from street level) aren't listed on booking sites. Tap one for its price, the nights it was checked for, its Tripadvisor rating, and links to Tripadvisor, Booking.com and Google Maps.
- **The side panel follows:** a nightly budget, the cheapest area, and a "prices by area" table you can sort and download.
- **A price history of our own,** one snapshot a day, so cards will show whether a night in an area is getting dearer.

### 📊 Market pages and more ways to look
- **Market stats** (`/stats/`): the busiest rental markets, the cheapest and dearest areas for a 1-bedroom, the best yields, sale price per sq ft month by month and what moved. Plus **every area** in one sortable table (`/areas/`), the **best yields** (`/yields/`), and pages for common searches like "1-bedroom under AED 60,000" (`/rents/…`). Each opens the map on the same search.
- **Follow the changes** with the RSS feed (`/feed.xml`): every publication's moves of 5% or more.
- **3D**: tilt the map and see the city's buildings raised, areas still shaded by price.
- **Peaks**: rent as a mountain range: the dearest areas rise as peaks, the cheapest sit at sea level, with the best-value areas ringed in gold.
- **Per sq ft** on the Sale price view, **AED, USD, EUR or GBP** for every figure, and a **Near** filter for areas close to a beach, golf course, park, mall or many schools.
- **In English and Arabic**: every market and area page has an Arabic version (`/ar/stats/`, `/ar/a/dubai-marina/`), and the map downloads its Arabic only when you choose it.

### 🔗 Share a card
Every area, hotel and holiday home card has **"Send this to someone: Share link"**: your phone's share sheet, or a line of text plus the link on your computer's clipboard. The link opens the map on that card, in the same view.

### 🌍 Made for Dubai
- **English or Arabic**, right to left, map place names included (or both at once with **A+ع**).
- **Near me** puts you on the map; your position never leaves your phone.
- **Every map has its own link:** copy the address and a friend sees the same homes, view and spot. Every area has its own page too (`/a/dubai-marina/`), which previews nicely in WhatsApp, and every card can be shared on its own.

### 💾 Remembers you, and only you
Save areas and watch their rent move. Get a calendar reminder before your lease renews. See what changed since your last visit. All of it stays **in your browser**: download it, import it, delete it.

### ♿ For everyone
Keyboard-friendly (map labels are real buttons), WCAG 2.1 AA contrast in light, dark and Arabic, checked automatically on every change. Dark mode follows your phone; motion switches off if your device asks.

---

## 🧭 Where the numbers come from

| Source | What it gives | Status |
|---|---|---|
| **[Dubai Data](https://datadubai.ae/)** (CC BY 4.0) | Medians per community and bedroom count, from DLD's Ejari feed, a few days behind | ✅ Main source, checked three times a day |
| **[Continental Club Property](https://continentalclub.ae/data-center/)** (CC BY 4.0) | The older districts Dubai Data skips: Deira, Bur Dubai, Karama, Al Qusais… (56 DLD areas) | ✅ In use, and a cross-check |
| **[dubairealestatedata.com](https://www.dubairealestatedata.com/rents)** (CC BY 4.0) | An independent second opinion | 🔁 Cross-check |
| **[Dubai Pulse / data.dubai](https://data.dubai) API** | Every contract: ranges, rent per m², new vs renewal, busiest buildings | ⏳ Code ready, waiting for the API key |
| **DLD's own open-data service** | The same, from the source | ⛔ Off until DLD agrees in writing |
| **[OpenStreetMap](https://www.openstreetmap.org/copyright)** (ODbL) | 798 hotels, hotel apartments, hostels and guest houses; Metro and Tram | ✅ Weekly |
| **[Xotelo](https://xotelo.com/)** (booking sites' rates on TripAdvisor) | Nightly prices for hotels and holiday homes, free, no key | ✅ About 150 places priced each pull |
| **[Google Hotels via SerpApi](https://serpapi.com/)** (free plan) | Prices where Xotelo has none, and vacation rentals | ⏳ Code ready, waiting for the free key |
| **Dubai's Department of Economy and Tourism** (via Dubai Pulse) | The official monthly average room rate | ⏳ Arrives with the Dubai Pulse key |

Right now: **534,699 contracts** from the last 12 months across **158 areas**, every one of them on the map, data to 19 Nov 2026; **374 hotels** and **53 holiday homes** with a current nightly price.

**House rules**
- **Not asking prices**, and not the RERA rental index (that's the allowed-increase calculator, a different thing).
- **Medians, never invented numbers.** No range published? The page says so instead of guessing.
- **Map points are area references, never buildings**, and never guessed: each comes from Dubai Municipality, a reviewed alias, or an OpenStreetMap place that passes the checks.
- **Big jumps are marked, not hidden**, until the next publication confirms them.
- **Hotel prices are samples,** not live booking prices: the lowest offer on booking sites for two nights two to three weeks ahead, kept for 10 days at most, and a place without a price says so.

---

## ⚙️ How it works

```
 cron-job.org ──► GitHub Actions, 06:17 · 14:17 · 22:17 UAE time
                   │
                   ├─ fetch    Dubai Data · Continental Club · cross-checks · Dubai Pulse (with a key)
                   │           hotel and holiday home prices (Xotelo; Google Hotels with a key)
                   ├─ place    Dubai Municipality points · reviewed aliases · checked OpenStreetMap results
                   ├─ build    areas, home sizes, outlines, trends · compare with our own rent history
                   │           a daily snapshot of each area's hotel and holiday home prices
                   ├─ check    data tests · never publish a catalog 30% smaller than the last
                   ├─ save     everything generated → the `data` branch, one dated commit per change
                   └─ deploy   GitHub Pages, only when something the page shows changed

 every 6 h ──► freshness check: old data or stopped pulls → GitHub emails the owner
```

A few things worth knowing:

- **It keeps its own history.** Dubai Data replaces its figures with each publication, so every build saves a small snapshot of every area's rents; hotel and holiday home prices get one a day. From mid-December 2026 the site can say "rent +6% since…" (and "+9% since…" for a night in a hotel), and from November 2027, year on year.
- **It's polite.** Each source is asked at most every 6 hours, a page a second, with an honest User-Agent. No CAPTCHA tricks, no listing portals, no VPNs. Every source's terms were read first.
- **It doesn't break quietly.** A bad run publishes nothing smaller than the last good one; a failed source shows up on the status page; stale data sends an email. Each pull writes a summary of what changed on its GitHub page.
- **It's tiny.** No build step, standard-library Python, libraries and fonts served from the site. Running cost: a free GitHub account.

The live **[data status page](https://jamalxcode.github.io/dubai_map/status/)** shows the latest pulls, what each source gave, what's in use, left out or waiting, the hotel figures, and any open alerts. It opens with **"Needs you"**: everything a person has to fix, each with what to do. The full story of a pull is in **[docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md)**.

---

## 🛠️ Run it yourself

```sh
scripts/data-branch.sh load        # fetch the published data into ./data
python3 collector/build.py         # rebuild the page files
python3 -m http.server 8080        # open http://localhost:8080
```

Three test suites, all run by GitHub on every push:

```sh
python3 -m unittest discover -s tests      # collectors, build, history, freshness rules, data checks
node --test tests/*.test.mjs               # rent-check logic, label placement, translations, page wiring
npm i --no-save playwright axe-core && node tests/ui-check.mjs
                                           # the real page in Chromium: 200+ checks, phones to desktop,
                                           # English and Arabic, plus accessibility (axe)
```

```
index.html              markup only
assets/app/atlas.js     the map, labels, filters, breakdowns, photos
assets/app/labels.js    label placement (pure, tested: no overlaps, nothing under a button)
assets/app/insights.js  rent-check logic (pure, tested)
assets/app/companion.js rent check, My areas, reminders, sharing
assets/app/i18n.js      English ⇄ Arabic
assets/app/status.js    the data status page (status/)
collector/              the Python jobs: fetch, place, build, history, hotels and their prices
scripts/                data branch, freshness check, area pages, share image
```

<details>
<summary><b>Owner's checklist</b></summary>

**The timer.** GitHub's own schedule runs hours late, so [cron-job.org](https://console.cron-job.org/) starts the pull (GitHub's schedule is the backup, and steps aside after a recent pull). It sends `POST https://api.github.com/repos/jamalxcode/dubai_map/actions/workflows/daily-ejari.yml/dispatches` with `{"ref":"main"}` at 02:17, 10:17 and 18:17 UTC, using a fine-grained token with **Actions: read and write**. Renew the token before it expires; the freshness check emails you if pulls stop.

**Contract-level data.** Request **`dld_rent_contracts-open-api`** on [data.dubai](https://data.dubai) (outside the UAE the sign-up page may refuse: write to help@digitaldubai.ae with the support ID it shows). Add the key and secret as the repository secrets `DUBAI_PULSE_KEY` and `DUBAI_PULSE_SECRET`, then run **Actions → Daily Ejari pull** with "force" ticked. The map switches to our own contracts once they cover 43 of the last 52 weeks.

**Manual import.** A rent-contracts CSV you're allowed to republish (Dubai Pulse's open CSV, for example) committed to `data/inbox/` is imported by the next pull and removed from the inbox.

**Placing an area.** Map points come from, in order: hand-checked points (`data/area_locations.csv`), Dubai Data's community table with checked points, Dubai Municipality's official communities (with reviewed spellings in `data/dld_dm_aliases.csv`), and, last, OpenStreetMap results that pass the checks. To place an area by hand, add a checked `lat,lng` to `data/area_locations.csv`.

**Hotel prices from Google.** Sign up at [serpapi.com](https://serpapi.com/) on the Free plan, copy the API key, and add it as the repository secret `SERPAPI_KEY`. Two searches a pull, at most 240 a month.

**Google Street View.** A Google Maps key (Maps Embed API and Maps JavaScript API) as the repository secret `GOOGLE_MAPS_EMBED_KEY`: photos in cards and Google's panorama in Street. Steps, restrictions and the daily cap: [API keys](docs/API_KEYS.md).

**A booking partner's live prices.** Join an affiliate programme (Travelpayouts, or Booking.com's via Awin or CJ), create a Dubai hotel widget, and put its link in `assets/app/partners.js`; hotel cards then offer "Show live prices".

**Your own domain.** Card links follow the site by themselves. Add a `CNAME` file and the DNS record, set `SITE_URL` for the area pages and the freshness check, and update the two `og:` addresses in `index.html`.

**Where things live.** `main` holds the code and hand-kept inputs; the `data` branch holds everything the jobs generate.
</details>

---

## 🗺️ What's next

- **Contract-level detail** (ranges, rent per m², new vs renewal, monthly trends) the day the Dubai Pulse key arrives.
- **Rent and hotel price change over time** from our own history, showing from mid-December.
- **Google Hotels prices** (the day the free SerpApi key is added) and **live booking prices** in hotel cards (with a partner widget).
- **Its own domain**, with every shared link following.
- **Street View inside the breakdown** (needs a free Google Maps Embed key), **Arabic area names**, and one day **other cities** in the region.

More ideas, and what each needs, in [docs/DESIGN_GOALS.md](docs/DESIGN_GOALS.md#ideas-on-the-table).

---

## 📚 The paper trail

Every decision is written down, conversation and all:

| | |
|---|---|
| [**Design goals**](docs/DESIGN_GOALS.md) | What it's for, and the ideas still on the table |
| [**Data pipeline**](docs/DATA_PIPELINE.md) | How the data is pulled, organised, stored and published |
| [**Business rules**](docs/BUSINESS_RULES.md) | Every data rule and threshold, and where it lives in the code |
| [**Interface rules**](docs/INTERFACE_RULES.md) | Layouts, colours, labels, motion: how it looks and behaves |
| [**Decisions**](docs/DECISIONS.md) | Why things are the way they are, pass by pass |
| [**Lessons learned**](docs/LESSONS_LEARNED.md) | Every pitfall hit, and the rule it left behind |
| [**API keys**](docs/API_KEYS.md) | Every outside service and key, and the steps to set each up |
| [**Conversation**](docs/CONVERSATION.md) | The owner's requests, in order, and the open items |
| [**CLAUDE.md**](CLAUDE.md) | Notes for coding sessions |

---

## ⚖️ Licences, credits and privacy

| What | Terms | How we comply |
|---|---|---|
| Dubai Data, Continental Club Property, dubairealestatedata.com | CC BY 4.0 | Credited on the page and in breakdowns, with a "reshaped" note |
| Ejari via Dubai Pulse | Dubai open-data licence | Credited |
| DLD open-data service | DLD website terms | Off until DLD agrees in writing |
| Dubai Municipality communities | DM open data | Credited |
| OpenStreetMap data | ODbL; [tile](https://operations.osmfoundation.org/policies/tiles/) and [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) policies | © OpenStreetMap contributors shown; Nominatim at 1 request a second, cached; OSM tiles only as a fallback |
| OpenFreeMap tiles | Free, attribution | "OpenFreeMap © OpenMapTiles" on the map |
| Wikimedia Commons photos | Each photo's licence (mostly CC BY-SA) | Author and licence on every photo, linked to its page |
| Google Maps, Street View, Images | [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), no key | Links only; nothing copied or embedded |
| Hotel and holiday home prices | Xotelo (free API); Google Hotels via SerpApi (free plan) | Credited on the map and in every card; samples, never presented as live booking prices |
| Leaflet · MapLibre · RTL text plugin | BSD-2 · BSD-3 · BSD-2 | Licences in `assets/vendor/` |
| Barlow fonts | SIL OFL 1.1 | Self-hosted, licence included |
| React Bits ideas (rolling counter, title) | MIT + Commons Clause | Our own versions, credited |

**Privacy.** No cookies, no accounts, nothing personal on any server. GoatCounter counts visits and which features are used (by name only, never what you type or where you are). Your saved areas and settings stay in your browser. The base map, photos (when you open a breakdown) and the counter load from their own servers, which see your IP address like any website.

*Independent tool. Not an official DLD or RERA service. Not legal or financial advice.*
