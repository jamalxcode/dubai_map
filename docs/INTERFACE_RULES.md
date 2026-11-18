# Dubai Real Estate Atlas: interface rules

**Last updated:** 2026-11-16 (Kuwait time)

How the page looks and behaves, with the values in force and the file that applies them. Data rules
are in [BUSINESS_RULES.md](BUSINESS_RULES.md); the goals behind both are in
[DESIGN_GOALS.md](DESIGN_GOALS.md). Keep this file in step with `assets/app/*.css` and `*.js`.

## 1. Principles

- **The rent is the interface.** Rents are written as text on the map, on a badge in their price colour; the colour repeats what the text says, strongly enough to read from across the room.
- **One control per job.** One page language switch, one home picker, one view bar on the map, one area search (the rent check); the finder above the table only filters the table.
- **One core action, one next step.** "Check a rent" is first on the page; each result offers one primary button, everything else is a plain link.
- **Big and bold, but no wasted scrolling.** On wide screens the title, rent check and filters fit the first screen.
- **Honest wording.** Say what a figure is ("typical" in headlines, the legend and merged labels, backed by medians; "median" where a figure is exactly one, in breakdowns and the table; "no range yet"), where it comes from and how old it is. Never "real-time", never invented examples.
- **Plain words.** Short sentences, no jargon on the page ("the middle half of tenants pay…", not "IQR").

## 2. Layout and breakpoints

| Width | Layout | Where |
|---|---|---|
| 1,100 px and up | Two panes: inputs scroll on the left (`minmax(440px,34vw)`), the map fills the window height on the right and stays put | `atlas.css` |
| 861–1,099 px | One column: title, rent check, filters, map, figures, table; the compact header (44 px title, 60 px figure) | `atlas.css` |
| 860 px and below (phones, fold phones open or closed) | One column, map in the top half of the first screen: the header shows the title and the figure only (no tagline), the rent check folds to one line until tapped, the home picker and rent range share one row; the legend starts folded; area breakdowns as a bottom sheet | `atlas.css`, `companion.css`, `atlas.js` |
| 400 px and below | Smaller title (30 px) and map buttons (32 px); photos 80% of the sheet width | `atlas.css` |
| 320 px | The narrowest screen supported and tested (no sideways scrolling, the sheet fits) | `tests/ui-check.mjs` |

- No sideways scrolling at any width. Tables scroll inside their own box (keyboard-focusable).
- **Area table:** the DLD area is a small muted second line under the area name (no column of its own); names, unit and headers wrap at word breaks, numbers never wrap; 8 px side padding. It fits without scrolling sideways in the side pane at every two-pane width (from 1,100 px: 12 px figures, 6 px side padding, the box reaching 8 px into the pane's margin) and on phones from about 540 px; a browser check measures it at 1,100, 1,350 and 1,920 px.
- The order of content below 1,100 px follows the reading order, kept with `display:contents` and `order`.

## 3. Colour and type

- **Brand palette, "golden note" (text and surfaces):** Oxblood `#521825` (primary field: header, primary buttons, selected states), Ivory `#F6F1E7` (paper and type on oxblood), Gold Leaf `#C9A227` (icons and accents: header frame, highlighted words, link underlines, focus on dark, dark-mode actions, the stale-data warning), Espresso `#2B2118` (deep text), Warm Gray `#8A7F72` (secondary, lines). Tokens: `--oxblood`, `--ivory`, `--gold`, `--espresso`, `--warmgray` (older names `--ink`, `--cream` map to espresso and ivory).
- **Contrast adjustments:** warm gray (3.5:1) and gold leaf (2.2:1) are too light for small text on ivory, so secondary text is a deeper warm gray `#655B51` (5.9:1) and gold as text on ivory is `#735B12` (5.8:1). Gold leaf reads on oxblood (5.7:1) and carries espresso type (6.5:1).
- **Prices: six blues, lowest to highest:** `#EFF3FF`, `#C6DBEF`, `#9ECAE1`, `#6BAED6`, `#2171B5`, `#084594`. Equal steps between the 5th and 95th percentile of what is shown (extremes keep the end colours); the same scale in light and dark; label badges, outlines, the rent check's colour chip and the legend ramp. Text on a badge is espresso on the four lighter blues (6.5:1 or more) and ivory `#FFFCF5` on the two darkest (5.0:1 and 9.0:1). The lowest step is almost paper-white, so swatches and badges carry a faint outline.
- **Scale:** the key runs from the 5th to the 95th percentile, so a few extreme areas don't stretch it. The legend writes a value at all seven step edges (38k, 52k … 120k); below the first value takes the lightest blue, above the last the darkest.
- **Dark mode:** follows the device until the visitor picks; remembered (`theme`). The base map switches with it: OpenFreeMap **Liberty** (detailed, in colour) by day, OpenFreeMap **Dark** lifted to the site's night colours (`tuneDark` in atlas.js) at night. The CSS invert filter is only for the OpenStreetMap fallback tiles.
- **Contrast:** WCAG AA (4.5:1) in light, dark and Arabic, checked by axe on every push. In dark mode price labels stay light ivory cards, so badges show exactly their key colour, but smaller (15 px figures), with a thin dark edge and no gold stack, so they don't glare on the dark map.
- **Type:** Barlow (text) and Barlow Condensed (headings, figures), served from the site. Arabic letters come from the device's Arabic font; numbers stay in Barlow. No letter-spacing in Arabic (it breaks letter joining).
- **Figures:** tabular numbers; AED written before the amount; Western digits in both languages.

## 4. Map labels

- Each area: the figure (`AED 65k`) on a badge in its price-key colour, with the area name underneath on an ivory card.
- **Names as shown:** names registered in capitals ("TOWN SQUARE") show in title case ("Town Square"), keeping acronyms (JLT, JVC, DIFC…) (`T.place`, the same rule on area pages); search, links and saved areas keep the registered name. Names are shortened once in the script (single areas at 28 letters, groups at 22 plus "+N"); the CSS doesn't cut them again.
- Labels never overlap. Overlapping labels merge into a group label coloured by the price key like any other (their contract-weighted average), marked by a gold stacked-card outline; every group names its busiest area and how many others it holds ("JLT +12").
- Label boxes are measured as drawn (a hidden label with the same styles, re-measured once the fonts load), so placement holds in both themes and languages.
- A group of up to 3 comes apart when each label fits at its point or just beside it; a moved label has a thin line to a dot at its point.
- Labels keep clear of the zoom bar, the view bar and the legend, and are re-placed when a control appears, the legend folds or the map is panned (not while a breakdown is open; then once it closes).
- A label whose point is on the map stays fully inside its edges (a line joins it to its point if it had to slide); crowded edges merge rather than cut labels off.
- **Thin figures** (fewer than 10 contracts): a dashed outline (the price colour darkened slightly) and an italic figure; same colours and contrast.
- **Community outlines** under the labels: official boundaries, filled with the area's price colour at 32% and outlined at 70%, redrawn with every view, filter and type change.
- Labels are keyboard buttons: Tab to one, Enter or Space opens it; the spoken name is the visible text.
- **Focus on an area:** tapping one area's label (or Enter, or the rent check's area) flies to its official outline, darkens the map outside it (black at 42%), rings it in gold leaf (3.5 px) and opens its breakdown; other labels stay at full contrast. Closing the breakdown or zooming by hand ends it; a home or view change keeps it. Group labels zoom in until their areas separate.
- Clicking a group zooms in until it splits; at full zoom it lists its areas.
- Rules live in `assets/app/labels.js` (no DOM) and are unit-tested.

## 5. Map controls

- Top left: one bar, as wide as its widest button at every size, **+**, **−**, **All Dubai** (back to the whole city) and **Near me** (where the browser offers location: moves the map to the visitor at zoom 14 and marks the spot with an oxblood dot; outside Dubai it says so and stays; the position is used on the device only, never sent or stored), each as wide as the bar. 40 px at full size, 36 px at 860 px and below, 32 px at 400 px and below.
- Top right: one bar, **Rent · Sale price · Yield** (what the labels show; a view appears only when the data has it; the only place to pick it), then **A+ع**: place names in English and Arabic together. Without it, place names follow the page language. Shown only when the vector map loaded; remembered (`mapBoth`).
- Bottom right on phones: **i** folds the map credits away (two wrapped lines covered the map); one tap shows them. Wide screens show the credits as always.
- **The address keeps the map:** `?home=homes:1-bedroom apartments&view=sale&at=25.08,55.15,13` is written as the map changes (no reload; other parameters kept), and a link with it opens that map. A resumed rent check uses the link's home.
- Bottom left: legend. With All homes picked it adds "Mixed home sizes: pick one for a fair comparison". Its title is a button that folds the notes away, leaving the colour bar and its values (remembered, `legendFolded`; phones start folded).
- The map container stays left to right in Arabic (it is a picture of the world); its legend and breakdowns read right to left.

## 6. The rent check

- **Renewal estimate** (inside the answer, once a rent is entered): "At renewal: how much can it go up?" with the estimated cap in one sentence, a field for the landlord's asked-for rent (green when within, amber when above, with the yearly amount over), the five bands folded under "The rule" (the visitor's band in bold), and the estimate note with DLD's official Rental Index link. With "All homes" it asks for a home size instead.
- Fields: area (search with nicknames, DLD names and typos), optional yearly rent (written with thousands separators as you type), **Check**. No home field: the check uses the map's **Home** picker.
- **One Home control for the page:** a check uses the map's picker (when the area lacks that home, its most common one, and the map follows); picking a home on the map re-checks the current area; **Other homes here:** under the result lists the area's other homes as links, which switch both.
- Result: what was checked, the big figure with a small chip in its price colour, what it is and how many contracts, the middle half when known, the verdict if a rent was entered, up to four findings ("Dearer than 64% of 126 areas…"; on phones folded under **More about this area**, open on wider screens), a folded **What does this mean?** (what a median is, why there is no range yet), one primary button and plain links (Save · Show on the map · Share · Dubai Data page). The links wrap as one group, never leaving a dangling separator.
- Wide screens: a check flies the map to the area (zoom 14) and opens its breakdown. Narrower screens: "Show on the map" does it.
- Remembered in the browser only: the last check, recent checks, saved areas, the map view.

- **The table follows the map view:** its title and subtitle change, it gains a sale price column, and in the sale and yield views it is sorted by that column, highest first. The rent check adds the median sale price for owners.
- **Filters:** one **Home** picker (all homes, each home size, then other property types with data, such as "Flats, any size"; a type already covered by a size, studios, isn't offered twice) and a **Rent range (AED)** (one label over Min – Max). They drive the map, so on wide screens they sit right under the header, above the rent check; on phones the rent check comes first. The map starts on 1-bedroom apartments. With one home size picked, the table names it in its subtitle and drops its unit column.
- **Table:** short headers (Rent, Contracts, Sale price, Yield; the subtitle says medians in AED). Every header but Unit sorts the table (▼ highest first, click again for ▲; Area sorts A–Z); the header carries `aria-sort`. Until one is clicked the view's own column leads; a new view resets it. Consecutive rows of the same area show its name once (kept for screen readers), so All homes reads as one block per area. At 600 px and below only the area, the view's own figure and contracts show; the CSV keeps every column.
- **Table finder:** a search box above the table, next to Download CSV, filters the table's rows only; the map keeps every area.
- **Key figures:** three in big type, lined up on one row (subgrid: label, figure, caption) (contracts in the last 12 months, the share of them on the map, areas on the map), then one small line: "Data to 16 Nov 2026 · updated 17 Nov, 09:00 (Kuwait time) · checked for new data three times a day".
- **About the data:** the sources in use listed once, plainly, split into **Figures from** and **Checked against**; every source's run status folded under **Data health**; licences and credits in "What this is not". No repeated footer.
- **Yields:** always one decimal (7.0%, 8.9%), on the map, in breakdowns, the table, the rent check and area pages.

## 7. Area breakdown (drilling down)

- **Content order:** the area's name; photos taken nearby and the Google links (Maps, Street View, Photos); the median and contracts; the sale price trend (24-month line, change on a year ago); range; rent per m²; yield; unit table; busiest buildings; sources; "Check a rent here".
- **Industrial zones:** the breakdown and the rent check say most homes are staff accommodation, so the figure isn't a guide to residential rents.
- **Backup figures:** when the map is built from Continental Club alone, the warning sign says so (and why), every visit, until Dubai Data is back.
- **History and cross-check notes:** under the figures, "Rent +6.5% since 14 Nov 2025" (bold, no colour: a rise is bad news for tenants and good news for owners); a jump not yet confirmed says so in the warning colour, and its label is dashed like a thin figure (the legend says "or a big change waiting to be confirmed"); "Other sources differ by more than 15%" lists the source, home and their figure, with a line on why sources differ.
- **The picked home leads:** with a home size picked, the breakdown starts with that home's figure (the one on the label), with its yield and sale price, highlights its row in the unit table, and gives the all-homes figures in a smaller block under it.
- **Wide screens:** a Leaflet pop-up, up to 320 px wide, its tip just above the label so the label stays visible; a 32 px × close button. It is never taller than the clear space between the map's buttons and the legend (`maxHeight`, set with the pan margins); longer content scrolls inside the card. When its photos arrive it is laid out and panned again (`refitPopup`), since it grew after opening. Browser-checked at 960×620 to 1,440×900. It never opens under the map's buttons or the legend: Leaflet draws controls above pop-ups, so the pop-up's pan margins are measured from the controls (left column, top-right stack, legend) and the map pans to clear them (`popupMargins` in `atlas.js`, rechecked on resize, language button and redraw).
- **Trend lines** (rent by month, sale price per sq ft) carry a small scale: lowest and highest value at the left (thousands as "k" above 10,000), first, middle and last month underneath, in 10 px muted text; drawn left to right in Arabic too.
- **860 px and below:** a bottom sheet, full width (capped at 640 px, centred), at most 80% of the screen high, scrolling on its own; photos and links move to the top; links become 40 px chips. Closes with ×, swipe down, Escape or a tap on the map. The pop-up stays open but hidden and its content moves into the sheet, so everything that hooks into pop-ups works in both.
- **Photos:** up to 4, a grid on wide screens, a swipeable row on phones (about 72–80% of the width, 150–170 px high). Each shows its author and licence. A photo that fails to load disappears; no photos means no strip.
- **Photo viewer (all screens):** tap a photo for a full-screen view at 960 px with title, author, licence and a link to its Commons page; arrows, swipes and the arrow keys move between photos (direction follows the language); Escape or × closes it and focus returns to the photo.

## 7b. Data status page

- Its own address, `status/` (linked from "Where the numbers come from" on the map page; not indexed by search engines). Same header, fonts, colours, language switch and dark mode as the map page.
- A big verdict ("All fine" / "Needs a look": an open alert, a failed last pull or the backup source), then: In the data (five counts), The last pull (per source: what it pulled and its state), In use on the map (read / in use per source), Left out, Waiting, Recent pulls (linked to GitHub) and Open alerts.
- Read live in the browser (data branch and GitHub's API); falls back to the site's copies. Browser-checked on desktop, phone and Arabic, with axe.

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
- Stale data: a gold-leaf warning sign when the data is more than 7 days behind; hideable for the visit.
- Empty: a message that says what to change ("Clear the search or widen the rent range").

## 11. Accessibility

- WCAG 2.1 AA, checked with axe on desktop, phone, dark mode, Arabic, and 320/344 px with the sheet open.
- Everything works by keyboard: labels, sheets, the photo viewer; focus is visible and returns where it came from.
- Touch targets at least 32 px (40 px for sheet controls and chips).
- Live regions announce the headline number and the rent check result.

## 12. Assets

- Page scripts and styles carry `?v=__BUILD__`, replaced with the commit on deploy, so a browser never mixes a new page with old files.
- Libraries and fonts are served from the site (`assets/vendor/`, `assets/fonts/`). MapLibre (1 MB) loads after the rent data.
