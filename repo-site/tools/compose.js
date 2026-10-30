// Composes the labelled screenshot cards every app README shows.
//
// One look for every app: the brand ground shared by all logos and widgets (#0E1116 → #171B22),
// a step number and a short label in the app's accent, a one-line caption, then the phone screen
// with rounded corners. No borders, no device frame, no drop shadow lines: slick and compact.
// The card is dark in both GitHub themes, so it reads the same in light and dark mode.

'use strict';
const fs = require('fs');

const CARD = { width: 360, pad: 18, screenRadius: 22, cardRadius: 28, ground: '#0E1116', raised: '#171B22', ink: '#F6F7F9', soft: '#C9CED6', muted: '#9AA3AE' };
const SCREEN = { width: 390, height: 844 };   // the emulator's viewport (CSS px)

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function shell(inner, accent) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{margin:0;background:transparent;font-family:"Inter","SF Pro Display",-apple-system,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
  .card{width:${CARD.width}px;border-radius:${CARD.cardRadius}px;overflow:hidden;
    background:radial-gradient(120% 60% at 50% 0%, ${accent}26 0%, transparent 60%), linear-gradient(180deg, ${CARD.raised} 0%, ${CARD.ground} 100%);
    padding:${CARD.pad + 2}px ${CARD.pad}px ${CARD.pad}px}
  .top{display:flex;align-items:center;gap:8px;margin:0 2px 6px}
  .num{font:700 11px/1 "Inter",sans-serif;letter-spacing:.08em;color:${CARD.ground};background:${accent};border-radius:99px;padding:4px 7px 4px}
  .app{font:600 11px/1 "Inter",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${CARD.muted}}
  h1{margin:0 2px 4px;font:700 19px/1.2 "Inter",sans-serif;color:${CARD.ink};letter-spacing:-.01em}
  p{margin:0 2px 14px;font:400 12.5px/1.4 "Inter",sans-serif;color:${CARD.soft};min-height:35px}
  .shot{display:block;width:100%;border-radius:${CARD.screenRadius}px}
  .wbox{border-radius:${CARD.screenRadius}px;padding:26px 0;display:flex;justify-content:center;align-items:center;
    background:radial-gradient(90% 90% at 30% 20%, ${accent}40, transparent 60%), radial-gradient(80% 80% at 80% 90%, #3b82f633, transparent 60%), #1d2330}
  .wbox img{display:block}
  </style></head>
  <body><div class="card" id="card">${inner}</div></body></html>`;
}

function header(o) {
  const n = String(o.index || 1).padStart(2, '0');
  return `<div class="top"><span class="num">${n}</span><span class="app">${esc(o.app)}</span></div><h1>${esc(o.label)}</h1><p>${esc(o.caption || '')}</p>`;
}

async function render(browser, html, out) {
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const png = await page.locator('#card').screenshot({ omitBackground: true });
  await ctx.close();
  fs.writeFileSync(out, await shrink(png));
}

// Palette PNG (libimagequant through sharp): about a fifth of the size, no visible difference.
// Without sharp installed (npm i in repo-site/), the full-colour PNG is written.
async function shrink(png) {
  let sharp;
  try { sharp = require('sharp'); } catch (e) { return png; }
  try { return await sharp(png).png({ palette: true, quality: 92, effort: 10, compressionLevel: 9 }).toBuffer(); } catch (e) { return png; }
}

// A phone screen. `crop` = { top, height } in CSS px of the 390×844 screen, to keep cards compact.
async function composeCard(browser, rawPath, out, o) {
  const b64 = fs.readFileSync(rawPath).toString('base64');
  const crop = o.crop || { top: 0, height: SCREEN.height };
  const w = CARD.width - CARD.pad * 2;
  const scale = w / SCREEN.width;
  const h = Math.round(crop.height * scale);
  const img = `<div style="width:${w}px;height:${h}px;overflow:hidden;border-radius:${CARD.screenRadius}px"><img class="shot" style="border-radius:0;margin-top:${-Math.round(crop.top * scale)}px" src="data:image/png;base64,${b64}"></div>`;
  await render(browser, shell(header(o) + img, o.accent), out);
}

// A widget on a soft wallpaper.
async function composeWidgetCard(browser, rawPath, out, o) {
  const b64 = fs.readFileSync(rawPath).toString('base64');
  const fam = o.family || 'medium';
  const widths = { small: 150, medium: 300, large: 300, accessoryRectangular: 200, accessoryCircular: 90, accessoryInline: 260 };
  const img = `<div class="wbox"><img style="width:${widths[fam] || 300}px" src="data:image/png;base64,${b64}"></div>`;
  await render(browser, shell(header(o) + img, o.accent), out);
}

module.exports = { composeCard, composeWidgetCard, CARD };
