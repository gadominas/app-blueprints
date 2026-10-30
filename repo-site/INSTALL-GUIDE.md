# The install guide

How every app repository tells people to install the app, and the installer behind it. The reference is [VisionX](https://github.com/gadominas/VisionX#install).

Like the rest of `repo-site/`, this is **not a blueprint**: it changes how a repository looks and how the app gets onto a phone, never the app itself. Producing or fixing an install guide never touches the app's script, its `VERSION` or `releases.json`.

## What every repository has

| What | Where | Made by |
| --- | --- | --- |
| The installer | `install.js` at the repository's root | [`tools/make-installer.js`](tools/make-installer.js), from [`templates/install.js`](templates/install.js) |
| Its two app-specific sentences | `install.kept` and `install.firstRun` in `docs/site/repo.json` | By hand |
| The install guide | The README's `## Install` section | By hand, word for word from [`TEMPLATE.md`](TEMPLATE.md) |

And nothing else about installing: no `Install <App>.js`, no `docs/INSTALL.md`, no second loader. One way in, the same in every app.

## How installing works

1. The person pastes a **two-line loader** into a new Scriptable script named *&lt;App&gt; Installer* and runs it.
2. The loader downloads the repository's current `install.js` and runs it. Because the loader always fetches it fresh, the installer can be improved without anyone pasting anything again.
3. `install.js` downloads the app script and checks it before writing anything: HTTP 200, and the app's own `const APP_ID = '…'` line, so an error page or the wrong file is never saved.
4. It saves the script **next to the installer**, in iCloud or on the device, wherever the person keeps scripts, under the script's file name (`VisionX.js` → *VisionX*). A file that is already identical is left alone ("up to date").
5. It says what happened and offers **Open &lt;App&gt;**, which runs the app through `scriptable:///run/<App>`.

Running *&lt;App&gt; Installer* again updates the app; every app also offers updates itself (in-app updates blueprint). Data and settings live in their own files, so both ways keep them.

## The installer: `install.js`

Generated, never written by hand:

```bash
node app-blueprints/repo-site/tools/make-installer.js VisionX           # writes VisionX/install.js
node app-blueprints/repo-site/tools/make-installer.js --check VisionX   # exit 1 if missing or out of date
```

It fills [`templates/install.js`](templates/install.js) with:

| Value | Taken from |
| --- | --- |
| App name and file | The one `.js` at the repository's root besides `install.js` (`Reading Stars.js` → *Reading Stars*) |
| `APP_ID` | That script's `const APP_ID = '…'` line |
| Icon colour | That script's `icon-color` header (the glyph is always `download`) |
| Repository and branch | `git remote` and the current branch, or `install.repo` / `install.branch` in `docs/site/repo.json` |
| What is kept on update | `install.kept`: one sentence, e.g. "Your presets, triggers and settings are kept." |
| What to do first | `install.firstRun`: one sentence for the "installed" message, e.g. "Apple Intelligence works straight away; for Claude or OpenAI, add a key in Settings › AI settings." |

To change how every installer behaves, change the template and generate all of them again.

`docs/site/repo.json`, next to the About box fields:

```json
"install": {
  "kept": "Your presets, triggers and settings are kept.",
  "firstRun": "Apple Intelligence works straight away; for Claude or OpenAI, add a key in Settings › AI settings."
}
```

## The README's Install section

Copy it from [`TEMPLATE.md`](TEMPLATE.md) word for word. Only two parts are the app's own:

- **The end of step 3**, after "Tap **Open &lt;App&gt;**": the first thing to do, in one sentence (sign in, add a player, accept the disclaimer and download the library). Link to a longer first-run section if the app has one.
- **"What else you need"**: one short bullet each for accounts, API keys, Shortcuts, extra downloads or a Home Screen icon. Leave the list out if there is nothing.

The update line ends with `install.kept`, the same sentence the installer shows, so the page and the phone say the same thing.

Rules:

- The loader is exactly the two lines in the template, with the repository's own `install.js` URL. Never paste the whole installer into the README, and never a one-line variant.
- The section title is `## Install`, nothing longer.
- Anything else about installing (moving to a new phone, backups, uninstalling, a slow first download) goes in the README's **Troubleshooting** section as a `<details>` block, not in a separate file.

## Moving an app to this guide

1. Add `install.kept` and `install.firstRun` to `docs/site/repo.json`; write the sentences from the old installer's messages and the old README.
2. Run `make-installer.js`, then delete any `Install <App>.js`. People who pasted an old installer keep a working copy: it downloads the app script, which doesn't move.
3. Replace the README's Install section with the template's; keep the app's first-run step and requirements.
4. Move anything from `docs/INSTALL.md` that the README doesn't already say into the README (Troubleshooting `<details>`, or "What else you need"), delete the file, and fix links to it.
5. Search the repository for the old installer's name and fix every mention.
6. Run `check-readme.js` and `make-installer.js --check`. Don't change the app's script, `VERSION` or `releases.json`.

## Checklist

- [ ] `install.js` is generated and up to date (`make-installer.js --check`)
- [ ] No `Install <App>.js` and no `docs/INSTALL.md` in the repository; nothing links to them
- [ ] The README's Install section matches the template; `check-readme.js` passes its Install checks
- [ ] On a phone: paste the loader, run it, tap **Open &lt;App&gt;**; run it again and it says "up to date"
- [ ] In airplane mode the installer says it couldn't download, and writes nothing
- [ ] The app's script, `VERSION` and `releases.json` are unchanged

## Prompt for a coding agent

```markdown
Move [App] (github.com/gadominas/[App]) to the shared install guide, following app-blueprints/repo-site/INSTALL-GUIDE.md exactly:

- Add install.kept and install.firstRun to docs/site/repo.json, generate install.js with repo-site/tools/make-installer.js, and delete any other installer file
- Replace the README's Install section with the one in repo-site/TEMPLATE.md; keep the app's first-run step and its "What else you need" bullets
- Fold docs/INSTALL.md (if any) into the README and delete it; fix every link to removed files
- Don't touch the app's script, VERSION or releases.json
- Run check-readme.js and make-installer.js --check, then commit and push
```
