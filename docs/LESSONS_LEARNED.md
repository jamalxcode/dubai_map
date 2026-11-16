# Dubai Rent Atlas: lessons learned

**Last updated:** 2026-11-16 (Kuwait time)

What went wrong or surprised us while building the site, what it taught, and the rule we now follow.
Grouped by topic; newest lessons are mixed in where they belong. The decisions themselves are in
[DECISIONS.md](DECISIONS.md).

## Data and sources

- **Check what a source's labels really mean.** Dubai Data calls every bedroom row "apartments", but in villa communities its 3+ bedroom rows are mostly villas (Al Furjan: 652 four-bedroom rentals, 68 four-bedroom sales). A cross-check gap that looked like a broken import was a definition difference. *Rule:* compare like with like (studios to 2 beds against an apartments-only source) and say on the page when a figure may mix home types.
- **One map, one measure.** When the older districts arrived with per-unit medians only, "All units" mixed two measures and coloured them together. *Rule:* the map starts on 1-bedroom, the one measure every area has; per-unit-only areas appear only with a unit picked.
- **Before guessing a location, look in the sources you already have.** Al Aryam and Al Waha Villas looked unplaceable, but Dubai Data records the DLD area each community lies in, and the Municipality has an official point for that area. OpenStreetMap independently agreed. *Rule:* never guess coordinates; a point comes from an official or checked source, or the area stays listed as unplaced and the freshness check says so.
- **Places in Dubai are often tagged in Arabic only.** OpenStreetMap had "فيلات الواحة" (Al Waha Villas) and the English name check rejected it. *Rule:* ask for and compare English names too.
- **A site may block a country, not a person.** data.dubai's sign-up page rejects visitors from outside the UAE (seen from Kuwait and from GitHub's US servers), while its API host is reachable. *Rule:* ask the publisher (we wrote to Digital Dubai support); no VPN, no workarounds.
- **Public APIs rate-limit shared addresses.** Wikimedia answered "too many requests" to the sandbox's shared address after two queries. Visitors' browsers each make one request when they open a breakdown, so the site is fine. *Rule:* fetch on demand, once per point per visit, and show nothing rather than an error when there is no answer.
- **Coverage varies.** Commons has many photos around the Marina and almost none in newer communities (Arjan returns racetrack diagrams). *Rule:* filter to real photos and let the Google links carry areas without free photos.

## Pipeline and workflows

- **Run the real job after changing it.** Recording failed look-ups as rows without coordinates passed the unit tests but failed the data check that runs inside the job, which would have stopped the daily pull from publishing. It was caught only by running the placement job by hand. *Rule:* after changing a collector, run the workflow once and read its log.
- **Scheduled workflows don't always run.** The weekly geocode job ran once and then missed its schedule, and GitHub turns off quiet schedules after 60 days. *Rule:* every scheduled workflow re-enables itself; important steps also run inside the thrice-daily pull; a freshness check fails loudly when something stops.
- **Never let a bad run shrink the site.** *Rule:* a build more than 30% smaller than the last is not published; the old files stay live.
- **GitHub Actions details that bit:** `$GITHUB_OUTPUT` takes only `key=value` lines; a `run:` line containing `: ` needs a block scalar (`run: |`); `pipefail` with `tee` hid the real exit code; a save step that mirrored the folder deleted files it didn't regenerate (it now only adds and updates); a cherry-pick retry needs a committer identity.
- **Data on its own branch.** Generated data on `main` made history unreadable and triggered deploys. *Rule:* generated files live on the `data` branch; `main` holds code and hand-kept inputs.

## Map and labels

- **Merging hides places.** International City and Warsan vanished into group labels, which looked like missing data. *Rule:* small groups come apart when there is room, groups name their busiest area, and the browser check confirms International City is named at zoom 13.
- **Fitting the whole city on load merged labels into a few blobs.** Reverted. *Rule:* start at a fixed view where labels read; "All Dubai" is a button.
- **Controls appear late.** The language button appears only when the vector map loads, after labels were placed, so one label sat under it. *Rule:* re-place labels when a control appears; tests check no label sits under a control.
- **Picture tiles can't change language.** OpenStreetMap's tiles print names as tagged locally. *Rule:* vector tiles when names must be chosen; keep the picture tiles as a fallback.
- **Arabic on a WebGL map needs the right-to-left text plugin**, or letters come out unjoined and reversed.
- **Library versions matter.** MapLibre 6 ships only as ES modules; the Leaflet plugin needs the classic build, so we use MapLibre 5.

## Interface

- **Measure before redesigning.** Every layout change started from pixel measurements (where the filters end, how wide the pop-up is) and was checked the same way after. The phone pop-up was 351 px wide on 320 px screens; we only knew because we measured.
- **Browsers cache stylesheets across deploys.** The owner saw a new page with an old stylesheet (a squashed rent check). *Rule:* every page asset carries `?v=__BUILD__`.
- **`display:grid` beats the `hidden` attribute.** *Rule:* every component that sets `display` also has a `[hidden]{display:none}` rule.
- **Re-rendering a Leaflet pop-up wipes what was added to it.** `popup.update()` and `setContent` replace the DOM. *Rule:* add to pop-up content once, after other handlers (a microtask later), and keep references to elements rather than looking them up again.
- **A label can be merged when you fly to it.** "Marina" flew the map there, but its label was part of a group, so nothing opened. *Rule:* if the area's own label isn't on the map, open its breakdown at its point anyway.
- **Letter-by-letter animation and letter-spacing break Arabic** (letters must join). *Rule:* no split-text animation and no letter-spacing in Arabic.
- **Placeholders get cut off on narrow fields.** *Rule:* keep examples short; check at the narrowest width.
- **Never show made-up figures**, even in a share image. *Rule:* the share image shows features, not prices.
- **Don't copy from Google Images.** The photos belong to their photographers and Google's terms forbid it. *Rule:* link out to Google; show only freely licensed photos, credited.

## Accessibility

- **axe found what we missed:** a label's spoken name not matching its visible text, a table that couldn't be scrolled by keyboard, a low-contrast dark-mode button. *Rule:* axe on every push, in light, dark, Arabic and the narrowest screens.
- **axe can't measure text on a gradient.** *Rule:* contrast on shaded labels is checked by hand and the colours are recorded.

## Testing

- **Don't depend on outside services in tests.** Tests serve a stand-in map style, stand-in Commons answers and a tiny image, so they test our code, not someone else's uptime.
- **Animations need time in tests.** Leaflet fades a pop-up out over about 200 ms before removing it. *Rule:* wait for the state, or past the animation, before checking.
- **Test helpers can shadow framework names.** A unittest helper called `run` replaced unittest's own method.
- **A sandbox isn't the internet.** The session's network blocks most hosts, Node's `fetch` ignores the proxy that Chromium uses, and Wikimedia rate-limits the shared address. *Rule:* ask for the exact host when a real answer is needed (the owner approves each), otherwise use stubs; never present a sandbox limit as a site problem.

## Working practice

- **A request is finished when it is merged, deployed and checked live** (Tests and Deploy green), and recorded in the docs.
- **Chained shell commands stop at the first failure.** A failed `git checkout -b` skipped the edits after it; the commit then had nothing in it. *Rule:* check that a change was actually written before committing.
- **Some actions belong to the owner.** Deleting branches and anything irreversible are not done from a session; they are listed for the owner instead.
- **Keep personal details out of a public repo:** write "the owner", never names, emails or support case numbers.
