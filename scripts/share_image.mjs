// Draws assets/share.png (1200 × 630), the picture every shared link shows. Rerun after a design change:
//   node scripts/share_image.mjs        (needs Playwright; uses the site's own fonts and colours)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const font = (fam, w, f) => `@font-face{font-family:"${fam}";font-weight:${w};src:url(data:font/woff2;base64,${readFileSync(ROOT + 'assets/fonts/' + f).toString('base64')}) format("woff2")}`;
const html = `<!doctype html><style>
${font('Barlow', 500, 'barlow-latin-500-normal.woff2')}${font('Barlow', 600, 'barlow-latin-600-normal.woff2')}
${font('Barlow Condensed', 700, 'barlow-condensed-latin-700-normal.woff2')}
body{margin:0;width:1200px;height:630px;background:#141414;color:#F7F2E9;font-family:Barlow;position:relative;overflow:hidden}
.frame{position:absolute;inset:22px;border:4px solid #B98A2F;border-radius:22px}
.in{position:absolute;left:78px;top:70px;right:78px}
h1{font:700 112px/.92 "Barlow Condensed";margin:0;letter-spacing:-.01em}
p{font-size:36px;line-height:1.3;color:#D9D1C3;margin:26px 0 0;max-width:900px}p b{color:#B98A2F;font-weight:600}
.row{position:absolute;left:78px;right:78px;bottom:72px;display:flex;gap:16px;align-items:flex-end}
.l{color:#141414;border-radius:12px;padding:10px 20px 12px;box-shadow:0 6px 18px rgba(0,0,0,.3);border-left:8px solid var(--c);
   background:linear-gradient(90deg,color-mix(in srgb,var(--c) 25%,#FFFDF8) var(--f),#FFFDF8 var(--f))}
.l b{display:block;font:700 46px/1 "Barlow Condensed"}.l small{display:block;font-size:22px;color:#4A443B;margin-top:4px}
</style><div class="frame"></div><div class="in"><h1>Dubai Rent Atlas</h1>
<p>What tenants <b>actually pay</b> per year, area by area, from Ejari rent contracts. Not asking prices.</p></div>
<div class="row"><div class="l" style="--f:35%;--c:#424483"><b>Every area</b><small>Over 150 areas</small></div>
<div class="l" style="--f:60%;--c:#51A686"><b>Every home type</b><small>Studio to 3 beds</small></div>
<div class="l" style="--f:85%;--c:#F9E855"><b>Your rent</b><small>Above or below?</small></div></div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html, { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: ROOT + 'assets/share.png' });
await b.close();
console.log('wrote assets/share.png');
