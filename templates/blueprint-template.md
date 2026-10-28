# <Capability> for Scriptable apps

<Date> · @Gediminas Siutilas

## Overview

<One paragraph: what the user gets, in every app, and why it is shared.>

What the user sees, in every app:

- **<Screen or element>**: <what it shows and does>.

The pieces, all inside the app's single script:

| Piece | Lives in | Job |
| --- | --- | --- |
| `<constant or function>` | <Top of the script / Scriptable side / the page> | <one line> |

<Any single rule that runs through the whole blueprint, in bold.>

Reference implementation: [<App>.js](https://github.com/gadominas/<App>/blob/main/<App>.js). The code below is taken from it, with names kept, so the two can be compared line by line.

## Step 1: <constants and settings>

<Why, then the code.>

```javascript
// …
```

## Step N: <next piece>

<Why, then the code, then rules as a short list.>

## Testing checklist

Run these on a phone, in light and dark mode.

- [ ] <Observable behaviour>

## Pitfalls

- **<Short name>** (hit in <App>, if it was). <What goes wrong and how the code above avoids it.>

## Prompt for Claude

Paste this into a chat about another app, with this doc's link. Replace the bracketed parts.

```markdown
Add <capability> to [App], following the attached doc "<title>" exactly, with <App>.js as the reference:

- Repository: github.com/gadominas/[App], branch main, script file [App.js]
- <per-app values>
- Run the testing checklist in light and dark mode, bump VERSION, add a releases.json entry, then commit and push to main
```
