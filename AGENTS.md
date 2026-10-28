# Instructions for coding agents

You are applying shared blueprints to one of Gediminas Siutilas’s apps. The goal is that every app looks, feels and behaves the same for the capabilities covered here. Follow the blueprints **exactly**: same structure, same function names, same UI order, same wording. Adapt only what is explicitly per-app.

Read this whole file before changing any code.

## 1. Blueprint catalog

| Id | File | Raw URL | Reference implementation | Depends on |
| --- | --- | --- | --- | --- |
| `in-app-updates` | [blueprints/in-app-updates.md](blueprints/in-app-updates.md) | https://raw.githubusercontent.com/gadominas/app-blueprints/main/blueprints/in-app-updates.md | https://github.com/gadominas/StravaFeed (v1.6.0) | — |
| `ai-configuration` | [blueprints/ai-configuration.md](blueprints/ai-configuration.md) | https://raw.githubusercontent.com/gadominas/app-blueprints/main/blueprints/ai-configuration.md | https://github.com/gadominas/BlogPulse/blob/main/BlogPulse.js (v1.0.0) | `in-app-updates` |

When asked to “apply all blueprints”, apply them in the order of this table.

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
| AI feature tags and labels | `suggestions: "Comment ideas"` | AI configuration |
| Background AI jobs | `summaries` on refresh, or none | AI configuration |
| Existing code to replace | old AI calls, old key storage, old version checks | all |

### Step 2: read before you write

1. Read the full blueprint, not just the code blocks. The rules, tables and pitfalls are requirements.
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
- Grep for the invariants in section 4.
- Check `releases.json` is valid JSON, newest first, and its top `version` equals `VERSION` in the script.
- Run `node tools/changelog.js` and include the regenerated `CHANGELOG.md`.
- Copy the blueprint’s **testing checklist** into your final summary for the user to run on a phone, in light and dark mode.

### Step 5: release and record

1. Bump `VERSION`, add the `releases.json` entry (three user-facing highlights), regenerate `CHANGELOG.md`.
2. Commit the script first and `releases.json` last, so the update offer never appears before the new script exists.
3. Record conformance in the app repository at `docs/BLUEPRINTS.md`:

   ```markdown
   # Blueprints

   This app follows https://github.com/gadominas/app-blueprints.

   | Blueprint | Blueprint date | Applied in version | Deviations |
   | --- | --- | --- | --- |
   | in-app-updates | 2026-10-27 | 1.1.0 | none |
   | ai-configuration | 2026-10-28 | 1.2.0 | No background jobs, so “What AI does” is omitted |
   ```

4. Push to `main` unless the user asks for a pull request.

## 4. Invariants (never break these)

**Security and privacy**
- API keys are entered in a native `Alert` secure field, stored only in the Keychain under app-prefixed names, and sent only to their own provider. They never appear in settings JSON, the page, logs, bridge URLs or the repository. The page sees masked keys only.
- Text from the network or from AI is escaped before it is inserted into the page.
- Never commit tokens, keys or personal data, including in examples and test fixtures.

**Behaviour**
- Versions are compared numerically with `cmpVer`, never as strings.
- The update check never blocks start-up and never throws; failures mean “no offer this time”.
- The installer verifies HTTP 200, the `APP_ID` line and a strictly newer `VERSION` before overwriting `module.filename`.
- `const VERSION = '…';` stays on one line with single quotes.
- Every AI request goes through `aiCall` with a user-facing feature tag; usage is saved after every request.
- OpenAI requests omit `max_tokens`; Claude requests include it.
- Without a key, AI-only features are hidden (not disabled), fallbacks are labelled “no AI”, and every hint points to **Settings › AI settings**.

**UI and feel**
- Shared sheets use the app’s own theme variables and work in light and dark mode.
- Fixed order in the AI sheet: provider in use, other provider, What AI does, Token usage.
- Destructive actions take two taps with a ~3.5 s **Confirm** state.
- `<select>` font size is at least 16px; the click handler ignores form controls.
- Stacking: Settings `z-index: 13`, AI sheet `14`, update sheet `48`.
- Re-renders keep the sheet’s scroll position.
- AI output is labelled `✦ AI … by <Provider>`.
- User-facing copy (buttons, toasts, labels) matches the blueprint wording.

## 5. When the blueprint doesn’t fit

- If the app genuinely can’t follow a step, choose the smallest deviation, implement it, and list it under **Deviations** in `docs/BLUEPRINTS.md` with the reason.
- Never silently “improve” a blueprint inside one app. If you find a bug or a clearly better approach, implement the blueprint as written (or the minimal fix if it is broken), then tell the user and propose the change to this repository, so every app benefits.
- If a blueprint is ambiguous, prefer what the reference implementation does.

## 6. Conformance review (when asked to check an app)

Do not change code. For each applicable blueprint, report:

1. **Missing**: steps or features not present.
2. **Divergent**: present but with different names, order, wording, storage or behaviour.
3. **Invariant violations** from section 4, highest risk first (security issues on top).
4. **Suggested plan**: the smallest set of changes to conform, and the version to release them in.

## 7. Final summary to the user

End every blueprint task with:

- the per-app parameters you used,
- what changed, file by file,
- deviations and why,
- the blueprint testing checklist to run on the phone,
- commit links, and the new version users will be offered.
