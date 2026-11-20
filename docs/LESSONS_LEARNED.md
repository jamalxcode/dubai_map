# Dubai Real Estate Atlas: lessons learned

**Last updated:** 2026-11-20 (Kuwait time)

What went wrong or surprised us while building the site, what it taught, and the rule we now follow.
Grouped by topic; newest lessons are mixed in where they belong. The decisions themselves are in
[DECISIONS.md](DECISIONS.md).

## Data and sources

- **Check what a source's labels really mean.** Dubai Data calls every bedroom row "apartments", but in villa communities its 3+ bedroom rows are mostly villas (Al Furjan: 652 four-bedroom rentals, 68 four-bedroom sales). A cross-check gap that looked like a broken import was a definition difference. *Rule:* compare like with like (studios to 2 beds against an apartments-only source) and say on the page when a figure may mix home types.
- **One map, one measure.** When the older districts arrived with per-unit medians only, "All units" mixed two measures and coloured them together. *Rule:* the map starts on 1-bedroom, the one measure every area has; per-unit-only areas appear only with a unit picked.
- **Before guessing a location, look in the sources you already have.** Al Aryam and Al Waha Villas looked unplaceable, but Dubai Data records the DLD area each community lies in, and the Municipality has an official point for that area. OpenStreetMap independently agreed. *Rule:* never guess coordinates; a point comes from an official or checked source, or the area stays listed as unplaced and the freshness check says so.
- **One source, two shapes.** Dubai Data's weekly export has a `share_in_top_area` column; the files rebuilt from its live pages didn't, so the rule placing Al Aryam and Al Waha Villas worked in the test run (export files) and failed in the next daily pull (live files). *Rule:* when a rule depends on a column, check every path that writes that file, and test against the live shape.
- **Places in Dubai are often tagged in Arabic only.** OpenStreetMap had "فيلات الواحة" (Al Waha Villas) and the English name check rejected it. *Rule:* ask for and compare English names too.
- **A site may block a country, not a person.** data.dubai's sign-up page rejects visitors from outside the UAE (seen from Kuwait and from GitHub's US servers), while its API host is reachable. *Rule:* ask the publisher (we wrote to Digital Dubai support); no VPN, no workarounds.
- **Public APIs rate-limit shared addresses.** Wikimedia answered "too many requests" to the sandbox's shared address after two queries. Visitors' browsers each make one request when they open a breakdown, so the site is fine. *Rule:* fetch on demand, once per point per visit, and show nothing rather than an error when there is no answer.
- **Coverage varies.** Commons has many photos around the Marina and almost none in newer communities (Arjan returns racetrack diagrams). *Rule:* filter to real photos and let the Google links carry areas without free photos.

## Pipeline and workflows

- **The data branch save has two lists.** `PAGE_FILES` (which files trigger a redeploy) and `GENERATED` (which files are copied at all). `outlines.json` was added to the first only, so the build wrote it and the save left it behind. *Rule:* a new generated file goes in `GENERATED`; if the page loads it, in `PAGE_FILES` too.
- **New data fields arrive with the next build, not the merge.** The sale price view needed per-bedroom sale prices in the data; the page deployed at once, but the data branch still held the old files, so the view was empty and the browser check failed in CI until the data was rebuilt. *Rule:* when a change adds a data field, run a rebuild ("Place unplaced areas" rebuilds and redeploys) right after merging, then rerun Tests.
- **Run the real job after changing it.** Recording failed look-ups as rows without coordinates passed the unit tests but failed the data check that runs inside the job, which would have stopped the daily pull from publishing. It was caught only by running the placement job by hand. *Rule:* after changing a collector, run the workflow once and read its log.
- **Scheduled workflows don't always run.** The weekly geocode job ran once and then missed its schedule, and GitHub turns off quiet schedules after 60 days. *Rule:* every scheduled workflow re-enables itself; important steps also run inside the thrice-daily pull; a freshness check fails loudly when something stops.
- **Never let a bad run shrink the site.** *Rule:* a build more than 30% smaller than the last is not published; the old files stay live.
- **GitHub Actions details that bit:** `$GITHUB_OUTPUT` takes only `key=value` lines; a `run:` line containing `: ` needs a block scalar (`run: |`); `pipefail` with `tee` hid the real exit code; a save step that mirrored the folder deleted files it didn't regenerate (it now only adds and updates); a cherry-pick retry needs a committer identity.
- **Data on its own branch.** Generated data on `main` made history unreadable and triggered deploys. *Rule:* generated files live on the `data` branch; `main` holds code and hand-kept inputs.

## Map and labels

- **Merging hides places.** International City and Warsan vanished into group labels, which looked like missing data. *Rule:* small groups come apart when there is room, groups name their busiest area, and the browser check confirms International City is named at zoom 13.
- **Fitting the whole city on load merged labels into a few blobs.** Reverted. *Rule:* start at a fixed view where labels read; "All Dubai" is a button.
- **A "move it or merge it" loop with a round limit can starve.** Labels under the phone's view bar and credits stayed there because the first stuck label (a big group against the legend) never got free and used every round, and whatever was left over was returned as it was. *Rule:* every stuck label gets its turn; a merge only counts if the merged label is clear; the last resort is hiding, never drawing under a control. Check every view at phone widths, not just the opening one, and compare only the part of a label the map doesn't clip.
- **Controls appear late.** The language button appears only when the vector map loads, after labels were placed, so one label sat under it. *Rule:* re-place labels when a control appears; tests check no label sits under a control.
- **Picture tiles can't change language.** OpenStreetMap's tiles print names as tagged locally. *Rule:* vector tiles when names must be chosen; keep the picture tiles as a fallback.
- **Arabic on a WebGL map needs the right-to-left text plugin**, or letters come out unjoined and reversed.
- **Library versions matter.** MapLibre 6 ships only as ES modules; the Leaflet plugin needs the classic build, so we use MapLibre 5.

## Interface

- **A tint depends on what's under it.** A 30% blue tint on a dark card reads grey-brown, not blue. *Rule:* price labels are light cards in both themes, so a price looks the same as its key colour everywhere.

- **A brand colour on a price reads as a price.** Oxblood group labels looked like a seventh, off-key price colour. *Rule:* anything that shows a price takes its colour only from the price key; mark other differences (groups) with shape or outline.

- **Measure before redesigning.** Every layout change started from pixel measurements (where the filters end, how wide the pop-up is) and was checked the same way after. The phone pop-up was 351 px wide on 320 px screens; we only knew because we measured.
- **Browsers cache stylesheets across deploys.** The owner saw a new page with an old stylesheet (a squashed rent check). *Rule:* every page asset carries `?v=__BUILD__`.
- **`display:grid` beats the `hidden` attribute.** *Rule:* every component that sets `display` also has a `[hidden]{display:none}` rule.
- **Re-rendering a Leaflet pop-up wipes what was added to it.** `popup.update()` and `setContent` replace the DOM. *Rule:* add to pop-up content once, after other handlers (a microtask later), and keep references to elements rather than looking them up again.
- **A label can be merged when you fly to it.** "Marina" flew the map there, but its label was part of a group, so nothing opened. *Rule:* if the area's own label isn't on the map, open its breakdown at its point anyway.
- **Letter-by-letter animation and letter-spacing break Arabic** (letters must join). *Rule:* no split-text animation and no letter-spacing in Arabic.
- **Placeholders get cut off on narrow fields.** *Rule:* keep examples short; check at the narrowest width.
- **Never show made-up figures**, even in a share image. *Rule:* the share image shows features, not prices.
- **Don't copy from Google Images.** The photos belong to their photographers and Google's terms forbid it. *Rule:* link out to Google; show only freely licensed photos, credited.
- **Leaflet draws controls above pop-ups, and its pan margin is 5 px.** A pop-up opened near the buttons hid under them. *Rule:* set the pop-up's pan padding from the measured controls and legend, and test a pop-up opened beside them.
- **A table column for a secondary label costs the figures.** The DLD area column plus `nowrap` pushed the numbers out of view in the narrow side column. *Rule:* secondary labels go as a small second line; only numbers stay unwrapped.
- **Estimated label widths drift from drawn ones.** Character-count and canvas estimates missed the real fonts by 10+ px, so labels overlapped once names got longer. *Rule:* measure label boxes from a hidden label with the same styles, attached only while measuring (a probe left in the page was counted as a label by tests and keyboard focus).
- **Two controls for one job confuse more than they help.** Two language switches, two view pickers and two area searches looked alike and did nearly the same thing. *Rule:* one control per job; a second entry point only when its scope is visibly different (the table finder filters only the table).
- **`display:flex` beats the `hidden` attribute.** A `.field{display:flex}` rule kept a hidden field on screen. *Rule:* the page has `[hidden]{display:none!important}`.
- **Fixing labels after placement fails in crowded places.** Sliding edge labels back in after merging found no free spot, because neighbours had filled it. *Rule:* put constraints (inside the map) into placement from the start, so merging accounts for them.
- **A control's choice must not split in two.** The rent check's own Home list drifted from the map's picker after the controls were merged once. *Rule:* when two places show the same choice, they share one state (`setMapHome`, `atlas:home`).
- **Labels placed only on zoom drift under buttons after a pan.** *Rule:* place them again after every move, except while a breakdown is open (redrawing closes it).
- **A test that runs at one moment misses the others.** "No label under a button" was only checked after "All Dubai", while labels hid under the bar at page start on phones. *Rule:* check layout invariants at the start of every run, in every language.
- **Data spelling leaks into the interface.** All-capitals names from the source looked like shouting. *Rule:* normalise for display (`T.place`), never for search or storage.
- **Size rules for one screen width can fight later additions.** A phone rule fixed the zoom buttons' width, so a new "Near me" button was clipped. *Rule:* fix only the dimension that matters (height for touch); let width follow the content, and test that no button's text overflows.
- **Critique rounds reach diminishing returns.** After four rounds the findings were small. *Rule:* count which features are used, then cut or improve based on that.
- **Panning can't fit a card taller than the space.** Pan margins kept short breakdowns clear, but a full one was taller than the map's clear area, and photos made it grow after opening. *Rule:* cap a pop-up's height at the clear space, re-fit after any content that loads later, and test the tallest content on short windows.
- **A source that replaces its figures erases the past.** Dubai Data's medians are overwritten each publication. *Rule:* keep our own dated snapshot of what we publish; history can't be rebuilt later.
- **A total-size guard misses single bad figures.** *Rule:* also compare each figure with the previous publication, and mark big jumps visibly instead of silently publishing them.
- **The session can't always reach the live site.** The session's network refused github.io, so the live files couldn't be fetched directly. *Rule:* verify a deploy through the Actions API (each job's result) and the data branch's latest commit, and say plainly when the live page itself wasn't checked.
- **A new data field isn't live until the data is rebuilt.** *Rule:* after merging, start the pull (or "Place unplaced areas") by hand, wait for its deploy job, then rerun Tests on the rebuilt data branch.
- **Escaping inside heredoc scripts bites.** A `rstrip('\\n')` written through a shell heredoc stripped the wrong characters and left a stray blank line. *Rule:* in generated edit scripts prefer plain string replacement and check the diff.
- **A name rule must look at the right name.** Flagging areas by their DLD areas' names caught Downtown Jabal Ali, a residential community inside an industrial DLD area. *Rule:* check a heuristic against the real data before shipping it, and prefer the narrowest field that carries the meaning.
- **Anything shown on the page that changes every run means a deploy every run.** *Rule:* keep run-by-run bookkeeping (run logs) off the page files; report it in run summaries and alerts instead.
- **A workflow's new permission is only proven by running it.** The freshness check gained `issues: write`; a missing permission would only show when a real problem appeared. *Rule:* after changing a workflow's permissions or secrets, run it once by hand and read its result.
- **Ask the remote, not memory, what exists.** The open-items list named work branches to delete that had only ever existed locally. *Rule:* list remote branches (`git ls-remote --heads origin`) before writing them down for the owner.
- **Showing a problem to the owner fixes it faster than an email.** Al Twar Fifth sat in an email warning for days; one look at the status page's list brought the missing name. *Rule:* every issue only a person can fix appears on the status page under "Needs you", with what to do.
- **When automation runs out, ask for local knowledge.** Every source missed Al Twar Fifth; the owner knew it as "Al Twar 5", and one more search spelling placed it. *Rule:* for an area that can't be placed, ask for other names it goes by before asking for coordinates, and teach the look-up the pattern (here: ordinals as numbers) so it helps the next area too.
- **A bounding box is not a boundary.** "Dubai's box" took in Sharjah and Ajman, so 14% of the places were in another emirate. *Rule:* filter by official boundaries (Dubai Municipality's outlines) when a place must be in Dubai; use boxes only to narrow a search.
- **Crowd-sourced tags need a sense check.** OpenStreetMap's holiday-flat tag sat on staff housing and residential towers. *Rule:* check a new tag-based source by eye against the names before counting it, and filter what's clearly something else.
- **A number in a price's place gets read as a price.** *Rule:* a figure that isn't money says what it counts in the figure itself.
- **"Free" APIs can need a card to go live.** LiteAPI's free account only gives a sandbox key; the live key needs a payment card authorised for bookings made with the key. *Rule:* before recommending a source, check what its live access requires (card, fees, booking liability) and say so up front.
- **An owner's "no" is not an open task.** *Rule:* when the owner declines something, take it off "Needs you" and record the choice, so the status page doesn't keep asking.
- **A mock-up is a shape, not a palette.** The dial mock-ups were navy; the site is oxblood, ivory and gold with blue prices. *Rule:* take the layout and behaviour from a mock-up, the colours from the design system.
- **An SVG gradient on a growing arc stretches with it.** With the default bounding-box units, a short filled arc showed the whole light-to-dark range. *Rule:* give gauge gradients `userSpaceOnUse` so colour matches position.
- **A test can encode a request the owner later reverses.** The collaborator's status-page check expected the LiteAPI key under "Needs you"; after the owner skipped it, that check had to flip, not be deleted. *Rule:* when the owner changes course, update the tests that captured the old intent so they guard the new one.
- **Third-party widgets: load on request.** A partner's price panel brings its scripts and maybe cookies. *Rule:* nothing from a partner loads until the visitor taps for it, inside a sandboxed frame, and the page never stores the partner's prices.
- **Project-wide test rules catch new code too.** The tile-referrer rule failed on a new iframe's referrer policy. *Rule:* run the whole suite after adding any network-facing element, not just the new checks.
- **Partner widgets come in different shapes.** Some programmes give an https link or iframe, others a script snippet. *Rule:* build the slot around "load on tap, sandboxed, never stored", and adapt it to the code the owner actually brings rather than guessing the format in advance.

## Accessibility

- **Brand colours aren't always text colours.** The brand taupe and gold fail 4.5:1 as small text on cream. *Rule:* compute contrast before applying a palette; keep the brand shade for lines and fills and use a deeper shade of the same hue for text.

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

## Animating the map's size (18 Nov 2026)

- **Problem:** the first panel animation tweened the grid column and resized the map (Leaflet `invalidateSize` + MapLibre canvas) on every frame; on real screens the whole page jittered.
- **Rule:** never resize or re-lay out the map during an animation. Resize it once, then move things with transforms only (the panel slides over the map, the map slides by the distance its centre moves). Re-place labels after the motion ends. Measure: one map `resize` event per toggle.

## Counts that add up (18 Nov 2026)

- **Problem:** the first Hotels build passed hotel counts as label values but left each area's weight (`n`) as its contract count; `RentLabels.place` with `sum` adds the weights, so a group label read "25,413 hotels" when the city has 975.
- **Rule:** in a view where groups add up (`sum`), the weight is the thing being counted. The browser check now fails if any hotel label is larger than the total.

## Room for a card (18 Nov 2026)

- **Problem:** the map flew to an area using a guessed padding, then opened its breakdown; the real card was taller than the guess and hung from the middle of the area, so it covered it.
- **Rule:** measure, don't guess. Open the card, read its size (or the sheet's), then fit the map into the space that is actually free; refit when the card's content grows.

## Test keys give test prices (18 Nov 2026)

- **Problem:** LiteAPI's sandbox key answers with made-up rates that look real.
- **Rule:** a collector checks the answer says it is live (`sandbox` false) before saving anything a visitor will read as a fact; test answers stop the run and say which key to use.

## A source that only logs is invisible (19 Nov 2026)

- **Problem:** DET's hotel figures failed on every pull, and each pull waited about 4 minutes for the timeout, but the collector only wrote to the log, so the status page, the run log and "Needs you" never showed it. A review of "are hotel prices being pulled?" was the first time anyone saw it.
- **Rule:** every collector records its state in `state.json` (`state.set_status`) on every outcome, including "waiting for a key"; a source that changes monthly is asked at most daily with a short wait; tests point `store.DATA` at a temporary folder, so they never touch the loaded data.

## A "never shrink" guard can freeze stale data (19 Nov 2026)

- **Problem:** the hotel price collector refused to save when fewer hotels had a price than before, so prices that had aged out (older than 10 days) were kept forever, shown as current.
- **Rule:** guard against the cause of a bad shrink (here: far fewer places matched), not the count itself, when dropping old figures is intended; and let the page hide figures past their age on its own.

## Test data must pass the collector's own filters (19 Nov 2026)

- **Problem:** the holiday homes test built 400 fake hotels at latitude 25.45, outside Dubai's map box, so the collector dropped them, saw a "short list" and stopped; four tests failed for a reason that had nothing to do with what they checked.
- **Rule:** fake records sit inside every filter the code applies (map box, kinds, dates) unless the test is about that filter; when several tests fail at once, read the collector's log line first.

## Quotes inside translated text break the key check (19 Nov 2026)

- **Problem:** a status message written as `T("Read the pull's \"Hotel prices\" step…")` passed in the browser, but `tests/i18n.test.mjs` read the key with its backslashes and reported it untranslated.
- **Rule:** no escaped double quotes inside `T()` text; drop the quotes or use single quotes with `\'`, and run the page tests after adding strings.

## Tests that assume data is absent break when it arrives (19 Nov 2026)

- **Problem:** the DET dial test assumed no hotel had a price; once real prices were loaded into `./data`, the page (rightly) showed prices instead and the test failed.
- **Rule:** a browser check that depends on a file being missing stubs it as missing (`page.route(... 404)`); the same for a file it depends on being present.

## A check that ran is not a check that passed (19 Nov 2026)

- **Problem:** the hotel check workflow went green after the Xotelo change, but its log showed it never priced anything: OpenStreetMap hadn't answered, so there was no places list to price.
- **Rule:** read what a check printed, not just its colour; when its input was missing, prove the change another way (here, the real pull with the saved list) before reporting it works.

## A check that passes on nothing (19 Nov 2026)

- **Problem:** the nightly budget check set AED 300 a night; every stand-in price was higher, so no area was kept, and "every kept area is under budget" was true of an empty list. The check passed without testing anything.
- **Rule:** a filter check also asserts that something was kept and something dropped; derive the threshold from the data (here the median), never a fixed number.

## Read a pop-up after it has opened (19 Nov 2026)

- **Problem:** a check opened a second hotel's card and read `.leaflet-popup-content` at once; Leaflet was still fading the first card out, so the check read the old text and failed, though the page was right.
- **Rule:** close the open pop-up first, wait for the new one (a few hundred ms), and read the newest pop-up, not the first match.

## "The first priced place" changes when a source is added (19 Nov 2026)

- **Problem:** a card check used `HOTELS.find(h => h.price)`; once Google prices joined Xotelo's, the first priced hotel was a Google one, whose card has no "Average" line, and the check failed.
- **Rule:** a check picks its subject by the property it is about (`h.src === 'xotelo'`), not by order.

## A bot checkpoint is a "no", not a puzzle (19 Nov 2026)

- **Problem:** Best Time To Book was offered as a free price API, but every request (its docs and its API) got a "verify you are a browser" page (HTTP 429).
- **Rule:** a source that blocks automated requests is not usable; record it as such (decisions) and move on. No headless-browser or CAPTCHA workarounds (CLAUDE.md).

## Checking a source needs it allowed in the session (19 Nov 2026)

- **Problem:** the first attempts to read the sources' pages failed with "host not found": the session's network only reaches allowed hosts, so nothing could be judged.
- **Rule:** when a source must be checked, ask for its exact hosts to be allowed (the environment tools), then verify coverage, limits and terms from its own pages before building; GitHub's runners reach the open internet, so the collector itself doesn't need this.

## Leaflet sizes every link in its bars (20 Nov 2026)

- **Problem:** the Metro button, moved into the map's top-right bar, stayed 30 px wide with "Metro" spilling over the place-names button: the bar has Leaflet's `leaflet-bar` class, and `.leaflet-touch .leaflet-bar a` fixes every link's width and height.
- **Rule:** a link inside a Leaflet bar needs a rule at least as specific as Leaflet's (`.leaflet-touch .viewSw a.metroBtn`) setting `width:auto`; measure the element in the browser rather than trusting the stylesheet.

## A section in a centred column shrinks to its content (20 Nov 2026)

- **Problem:** on phones the area check sat narrow and centred: its parent (`.pane`, `display:contents`) left it a flex child of a centred column, so it took its content's width and auto margins.
- **Rule:** a full-width section on phones gets `align-self:stretch; width:100%`; when something looks centred, measure its box and its parent's display before adding padding.

## Duplicate translation keys win silently (20 Nov 2026)

- **Problem:** twice a new string ("Dubai Real Estate Atlas", "median sale price AED {v}") was added to `i18n.js` though it already existed; the object literal keeps the last one, so an older translation was quietly replaced and the tests stayed green.
- **Rule:** before adding a key, `grep -c "'<key>':" assets/app/i18n.js`; after adding, the count must be 1.

## A Pages deploy can fail on its own (20 Nov 2026)

- **Problem:** a merge's Deploy run failed in GitHub's `deploy-pages` step though Tests passed and the build step succeeded.
- **Rule:** when only the publishing step fails, re-run the failed job once before looking for a cause in the code; say so in the report.

## A rolling counter's text is every digit (20 Nov 2026)

- **Problem:** a check read the contracts figure's `textContent` and got "1.2e58": the odometer draws a strip of digits for each place.
- **Rule:** tests read a counter's `aria-label` (the number as spoken), never its text.

## A link that opens late data must wait for it (20 Nov 2026)

- **Problem:** a shared hotel link has to open a card whose data (hotels, prices) loads after the page; opening it at start found nothing, and the check itself first ran before prices were in.
- **Rule:** `openFromURL` retries for up to 12 s and gives up quietly; checks wait for the data (`waitForFunction`) before asserting; a consumed `?open=` is dropped from the address so it doesn't reopen later.

## An overlay on the map must beat Leaflet's controls (20 Nov 2026)

- **Problem:** the 3D view covered the map at z-index 800, but Leaflet's zoom bar (z-index 1000) stayed on top of its Back to 2D button, so it couldn't be clicked; only a browser click (not a scripted one) showed it.
- **Rule:** anything drawn over `.mapWrap` goes above 1000, and checks press its buttons with a real click (`page.click`), not `el.click()`.
