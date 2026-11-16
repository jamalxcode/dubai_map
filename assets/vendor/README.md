# Third-party libraries, served from this site

Copied unchanged from their npm packages, so no visitor request goes to a library CDN. Leaflet, GSAP and
Lenis match the integrity hashes the page used when it loaded them from unpkg.com and jsdelivr.net.

| Library | Version | Files | Licence |
|---|---|---|---|
| Leaflet | 1.9.4 | `leaflet/leaflet.js`, `leaflet/leaflet.css`, `leaflet/images/` | BSD 2-Clause (`leaflet/LICENSE`) |
| GSAP | 3.15.1 | `gsap/gsap.min.js` | GSAP Standard "no charge" licence, https://gsap.com/standard-license (notice in the file header) |
| Lenis | 1.3.27 | `lenis/lenis.min.js` | MIT (`lenis/LICENSE`) |
| MapLibre GL JS | 5.24.0 | `maplibre/maplibre-gl.js`, `maplibre/maplibre-gl.css` (loaded after the page, for the vector base map) | BSD 3-Clause (`maplibre/LICENSE.txt`) |
| MapLibre GL Leaflet | 0.1.4 | `maplibre/leaflet-maplibre-gl.js` | ISC (`maplibre/LICENSE-leaflet-plugin.txt`) |
| mapbox-gl-rtl-text | 0.3.0 | `maplibre/mapbox-gl-rtl-text.js` (Arabic shaping and right-to-left order on the map) | BSD 2-Clause (`maplibre/LICENSE-rtl-text.md`) |

To update one: download the package from the npm registry, copy the same files, and update this table.
