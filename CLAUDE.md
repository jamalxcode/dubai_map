# CLAUDE.md

Guidance for Claude Code sessions in this repository.

## Overview

Dubai Real Estate Atlas (https://jamalxcode.github.io/dubai_map/) maps what tenants actually pay in yearly rent across Dubai, area by area, from Ejari contracts registered with the Dubai Land Department. Python collectors run in GitHub Actions three times a day and publish small JSON files; the site is a static page (no build step) in English and Arabic.

Read before changing behaviour:
- `docs/BUSINESS_RULES.md`: every rule and threshold, with the file that applies it. Keep it in step with the code.
- `docs/INTERFACE_RULES.md`: how the page looks and behaves (breakpoints, colours, labels, sheets, motion). Keep it in step with the CSS and JS.
- `docs/LESSONS_LEARNED.md`: problems already hit and the rule each one left; read before repeating them, add new ones.
- `docs/DESIGN_GOALS.md`: the owner's goals; a change that conflicts with a goal needs the goal updated first.
- `docs/DECISIONS.md`: why things are the way they are (numbered passes); add a pass for each piece of work.
- `docs/CONVERSATION.md`: the owner's requests, in order, and the open items.

## Commands

```sh
scripts/data-branch.sh load                      # copy the published data (data branch) into ./data first
python3 -m unittest discover -s tests            # collectors, build, freshness rules, share pages, data checks
node --test tests/*.test.mjs                     # page wiring, rent-check logic, label placement, translations
node tests/ui-check.mjs                          # Chromium + axe: needs `npm i --no-save playwright axe-core` and loaded data
python3 collector/build.py                       # rebuild the page files from ./data
python3 scripts/share_pages.py _site             # area preview pages (deploy does this)
node scripts/share_image.mjs                     # redraw assets/share.png
python3 -m http.server 8080                      # view locally
```

Standard-library Python only (3.12 in CI). Node 22 for tests.

## Layout

- `collector/`: `fetch_ejari.py` (Dubai Pulse API, needs `DUBAI_PULSE_KEY`/`_SECRET`), `fetch_dld.py` (off until DLD permits), `fetch_datadubai.py` (Dubai Data, CC BY 4.0), `fetch_crosscheck.py` + `crosscheck.py` (independent sources), `ccp_areas.py` (older districts from Continental Club), `geocode_missing.py` (OpenStreetMap last resort), `build.py` → `kinds.py`, `places.py`, `output.py`; shared `net.py` (polite HTTP) and `state.py` (source states).
- `scripts/`: `data-branch.sh` (load/save the data branch), `check_fresh.py` (freshness alerts), `share_pages.py`, `share_image.mjs`.
- `index.html`: markup only. `assets/app/`: `atlas.js` + `atlas.css` (the page), `labels.js` (label placement, pure), `insights.js` (rent-check logic, pure) + `companion.js` + `companion.css` (rent check, My areas, reminders), `i18n.js` (Arabic). `assets/vendor/`: Leaflet, GSAP, Lenis, unchanged copies. `assets/fonts/`: Barlow.
- Workflows: `daily-ejari.yml` (the pull; cron-job.org starts it), `geocode.yml` (weekly), `pages.yml` (deploy), `tests.yml`, `freshness.yml` (every 6 h).

## Rules that bite

- **Generated data lives on the `data` branch**, never on `main`. Load it to run anything; the save step only adds and updates files.
- **Never publish a smaller catalog** than the last (30% guard in `output.py`); keep that safety.
- **Pushing to `main` deploys** the live site (and runs Tests). Work on a branch, run all three test suites, then merge.
- **Someone else may edit `index.html` in parallel**: fetch `origin/main` before editing and merge, don't overwrite.
- Asset links carry `?v=__BUILD__`; deploy replaces it. Keep the placeholder on new asset links.
- **Every visible string goes through `T()`** (`assets/app/i18n.js`) with an Arabic entry; fixed markup text gets a `data-t` key. `tests/i18n.test.mjs` fails on a missing key. Area names stay in English (Ejari names, what search matches); home types are stored in English and shown with `T.unit()`.
- CSS uses logical properties (`margin-inline-end`, `inset-inline-start`, `text-align:start`) so Arabic mirrors; the map container stays left to right.
- The base map is MapLibre vector tiles (OpenFreeMap) under Leaflet, loaded after the data; `NAME_FIELD` in `atlas.js` sets the language of its names. The classic OSM raster is the fallback; keep both paths working. Tests serve a local stub style, never the real service.
- Area breakdowns link out to Google (Maps URLs, no key) and show Wikimedia Commons photos with author and licence. Never copy or embed images from Google Images; tests stub Commons.
- At 860 px and below an area's breakdown is a bottom sheet: the Leaflet pop-up stays open but hidden (CSS) and its content is moved into `.areaSheet`; code that reads pop-up content must also work there (`.leaflet-popup-content` class is kept on the sheet body). Test narrow screens at 320 and 344 px.
- Label rules go in `labels.js` (no DOM) with a test in `tests/labels.test.mjs`; no two labels may overlap.
- Colours: the "golden note" palette (oxblood, ivory, gold leaf, espresso, warm gray) for text and surfaces, the six-step blue scale (`--b1`…`--b6`) for prices only, and every price label (single or group) takes its colour only from that scale; price labels stay light cards in dark mode too, so they match the key. Warm gray and gold leaf are too light for small text on ivory; use `--muted` and `--gold-ink`. Shaded label text was contrast-checked by hand against every price colour (axe can't measure gradients): keep those values or recheck 4.5:1.
- The price key runs from the 5th to the 95th percentile of what is shown (`scaleFor`); extremes keep the end colours. Dials and shading are a share of the top of the key (`LABEL.top`, `priceKey`), never a fixed amount.
- Keep the GoatCounter snippet in `index.html` (endpoint `https://salacompany.goatcounter.com/count`, shared with Flattery). Count features only, nothing personal.
- Don't guess coordinates: places come from Dubai Municipality, reviewed aliases or OpenStreetMap results that pass the checks.
- The DLD service stays off without DLD's written permission. No VPN, no CAPTCHA workarounds, no listing portals.
- Secrets only in GitHub Secrets. Keep the owner's name, email and support case details out of the repo; write "the owner".
- Shown times are Kuwait time.
- Branch deletion is not allowed from sessions; list stale branches in `docs/CONVERSATION.md` for the owner.
