# App Blueprints

Shared, copy-ready patterns for building my apps so they all look, feel and behave the same way.

Each **blueprint** is one capability described end to end: what the user sees, the exact code (taken from a shipped app, with names kept), the UI and CSS, a testing checklist and the pitfalls already hit in production. Any new or existing app adopts a capability by following its blueprint, by hand or through a coding agent.

## Why this exists

My apps are small, single-script [Scriptable](https://scriptable.app) apps for iOS with a WebView UI (StravaFeed, BlogPulse, VisionX, Go2FGym, CarWatch and others). Without a shared reference, every app solves the same problems a little differently: a different settings screen, a different way of storing keys, a different update flow. That costs time on every new app and makes the apps feel unrelated.

This repository fixes that by keeping one answer per problem:

- **Consistency.** The same settings sheets, labels, buttons, toasts and behaviour in every app.
- **Speed.** A new app starts with solved problems instead of rediscovering them.
- **Proven code.** Every blueprint is extracted from an app that already shipped it, with its reference implementation linked.
- **Agent-ready.** Blueprints are written precisely enough that a coding agent can apply them without guessing. See [`AGENTS.md`](AGENTS.md).

## Blueprint catalog

| Blueprint | Version | What it gives an app | Reference app | Updated |
| --- | --- | --- | --- | --- |
| [In-app updates](blueprints/in-app-updates.md) | 1.0.0 | `VERSION` + `releases.json`, update check on open, “what’s new” sheet with three highlights, one-tap install, two-day snooze, generated `CHANGELOG.md` | [StravaFeed](https://github.com/gadominas/StravaFeed) 1.6.0 | 2026-10-27 |
| [Settings](blueprints/settings.md) | 1.1.0 | One Settings sheet with the same Appearance section in every app (colour palettes with Auto, layout density, text size, headline font on shared CSS tokens), the app's own switches, Updates, and a registry of tunables with ranges and Reset, each section in its own card; changes apply instantly and are saved in `settings.json`, so updates never reset them | [BlogPulse](https://github.com/gadominas/BlogPulse) 1.13.0 | 2026-10-30 |
| [AI configuration](blueprints/ai-configuration.md) | 1.0.0 | Claude or OpenAI with keys in the iOS Keychain, model picker from the user’s own key, connection test, one `aiCall` for every request, per-feature token usage with a 14-day chart, “✦ AI” labelling, graceful no-key mode | [BlogPulse](https://github.com/gadominas/BlogPulse) 1.0.0 | 2026-10-28 |
| [Launch screen](blueprints/launch-screen.md) | 1.0.0 | A 2.4 s branded launch screen: the app's logo draws itself, then its name and a three-word tagline; tap to skip, Reduce Motion aware, can never get stuck; five colour variables and the logo's parts are all an app changes | [VisionX](https://github.com/gadominas/VisionX) 1.17.1 | 2026-10-29 |
| [Widgets](blueprints/widgets.md) | 1.0.0 | One widget frame for every app: logo tile and name, one hero, rows, footer, on the logo's ground; small, medium, large and Lock Screen; each app only writes `widgetModel()` from its own data; never presents UI or shows an error | [VisionX](https://github.com/gadominas/VisionX) 1.19.0 | 2026-10-29 |
| [AI invitation](blueprints/ai-invitation.md) | 1.2.1 | For apps that do more with AI: an animated invitation from the first launch that names three things AI adds, shows the three steps and opens AI settings with **Add key** highlighted; about twice a week at first, weekly after a few “Later”s, only while there's no key, never over anything else, “Don't remind me again” ends it | [Stockit](https://github.com/gadominas/Stockit) 1.13.3 | 2026-10-30 |
| [Read aloud](blueprints/read-aloud.md) | 1.0.1 | Listen to any text the app shows, with iPhone voices or OpenAI's: Listen buttons named after what they read, a player with a coloured mode label (Full article, TL;DR, Story, Summaries), progress with time left and tap-to-jump, the sentence being read highlighted while read text dims, and a text view that follows the voice; ready-to-paste [snippets](snippets/read-aloud) and a browser demo | [BlogPulse](https://github.com/gadominas/BlogPulse) 1.15.1 | 2026-10-31 |
| [Anonymous usage analytics](blueprints/usage-analytics.md) | 1.1.0 | Opt-in, anonymous counts to one shared PostHog project for every app (free up to 1M events a month, each event tagged with its app): a one-time question, **Settings › Privacy** with a **Send test** row, a random install ID deleted when switched off, the same core events in every app plus each app's own, sent in batches that never slow the app, every send in the start-up log | [StravaFeed](https://github.com/gadominas/StravaFeed) 1.24.0 | 2026-10-31 |

Apply them in this order: **In-app updates** (every later change ships as a version through `releases.json`), then **Settings** (it provides the sheet the other two plug into), then **AI configuration** (its entry is one row in the Settings sheet), then **Launch screen** (self-contained, touches nothing else), then **Widgets** (uses the Settings tunables and the launch screen's name and accent), then **AI invitation** (waits for the launch screen and the update offer, and leads into AI settings; skip it, like AI configuration, in apps without AI), then **Read aloud** (for apps with text worth listening to; adds Settings › Listening, and uses AI configuration only for the AI voice), then **Anonymous usage analytics** (counts what the others added and adds a Privacy section to Settings; only when you want numbers; every app sends to the same shared PostHog project). Where two blueprints overlap, AI configuration governs AI keys, providers and models.

## Recipes

A **recipe** is a set of coding rules that every app follows while it's built, rebuilt or refactored. It fixes a class of bug once, the same way everywhere, and adds nothing the user sees, so there is nothing to opt into: **every app follows every recipe**.

| Recipe | Version | What it prevents | Reference apps | Updated |
| --- | --- | --- | --- | --- |
| [Safe start-up](recipes/safe-startup.md) | 1.1.0 | A blank or black screen when the app opens, especially from its widget, after quick taps or with slow iCloud; data saved over after a failed read; a damaged file stopping every later save. The window comes first, data is read after with time limits, the page boots from handed-over data, one window at a time, background work waits for the first screen, and a start-up log in Settings | [BlogPulse](https://github.com/gadominas/BlogPulse) 1.12.0, [StockIt](https://github.com/gadominas/StockIt) 1.13.3 | 2026-10-30 |

Apply recipes to a new app from its first commit, and to an existing app whenever you apply a blueprint or touch its start-up, storage or run code. When a bug matches a recipe's symptom, apply the recipe rather than a local fix. Each app lists the recipes it follows in `docs/BLUEPRINTS.md` under **Recipes**.

## Repository layout

```
app-blueprints/
├── README.md                 ← you are here: what this is and how to use it
├── AGENTS.md                 ← instructions for coding agents (Claude Code, Codex, Cursor, …)
├── CLAUDE.md                 ← points Claude Code at AGENTS.md
├── .github/copilot-instructions.md ← points GitHub Copilot at AGENTS.md
├── recipes/
│   └── safe-startup.md       ← no blank screen on open; window first, data after
├── blueprints/
│   ├── in-app-updates.md
│   ├── settings.md
│   ├── ai-configuration.md
│   ├── launch-screen.md
│   ├── widgets.md
│   ├── ai-invitation.md
│   ├── read-aloud.md         ← listen with highlighting; code in snippets/read-aloud
│   └── usage-analytics.md    ← opt-in anonymous counts to PostHog
├── snippets/
│   └── read-aloud/           ← ready-to-paste code for a blueprint, tagged with it, plus demo.html
├── docs/
│   └── widgets.png           ← every app's widget in the shared frame
├── templates/
│   ├── blueprint-template.md ← skeleton for writing a new blueprint
│   └── recipe-template.md    ← skeleton for writing a new recipe
├── tools/
│   ├── inventory.js          ← which app follows which blueprint version
│   └── apps.json             ← the apps the inventory checks
└── repo-site/                ← NOT a blueprint: how each app's GitHub page is rebuilt
    ├── REBUILD.md            ← the instructions (README, screenshot cards, badges, About box)
    ├── TEMPLATE.md           ← the README skeleton every app repository uses
    └── tools/                ← Scriptable emulator, capture, card composer, README check, About
```

## Repository sites (separate from the blueprints)

The blueprints decide how the apps behave. How their GitHub repositories look is kept apart, in [`repo-site/`](repo-site): one README layout, the same badges and About box, and numbered, labelled screenshot cards that are regenerated from each app's real script in a Scriptable emulator. To rebuild an app's page, follow [`repo-site/REBUILD.md`](repo-site/REBUILD.md); it never changes an app's code or version.

## How to use it

### With a coding agent (recommended)

Point the agent at this repository and the target app. For example, in Claude Code, Claude chat or any agent with GitHub access:

```markdown
Follow https://github.com/gadominas/app-blueprints/blob/main/AGENTS.md.
Apply all blueprints and recipes to [Go2FGym]:
- Repository: github.com/gadominas/[Go2FGym], branch main, script [Go2FGym.js]
- APP_ID: [go2fgym], next version: [1.1.0]
- AI features and their usage labels: [suggestions: "Comment ideas"]
- Background AI jobs: [none]
```

To apply just one blueprint, name it (“Apply the AI configuration blueprint to …”). Each blueprint also ends with its own ready-made **Prompt for Claude**.

To check an existing app, ask for a conformance review: “Check [VisionX] against all blueprints in gadominas/app-blueprints and list every difference.”

### By hand

1. Open the blueprint and its reference implementation side by side.
2. Follow the steps in order; they are written to be done top to bottom.
3. Replace the per-app values (app id, Keychain names, repository URL, colour variables).
4. Run the blueprint’s testing checklist on a phone, in light and dark mode.
5. Release through the in-app updates flow (bump `VERSION`, add a `releases.json` entry).

## Versions and traces

Every blueprint carries its own version in its front matter (shown at the top of the file on GitHub) and a **Version history** at the end. Each version is tagged in this repository as `<id>-v<version>`, for example `settings-v1.0.0`, so an app can point at exactly the version it was built with.

Every app leaves a trace of the blueprints it was built with, in three places that always agree:

- **In the script**: a `BLUEPRINTS` block next to `VERSION`, listing each blueprint's id, name, version and the app version since which it follows it. It travels with the installed app and is the source of truth.
- **In the app**: **Settings › Built with**, a read-only section listing the same blueprints and versions, each linking to its version of the blueprint here, plus a link to this repository, so anyone using the app can read how it was built.
- **In the app's repository**: `docs/BLUEPRINTS.md`, the same list plus any deviations.

The rules are in [AGENTS.md › 4](AGENTS.md#4-blueprint-versions-and-traces), so every rebuild or refactor by an agent keeps the trace up to date.

**Inventory.** To see which app follows which blueprint version and which are behind:

```bash
node tools/inventory.js            # tables: blueprint checks, then every app
node tools/inventory.js --strict   # exit code 1 if anything is behind, untraced or inconsistent
node tools/inventory.js --json     # the full result for other tools
```

It reads the blueprints here and, for each app in `tools/apps.json`, the script's `BLUEPRINTS` block and `docs/BLUEPRINTS.md` straight from GitHub. Add an app to `tools/apps.json` when it adopts its first blueprint.

## Shared conventions

These hold across every blueprint and every app:

- **One script per app**, with constants at the top and the start-up call at the very end.
- **Users never edit code.** Anything a user would reasonably want different is a setting in the Settings sheet; the code holds only defaults, and saved choices are loaded before the app, widget and Shortcuts branches.
- **One look system.** Every colour comes from the shared tokens (`--paper`, `--sheet`, `--ink`, `--signal`, …) and every font size scales with `--ts`, so the common Appearance settings work in every app.
- **Secrets live in the iOS Keychain only**, under names prefixed with the app id. Never in settings JSON, the page or the repository.
- **The page never calls external APIs.** It sends actions over the app’s `myapp://` bridge; the Scriptable side does the work and pushes state back.
- **Remote or AI-written text is escaped** before it reaches the page.
- **Shared sheets use the shared colour tokens**, so they follow every palette in light and dark mode. Shared class names are prefixed (`upd…`, `ai…`).
- **Destructive actions take two taps** (button turns into **Confirm** for ~3.5 s).
- **Every release** bumps `VERSION`, adds a `releases.json` entry with three user-facing highlights and regenerates `CHANGELOG.md`.

## Adding or changing a recipe

1. Fix the bug in a real app first, release it, and confirm the fix on a phone.
2. Copy [`templates/recipe-template.md`](templates/recipe-template.md) to `recipes/<kebab-case-name>.md`: the symptom, the causes, the rules, the per-app values, the code from the fixed app with names kept, a testing checklist and the pitfalls.
3. Add a row to the recipe table above **and** in [`AGENTS.md`](AGENTS.md) (section 1a), starting at version 1.0.0, and add the recipe's rules to the invariants in `AGENTS.md`.
4. To change a recipe, bump its version, add a row to its **Version history**, update `updated` and both tables, then tag it: `git tag safe-startup-v1.1.0 && git push origin safe-startup-v1.1.0`.

## Adding or changing a blueprint

1. Build and ship the pattern in a real app first. A blueprint describes working code, not a plan.
2. Copy [`templates/blueprint-template.md`](templates/blueprint-template.md) to `blueprints/<kebab-case-name>.md` and fill it in, keeping the reference app’s names in the code.
3. Add a row to the catalog above **and** in [`AGENTS.md`](AGENTS.md), starting at version 1.0.0.
4. To change a blueprint, bump its version (major when apps must change, minor for additions, patch for wording), add a row to its **Version history** saying what changed, update `updated` and both catalogs, commit, then tag and push the tag:

   ```bash
   git tag settings-v1.1.0 && git push origin settings-v1.1.0
   ```

5. Run `node tools/inventory.js` to see which apps are now behind.

If an app finds a bug or a better way while applying a blueprint, fix the blueprint here, not only in that app.
