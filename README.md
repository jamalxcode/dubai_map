# 🗺️ Dubai Real Estate Atlas

> **What does everyone else actually pay?**
> Not what the listing says. Not what the agent hopes. What tenants *actually pay*, from rent contracts registered with the Dubai Land Department.

**👉 [jamalxcode.github.io/dubai_map](https://jamalxcode.github.io/dubai_map/)** · [بالعربية](https://jamalxcode.github.io/dubai_map/?lang=ar)

Every rent in Dubai is registered in **Ejari**. Half a million contracts a year, area by area, studio to villa. This site turns them into a map you can read in two seconds: the rent is written right on the map, in big letters, where the homes are. Then it helps with the question you came with: *am I paying too much?*

It is free, has no ads, needs no account, sets no cookies and runs on a few small files and three scheduled jobs a day.

---

## ✨ What you can do with it

### 🔍 Check a rent in five seconds
Type an area: "JVC", "marina", "Al Barsha South Fourth", or even a typo. Pick the home and, if you like, what you pay. You get:

- the **median yearly rent** for that home, and how many contracts it comes from;
- **your verdict:** "7% above the median (AED 5,000 a year more)", with the honest caveat that half pay more and half less;
- **the same home for less nearby:** "Dubai Sports City, AED 56,000, 2.3 km away";
- **where the area ranks:** "cheaper than 93% of areas for a 1-bedroom".

Then one clear next step: compare, save, set a reminder or see it on the map. On a wide screen the map flies to the area by itself.

### 🗺️ Read the city at a glance
- Every area shows its rent **as text**: `AED 65k · Jumeirah Village Circle`. No colour legends to decode.
- Every price wears the **price key**, from the palest blue (cheapest) to deep navy (dearest). A little **dial** and the label's shading show the rent as a share of the **top of the key**. The key ignores the most extreme 5% at each end, so one palace-priced area can't wash everything else out; those areas simply wear the deepest or palest blue.
- Too crowded to read? Labels **merge** into one oxblood label with the contract-weighted average. Zoom in and they come apart. Two neighbours that only just collide get their own labels, one moved aside with a thin line to its spot. **Labels never overlap.** Ever. A test checks.
- The big number up top is the **average rent of whatever is on screen**, rolling like an odometer as you pan.
- Areas are **shaded inside their official boundaries** in the same blues, so the city reads at a glance even zoomed out.
- Figures that rest on **fewer than 10 contracts** are drawn dashed and italic, so you know which ones to take with a pinch of salt.
- Switch the whole map between **Rent, Sale price and Yield** with one tap: the labels, the blues and the key all follow, each view with its own scale.
- Filter by **property type** (Homes, Flats, Studios), **unit**, rent range, or switch the labels to rent per m² or contract counts. Labour camps and whole-building leases never sneak into home rents.

### 📸 Drill down and see the place
Tap an area for its full breakdown: every bedroom count, contracts, yield, the DLD areas it covers, and a **24-month sale price trend** with the change on a year ago. Plus:

- **photos taken nearby**, freely licensed from Wikimedia Commons, each credited to its photographer. Tap one for full screen and swipe through;
- one-tap links to **Google Maps, Street View and Google photos** of the area.

On a phone the breakdown slides up from the bottom with the photos first, sized for everything down to a folded phone's cover screen.

### 🌍 English or Arabic, your choice
- The whole site in **Arabic**, right to left, from the **عربي** button, a `?lang=ar` link, or a phone set to Arabic.
- A separate button **on the map** sets the language of street and place names: **English · عربي · Both**. No more half-Arabic, half-English maps.

### 💾 It remembers you (and only you)
- **My areas:** save areas and see how their rent moves since you saved them.
- **Reminders in your own calendar:** "your lease renews in 60 days, check the market first", or a check-up every 3, 6 or 12 months. A calendar file, not an app or push spam.
- **"New figures since your last visit"**, only when the data actually moved.
- All of it stays **in your browser**. Download it, import it, delete it. Nothing is sent anywhere.

### 📤 Share it
**Share** on any result opens your phone's share sheet. Every area has its own page (`/a/dubai-marina/`) with all its figures, which search engines can find too; pasted into WhatsApp it previews as *"Dubai Marina rents: AED 90,000 a year for a 1-bedroom apartment"*.

### ♿ Works for everyone
Oxblood, ivory and gold leaf for everything you read; blues only for prices. Keyboard-friendly (map labels are real buttons), WCAG 2.1 AA contrast in light, dark and Arabic, checked automatically on every change. Dark mode follows your phone. Motion switches off if your device asks.

---

## 🧭 Where the numbers come from

| Source | What it gives us | Status |
|---|---|---|
| **[Dubai Data](https://datadubai.ae/)** (CC BY 4.0) | Medians per community and bedroom count, from DLD's Ejari feed, about 3 days behind | ✅ In use, read daily |
| **[Continental Club Property](https://continentalclub.ae/data-center/)** (CC BY 4.0) | The older districts Dubai Data skips: Deira, Bur Dubai, Karama, Al Qusais… (56 DLD areas) | ✅ In use |
| **[Dubai Pulse / data.dubai](https://data.dubai) API** (Dubai open-data licence) | Every contract, so ranges, trends, rent per m², new vs renewal, busiest buildings | ⏳ Ready; waiting for the free API key |
| **DLD's own open-data service** | The same, from the source | ⛔ Off until DLD agrees in writing |
| **[dubairealestatedata.com](https://www.dubairealestatedata.com/rents)** (CC BY 4.0) | An independent second opinion | 🔁 Cross-check only |
| **Manual CSV** in `data/inbox/` | Anything you're allowed to republish | 📥 Always imported |

Today: **534,143 contracts** from the last 12 months across **158 areas**, 99.5% of them on the map.

**Honesty rules.**
- **Not asking prices**, and not the RERA rental index (that's the allowed-increase calculator, a different thing).
- **Medians, never invented numbers.** When no range is published, the page says so instead of guessing.
- **Cross-checked:** if a second source suddenly disagrees, an alarm goes off.
- **Map points are area references, never buildings.** Every point comes from an official or checked source; nothing is placed by guesswork. The one area we can't place yet (Al Twar Fifth) is listed, not faked.

---

## ⚙️ The engine room

```
 cron-job.org ──► GitHub Actions (05:17 · 13:17 · 21:17 Kuwait)
                   │
                   ├─ fetch:  Dubai Data · Continental Club · Dubai Pulse (with a key)
                   ├─ place:  Dubai Municipality points, reviewed aliases, OpenStreetMap
                   ├─ check:  data tests · never publish a catalog 30% smaller than the last
                   ├─ save:   generated data → the `data` branch
                   └─ deploy: GitHub Pages (only when a page file changed)

 every 6 h ──► freshness check: stale data? stopped pulls? failed deploy? a source disagreeing?
              an area with 1,000+ contracts off the map? → GitHub emails the owner
```

**Polite by design.**
- **Sources:** each one is asked at most every 6 hours, with small paced pages, bounded retries and an honest User-Agent; then it stops until next time.
- **What we never do:** CAPTCHA pages, listing portals or VPNs.
- **Terms:** every source's terms and robots.txt were read first.

**Built to not break quietly.**
- **Schedules:** each workflow switches its own schedule back on (GitHub turns quiet ones off after 60 days).
- **Bad runs:** a failed pull republishes nothing smaller.
- **Missing pieces:** every missing piece trips the freshness check.

**Tiny and owned.**
- **One static page, no build step.**
- **Collectors:** standard-library Python, nothing to install.
- **Libraries and fonts** are served from the site itself.
- **Cost:** a free GitHub account.

### Under the hood

```
index.html              markup only
assets/app/atlas.js     the map, labels, filters, breakdowns, photos, phone sheet
assets/app/labels.js    label placement (pure, unit-tested: no two labels may overlap)
assets/app/insights.js  rent-check logic (pure, unit-tested)
assets/app/companion.js rent check, My areas, reminders, sharing
assets/app/i18n.js      English ⇄ Arabic
assets/vendor/          Leaflet, MapLibre, GSAP, Lenis (unchanged copies)
collector/              the Python jobs: fetch, place, build
scripts/                data-branch.sh, freshness check, share pages, share image
```

Built with [Leaflet](https://leafletjs.com/) and [MapLibre](https://maplibre.org/) on [OpenFreeMap](https://openfreemap.org) tiles (OpenStreetMap data), [GSAP](https://gsap.com/) and [Lenis](https://lenis.darkroom.engineering/) for motion, and our own plain-JS takes on two [React Bits](https://reactbits.dev/) effects (the rolling counter and the title).

---

## 🛠️ Run it yourself

```sh
scripts/data-branch.sh load        # fetch the published data into ./data
python3 collector/build.py         # rebuild the page files
python3 -m http.server 8080        # open http://localhost:8080
```

**Tests:** three suites, all run by GitHub on every push.

```sh
python3 -m unittest discover -s tests      # collectors, build, freshness rules, data checks
node --test tests/*.test.mjs               # rent-check logic, label placement, translations, page wiring
npm i --no-save playwright axe-core && node tests/ui-check.mjs
                                           # the real page in Chromium: 80+ checks from 320 px phones
                                           # to desktop, English and Arabic, plus WCAG checks (axe)
```

### Owner's checklist

<details>
<summary><b>⏰ The timer (cron-job.org)</b></summary>

GitHub's own schedules can run hours late, so [cron-job.org](https://console.cron-job.org/) starts the pull, with GitHub's schedule as a backup.

- **Token:** a fine-grained GitHub token for `jamalxcode/dubai_map`, permission **Actions: read and write**.
- **Jobs:** `POST https://api.github.com/repos/jamalxcode/dubai_map/actions/workflows/daily-ejari.yml/dispatches` with body `{"ref":"main"}` and headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `Content-Type: application/json`, at **02:17, 10:17 and 18:17 UTC**. GitHub answers `204`.
- **Renewal:** renew the token before it expires; the freshness check emails you if pulls stop.
</details>

<details>
<summary><b>🔑 Switching on contract-level data (the free Dubai Pulse key)</b></summary>

1. Sign up at **[data.dubai](https://data.dubai)** and request access to **`dld_rent_contracts-open-api`**. You get an API key and secret.
   - **Outside the UAE**, the sign-up page may show "The requested URL was rejected": write to help@digitaldubai.ae with the support ID it shows. The owner's request has been waiting since 16 Nov.
   - The API itself is reachable from anywhere.
2. Add them in **Settings → Secrets and variables → Actions** as `DUBAI_PULSE_KEY` and `DUBAI_PULSE_SECRET`.
3. Run **Actions → Daily Ejari pull** with "force" ticked. A `403` means the key works but the dataset isn't granted yet.

How the pull works:
- **Paging:** 500-row pages, 4 seconds apart, at most 120 pages.
- **Window:** contract start dates from 3 days back to 14 ahead, plus a rolling slice of the last 60 days for late registrations.
- **When it takes over:** the map switches to our own contracts once they cover 43 of the last 52 weeks (and 1,000 home contracts). Dropping a year of Dubai Pulse's CSV into `data/inbox/` gets there at once.
</details>

<details>
<summary><b>📥 No key yet? Manual import</b></summary>

Upload a CSV of Ejari contracts to `data/inbox/`. The next run imports it, deletes it from the inbox and rebuilds. Only use files you may republish:
- **Fine:** Dubai Pulse's open CSV.
- **Not without DLD's OK:** exports from DLD's website, which are personal use only.
</details>

<details>
<summary><b>📍 How areas get onto the map</b></summary>

First match wins:
1. **Hand-checked points:** `data/area_locations.csv`.
2. **Dubai Data's area → community table**, with checked points in `data/community_locations.csv`. A community without its own point, lying at least 90% inside one DLD area, takes that area's official point.
3. **Official Dubai Municipality communities:** `data/dm_communities.csv`, each point guaranteed inside its official boundary, plus reviewed DLD spellings in `data/dld_dm_aliases.csv`.
4. **OpenStreetMap, as a last resort:** a result counts only if it is inside Dubai, is a real place (not a shop or road) and its name matches, in English or as tagged.

**When it runs:** every Sunday; new areas are also looked up during the daily pull.
</details>

<details>
<summary><b>🌿 Where things live</b></summary>

- **`main`**: code, page, workflows, hand-kept inputs.
- **`data`**: everything the jobs generate (contract archive, source mirrors, map points, the JSON the page loads).

`scripts/data-branch.sh load` copies it into `./data`; `save` commits back, adding and updating only.
</details>

---

## 🗺️ What's next

- **Contract-level detail** (ranges, trends, rent per m², new vs renewal): the moment the Dubai Pulse key arrives.
- **Street View inside the breakdown:** needs a free Google Maps Embed key.
- **Building-level drill-down:** photos and Street View at registered projects.
- **Arabic area names**, **shaded community outlines**, and one day **other cities** in the region.

The full list, with what each idea needs, is in [docs/DESIGN_GOALS.md](docs/DESIGN_GOALS.md#ideas-on-the-table).

---

## 📚 The paper trail

How the site got here is written down, conversation and all:

| | |
|---|---|
| [**Design goals**](docs/DESIGN_GOALS.md) | What it's for, and the ideas still on the table |
| [**Business rules**](docs/BUSINESS_RULES.md) | Every data rule and threshold, with where it lives in the code |
| [**Interface rules**](docs/INTERFACE_RULES.md) | Layouts, colours, labels, sheets, motion: how it looks and behaves |
| [**Lessons learned**](docs/LESSONS_LEARNED.md) | Every pitfall we hit, and the rule it left behind |
| [**Decisions**](docs/DECISIONS.md) | Why things are the way they are, pass by pass |
| [**Conversation**](docs/CONVERSATION.md) | The owner's requests, in order, and the open items |
| [**CLAUDE.md**](CLAUDE.md) | Notes for coding sessions |

---

## ⚖️ Licences, credits and privacy

| What | Terms | How we comply |
|---|---|---|
| Dubai Data, Continental Club Property, dubairealestatedata.com | CC BY 4.0 | Credited on the page and in each breakdown; "reshaped" note |
| Ejari via Dubai Pulse | Dubai open-data licence | Source credited |
| DLD open-data service | DLD website terms (personal, noncommercial without written agreement) | Off until DLD agrees |
| Dubai Municipality communities | DM open data, credit DM | Credited |
| OpenStreetMap data (base map, some area points) | ODbL; [tile](https://operations.osmfoundation.org/policies/tiles/) and [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) policies | © OpenStreetMap contributors shown; Nominatim at 1 request/s, cached; OSM tiles only as a fallback |
| OpenFreeMap tiles | Free, no key, attribution | "OpenFreeMap © OpenMapTiles" shown on the map |
| Wikimedia Commons photos | Each photo's own licence (mostly CC BY-SA) | Author and licence on every photo, linked to its page |
| Google Maps / Street View / Images | [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), no key | Links only; nothing copied or embedded |
| Leaflet · MapLibre · RTL text plugin · Lenis | BSD-2 · BSD-3 · BSD-2 · MIT | Licences in `assets/vendor/` |
| GSAP | Standard "no charge" licence | Not used in a no-code tool |
| Barlow fonts | SIL OFL 1.1 | Self-hosted, licence included |
| React Bits ideas | MIT + Commons Clause | Our own versions, credited |

**Privacy.**
- **No cookies, no accounts, no personal data on any server.**
- **Visit counts:** GoatCounter counts visits, rent checks, saves and shares, with the area name, and stores nothing in your browser.
- **Your data stays with you:** your saved areas, checks and settings stay in your browser.
- **Third-party requests:** the base map, photos (only when you open a breakdown) and the counter load from their own servers, which see your IP address like any website.

*Independent tool. Not an official DLD or RERA service. Not legal or financial advice.*
