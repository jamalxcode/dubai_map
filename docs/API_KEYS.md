# API keys and outside services

Every outside service the atlas uses: what it's for, whether it needs a key, where the key lives, what it costs, and the steps the owner follows to set it up. No key or secret value is ever written in the repository or in a conversation; they live in GitHub Secrets (repo → Settings → Secrets and variables → Actions).

## At a glance

| Service | For | Key | Where it lives | Cost | Status |
|---|---|---|---|---|---|
| Google Maps Platform: Maps Embed API | Street View photo in an area's card | yes | secret `GOOGLE_MAPS_EMBED_KEY`, written into `assets/app/keys.js` at deploy | no charge | on since 29 Nov 2026 |
| Google Maps Platform: Maps JavaScript API (Street View panorama) | Street's main view: Google's panorama with the price signs over it | same key | same | 5,000 panorama loads a month free, then $14 per 1,000 (Google's list, 29 Nov 2026) | on since 29 Nov 2026; daily cap still to set |
| SerpApi (Google Hotels) | hotel and holiday home prices Xotelo lacks | yes | secret `SERPAPI_KEY` (collectors only, never in the page) | free plan (we use at most 240 searches a month) | on since 21 Nov 2026 |
| Dubai Pulse (DLD rent contracts API) | contract-level rents | key and secret | secrets `DUBAI_PULSE_KEY`, `DUBAI_PULSE_SECRET` | free | waiting on Digital Dubai (open item 1) |
| GitHub token for cron-job.org | starts the daily pull three times a day | fine-grained token (Actions: read and write) | in cron-job.org only | free | on; renew before it expires |
| Booking partner widget | live hotel prices on a visitor's dates | widget link, not a secret | `assets/app/partners.js` | affiliate | waiting on the owner (open item 5c) |
| Xotelo, Frankfurter (ECB rates), OpenFreeMap, OpenStreetMap (Overpass, Nominatim), Wikimedia Commons, the Mobility Database (RTA's GTFS), Dubai Data, Continental Club | prices, rates, base map, places, photos, buses and boats, rents | none | n/a | free | on |
| GoatCounter | feature counts (nothing personal) | none (public endpoint) | `index.html` | free | on |

Not used, by the owner's choice: LiteAPI (its live key needs a payment card). DLD's own service stays off without DLD's written permission.

## The general process

1. **Get the key** from the service, signed in as the owner.
2. **Restrict it** wherever the service allows: to this site's address (browser keys) and to the APIs it needs.
3. **Add it as a repository secret** (exact name from the table above). Nobody pastes keys in chat or commits them.
4. **Tell the session "added"**: code reads the secret in the workflow (`secrets.NAME`), never from the repo. A key the page uses in the open (Google's) is written into the deployed copy of `assets/app/keys.js` at deploy; locally and in tests the placeholder stays, so the feature stays off and its outside links remain.
5. **Check the logs, not the value:** the workflow prints whether the key was found (for Google: "Street View photos on" in the deploy's "Assemble site" step), never the key itself.
6. **Give the feature a fallback** that takes over by itself if the key is missing, refused or over its limit, and a cap where the service can bill.

## Google Maps Platform, step by step (what the owner did, 29 Nov 2026)

### 1. Project, billing and the key
1. https://console.cloud.google.com, signed in as the owner; project "My First Project".
2. **Billing**: link a billing account (Google requires one even for the free Embed API).
3. **APIs & Services → Library**: enable **Maps Embed API**.
4. **APIs & Services → Credentials → Create credentials → API key**.

### 2. The repository secret
1. GitHub, signed in as **jamalxcode** (the repository owner; other accounts, and the GitHub phone app, can't open Settings).
2. https://github.com/jamalxcode/dubai_map → **Settings** → left menu, under **Security and quality**: **Secrets and variables → Actions**.
3. **New repository secret**: name `GOOGLE_MAPS_EMBED_KEY`, the key as the value → **Add secret**.
4. The next deploy (any push to `main`) writes it into the page.

### 3. Street View as Street's main view (Maps JavaScript API)
1. Google Cloud → search **Maps JavaScript API** → **Enable** (or Google Maps Platform → APIs & Services, filter Maps).
2. **Keys & Credentials** → the key → **API restrictions**: Maps JavaScript API and Maps Embed API ticked (the owner kept the other Maps APIs ticked too; the website restriction stops other sites using the key). → **OK**.
3. **Website restrictions** → **Add**, both lines:
   - `https://jamalxcode.github.io/dubai_map/*`
   - `https://jamalxcode.github.io/*` (Google's script sends only the site's host, not the `/dubai_map/` path; this line covers only the owner's own GitHub sites)
4. **Save**, wait about 5 minutes, reload the map, press **Street**.

### 4. Cap the cost (recommended)
- **APIs & Services → Maps JavaScript API → Quotas**: set requests per day to about **150** (about 4,500 a month, inside the free 5,000).
- **Billing → Budgets & alerts**: a small budget (for example $1) emails the owner if anything is ever charged.
- Past the cap Google refuses, and Street shows the drawn street by itself.

### What counts
- Maps Embed API (photos in cards): no charge.
- Maps JavaScript API: one Dynamic Street View load each time Street starts on Google. Walking inside it, turning, and going to another area from the list or a sign reuse the same panorama: no new load.

### If something looks wrong
| You see | Meaning | Fix |
|---|---|---|
| Street shows the drawn street with "Google refused the key" and a code in brackets | Google refused the key (`gm_authFailure`); the code says why | see the codes below; then press **Try Google again** or reopen Street |
| ... `RefererNotAllowedMapError` | the page's address isn't in the key's website list | add `https://jamalxcode.github.io/*` and `https://jamalxcode.github.io/dubai_map/*`, Save, wait 5 minutes |
| ... `ApiNotActivatedMapError` or `ApiTargetBlockedMapError` | Maps JavaScript API isn't enabled, or isn't ticked on the key | enable it in the Library and tick it under API restrictions |
| ... `OverQuotaMapError` | the daily cap (Quotas) or the month's allowance is used up | wait for the next day, or raise the cap a little |
| ... `BillingNotEnabledMapError` | the project's billing account is off | relink billing under Billing |
| ... `InvalidKeyMapError` or `ExpiredKeyMapError` | the secret holds a wrong or deleted key | create a key, update the secret `GOOGLE_MAPS_EMBED_KEY`, push any change to redeploy |
| "Google Street View didn't load" | the script didn't arrive (network, blocker) | reload; the drawn street works meanwhile |
| "Google has no Street View near here" | no photo within 600 m | press **Google Street View** after walking to a street, or pick another area |
| A card's photo box shows "referer not allowed" | the website list doesn't cover the page | check both website lines above |
| A card's photo box is empty | Google has no photo at that point | nothing to fix |
| No "Street View photo" in cards | the secret is missing or misnamed | check the secret's name; the deploy log says "Street View photos off" |

### If the site moves to its own domain
Add the new address (`https://<domain>/*`) to the key's website restrictions before switching, or the photos and the panorama stop.

## Where the code is
- `assets/app/keys.js`: the placeholder `__GMAPS_EMBED_KEY__`; never commit a real key.
- `.github/workflows/pages.yml`, "Assemble site": replaces the placeholder from the secret and logs on or off.
- `assets/app/atlas.js`: `svKey()`, `svFrame()` (the card's photo; the frame sends the full page address).
- `assets/app/street.js`: `loadGoogle()`, `startGoogle()`, `gm_authFailure`, `goTo()` (Google's panorama and the fallback to the drawn street).
- `tests/ui-check.mjs`: stand-ins for the key, the Embed page and the Maps JavaScript API; tests never call Google.
