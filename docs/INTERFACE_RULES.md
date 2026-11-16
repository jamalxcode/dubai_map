# Dubai Rent Atlas: interface rules

**Last updated:** 2026-11-16 (Kuwait time)

How the page looks and behaves, with the values in force and the file that applies them. Data rules
are in [BUSINESS_RULES.md](BUSINESS_RULES.md); the goals behind both are in
[DESIGN_GOALS.md](DESIGN_GOALS.md). Keep this file in step with `assets/app/*.css` and `*.js`.

## 1. Principles

- **The rent is the interface.** Rents are written as text on the map; colour, the dial and shading only repeat what the text says.
- **One core action, one next step.** "Check a rent" is first on the page; each result offers one primary button, everything else is a plain link.
- **Big and bold, but no wasted scrolling.** On wide screens the title, rent check and filters fit the first screen.
- **Honest wording.** Say what a figure is ("median", "typical", "no range yet"), where it comes from and how old it is. Never "real-time", never invented examples.
- **Plain words.** Short sentences, no jargon on the page ("the middle half of tenants pay…", not "IQR").

## 2. Layout and breakpoints

| Width | Layout | Where |
|---|---|---|
| 1,100 px and up | Two panes: inputs scroll on the left (`minmax(420px,34vw)`), the map fills the window height on the right and stays put | `atlas.css` |
| 861–1,099 px | One column: title, rent check, filters, map, figures, table | `atlas.css` |
| 860 px and below (phones, fold phones open or closed) | One column, map in the top 60% of the first screen; filters in a sheet behind the **Filters** button; the rent check folds to one line until tapped; area breakdowns as a bottom sheet | `atlas.css`, `companion.css`, `atlas.js` |
| 400 px and below | Smaller title (30 px) and map buttons (32 px); photos 80% of the sheet width | `atlas.css` |
| 320 px | The narrowest screen supported and tested (no sideways scrolling, the sheet fits) | `tests/ui-check.mjs` |

- No sideways scrolling at any width. Tables scroll inside their own box (keyboard-focusable).
- The order of content below 1,100 px follows the reading order, kept with `display:contents` and `order`.

## 3. Colour and type

- **Palette:** Dubai road signs. Sign blue `#1546A0` (header, primary buttons, dearest band), ink `#0E3478`, caution yellow `#F2B705` (stale-data warning only). Tokens on `:root`, redefined for dark mode (`data-theme="dark"`).
- **Price bands:** five blues, light to dear in light mode, dearer is brighter at night. Bands cut at the 20/40/60/80th percentiles of what is shown.
- **Dark mode:** follows the device until the visitor picks; remembered (`theme`). The base map switches with it: OpenFreeMap **Liberty** (detailed, in colour) by day, OpenFreeMap **Dark** lifted to the site's night colours (`tuneDark` in atlas.js) at night. The CSS invert filter is only for the OpenStreetMap fallback tiles.
- **Contrast:** WCAG AA (4.5:1) in light, dark and Arabic, checked by axe on every push. Text on shaded labels uses colours checked by hand (`#46515B`, `#fff`, `#C5CED8`), because axe can't measure text on a gradient.
- **Type:** Barlow (text) and Barlow Condensed (headings, figures), served from the site. Arabic letters come from the device's Arabic font; numbers stay in Barlow. No letter-spacing in Arabic (it breaks letter joining).
- **Figures:** tabular numbers; AED written before the amount; Western digits in both languages.

## 4. Map labels

- Each area: `AED 65k` plus the area name, with a dial (share of AED 100k) and the box shaded from the inline start by the same share.
- Labels never overlap. Overlapping labels merge into a blue group label (contract-weighted average, "avg"); groups of 2–3 name their busiest area ("Al Barsha First +1"), bigger ones count ("12 areas").
- A group of up to 3 comes apart when each label fits at its point or just beside it; a moved label has a thin line to a dot at its point.
- Labels keep clear of the zoom buttons, the language button and the legend, and are re-placed when a control appears.
- Labels are keyboard buttons: Tab to one, Enter or Space opens it; the spoken name is the visible text.
- Clicking a group zooms in until it splits; at full zoom it lists its areas.
- Rules live in `assets/app/labels.js` (no DOM) and are unit-tested.

## 5. Map controls

- Top left: zoom + and −, **All Dubai** (back to the whole city). 40 px at full size, 36 px at 860 px and below, 32 px at 400 px and below.
- Top right: base map language, **English · عربي · Both**, shown only when the vector map loaded; starts in the page's language; remembered (`mapLang`).
- Bottom left: legend (what the labels show, the band ramp, the dial note).
- The map container stays left to right in Arabic (it is a picture of the world); its legend and breakdowns read right to left.

## 6. The rent check

- Fields: area (search with nicknames, DLD names and typos), home, optional yearly rent, **Check**.
- Result: what was checked, the big figure with its dial, what it is and how many contracts, the range or "no range yet", the verdict if a rent was entered, up to four findings, one primary button and plain links (Save · Show on the map · Share · Dubai Data page). The links wrap as one group, never leaving a dangling separator.
- Wide screens: a check flies the map to the area (zoom 14) and opens its breakdown. Narrower screens: "Show on the map" does it.
- Remembered in the browser only: the last check, recent checks, saved areas, the map view.

## 7. Area breakdown (drilling down)

- **Content order:** the area's name; photos taken nearby and the Google links (Maps, Street View, Photos); the median and contracts; range; rent per m²; yield; unit table; busiest buildings; sources; "Check a rent here".
- **Wide screens:** a Leaflet pop-up, up to 320 px wide.
- **860 px and below:** a bottom sheet, full width (capped at 640 px, centred), at most 80% of the screen high, scrolling on its own; photos and links move to the top; links become 40 px chips. Closes with ×, swipe down, Escape or a tap on the map. The pop-up stays open but hidden and its content moves into the sheet, so everything that hooks into pop-ups works in both.
- **Photos:** up to 4, a grid on wide screens, a swipeable row on phones (about 72–80% of the width, 150–170 px high). Each shows its author and licence. A photo that fails to load disappears; no photos means no strip.
- **Photo viewer (all screens):** tap a photo for a full-screen view at 960 px with title, author, licence and a link to its Commons page; arrows, swipes and the arrow keys move between photos (direction follows the language); Escape or × closes it and focus returns to the photo.

## 8. Language and direction

- English and Arabic. Chosen by a `?lang=` link, else the saved choice, else the device; set before first paint to avoid a flash in the wrong direction.
- **Language switch** (header, next to the theme button): **English | عربي** both always shown, the current one filled white; tapping the other reloads the page in that language and remembers it (`lang`).
- Every visible text goes through `T()`; fixed markup text has a `data-t` key. A missing translation shows English, and the tests fail on it.
- CSS uses logical properties (`margin-inline-end`, `inset-inline-start`, `text-align:start`) so the page mirrors without separate rules.
- Area names stay as registered in Ejari (English); home types are shown in Arabic but stored in English.
- No letter-by-letter animation in Arabic.

## 9. Motion

- One opening moment: the title sets in letter by letter (English only), the headline number rolls up.
- Labels fade in after a filter change; zooming redraws instantly.
- Sheets slide up; the map flies to a checked area.
- `prefers-reduced-motion` turns all of it off (jumps instead of flights, no animation).

## 10. Feedback and states

- Loading: "Loading rents…"; a shimmer where photos will appear.
- Errors offer a way forward: "Try again", suggestions for an unknown area, the units that have figures.
- Stale data: a yellow road-sign warning when the data is more than 7 days behind; hideable for the visit.
- Empty: a message that says what to change ("Clear the search or widen the rent range").

## 11. Accessibility

- WCAG 2.1 AA, checked with axe on desktop, phone, dark mode, Arabic, and 320/344 px with the sheet open.
- Everything works by keyboard: labels, sheets, the photo viewer; focus is visible and returns where it came from.
- Touch targets at least 32 px (40 px for sheet controls and chips).
- Live regions announce the headline number and the rent check result.

## 12. Assets

- Page scripts and styles carry `?v=__BUILD__`, replaced with the commit on deploy, so a browser never mixes a new page with old files.
- Libraries and fonts are served from the site (`assets/vendor/`, `assets/fonts/`). MapLibre (1 MB) loads after the rent data.
