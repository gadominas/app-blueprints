#!/usr/bin/env node
// Regenerates an app repository's screenshots.
//
//   node repo-site/tools/capture.js <app-repo-dir> [--only id1,id2] [--raw-only] [--keep-raw]
//
// Reads <app-repo-dir>/docs/site/scenario.js, runs the app's real script in the Scriptable
// emulator once per shot (fresh state each time), saves the raw phone screen, then composes
// the labelled card that the README shows: docs/screenshots/<id>.png.
// Raw screens go to docs/site/raw/ (git-ignored) so a card can be re-composed without a re-run.
// See repo-site/REBUILD.md.

'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { Emulator, sleep } = require('./scriptable-emulator');
const { composeCard, composeWidgetCard } = require('./compose');

async function main() {
  const argv = process.argv.slice(2);
  const repo = path.resolve(argv.find((a) => !a.startsWith('--')) || '.');
  const only = (argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
  const rawOnly = argv.includes('--raw-only');
  const composeOnly = argv.includes('--compose-only');
  const scenarioPath = path.join(repo, 'docs', 'site', 'scenario.js');
  const sc = require(scenarioPath);
  process.env.TZ = sc.timezone || 'Europe/Vilnius';   // the script's own Date and DateFormatter run in the scenario's zone
  const outDir = path.join(repo, 'docs', 'screenshots');
  const rawDir = path.join(repo, 'docs', 'site', 'raw');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });
  const browser = await chromium.launch();
  const log = (s) => console.log(s);
  let failed = 0;
  const shots = sc.shots.filter((s) => !only.length || only.includes(s.id));
  for (const [i, shot] of shots.entries()) {
    const n = sc.shots.indexOf(shot) + 1;
    log(`▸ ${shot.id}: ${shot.label}`);
    const raw = path.join(rawDir, shot.id + '.png');
    try {
      if (!composeOnly) {
        const fx = typeof sc.fixtures === 'function' ? sc.fixtures(shot) : sc.fixtures;
        const emu = new Emulator({
          browser, log, fixtures: fx,
          scriptPath: path.resolve(repo, shot.script || sc.app.script),   // a shot may run another copy (e.g. an older VERSION for the update sheet)
          now: shot.now || sc.now, dark: !!shot.dark, locale: shot.locale || sc.locale || 'en_US', timezone: sc.timezone || 'Europe/Vilnius',
          config: shot.widget ? { runsInApp: false, runsInWidget: !shot.widget.startsWith('accessory'), runsInAccessoryWidget: shot.widget.startsWith('accessory'), widgetFamily: shot.widget } : {},
          args: shot.args || {}, verbose: !!process.env.VERBOSE,
        });
        emu.run();
        if (shot.widget) {
          const t0 = Date.now();
          while (!emu.widget && Date.now() - t0 < 15000) await sleep(50);
          if (!emu.widget) throw new Error('no widget was set. ' + emu.errors.join(' | '));
          const ctx = await browser.newContext({ deviceScaleFactor: 3 });
          const p = await ctx.newPage();
          await p.setContent(emu.widgetHTML(shot.widget));
          await p.locator('#widget').screenshot({ path: raw, omitBackground: true });
          await ctx.close();
        } else {
          const wv = await emu.waitForPresent();
          const page = wv._page;
          const h = helpers(page, emu);
          await h.wait(shot.settle == null ? (sc.settle == null ? 2900 : sc.settle) : shot.settle);   // past the 2.4 s launch screen
          if (shot.run) await shot.run(h);
          await h.wait(shot.after == null ? 450 : shot.after);
          await (emu.presented._page).screenshot({ path: raw });
        }
        await emu.close();
        if (emu.errors.length) log('  ! errors: ' + emu.errors.slice(0, 3).join(' | ').slice(0, 400));
      }
      if (!rawOnly) {
        const out = path.join(outDir, shot.id + '.png');
        const opts = { label: shot.label, caption: shot.caption, index: n, accent: sc.app.accent, app: sc.app.name, crop: shot.crop };
        if (shot.widget) await composeWidgetCard(browser, raw, out, Object.assign(opts, { family: shot.widget }));
        else await composeCard(browser, raw, out, opts);
        log('  ✓ ' + path.relative(repo, out));
      }
    } catch (e) {
      failed++;
      log('  ✗ ' + (e && e.stack || e));
    }
  }
  await browser.close();
  if (failed) log(`${failed} shot(s) failed`);
  process.exit(failed ? 1 : 0);   // the app's own timers would keep Node alive
}

// Helpers a shot's run() gets: tap, type, scroll, evaluate, wait.
function helpers(page, emu) {
  const h = {
    page, emu,
    wait: (ms) => sleep(ms),
    // Tap the first visible element matching a CSS selector, or containing the text.
    async tap(target, opts = {}) {
      const l = target.startsWith('text=') ? page.getByText(target.slice(5), { exact: !!opts.exact }) : page.locator(target);
      const el = l.filter({ visible: true }).first();
      await el.click({ timeout: opts.timeout || 4000, force: !!opts.force });
      await sleep(opts.after == null ? 500 : opts.after);
    },
    async tapText(text, opts = {}) { return h.tap('text=' + text, opts); },
    async type(selector, text, opts = {}) { const el = page.locator(selector).filter({ visible: true }).first(); await el.fill(''); await el.type(text, { delay: 5 }); await sleep(opts.after == null ? 300 : opts.after); },
    async eval(fn, arg) { return page.evaluate(fn, arg); },
    async scrollTo(selectorOrY, offset = 0) {
      if (typeof selectorOrY === 'number') await page.evaluate((y) => { (document.scrollingElement || document.body).scrollTo(0, y); }, selectorOrY);
      else await page.evaluate(({ s, off }) => { const el = document.querySelector(s); if (!el) return; const r = el.getBoundingClientRect(); window.scrollBy(0, r.top - off); }, { s: selectorOrY, off: offset });
      await sleep(400);
    },
    async scrollEl(container, y) { await page.evaluate(({ c, y }) => { const el = document.querySelector(c); if (el) el.scrollTop = y; }, { c: container, y }); await sleep(400); },
    async bridge(js) { return emu.presented.evaluateJavaScript(js); },
  };
  return h;
}

main().catch((e) => { console.error(e); process.exit(1); });
