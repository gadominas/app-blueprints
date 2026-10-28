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

| Blueprint | What it gives an app | Reference app | Updated |
| --- | --- | --- | --- |
| [Settings](blueprints/settings.md) | Hardcoded values moved into a Settings sheet behind a gear icon: defaults in `CONFIG`, choices saved in the Keychain and layered on top at start (so updates never reset them), a schema-driven sheet with fixed anatomy, section order, effect classes after Save, and copy guidelines | [StravaFeed](https://github.com/gadominas/StravaFeed) 1.8.1 | 2026-10-28 |
| [In-app updates](blueprints/in-app-updates.md) | `VERSION` + `releases.json`, update check on open, “what’s new” sheet with three highlights, one-tap install, two-day snooze, generated `CHANGELOG.md` | [StravaFeed](https://github.com/gadominas/StravaFeed) 1.6.0 | 2026-10-27 |
| [AI configuration](blueprints/ai-configuration.md) | Claude or OpenAI with keys in the iOS Keychain, model picker from the user’s own key, connection test, one `aiCall` for every request, per-feature token usage with a 14-day chart, “✦ AI” labelling, graceful no-key mode | [BlogPulse](https://github.com/gadominas/BlogPulse) 1.0.0 | 2026-10-28 |

Apply them in this order: **In-app updates** (every later change ships as a version through `releases.json`), then **Settings** (it provides the sheet the other two plug into), then **AI configuration** (its entry is one row in the Settings sheet). Where two blueprints overlap, AI configuration governs AI keys, providers and models.

## Repository layout

```
app-blueprints/
├── README.md                 ← you are here: what this is and how to use it
├── AGENTS.md                 ← instructions for coding agents (Claude Code, Codex, Cursor, …)
├── CLAUDE.md                 ← points Claude Code at AGENTS.md
├── blueprints/
│   ├── settings.md
│   ├── in-app-updates.md
│   └── ai-configuration.md
└── templates/
    └── blueprint-template.md ← skeleton for writing a new blueprint
```

## How to use it

### With a coding agent (recommended)

Point the agent at this repository and the target app. For example, in Claude Code, Claude chat or any agent with GitHub access:

```markdown
Follow https://github.com/gadominas/app-blueprints/blob/main/AGENTS.md.
Apply all blueprints to [Go2FGym]:
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

## Shared conventions

These hold across every blueprint and every app:

- **One script per app**, with constants at the top and the start-up call at the very end.
- **Users never edit code.** Anything a user would reasonably want different is a setting in the gear sheet; `CONFIG` holds only the defaults, and saved choices are applied at the entry point so widgets and Shortcuts runs use them too.
- **Secrets live in the iOS Keychain only**, under names prefixed with the app id. Never in settings JSON, the page or the repository.
- **The page never calls external APIs.** It sends actions over the app’s `myapp://` bridge; the Scriptable side does the work and pushes state back.
- **Remote or AI-written text is escaped** before it reaches the page.
- **CSS uses the app’s own theme variables**, so shared sheets follow each app’s light and dark themes. Shared class names are prefixed (`upd…`, `ai…`).
- **Destructive actions take two taps** (button turns into **Confirm** for ~3.5 s).
- **Every release** bumps `VERSION`, adds a `releases.json` entry with three user-facing highlights and regenerates `CHANGELOG.md`.

## Adding or changing a blueprint

1. Build and ship the pattern in a real app first. A blueprint describes working code, not a plan.
2. Copy [`templates/blueprint-template.md`](templates/blueprint-template.md) to `blueprints/<kebab-case-name>.md` and fill it in, keeping the reference app’s names in the code.
3. Add a row to the catalog above **and** in [`AGENTS.md`](AGENTS.md).
4. When a blueprint changes in a way apps must follow, update its date in both catalogs and say what changed at the top of the blueprint, so agents can bring older apps in line.

If an app finds a bug or a better way while applying a blueprint, fix the blueprint here, not only in that app.
