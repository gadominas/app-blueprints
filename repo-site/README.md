# repo-site

How the app repositories' GitHub pages are built: one README layout, one badge row, one About box, and labelled screenshot cards regenerated from each app's real script.

This is **not a blueprint**. The blueprints in [`../blueprints`](../blueprints) describe how the apps behave; this folder only describes how their repositories look, and rebuilding a page never changes an app's code, version or `releases.json`.

| File | What it is |
| --- | --- |
| [`REBUILD.md`](REBUILD.md) | The instructions: what every repository page has, how to choose and regenerate the screenshots, how to write the README, the About box, a checklist and a prompt for a coding agent |
| [`TEMPLATE.md`](TEMPLATE.md) | The README skeleton every app repository follows |
| [`tools/scriptable-emulator.js`](tools/scriptable-emulator.js) | Runs a Scriptable script in Node with headless Chromium behind every `WebView`, fixtures behind every request, and widgets drawn as HTML |
| [`tools/capture.js`](tools/capture.js) | Runs an app's `docs/site/scenario.js` and writes its cards to `docs/screenshots/` |
| [`tools/compose.js`](tools/compose.js) | The card design: brand ground, numbered label, caption, borderless rounded screen |
| [`tools/check-readme.js`](tools/check-readme.js) | Checks a README against the template: header, badges, section order, links, unused cards, `repo.json` |
| [`tools/apply-about.sh`](tools/apply-about.sh) | Sets a repository's description, website and topics from its `docs/site/repo.json` |

Quick start, with the apps checked out next to `app-blueprints`:

```bash
(cd app-blueprints/repo-site && npm install)
node app-blueprints/repo-site/tools/capture.js BlogPulse
node app-blueprints/repo-site/tools/check-readme.js BlogPulse
app-blueprints/repo-site/tools/apply-about.sh BlogPulse
```
