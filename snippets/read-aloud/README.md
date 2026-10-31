# Read aloud — snippets

Code for the [read-aloud blueprint](../../blueprints/read-aloud.md), taken from [BlogPulse](https://github.com/gadominas/BlogPulse) 1.15.1 with names kept. These files are part of the blueprint: they change only with a new blueprint version and are tagged with it (`read-aloud-v<version>`), so an app can copy exactly the version it follows.

| File | Paste into | What it is |
| --- | --- | --- |
| `read-aloud.page.js` | the page script | The engine (sentences and pieces, iPhone and AI voices), the player, progress and jumping, highlighting, the text view, and BlogPulse's item builders as the pattern for your own |
| `read-aloud.handlers.page.js` | the page script | `readAloudAct()` for taps on the player, the text and Settings › Listening, and the `change` listener for the Listening menus |
| `listening-settings.page.js` | the page script | `listenHTML()`: the Settings › Listening section |
| `read-aloud.html` | the end of `<body>` | `#readsheet` (the text view) and `#player` |
| `read-aloud.css` | the stylesheet | Player, mode labels, highlighting, text view; shared tokens only, apart from the four mode colours |
| `read-aloud.scriptable.js` | the Scriptable side | Settings fields, `aiSpeech()` (OpenAI speech), the article reader (`extractArticle()` and its text helpers) and `readAloudBridge()` |
| `demo.html` | a browser | Runs the page side on its own, with stubs for everything an app provides |

## What the app provides

The snippets use the names every app already has from the other blueprints:

- `$`, `esc`, `send(type, data, cb)`, `toast`, `S.settings`, `lockBody()` (add `|| raOpen`), `cfgOpen` and `renderCfg()` (settings blueprint)
- `keyFor`, `recordUsage`, `fetchModels` (ai-configuration, only for the AI voice)
- `call(fn, ...args)` on the Scriptable side, to run a page function
- `refreshInPlace()`: re-renders any view that shows the text being read in place, or does nothing
- your own item builders and Listen buttons (blueprint, Steps 2 and 7)

## Try it

Download this folder and open `demo.html` in Safari or Chrome (on a Mac, PC or iPhone). Tap **Article** or **Listen to TL;DR**, then the text button in the player. The demo has no AI voice; it uses the browser's own voices.
