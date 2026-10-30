---
id: safe-startup
kind: recipe
title: Safe start-up for Scriptable apps (no blank screen)
version: 1.0.0
updated: 2026-10-30
author: Gediminas Siutilas
reference: BlogPulse 1.9.2 (https://github.com/gadominas/BlogPulse/blob/main/BlogPulse.js), Stockit 1.4.1 (https://github.com/gadominas/StockIt/blob/main/Stockit.js)
applies_to: every app with a WebView UI, new or existing
---

# Safe start-up for Scriptable apps (no blank screen)

## What this recipe is

A **recipe** is a coding rule set that every app follows while it is being built, rebuilt or refactored. Unlike a blueprint it adds no feature the user sees; it fixes a class of bug once, the same way everywhere. Apply it to every new app from the first commit, and to any existing app whose start-up, storage or run code you touch.

## The bug it prevents

**Symptom:** the app opens to a blank (black or white) screen, most often when it's opened from its **widget**, after **several quick taps**, or when iCloud is slow or offline. Sometimes it stays blank forever; sometimes it shows the page after a long wait. Closing and reopening may or may not help.

Seen in BlogPulse (fixed in 1.9.0 to 1.9.2) and Stockit (fixed in 1.4.1).

**Causes, all of which happen together on a real phone:**

| Cause | What goes wrong |
| --- | --- |
| Data read before the window | Top-level `await load(...)` calls `FileManager.downloadFileFromiCloud`, which can take seconds, or forever offline. Nothing is on screen meanwhile, so the user sees a blank screen. |
| Page built before its window is on screen | `wv.loadHTML(page)` then `wv.present()`: on some iPhones WebKit runs the page but never paints it. The page "works" (scripts run, the bridge answers) yet the screen stays blank. Opening from a widget makes this far more likely. |
| Several runs at once | Each widget tap starts another run. Two windows fight over the screen and the files. |
| One huge message to the page | The whole state inlined in the HTML, or passed in one `evaluateJavaScript`, can stall WebKit on a large data set. |
| Work at start-up | A refresh, update check and icon download all start before the first frame is drawn, competing with it. |
| Saving after a failed read | When a read times out the app runs with empty defaults, and closing it then **saves the empty data over the user's real files**. |

## The rules

1. **Window first, data after.** Show an empty window in the app's dark ground colour, present it, then build the real page inside it while it's visible.
2. **Only settings are read before the window**, because every branch needs them (app, widget, Shortcuts). Everything else is read in `loadData()`, after the window is up.
3. **Every iCloud read has a time limit** (10 s). A file that doesn't arrive in time falls back to its default and is listed in `loadIssues`.
4. **Never save data that was never read.** `write()` refuses to write a data file until `loadData()` has read everything, and refuses to write `settings.json` if settings weren't read.
5. **The page boots from data it's handed.** It shows a "Loading your …" placeholder, receives big lists in pieces (`window.__parts`), then `window.__boot(state)` starts the app. It never contains `clientState()` inlined.
6. **Every message to the page has a time limit** (`ev()`, 20 s).
7. **One window at a time.** A run holds a lock file in the local temporary directory and refreshes it every second. A new run waits at most 1.5 s for an older window, then opens anyway; it must never refuse to open.
8. **Background work waits for the first screen**: the app's own refresh or scan 0.7 s after boot, the update check 3.5 s, the widget icon 6 s.
9. **The page redraws itself** once the data is in and whenever it comes back into view.
10. **Opening can't fail silently.** A short start-up log is kept on the phone (local, not iCloud). If start-up stalls for 25 s, or throws, the page shows what happened. **Settings › Updates › Start-up log** shows the last 40 lines.
11. **The widget branch reads its own data** (`await loadData()`) and never builds a WebView.

## Per-app values

| Value | Example (Stockit) | Notes |
| --- | --- | --- |
| `APP_ID` | `stockit` | Already in every app (in-app updates blueprint). Names the log and lock files. |
| Data files read in `loadData()` | `stocks`, `market`, `insights`, `tldrs`, `usage` | Every JSON file except `settings`. List the same names in `write()`'s guard. |
| The big list handed over in pieces | `st.stocks` in slices of 6 | BlogPulse: `st.articles` in slices of 300. Pick the list that grows with use. |
| Placeholder text | `Loading your stocks…` | Shown in the page's main element until `__boot` runs. |
| First window colour | `#0E1116` | The launch screen's ground (`--sp-ground`), so the hand-over is invisible. |
| Deferred work | refresh prices; briefing if due | The app's own start-up work, moved out of `main()`. |

## Step 1: the start-up log

Near the storage helpers, before anything that can fail:

```javascript
// A short start-up log on the phone (local, not iCloud): Settings › Updates › Start-up log, and on screen if opening stalls.
const LOG_PATH = FileManager.local().joinPath(FileManager.local().documentsDirectory(), APP_ID + "-startup.log");
function startLog(msg) {
  try {
    const lfm = FileManager.local(), line = new Date().toISOString().slice(11, 19) + "  " + msg;
    const old = lfm.fileExists(LOG_PATH) ? lfm.readString(LOG_PATH).split("\n").slice(-60) : [];
    lfm.writeString(LOG_PATH, old.concat(line).join("\n"));
  } catch (e) {}
}
```

## Step 2: reads with a time limit, writes only after reads

Replace the app's `load()` and `write()`:

```javascript
const loadIssues = [];   // files iCloud didn't hand over in time
async function load(n, def, waitMs = 10000) {
  const p = P(n);
  if (!fm.fileExists(p)) return def;
  try {
    if (fm.isFileStoredIniCloud(p) && !fm.isFileDownloaded(p)) {
      // iCloud can take a long time (or forever, offline): never let start-up hang on it
      await Promise.race([fm.downloadFileFromiCloud(p), new Promise(r => Timer.schedule(waitMs, false, r))]);
      if (!fm.isFileDownloaded(p)) { loadIssues.push(n); startLog(`iCloud didn't deliver ${n}.json in ${waitMs / 1000} s`); return def; }
    }
    return JSON.parse(fm.readString(p));
  } catch (e) { loadIssues.push(n); startLog(`Couldn't read ${n}.json: ${e}`); return def; }   // a broken file falls back to defaults, never crashes
}
// Data files are only written once they were read, so a slow start can never save an empty list over them.
let dataLoaded = false;
const write = (n, v) => {
  if (n === "settings" ? !settingsOk : (["stocks", "market", "insights", "tldrs", "usage"].includes(n) && !dataLoaded)) return;
  fm.writeString(P(n), JSON.stringify(v));
};
```

`Timer.schedule(ms, false, fn)` is used instead of `setTimeout`, which Scriptable doesn't have.

## Step 3: settings at the top, everything else in `loadData()`

Settings stay where the settings blueprint puts them, loaded before every branch. Right after them:

```javascript
const settingsOk = !loadIssues.includes("settings");   // settings that were never read are never saved over
// Data is read in loadData(): the app shows its first screen before reading it, because iCloud can be slow.
let stocks = [], market = {}, insights = { briefing: null, stories: {}, ideas: null }, tldrs = {};
async function loadData() {
  loadIssues.length = 0;
  stocks = await load("stocks", []);
  market = await load("market", {});
  insights = await load("insights", { briefing: null, stories: {}, ideas: null });
  insights.stories = insights.stories || {};
  tldrs = await load("tldrs", {});
  usage = await load("usage", usage);
  dataLoaded = loadIssues.length === 0;   // anything missing: show what we have, save nothing over it
}
```

- Every other top-level `await load(...)` in the script moves into `loadData()`. Grep for them: `grep -n "await load(" App.js`.
- Data variables become `let` (or `var`, if declared in a later part of the file) with empty defaults, so code that runs before `loadData()` sees empty data, never `undefined`.
- Migrations that ran at the top (`insights.stories = insights.stories || {}`) move into `loadData()` too.
- `saveAll()` needs no change: `write()` skips what wasn't read. Where `saveAll()` also stamps a session time, stamp it only when `dataLoaded`.

## Step 4: the page boots from handed-over data

In the page markup, the main element starts with a placeholder:

```html
<main id="main"><div class="booting" role="status"><span class="busy-dot"></span>Loading your stocks…</div></main>
```

At the end of the page script, replace `window.__INIT = ${safeJSON(clientState())}; (${clientApp.toString()})();` with:

```javascript
// The page goes on screen first; Scriptable hands over the data once it has read it.
window.__parts = [];
window.__bootNote = function (title, detail) {
  var b = document.querySelector(".booting"); if (!b) return;
  b.className = "booting note";
  b.innerHTML = "<b></b><span></span>" + (detail ? "<pre></pre>" : "");
  b.querySelector("b").textContent = title;
  b.querySelector("span").textContent = "Close Stockit and open it again. If it keeps happening, run the installer once more.";
  if (detail) b.querySelector("pre").textContent = detail;
};
setTimeout(function () { if (!window.__booted) window.__bootNote("Still loading…"); }, 25000);
document.addEventListener("visibilitychange", function () {   // coming back into view: redraw
  if (document.visibilityState !== "visible") return;
  var d = document.documentElement; d.style.transform = "translateZ(0)"; void d.offsetHeight; d.style.transform = "";
});
window.__boot = function (st) {
  if (window.__booted) return;
  if (!st.stocks || !st.stocks.length) st.stocks = [].concat.apply([], window.__parts);
  window.__parts = [];
  window.__booted = true; window.__INIT = st;
  requestAnimationFrame(function () {   // make WebKit draw again once the data is in (helps if the window came up blank)
    var d = document.documentElement; d.style.transform = "translateZ(0)"; void d.offsetHeight;
    requestAnimationFrame(function () { d.style.transform = ""; });
  });
  (${clientApp.toString()})();
};
```

- Keep this ES5 (no arrow functions, no backticks): it sits inside the page's template string, like the in-app updates page code.
- The launch screen script stays **before** this block, untouched; it doesn't depend on data.
- The page's `clientApp` already reads `window.__INIT`, so it needs no change. Its first `render()` replaces the placeholder.
- Name `stocks` after the app's big list (`articles` in BlogPulse, `workouts`, …).

CSS, next to the other shared rules (shared tokens only):

```css
.booting{display:flex;align-items:center;justify-content:center;gap:10px;padding:80px 20px;color:var(--muted);font-size:calc(14px * var(--ts))}
.booting.note{flex-direction:column;text-align:center;color:var(--ink-2);padding:60px 24px}
.booting.note b{font-size:calc(18px * var(--ts));color:var(--ink)}
.booting.note pre,.startlog{max-width:100%;overflow:auto;text-align:left;font:12px/1.45 ui-monospace,Menlo,monospace;background:var(--sheet);border:1px solid var(--rule);border-radius:10px;padding:10px;color:var(--ink-2);white-space:pre-wrap;-webkit-user-select:text;user-select:text}
.startlog{margin:8px 0;max-height:260px}
```

If the app has no `.busy-dot` spinner yet:

```css
.busy-dot{width:15px;height:15px;flex:none;border-radius:50%;border:2px solid var(--rule);border-top-color:var(--signal);animation:bdspin .8s linear infinite}
@keyframes bdspin{to{transform:rotate(360deg)}}
```

## Step 5: the run

Replace `main()` and the branch at the end of the file:

```javascript
// ---------- run ----------
// A run marks itself as open while its window is on screen. A new run waits at most 1.5 s for an older
// window to close, then opens anyway: quick taps on the widget don't stack up copies.
const lockFm = FileManager.local();
const RUN_LOCK = lockFm.joinPath(lockFm.temporaryDirectory(), APP_ID + '-running');
let lockTimer = null;
const lockAge = () => { try { return lockFm.fileExists(RUN_LOCK) ? Date.now() - Number(lockFm.readString(RUN_LOCK)) : Infinity; } catch (e) { return Infinity; } };
const pause = ms => new Promise(r => Timer.schedule(ms, false, r));
async function waitForOtherWindow() { for (let waited = 0; lockAge() < 2500 && waited < 1500; waited += 300) await pause(300); }
function holdLock() {
  const beat = () => { try { lockFm.writeString(RUN_LOCK, String(Date.now())); } catch (e) {} };
  beat(); lockTimer = Timer.schedule(1000, true, beat);
}
function releaseLock() {
  if (lockTimer) { lockTimer.invalidate(); lockTimer = null; }
  try { if (lockFm.fileExists(RUN_LOCK)) lockFm.remove(RUN_LOCK); } catch (e) {}
}
// Talks to the page with a time limit, so a stuck page can't stall the app.
const ev = (js, ms = 20000) => Promise.race([wv.evaluateJavaScript(js, false), pause(ms).then(() => { throw new Error("the page didn't respond in " + ms / 1000 + " s"); })]);

async function bootApp(isClosed) {
  const t0 = Date.now();
  startLog(`Stockit ${VERSION}: reading data`);
  await loadData();
  startLog(`data read in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${stocks.length} stocks${loadIssues.length ? "; missing: " + loadIssues.join(", ") : ""}`);
  if (isClosed()) return;
  const st = clientState(), list = st.stocks;
  st.stocks = [];
  for (let i = 0; i < list.length; i += 6) await ev(`window.__parts.push(${safeJSON(list.slice(i, i + 6))})`);   // in pieces: one huge message can stall WebKit
  await ev(`window.__boot(${safeJSON(st)})`);
  let seen = "";
  try { seen = await ev(`document.visibilityState + ", " + innerWidth + "x" + innerHeight`, 5000); } catch (e) { seen = String(e.message || e); }
  startLog(`screen ready in ${((Date.now() - t0) / 1000).toFixed(1)} s (page: ${seen})`);
  if (loadIssues.length) toast("Some of your data is still coming from iCloud. Nothing will be saved until you reopen Stockit.");
  // Deferred work, once the first screen is drawn: the app's own refresh, then updates, then the widget's icon.
  Timer.schedule(700, false, () => {
    if (isClosed() || !dataLoaded) return;
    if (stocks.length && settings.refreshOnOpen !== false && Date.now() - (settings.lastRefresh || 0) > cfg("pricesFreshMin") * 60e3)
      runRefresh(false).catch(e => toast(String(e.message || e)));
  });
  Timer.schedule(3500, false, () => {
    if (isClosed() || updateChecked) return;
    updateChecked = true;
    checkForUpdate().then(u => { pendingUpdate = u; offerUpdate(); });
  });
  Timer.schedule(6000, false, () => { widgetIcon(); });
}

async function main() {
  await waitForOtherWindow();
  buildWebView();
  // A page built before its window is on screen can stay blank on some iPhones (the page runs, nothing is drawn),
  // most often when opened from the widget. So: an empty dark window first, then the real page built inside it.
  await wv.loadHTML('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#0E1116"></body></html>');
  const presented = wv.present(true);
  holdLock();
  await pause(300);                          // let the window finish appearing
  startLog("window on screen");
  await Promise.race([wv.loadHTML(buildHTML()), pause(15000)]);   // the launch screen, drawn on screen
  let closed = false;
  presented.then(() => { closed = true; releaseLock(); });
  bootApp(() => closed).catch(e => {         // runs beside the window: closing it never waits on this
    startLog("start-up failed: " + (e.message || e));
    let log = "";
    try { log = FileManager.local().readString(LOG_PATH).split("\n").slice(-12).join("\n"); } catch (x) {}
    if (!closed) wv.evaluateJavaScript(`window.__bootNote("Stockit couldn't open", ${safeJSON(log)})`, false).catch(() => {});
  });
  await presented;
  closed = true;
  releaseLock();
  saveAll();                                 // write() skips data that was never read
  if (dataLoaded) saveWidget(widgetSnapshot());
}

// Settings are loaded at the top of the script, before every branch; data is read in each branch.
if (config.runsInWidget || config.runsInAccessoryWidget) {
  await loadData();
  await runWidget();             // never builds or presents a WebView, Alert or QuickLook
} else {
  await main();
}
Script.complete();
```

- `bootApp` is **not awaited** by `main()`: closing the window must never wait on it.
- `toast`, `push` and every other `evaluateJavaScript` caller must tolerate being called before `__boot` (they already do when they guard on `wv`). Calls that need the app's page functions should happen after `bootApp` has handed the state over; the deferred timers guarantee that for start-up work.
- `buildHTML()` must no longer call `clientState()`. It may read `settings` (theme, density, font), which are loaded.
- Any other start-up work in the old `main()` (opening a deep link from the widget, a Shortcuts parameter, a first-run alert) moves into `bootApp`, after `__boot`.

## Step 6: Settings › Updates › Start-up log

In the Updates section of the Settings sheet, after **Check for updates now**:

```html
<div class="srow"><div class="grow"><b>Start-up log</b><small class="muted">What happened the last times Stockit opened</small></div><button class="sm" data-act="startlog">Show</button></div>
<pre id="startlog" class="startlog" hidden></pre>
```

In the page's click handler:

```javascript
case "startlog": {
  const pre = $("#startlog");
  if (!pre.hidden) { pre.hidden = true; t.textContent = "Show"; break; }
  send("startlog", {}, (ok, txt) => { pre.textContent = txt || "Nothing logged yet."; pre.hidden = false; t.textContent = "Hide"; });
  break;
}
```

In the Scriptable-side bridge handler:

```javascript
case "startlog": {
  let txt = "";
  try { txt = FileManager.local().readString(LOG_PATH).split("\n").slice(-40).join("\n"); } catch (e) {}
  return call("__done", m.req, true, txt);
}
```

## Testing checklist

On the phone, in light and dark mode:

- [ ] Open the app from the Scriptable list: the launch screen appears at once, then the data; no blank frame.
- [ ] Open the app from its widget ten times in a row, closing it each time: it opens every time.
- [ ] Tap the widget three times quickly: one window opens, not three.
- [ ] Close the app during the launch screen, then open it again: it opens, and no data is lost.
- [ ] Turn on Airplane mode, evict the app's folder from iCloud (Files › Scriptable › the app's folder › long-press › Remove Download), open the app: it opens within ~10 s with what it has, says data is still coming from iCloud, and after closing and reopening online, all data is back.
- [ ] **Settings › Updates › Start-up log** shows lines like `window on screen`, `data read in 0.3 s: 12 stocks`, `screen ready in 0.6 s (page: visible, 390x844)`.
- [ ] The widget still shows the app's data (the widget branch reads it).
- [ ] The update offer still appears a few seconds after opening when a new version exists.

Statically, before releasing:

- [ ] `grep -n "await load(" App.js` lists only `settings` at the top and the reads inside `loadData()`.
- [ ] `grep -n "clientState()" App.js` shows no call inside `buildHTML`.
- [ ] `main()` loads an empty page, presents it, then loads `buildHTML()`; the widget branch calls `loadData()` first.
- [ ] A test harness (if the app has one) covers: the empty first window, a file that iCloud never delivers (the app still boots and the file is not overwritten), the widget run, and the start-up log.

## Pitfalls

- **Settings still have to load first.** Don't move `settings` into `loadData()`: the widget and Shortcuts branches, the theme in `buildHTML()` and the update check all need it.
- **Never write before reading.** The guard in `write()` is what keeps a slow iCloud from wiping a user's data. Every data file needs to be on its list; a new data file added later must be added there too.
- **`Timer.schedule` returns a `Timer`**, with `invalidate()`. Test mocks must return an object with `invalidate`, not a number.
- **The lock lives in `temporaryDirectory()` of `FileManager.local()`**, never iCloud: an iCloud lock file can itself be slow to read, which is the bug this recipe fixes.
- **Never refuse to open.** An earlier BlogPulse (1.9.0) waited for the lock without a limit and showed nothing after a run that got stuck. The 1.5 s cap is the fix.
- **Hand big lists over in pieces.** One `evaluateJavaScript` of several hundred kilobytes can stall WebKit. Slices of 6 heavy items (with price histories) or 300 light ones (articles) both work.
- **Keep the boot block ES5.** It sits in the page's template string; a backtick or `${` in it breaks the whole page.
- **A `const` declared after first use throws.** Data variables that other parts of the script read at load time (for example `usage` in the AI part) should be `var`, or be declared before that part.
- **Test harnesses that build a DOM per `loadHTML`** must accept the empty first page (no bridge hook) without throwing.

## Prompt for a coding agent

```markdown
Follow https://github.com/gadominas/app-blueprints/blob/main/AGENTS.md.
Apply the safe-startup recipe (recipes/safe-startup.md) to [App] (https://github.com/gadominas/[App]).
Data files: [list]; big list for the hand-over: [name]; placeholder text: "Loading your […]…".
Move the app's own start-up work into bootApp. Run the static checks, release a patch version,
and add the recipe to docs/BLUEPRINTS.md under Recipes.
```

## Version history

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-10-30 | First version, from BlogPulse 1.9.0–1.9.2 and Stockit 1.4.1 |
