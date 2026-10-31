# Instructions for coding agents

You are applying shared blueprints and recipes to one of Gediminas Siutilas’s apps. The goal is that every app looks, feels and behaves the same for the capabilities covered here, and that a bug fixed in one app is fixed the same way in all of them. Follow the blueprints **exactly**: same structure, same function names, same UI order, same wording. Adapt only what is explicitly per-app.

Read this whole file before changing any code.

## 1. Blueprint catalog

| Id | Name | Version | File | Raw URL | Reference implementation | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| `in-app-updates` | In-app updates | 1.0.0 | [blueprints/in-app-updates.md](blueprints/in-app-updates.md) | https://raw.githubusercontent.com/gadominas/app-blueprints/main/blueprints/in-app-updates.md | https://github.com/gadominas/StravaFeed (v1.6.0) | — |
| `settings` | Settings | 1.1.0 | [blueprints/settings.md](blueprints/settings.md) | https://raw.githubusercontent.com/gadominas/app-blueprints/main/blueprints/settings.md | https://github.com/gadominas/BlogPulse/blob/main/BlogPulse.js (v1.13.0) | — |
| `ai-configuration` | AI configuration | 1.0.0 | [blueprints/ai-configuration.md](blueprints/ai-configuration.md) | https://raw.githubusercontent.com/gadominas/app-blueprints/main/blueprints/ai-configuration.md | https://github.com/gadominas/BlogPulse/blob/main/BlogPulse.js (v1.0.0) | `in-app-updates`, `settings` |
| `launch-screen` | Launch screen | 1.0.0 | [blueprints/launch-screen.md](blueprints/launch-screen.md) | https://raw.githubusercontent.com/gadominas/app-blueprints/main/blueprints/launch-screen.md | https://github.com/gadominas/VisionX/blob/main/VisionX.js (v1.17.1) | — |
| `widgets` | Widgets | 1.0.0 | [blueprints/widgets.md](blueprints/widgets.md) | https://raw.githubusercontent.com/gadominas/app-blueprints/main/blueprints/widgets.md | https://github.com/gadominas/VisionX/blob/main/VisionX.js (v1.19.0) | `settings`, `launch-screen` |
| `ai-invitation` | AI invitation | 1.2.1 | [blueprints/ai-invitation.md](blueprints/ai-invitation.md) | https://raw.githubusercontent.com/gadominas/app-blueprints/main/blueprints/ai-invitation.md | https://github.com/gadominas/Stockit/blob/main/Stockit.js (v1.13.3) | `ai-configuration`, `in-app-updates`, `settings` |
| `read-aloud` | Read aloud | 1.0.1 | [blueprints/read-aloud.md](blueprints/read-aloud.md) | https://raw.githubusercontent.com/gadominas/app-blueprints/main/blueprints/read-aloud.md | https://github.com/gadominas/BlogPulse/blob/main/BlogPulse.js (v1.15.1) | `settings` (`ai-configuration` for the AI voice) |
| `usage-analytics` | Anonymous usage analytics | 1.1.0 | [blueprints/usage-analytics.md](blueprints/usage-analytics.md) | https://raw.githubusercontent.com/gadominas/app-blueprints/main/blueprints/usage-analytics.md | https://github.com/gadominas/StravaFeed/blob/main/Strava%20Daily%20Digest.js (v1.24.0) | `settings`, `in-app-updates` |

A blueprint's front matter (`id`, `title`, `version`, `updated`, `reference`, `depends_on`) is the source of truth; this table mirrors it.

**Snippets.** A blueprint may ship its code as files in `snippets/<id>/` (read aloud does). They are part of the blueprint: the same version, the same tag, the same names. Copy them from the tag the app follows, adapt only the per-app values the blueprint lists, and keep their function names, ids and classes.

When asked to “apply all blueprints”, apply them in the order of this table: `in-app-updates`, `settings`, `ai-configuration`, `launch-screen`, `widgets`, `ai-invitation`, `read-aloud`, `usage-analytics`. Every change ships as a version (in-app updates), the Settings sheet is where the AI settings row lives, AI configuration follows, then the launch screen, which touches nothing else, then the widget, which takes its tunables from Settings and its name and accent from the launch screen, then the AI invitation, which waits for the launch screen and the update offer and leads into the AI settings sheet, then read aloud, for apps that show text worth listening to (it adds a Listening section to Settings and uses AI configuration only for the AI voice), and last anonymous usage analytics, which counts what all the others added and adds a Privacy section to Settings. Apps without AI features skip `ai-configuration` and `ai-invitation`. Usage analytics is opt-in for the app's owner too: apply it only when asked; every app uses the shared PostHog project in the blueprint's Step 0.

**Overlaps.** `ai-configuration` governs AI keys, providers, models and token usage; `settings` governs every other user choice. Never add an API key field, model field or thinking-effort control to the Settings sheet: put one **AI settings** row in the main feature's section instead. When `settings` is applied to an app that already follows `ai-configuration`, keep its AI sheet as it is.

## 1a. Recipes (apply them always)

A **recipe** is a set of coding rules that fixes a class of bug once, the same way in every app. It adds no feature the user sees, so it is not a blueprint: there is nothing to opt into. **Every app follows every recipe.**

| Id | Name | Version | File | Prevents | Reference implementations |
| --- | --- | --- | --- | --- | --- |
| `safe-startup` | Safe start-up | 1.1.0 | [recipes/safe-startup.md](recipes/safe-startup.md) | Blank or black screen on open, especially from the widget, after quick taps, or with slow iCloud; data overwritten after a failed read; a damaged file blocking every later save | BlogPulse 1.12.0, Stockit 1.13.3 |

Apply the recipes:

- **When building a new app:** from the first commit, before any feature.
- **When applying any blueprint, rebuilding or refactoring an app:** check the app against every recipe first, and apply what's missing in the same release. Touching start-up, storage, the run code (`main()`), the widget branch or the page's boot means re-checking `safe-startup`.
- **When fixing a bug whose symptom a recipe lists** (for example "blank screen when opened from the widget"): apply the recipe, don't write a local fix. If the recipe doesn't cover the case, fix the recipe here and then apply it.
- **When asked to review an app:** report recipe gaps with the blueprint gaps (section 7).

How to apply one: read the whole recipe (its rules, per-app values, steps, testing checklist and pitfalls are requirements), adapt only the per-app values it lists, keep its names (`loadData`, `bootApp`, `startLog`, `__boot`, `__parts`, …), run its static checks, and copy its testing checklist into your summary. Record it in the app's `docs/BLUEPRINTS.md` under a **Recipes** heading (`| Recipe | Version | Since app version | Deviations |`). Recipes don't go in the script's `BLUEPRINTS` block or in Built with: they describe how the code is written, not what the user gets.

## 2. What these blueprints target

Single-file [Scriptable](https://scriptable.app) apps for iOS that render their UI in a `WebView`:

- **Scriptable side**: native JavaScript with `Request`, `Keychain`, `FileManager`, `Alert`, `WebView`.
- **Page side**: HTML, CSS and JS loaded with `ui.loadHTML(...)`, usually built inside a JavaScript template string.
- **Bridge**: the page navigates to a custom URL (`myapp://action?...`), `shouldAllowRequest` handles it, and the Scriptable side replies with `ui.evaluateJavaScript(...)`.

If the target app is not this kind of app (for example a web app or React Native), stop and ask before adapting a blueprint; the patterns translate, the code does not.

## 3. Workflow

### Step 1: gather per-app parameters

Before writing code, establish and state these values. Infer them from the target repository where possible; ask only for what you cannot find.

| Parameter | Example | Used by |
| --- | --- | --- |
| Repository and branch | `gadominas/Go2FGym`, `main` | all |
| Script file | `Go2FGym.js` | all |
| `APP_ID` (lowercase, never changes) | `go2fgym` | in-app updates |
| Keychain prefix (uppercase) | `GO2FGYM_` → `GO2FGYM_ANTHROPIC_KEY`, `GO2FGYM_OPENAI_KEY` | AI configuration |
| Snooze Keychain key | `go2fgym-update-snooze` | in-app updates |
| Current and next `VERSION` | `1.0.0` → `1.1.0` | all |
| Theme colour variables | the app’s equivalents of `--card`, `--soft`, `--mut`, `--accent`, `--rule`, `--ink`, `--danger` | all UI |
| Bridge helpers | names of the app’s `send`, `push`/state function, `toast`, `js`, settings save | all |
| App folder | `Go2FGym` (holds `settings.json`) | settings |
| Colour token mapping | the app’s current variables → `--paper`, `--sheet`, `--ink`, `--ink-2`, `--muted`, `--rule`, `--signal`, `--signal-wash`, `--amber`, `--amber-wash`, `--danger` | settings |
| Settings mapping table | every hardcoded value → Appearance, app section, remembered pick, tunable, internal state or code constant | settings (show it to the user and wait for confirmation before writing code) |
| AI feature tags and labels | `suggestions: "Comment ideas"` | AI configuration |
| PostHog project | the shared one: `https://us.i.posthog.com`, `phc_yAi2PxJCRioWEKLF3uockdCf3QvyQdNABivwqpE4NCWR` (blueprint Step 0); `APP_ID` tells the apps apart | usage analytics |
| Install-ID Keychain name | `go2fgym-install-id` | usage analytics |
| Event catalog | 4–8 of the app's features as `object_verb` events with fixed-choice properties (show it to the user and wait for confirmation) | usage analytics |
| Background AI jobs | `summaries` on refresh, or none | AI configuration |
| Existing code to replace | old AI calls, old key storage, old version checks | all |

### Step 2: read before you write

1. Read the full blueprint, not just the code blocks. The rules, tables and pitfalls are requirements. Read every recipe in section 1a too, and check the app against them.
2. Open the reference implementation and compare. If the blueprint and the reference disagree, the **blueprint wins**; mention the difference in your summary.
3. Read the target app’s script end to end: its settings block, bridge, click handler, state pushed to the page, theme variables and start-up order.

### Step 3: implement

- Follow the blueprint’s steps in order.
- **Keep the blueprint’s names**: functions (`aiCall`, `recordUsage`, `checkForUpdate`, `applyUpdate`, …), bridge actions (`aikey`, `update-now`, …), settings fields, CSS classes and element ids. Shared names are what make apps comparable and future fixes portable.
- **Adapt only per-app values**: app id, Keychain names, URLs, script file name, theme variable names, feature tags, bridge helper names.
- **Replace, don’t duplicate.** Route existing behaviour through the blueprint’s functions (every AI request through `aiCall`) and remove the old path. Migrate stored data so users never re-enter anything (see the key migration snippet in the AI blueprint).
- **Respect the app’s existing structure**: declare constants above any code that runs, keep the start-up call at the end of the file, insert code next to related code rather than appending everything at the bottom.
- **Page-side code inside a template string** must not contain backticks or `${` unless intentionally interpolated on the Scriptable side. The in-app updates page code is ES5 for this reason; keep it so.

### Step 4: verify

You usually cannot run Scriptable. Do everything you can statically, then hand the rest to the user.

- Syntax-check the script (for example `node --check` on a copy with Scriptable-only top-level `await` wrapped, or an equivalent parser).
- Grep for the invariants in section 5.
- Check `releases.json` is valid JSON, newest first, and its top `version` equals `VERSION` in the script.
- Run `node tools/changelog.js` and include the regenerated `CHANGELOG.md`.
- Copy the blueprint’s **testing checklist** into your final summary for the user to run on a phone, in light and dark mode, plus the checklist of every recipe you applied.
- Run each applied recipe's static checks (for `safe-startup`: no top-level `await load(...)` except settings, no `clientState()` in `buildHTML`, empty window before the real page, `loadData()` in the widget branch).

### Step 5: release and record

1. Bump `VERSION`, add the `releases.json` entry (three user-facing highlights), regenerate `CHANGELOG.md`.
2. Commit the script first and `releases.json` last, so the update offer never appears before the new script exists.
3. Leave the trace (see [Blueprint versions and traces](#4-blueprint-versions-and-traces)): update the `BLUEPRINTS` block in the script, **Built with** in Settings, and `docs/BLUEPRINTS.md`, including its **Recipes** table. Do this in the same commit as the code change, every time a blueprint is applied, upgraded or partly removed.
4. Push to `main` unless the user asks for a pull request.

## 4. Blueprint versions and traces

Every blueprint has a version, and every app records which blueprint versions it was built with. This is what makes an inventory possible: you can tell, for any app, which capability came from which blueprint, and which apps are behind.

### Blueprint versions

- The version lives in the blueprint's front matter (`version: 1.0.0`) and in its **Version history** table at the end.
- **Major** (2.0.0): apps must change to stay conformant (a renamed function, a new required step, a changed storage format).
- **Minor** (1.1.0): something new that apps may adopt; apps on the previous minor version are still conformant.
- **Patch** (1.0.1): wording, examples or fixes to the doc that don't change what apps do.
- Each version is tagged in this repository as `<id>-v<version>` (for example `settings-v1.0.0`), so an app can link to, and an agent can read, exactly the version the app follows.
- Releasing a blueprint version: update the front matter, add the Version history row, update the catalog in this file and the README, commit, then tag and push the tag.

### The trace in each app

An app carries its trace in three places, which must always agree:

1. **The `BLUEPRINTS` block in the script**, near `VERSION`. It is the source of truth and travels with the installed app. Keep this exact one-line-per-blueprint shape, single quotes and all, because inventory reads it with a pattern, without running the script:

   ```javascript
   // ───────── Blueprints ─────────
   // Shared blueprints this app was built with (github.com/gadominas/app-blueprints). One line per blueprint, in this exact shape:
   // inventory tools read it without running the script, and Settings › Built with shows it.
   const BLUEPRINTS_REPO = 'https://github.com/gadominas/app-blueprints';
   const BLUEPRINTS = [
     { id: 'in-app-updates', name: 'In-app updates', version: '1.0.0', since: '1.5.0' },
     { id: 'settings', name: 'Settings', version: '1.0.0', since: '1.7.0' },
     { id: 'ai-configuration', name: 'AI configuration', version: '1.0.0', since: '1.6.0' },
     { id: 'launch-screen', name: 'Launch screen', version: '1.0.0', since: '1.8.0' },
     { id: 'widgets', name: 'Widgets', version: '1.0.0', since: '1.9.0' },
   ];
   ```

   `version` is the blueprint version the app now follows; `since` is the app version that brought it in line with that blueprint version. List blueprints in catalog order.

2. **Settings › Built with**, read-only and last in the sheet, rendered from `BLUEPRINTS`: each blueprint with its version, linking to its tagged file, and a link to this repository ([settings blueprint, Step 9](blueprints/settings.md#step-9-built-with-the-blueprint-trace)). An app without the Settings sheet yet shows the same rows wherever its version line and settings live, until it adopts the sheet.

3. **`docs/BLUEPRINTS.md`** in the app repository, for people reading the repo, with the deviations:

   ```markdown
   # Blueprints

   This app follows the shared blueprints in https://github.com/gadominas/app-blueprints.
   The script's `BLUEPRINTS` block is the source of truth; this table mirrors it and adds deviations.

   | Blueprint | Version | Since app version | Deviations |
   | --- | --- | --- | --- |
   | [in-app-updates](https://github.com/gadominas/app-blueprints/blob/in-app-updates-v1.0.0/blueprints/in-app-updates.md) | 1.0.0 | 1.5.0 | none |
   | [ai-configuration](https://github.com/gadominas/app-blueprints/blob/ai-configuration-v1.0.0/blueprints/ai-configuration.md) | 1.0.0 | 1.6.0 | No background jobs, so “What AI does” has no switch |
   ```

### When to update the trace

| Situation | What to do |
| --- | --- |
| Applying a blueprint for the first time | Add its line; `since` = the version being released |
| Bringing an app up to a newer blueprint version | Change `version`, set `since` to the version being released |
| Rebuilding or refactoring an app | Keep the block; check each listed blueprint is still followed, and fix the code or the trace (with a deviation) before releasing |
| An app that predates traces (no `BLUEPRINTS` block) | Add the block on its next release: list what its `docs/BLUEPRINTS.md` and the code show, at version `1.0.0` if the code matches that version, otherwise note the gap as a deviation |
| Removing a capability that came from a blueprint | Remove its line and its Built with row, and say so in the release notes |

### Inventory and validation

`node tools/inventory.js` (run from this repository) reads every blueprint's front matter and every app listed in `tools/apps.json`, fetches each app's script and `docs/BLUEPRINTS.md` from GitHub, and reports per app and blueprint: the version followed, the latest version, and whether it is current, behind, missing a trace, or inconsistent between the script and the docs. It also checks that every blueprint version has its tag. Add new apps to `tools/apps.json`.

## 5. Invariants (never break these)

**Security and privacy**
- API keys are entered in a native `Alert` secure field, stored only in the Keychain under app-prefixed names, and sent only to their own provider. They never appear in settings JSON, the page, logs, bridge URLs or the repository. The page sees masked keys only.
- Text from the network or from AI is escaped before it is inserted into the page.
- Never commit tokens, keys or personal data, including in examples and test fixtures. (A PostHog project key, `phc_…`, is made to be public and may sit in the script; a personal key, `phx_…`, never.)
- Usage analytics is opt-in: nothing is sent before the person says yes; events are anonymous (`$process_person_profile: false`, a random install ID), carry counts and fixed choices only, never names, account IDs, text, URLs, photos or anything read from a service; turning it off deletes the install ID; every app sends to the shared project (US cloud, `USAGE.HOST = 'https://us.i.posthog.com'`) with `app: APP_ID` on every event; the README says what is sent and where.

**Settings**
- Settings are loaded before the app, widget and Shortcuts branches, and saved after every change (no Save button).
- Every app has the same Appearance section: Auto plus six palettes, Comfortable/Compact/Tiny, Small/Default/Large/Larger, Sans serif/Serif, with these exact labels.
- Every colour is a shared token and every font size is `calc(<px> * var(--ts))`; form fields stay at 16px.
- Tunables are declared in the `CONFIG` registry, read only through `cfg()`, validated and clamped by `setCfg`, and stored only when they differ from the default; keys are never renamed.
- The `set` action only accepts keys on its allow-list.
- Secrets are never settings: each has its own Keychain entry, is typed into a native secure prompt, and the page sees only its last four characters.
- Section order: Appearance, the app’s own sections, Updates, tunables, Built with; the settings icon is an SVG line icon left of refresh.

**Traces**
- Every app has a `BLUEPRINTS` block in the exact shape above, listing every blueprint it follows with the version it follows; Built with and `docs/BLUEPRINTS.md` say the same.
- The trace is updated in the same commit as the code it describes; never claim a blueprint version the code doesn't follow.

**Behaviour**
- Versions are compared numerically with `cmpVer`, never as strings.
- The update check never blocks start-up and never throws; failures mean “no offer this time”.
- The installer verifies HTTP 200, the `APP_ID` line and a strictly newer `VERSION` before overwriting `module.filename`.
- `const VERSION = '…';` stays on one line with single quotes.
- Every AI request goes through `aiCall` with a user-facing feature tag; usage is saved after every request.
- OpenAI requests omit `max_tokens`; Claude requests include it.
- Without a key, AI-only features are hidden (not disabled), fallbacks are labelled “no AI”, and every hint points to **Settings › AI settings**.
- The AI invitation appears only while no AI key exists (the key alone decides, never the "In use" badge), more than once every 3 days, on a launch that offers an update, over another sheet, or outside the app's page; **Don't remind me again** ends it for good.

**Start-up (recipe `safe-startup`)**
- Only settings are read before the window; every other data file is read in `loadData()` after an empty window in the app's ground colour is on screen, and the real page is built inside that visible window.
- Every iCloud read has a time limit; a data file that didn't arrive is never written; a file that arrived damaged is copied aside (`<name>.broken-<time>.json`) and then saved normally.
- The page boots from data it's handed (`window.__parts`, `window.__boot`); `buildHTML()` never inlines `clientState()`; every `evaluateJavaScript` at start-up has a time limit.
- One window at a time (lock in the local temporary directory, wait at most 1.5 s, never refuse to open).
- The app's own refresh, the update check and the widget icon start after the first screen (0.7 s, 3.5 s, 6 s).
- A start-up log is kept locally and shown in **Settings › Updates › Start-up log**; a stalled start-up says so on screen.
- The widget branch calls `loadData()` itself and never builds a WebView.

**UI and feel**
- Shared sheets use the app’s own theme variables and work in light and dark mode.
- Fixed order in the AI sheet: provider in use, other provider, What AI does, Token usage.
- Destructive actions take two taps with a ~3.5 s **Confirm** state.
- `<select>` font size is at least 16px; the click handler ignores form controls.
- Stacking: Settings `z-index: 13`, AI sheet `14`, update sheet `48`, launch screen `90`.
- The launch screen is shown 2.4 s and fades out by pure CSS (never only by script), skips on tap, and respects Reduce Motion.
- The widget branch (`config.runsInWidget || config.runsInAccessoryWidget`) comes right after settings load and before anything that builds a WebView; a widget run never presents UI and never shows an error. Widgets use the shared frame and brand colours; an app writes only `WIDGET` and `widgetModel()`, and never puts secrets, money hidden from kids, or locked content in a widget.
- Re-renders keep the sheet’s scroll position.
- AI output is labelled `✦ AI … by <Provider>`.
- User-facing copy (buttons, toasts, labels) matches the blueprint wording.

## 6. When the blueprint doesn’t fit

- If the app genuinely can’t follow a step, choose the smallest deviation, implement it, and list it under **Deviations** in `docs/BLUEPRINTS.md` with the reason.
- Never silently “improve” a blueprint inside one app. If you find a bug or a clearly better approach, implement the blueprint as written (or the minimal fix if it is broken), then tell the user and propose the change to this repository, so every app benefits.
- If a blueprint is ambiguous, prefer what the reference implementation does.

## 7. Conformance review (when asked to check an app)

Do not change code. Start from `node tools/inventory.js` to see what each app claims; then read the code to check the claim. For each applicable blueprint, and for every recipe, report:

1. **Missing**: steps or features not present.
2. **Divergent**: present but with different names, order, wording, storage or behaviour.
3. **Invariant violations** from section 5, highest risk first (security issues on top).
4. **Suggested plan**: the smallest set of changes to conform, and the version to release them in.

## 8. Final summary to the user

End every blueprint task with:

- the per-app parameters you used,
- the recipes you applied or checked, with their versions,
- the app's `BLUEPRINTS` block after your change (blueprint versions and `since`),
- what changed, file by file,
- deviations and why,
- the blueprint testing checklist to run on the phone,
- commit links, and the new version users will be offered.

## 9. Not covered here: repository sites

Rebuilding an app's README, screenshots, badges or GitHub About box is a separate task with its own instructions: [`repo-site/REBUILD.md`](repo-site/REBUILD.md). How an app is installed (one generated `install.js`, the same two-line loader and Install section in every README) is in [`repo-site/INSTALL-GUIDE.md`](repo-site/INSTALL-GUIDE.md). It is not a blueprint, has no version or trace, and must not change an app's script, `VERSION` or `releases.json`.
