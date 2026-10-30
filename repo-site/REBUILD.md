# Rebuilding an app's repository site

How to regenerate the public face of any of the Scriptable app repositories: the README, the labelled screenshots, the badges, and the GitHub **About** box (description, website, topics). Follow it whenever an app ships a feature worth showing, its interface changes, or the repositories have drifted apart.

> This is **not a blueprint**. Blueprints (`../blueprints/`) describe how the apps *behave*. This folder describes how their *repositories look*. Rebuilding a site never changes an app's script, version or `releases.json`, and never needs a release.

## 1. The result, in every repository

| Piece | Where | Same in every app |
| --- | --- | --- |
| Header | top of `README.md` | Centered logo (`docs/logo.svg`, 96 px), name, bold three-word tagline, one-sentence pitch, the Scriptable line, the badge row |
| Badges | header | version (live from `releases.json`), iOS · Scriptable, AI, built with app-blueprints, last commit, license (only with a `LICENSE` file). Flat-square, label `#0E1116`, version in the app's accent |
| Hero | under the header | The first three screenshot cards, side by side |
| Sample-data note | under the hero | `> [!NOTE]` saying the screens use invented data, plus anything special about them |
| Special disclaimer | under the note | `> [!IMPORTANT]` one-liner when the app has one (unofficial client, health and safety, safety-critical use), linking to **Disclaimer** |
| Sections | body | Highlights · Screenshots · Install · How to use it · Widget · AI · Settings · Updates and what's new · Privacy and security · How it works (optional) · Troubleshooting (optional) · Built with · Disclaimer · More apps like this · License |
| Screenshot cards | `docs/screenshots/NN-<id>.png` | Numbered, labelled, borderless cards on the shared brand ground (below) |
| Scenario | `docs/site/scenario.js` | The data and steps that produce every card, so anyone can regenerate them |
| About box | GitHub repository settings | Description, website, topics from `docs/site/repo.json` |

The skeleton is [`TEMPLATE.md`](TEMPLATE.md). Section names, order and the header block are fixed; the content under each heading is the app's own.

## 2. Screenshot cards

Every card has the same anatomy:

- **Ground**: the brand ground every logo and widget uses, `#171B22` fading to `#0E1116`, with a faint glow of the app's accent at the top. Dark in both GitHub themes, so the cards look the same in light and dark mode.
- **Label block**: a pill with the card number in the app's accent, the app name in small caps, a **label** of 2 to 5 words saying what the screen shows (`Kudos to everyone`, `Ask about the week`), and a **caption** of one sentence (max ~90 characters) saying why it matters.
- **Screen**: the phone screen at 390 × 844 points, rounded corners, no device frame, no border, no stroke. A card may crop the screen (`crop: { top, height }`) to stay compact, but every phone card in one README uses the same height unless a crop is clearly better.
- **Widgets**: the widget rendered by the app's own `renderWidget()`, centred on a soft wallpaper inside the same card.
- **Size**: 360 points wide, rendered at 2× (720 px). Shown at `width="31%"`, three to a row.

Choosing the shots (8 to 14 per app):

1. **01–03 are the hero.** The app's three most distinctive capabilities, the first one being the main screen with real-looking content. Not the launch screen, not Settings.
2. Then the remaining key capabilities, one card per capability, in the order of the Highlights list.
3. Then the shared ones, in this order, when the app has them: the **launch screen**, **Settings** (Appearance visible), **AI settings** (a key in use, token usage visible), the **update sheet**, one **dark mode** screen, the **widget** (medium; add large or small when it shows something different).
4. One capability per card. If a label needs "and", it's two cards or a better label.
5. Every card's `alt` text in the README says in a sentence what the screen shows.

Sample data rules:

- Invented people, places, companies, plates and numbers only. Never real names, faces, accounts, tokens, keys or personal data, and never the owner's own data. Photos only when they are free to use (public domain or the app's own bundled assets) and show no identifiable real person.
- Dates are relative to the scenario's fixed `now` (default Thursday 29 October 2026, 08:12 Vilnius), so every rebuild shows a believable "today".
- Keys in fixtures are fake (`sk-ant-demo-…1234`); the Keychain is in memory and nothing leaves the emulator.

## 3. Regenerating the screenshots

The tools in [`tools/`](tools) run the app's **real script** in a Scriptable emulator (Node + headless Chromium through Playwright), so the screens are the app's actual interface, not mock-ups.

```bash
# once: sharp (small palette PNGs), and Playwright with Chromium if node can't already require('playwright')
(cd app-blueprints/repo-site && npm install)
node -e "require('playwright')" 2>/dev/null || (cd app-blueprints/repo-site && npm i --no-save playwright && npx playwright install chromium)
# then, with the app checked out next to app-blueprints
node app-blueprints/repo-site/tools/capture.js VisionX                       # every card
node app-blueprints/repo-site/tools/capture.js VisionX --only=01-gate,08-launch
node app-blueprints/repo-site/tools/capture.js VisionX --compose-only        # re-label without re-running
node app-blueprints/repo-site/tools/check-readme.js VisionX                  # README against the template
```

Raw screens go to `docs/site/raw/` (git-ignored); finished cards to `docs/screenshots/`, about 60 to 120 KB each. Delete cards the README no longer uses (`check-readme.js` lists them). A full run of 14 shots takes two to four minutes; the six apps can run in parallel.

### What the emulator does

[`tools/scriptable-emulator.js`](tools/scriptable-emulator.js) runs the script in a Node `vm` with stubs for `WebView`, `Request`, `FileManager` (in memory), `Keychain` (in memory), `Alert` (scripted answers), `Device`, `Timer`, `Notification`, `CallbackURL`, `ListWidget` and the rest, and a fixed clock.

- Each `WebView` is a Chromium page at 390 × 844, 2× scale, iPhone user agent, light or dark colour scheme.
- `loadHTML(html, base)` serves the HTML at `base` (default `https://app.scriptable.local/`); `evaluateJavaScript(js, useCallback)` runs in the page, with `completion()` when asked.
- Bridges work as on the phone: navigations to custom schemes (`blogpulse://…`, hidden `vsbridge://` frames) reach the script's `shouldAllowRequest`.
- **Every** network request, from `Request` or from any page, goes through the scenario's fixtures; anything unmatched gets a 404 and is logged as `· Request without fixture`. Nothing reaches the internet.
- A widget run (`widget: 'medium'`) sets `config.runsInWidget` and `widgetFamily`, and the `ListWidget` tree passed to `Script.setWidget` is drawn as HTML.

### `docs/site/scenario.js`

```js
module.exports = {
  app: { name: 'VisionX', script: 'VisionX.js', accent: '#E5383B' },   // accent = WIDGET.accent in the script
  now: Date.UTC(2026, 9, 29, 6, 12),            // the fixed "now"
  locale: 'en_US', timezone: 'Europe/Vilnius',
  settle: 2900,                                  // ms to wait after the window opens (past the 2.4 s launch screen)
  fixtures: (shot) => ({                         // fresh for every shot
    files: { '<absolute path>': '<string | Buffer | object>' },   // see emu.paths: documents (iCloud) and local
    keychain: { VISIONX_ANTHROPIC_KEY: 'sk-ant-demo-0000000000001234' },
    alerts: [0],                                 // answers for Alert.present(): index, or { index, text: [...] }
    routes: [                                    // first match wins
      { match: /releases\.json/, respond: { json: { /* … */ } } },
      { match: 'api.anthropic.com/v1/messages', respond: (req) => ({ json: { content: [{ type: 'text', text: '…' }], usage: { input_tokens: 900, output_tokens: 120 } } }) },
      { match: /icon-1024\.png/, respond: { file: __dirname + '/../icon-1024.png' } },
    ],
    pageInit: '/* JS run in every page before its own scripts, e.g. a fake camera */',
    globals: (ctx, emu) => ({ /* extra or replaced Scriptable globals */ }),
    callback: (url, params) => ({ result: '…' }),   // CallbackURL (Shortcuts) answers
  }),
  shots: [
    { id: '01-gate', label: 'Opens the gate for a known car', caption: 'Reads the plate, checks your list and runs the “Open Gate” shortcut.',
      run: async (h) => { await h.tap('text=Start session'); await h.wait(6000); } },
    { id: '07-launch', label: 'Launch screen', caption: '…', settle: 900 },                 // caught mid-animation
    { id: '10-dark', label: 'Dark mode', caption: '…', dark: true },
    { id: '12-widget', label: 'Home Screen widget', caption: '…', widget: 'medium' },
    { id: '05-report', label: '…', caption: '…', crop: { top: 0, height: 700 } },
    { id: '11-update', label: '…', caption: '…', script: 'docs/site/raw/VisionX-1.18.0.js' },   // another copy of the script, e.g. an older VERSION
  ],
};
```

`capture.js` runs the script in the scenario's `timezone` (it sets `TZ`), so the script's own dates, `DateFormatter` and the widget show local times.

A shot's `run(h)` gets: `h.page` (Playwright page), `h.tap(selectorOr'text=…')`, `h.type(selector, text)`, `h.scrollTo(selectorOrY, offset)`, `h.scrollEl(container, y)`, `h.eval(fn, arg)`, `h.wait(ms)`, `h.bridge(js)` and `h.emu` (files, keychain, requests made, notifications).

Getting a scenario right:

- Seed the app's saved state through `files` (its JSON in the app folder) rather than clicking through onboarding. Read the script's `load`/`readStore`/`settings.json` code for the exact paths: `emu.paths.documents` is iCloud Drive › Scriptable, `emu.paths.local` is the local Documents folder.
- Answer the app's own network calls with fixtures shaped exactly like the real responses (feeds, APIs, the site the app reads), and AI calls with fixed replies, so the AI screens are deterministic.
- Look at every raw screen before composing. Fix the scenario, not the card, when something looks wrong: empty states, errors, half-loaded lists, toasts in the way.
- If the app needs a capability the emulator lacks, add it through `globals` in the scenario first; move it into the emulator only when a second app needs it.

Lessons from the first full rebuild (October 2026, all six apps):

| Situation | What works |
| --- | --- |
| Camera (`getUserMedia`) | `pageInit` replaces it with `canvas.captureStream()` of a drawn SVG scene; the AI fixtures answer in the same order as the scenes (VisionX) |
| Random content (rounds, picks) | Seed `Math.random` in `pageInit` and drive the page through its own functions (Reading Stars) |
| Speech (`speechSynthesis`) | Headless Chromium has no voices: stub `speechSynthesis` and `SpeechSynthesisUtterance` in `pageInit` (BlogPulse) |
| A site the app reads in a hidden WebView | Route the site's own URLs (`https://www.strava.com/…`) to fixtures shaped exactly like the real responses; every page's requests go through the same fixtures (Strava Daily Digest) |
| A big public data set | Keep only what the shots show in `docs/site/fixtures/`, and seed the app's "downloaded" state through `files` (Go2FGym: 466 exercises, 13 photos, 1.5 MB) |
| The AI settings sheet is taller than the screen | Scroll so the key in use and the token totals both show, or set text size Small for that shot, or use two cards (key, then usage) |
| The update sheet | Never invent features: offer the app's real newest release to an older copy of the script (`script:` on the shot), or relabel the real newest entry as the next version |
| Launch screen | `settle` 900 to 1700 ms, depending on how long the app shows a blank window first; check the tagline is visible |
| Things the emulator can't draw | Native alerts and notifications, Lock Screen accessory widgets clipped oddly: describe them in the README instead of forcing a card |

## 4. Writing the README

Start from [`TEMPLATE.md`](TEMPLATE.md) and the current README side by side.

1. **Keep everything true and useful** from the current README: features, steps, tables, setup of shortcuts, worked examples, limits, troubleshooting. Move long reference material into `<details>` blocks instead of deleting it.
2. **Keep every special disclaimer word for word** (unofficial client, trademark, terms of use, health and safety, "a plate is not proof of identity", money and kids, at your own risk). Put the full text under **Disclaimer**, a one-line `[!IMPORTANT]` under the header, and leave short in-context warnings where they were.
3. **Check every claim against the script** at its current `VERSION`: names of buttons, settings and sections, defaults, limits. The README describes the app as it is, not as it was.
4. Plain, direct English; short sentences; no marketing superlatives; no em dash chains. Bold the lead of each bullet. Emojis only where the app itself uses them in its UI.
5. Images: the cards from `docs/screenshots/`, `docs/logo.svg`, the icons in **More apps like this**, and photos an app already uses to document real use (`docs/photos/`). No tables around images (GitHub draws table borders).
6. **The Install section and `install.js` follow [`INSTALL-GUIDE.md`](INSTALL-GUIDE.md)**: the template's section word for word, an installer generated by `tools/make-installer.js`, and no other installer file or `docs/INSTALL.md`.
7. Links: relative inside the repository, absolute to other repositories. `#ai`, `#disclaimer` and the other section anchors must resolve.

## 5. The About box

Each app keeps its About settings in `docs/site/repo.json`:

```json
{
  "description": "Sees. Understands. Acts. Your iPhone as an AI smart camera that runs Apple Shortcuts when something happens. A Scriptable app.",
  "homepage": "https://github.com/gadominas/VisionX#readme",
  "topics": ["scriptable", "scriptable-app", "ios", "iphone", "javascript", "app-blueprints", "ai", "claude", "openai", "…the app's own…"]
}
```

- **Description**: the tagline, then one sentence on what it does, ending with "A Scriptable app." Under 350 characters.
- **Website**: the README (`…#readme`) unless the app has a real site.
- **Topics**: the shared ones first, `scriptable`, `scriptable-app`, `ios`, `iphone`, `javascript`, `app-blueprints`, then `ai`, `claude`, `openai` when the app uses AI, then 3 to 8 of the app's own (lowercase, hyphens, max 20 in total).

Apply them (needs the GitHub CLI logged in as the owner):

```bash
repo-site/tools/apply-about.sh ../VisionX     # reads docs/site/repo.json and sets description, website and topics
```

## 6. Checklist before pushing

- [ ] `capture.js` ran without `✗`; no unexpected `Request without fixture` lines.
- [ ] `check-readme.js` passes (it also checks the Install section and that `install.js` is generated and current).
- [ ] Every card looked at: right screen, no error, no empty state, no real personal data.
- [ ] The README follows `TEMPLATE.md`: header, badges, hero, notes, sections in order.
- [ ] Every image path exists; no unused files left in `docs/screenshots/`.
- [ ] Disclaimers kept in full; claims checked against the script's current `VERSION`.
- [ ] `docs/site/repo.json` updated; About applied.
- [ ] `docs/site/raw/` is in `.gitignore`; anything in `docs/site/fixtures/` is invented or free to use, and small (a few MB at most).
- [ ] Commit message: `Repository site: <what changed>` (no version bump, no `releases.json` entry).

## 7. Prompt for a coding agent

```markdown
Follow https://github.com/gadominas/app-blueprints/blob/main/repo-site/REBUILD.md.
Rebuild the repository site of [VisionX] (github.com/gadominas/[VisionX], branch [main]):
regenerate the screenshot cards from docs/site/scenario.js (create or extend it for [the new trigger editor]),
rewrite README.md on TEMPLATE.md keeping every disclaimer, update docs/site/repo.json and apply the About box.
Do not change the app's script or releases.json.
```
