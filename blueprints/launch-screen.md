---
id: launch-screen
title: Launch screen for Scriptable apps
version: 1.0.0
updated: 2026-10-29
author: Gediminas Siutilas
reference: VisionX 1.17.1 (https://github.com/gadominas/VisionX/blob/main/VisionX.js)
depends_on: []
---

# Launch screen for Scriptable apps

## Overview

Every app opens on a branded launch screen for **2.4 seconds**: its logo animates in, then the app's name and a tagline of three short words, then it fades out over 0.4 s (about 2.8 s in all). Tap anywhere to skip it. The apps start the same recognisable way, the moment the page lays itself out is covered, and each app reads as a finished product rather than a script.

What the user sees, in every app:

- **Launch screen**: the logo draws itself on the brand background, the name and tagline rise in, and the screen fades out by 2.8 s. A tap skips it.
- **With Reduce Motion on**: the finished logo, name and tagline, without movement, gone after 1.6 s.

The pieces, all inside the app's page (the Scriptable side changes nothing):

| Piece | Lives in | Job |
| --- | --- | --- |
| `#splash` markup | The page, first thing in `<body>` | The screen: logo SVG split into animated parts, name, tagline |
| `.splash` CSS and `sp*` keyframes | The page's `<style>` | The whole animation, the fade-out and Reduce Motion |
| Splash script | The page, first lines of its script | Tap to skip; removes the screen from the page after the fade |

**The fade-out is pure CSS, so the launch screen can never get stuck: it disappears even if the page script fails.**

Reference implementation: [VisionX.js](https://github.com/gadominas/VisionX/blob/main/VisionX.js) (search for `splash`). The code below is the same code, with names kept, so the two can be compared line by line.

## The rules

| Rule | What it means |
| --- | --- |
| Timing | Shown 2.4 s, then a 0.4 s fade: gone by 2.8 s. Never shorter than 1.5 s or longer than 3 s. |
| Every launch | Shown each time the app opens. Scriptable builds a fresh page every run, so there is no "seen it" state to keep. |
| Tap to skip | A tap anywhere hides it at once. |
| Never sticks | The fade is a CSS animation on the screen itself; the script only removes it from the page afterwards. |
| Never blocks | The app loads underneath; Scriptable-side work (update check, data loading) runs as normal. Anything that opens meanwhile shows once it fades. |
| Reduce Motion | No movement: everything appears at once and fades after 1.6 s. |
| Accessible | One `role="img"` with the label "App name. Tagline", read once by VoiceOver, hidden from it once gone. Tagline text at 4.5:1 contrast or better. |
| Brand colours | Fixed per app, not switched by light or dark mode. |
| On top | Above every other layer of the app: `z-index: 90`. |

### Animation beats

| Time | What happens | Part (class) |
| --- | --- | --- |
| 0.05 s | The logo tile scales up from 86% and fades in | `spIcon` |
| 0.15 s | The main outline draws itself (0.8 s) | `spDraw` |
| 0.25 s | Faint frame parts fade in | `spFrame` |
| 0.75 s | The focal point pops in with a slight overshoot | `spPop` |
| 0.95 s | The sweep slides into its resting place (1 s) | `spSweep` |
| 1.05 s | The name rises in; small details fade in | `spWord`, `spDetail` |
| 1.40 s | The tagline rises in | `spTag` |
| 2.40 s | The whole screen fades out (0.4 s) | `splash` |
| 2.90 s | Removed from the page | script |

## Step 1: per-app values

Everything app-specific lives in five CSS colour variables, the logo's SVG parts and two lines of text.

| Slot | VisionX value | Rule |
| --- | --- | --- |
| `--sp-bg` background | `#0E1116` | The logo tile's own colour |
| `--sp-ink` lines | `#F6F7F9` | Outline and frame colour; high contrast on the background |
| `--sp-accent` | `#E5383B` | Focal point and the highlighted part of the name |
| `--sp-accent2` | `#2DD4BF` | The sweep; the accent again if the logo has only one |
| `--sp-muted` tagline | `#9AA3AE` | At least 4.5:1 on the background |
| Name | Vision + **X** | As in the app's header; the highlighted part in a `<span>` |
| Tagline | Sees. Understands. Acts. | Three short words or phrases, 28 characters at most |
| Label | VisionX. Sees. Understands. Acts. | "Name. Tagline", for VoiceOver |

Optional: `--sp-font` for the name (VisionX uses the app's `--display` font), `--sp-sweep-from` for the sweep's start distance (default `-120px`, in SVG units).

## Step 2: turn the logo into animated parts

Split the app's logo SVG into up to five parts by role and give each its class. Only **Draw** is required.

| Role (class) | How it animates | What it should be | VisionX |
| --- | --- | --- | --- |
| Draw (`spDraw`) | Its stroke draws from start to end | 1 to 3 outline paths, stroke only, each with `pathLength="100"` | Eye outline |
| Frame (`spFrame`) | Fades in, faint | Optional framing or background marks | Viewfinder corners |
| Pop (`spPop`) | Scales up from nothing, slight bounce | One solid focal shape in the accent colour | Red pupil |
| Detail (`spDetail`) | Fades in late | Small highlights, dots or ticks | Glint in the pupil |
| Sweep (`spSweep`) | Slides into its resting place | One line or bar in the second accent | Teal scan line |

1. Fit the logo into a **240 by 240** viewBox, inside 30 to 210 so nothing touches the edge.
2. Turn the main shape into **stroke-only** paths. A filled logo keeps its fill on a Pop or Detail part and gets one outline path to draw around it.
3. Give each part its class and drop its own `fill`, `stroke` and colour attributes: the CSS variables colour them.
4. Order the paths: frame, outlines, focal point, details, sweep. Later parts sit on top.
5. The finished frame must match the app icon exactly: the animation ends on the real logo.

A logo with no natural focal point or sweep leaves those parts out; the beats keep their timing.

## Step 3: the markup

The first thing inside `<body>`, before the app's header, so it covers the page from the first frame.

```html
<div class="splash" id="splash" role="img" aria-label="APP_NAME. TAGLINE">
  <div class="spIcon"><svg viewBox="0 0 240 240" aria-hidden="true">
    <path class="spFrame" d="FRAME_PATH"></path>
    <path class="spDraw" pathLength="100" d="OUTLINE_PATH"></path>
    <circle class="spPop" cx="120" cy="120" r="25"></circle>
    <circle class="spDetail" cx="129" cy="111" r="6"></circle>
    <path class="spSweep" d="SWEEP_PATH"></path>
  </svg></div>
  <div class="spWord">NAME_START<span>NAME_HIGHLIGHT</span></div>
  <div class="spTag">TAGLINE</div>
</div>
```

## Step 4: the CSS

Anywhere in the page's `<style>`. Change only the five colour values on `.splash`.

```css
.splash{--sp-bg:#0E1116;--sp-ink:#F6F7F9;--sp-accent:#E5383B;--sp-accent2:#2DD4BF;--sp-muted:#9AA3AE;
  position:fixed;inset:0;z-index:90;background:var(--sp-bg);color:var(--sp-ink);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;cursor:pointer;
  animation:spOut .4s ease 2.4s forwards}
.splash.gone{display:none}
.spIcon{width:148px;height:148px;opacity:0;transform:scale(.86);animation:spIn .5s cubic-bezier(.2,.9,.3,1.2) .05s forwards}
.spIcon svg{width:100%;height:100%;display:block;overflow:visible}
.spFrame{fill:none;stroke:var(--sp-ink);stroke-opacity:.35;stroke-width:7;stroke-linecap:round;stroke-linejoin:round;opacity:0;animation:spFade .4s ease .25s forwards}
.spDraw{fill:none;stroke:var(--sp-ink);stroke-width:13;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;animation:spDraw .8s ease-in-out .15s forwards}
.spPop{fill:var(--sp-accent);transform-box:fill-box;transform-origin:center;transform:scale(0);animation:spPop .45s cubic-bezier(.3,1.7,.5,1) .75s forwards}
.spDetail{fill:var(--sp-ink);opacity:0;animation:spFade .3s ease 1.05s forwards}
.spSweep{fill:none;stroke:var(--sp-accent2);stroke-width:7;stroke-linecap:round;opacity:0;transform:translateX(var(--sp-sweep-from,-120px));animation:spSweep 1s ease-in-out .95s forwards}
.spWord{font:800 40px/1 var(--sp-font,ui-rounded,-apple-system,system-ui,sans-serif);letter-spacing:-.02em;opacity:0;transform:translateY(10px);animation:spUp .45s ease 1.05s forwards}
.spWord span{color:var(--sp-accent)}
.spTag{font:600 15px/1.3 -apple-system,system-ui,sans-serif;letter-spacing:.06em;color:var(--sp-muted);opacity:0;transform:translateY(8px);animation:spUp .45s ease 1.4s forwards}
@keyframes spIn{to{opacity:1;transform:scale(1)}}
@keyframes spFade{to{opacity:1}}
@keyframes spDraw{to{stroke-dashoffset:0}}
@keyframes spPop{to{transform:scale(1)}}
@keyframes spSweep{0%{opacity:0}15%{opacity:1}100%{opacity:1;transform:translateX(0)}}
@keyframes spUp{to{opacity:1;transform:none}}
@keyframes spOut{to{opacity:0;visibility:hidden}}
@media (prefers-reduced-motion:reduce){
  .splash *{animation:none!important;opacity:1!important;transform:none!important;stroke-dashoffset:0!important}
  .splash{animation:spOut .3s ease 1.6s forwards!important}
}
```

For a vertical sweep, change both `translateX` to `translateY`.

## Step 5: the script

The first lines of the page script, self-contained, ES5, so nothing declared later can break it.

```javascript
(function () {
  var sp = document.getElementById("splash");
  if (!sp) return;
  function gone() { sp.classList.add("gone"); sp.setAttribute("aria-hidden", "true"); }
  sp.addEventListener("click", gone);   // tap to skip
  setTimeout(gone, 2900);               // out of the page once the CSS fade is done
})();
```

Rules:

- Keep `wv.present()` and every Scriptable-side step as they are; nothing waits for the launch screen.
- `z-index: 90` must beat the app's other layers (Settings 13, AI sheet 14, update sheet 48, an app's own toasts); raise it if an app uses higher numbers.
- Check no existing class starts with `sp`; if one does, keep the blueprint's names and rename the app's class.

## Testing checklist

Run these on a phone, in light and dark mode.

- [ ] Opening the app shows the launch screen; the logo, name and tagline appear in that order
- [ ] The last frame of the animation matches the app icon exactly
- [ ] It is gone by 3 seconds, and the app is ready underneath
- [ ] A tap skips it straight away
- [ ] With Reduce Motion on (Settings › Accessibility › Motion), the logo shows without movement and is gone by about 2 seconds
- [ ] VoiceOver reads "App name. Tagline" once, then moves on to the app
- [ ] It looks the same in light and dark mode
- [ ] Anything that opens at start (an update offer, an error banner) appears after it, not hidden under it
- [ ] With an error forced into the page script (a temporary `throw` near the top), the screen still fades out
- [ ] It fits the smallest phone width (320 px) and an iPad

## Pitfalls

- **Template strings.** The page is usually built inside a JavaScript template string: the launch screen code must contain no backtick and no `${`. The code above has neither.
- **Definition order** (hit in VisionX, three times, in other features). A `const` or `let` used during start-up but declared further down throws and stops the page script. The splash script is self-contained and runs first, so it can't be caught by this; the CSS fade covers it either way.
- **Hiding it from script alone.** Never remove the `spOut` animation and rely on the script: a script error would leave the screen stuck over the app.
- **Start-up errors** show only once the screen fades, about 2.8 s in. Expected, not a bug.
- **Theming it.** It keeps the brand colours in light and dark mode on purpose; don't map it to the app's palette tokens.
- **The Scriptable script-list icon** can't show the logo: Scriptable only allows its built-in glyphs there. Put the logo on the home screen with a Shortcut (Run Script) and the app's 1024 px icon.

## Prompt for Claude

Paste this into a chat about another app, with this doc's link. Replace the bracketed parts.

```markdown
Add the launch screen to [App], following the shared blueprint "launch-screen" (github.com/gadominas/app-blueprints/blob/main/blueprints/launch-screen.md) exactly, with VisionX.js as the reference:

- Repository: github.com/gadominas/[App], branch [main], script file [App.js]
- Logo: [the app's logo SVG, or where to find it], split into the five roles
- Colours: background [#...], lines [#...], accent [#...], second accent [#...], tagline [#...]
- Name: [Name] with [highlighted part]; tagline: [three short words]
- Run the testing checklist in light and dark mode, bump VERSION, add a releases.json entry, then commit and push to main
- Record it in the app's trace (AGENTS.md › 4): the BLUEPRINTS line, Settings › Built with, and docs/BLUEPRINTS.md
```

## Version history

| Version | Date | Changes |
| --- | --- | --- |
| 1.0.0 | 2026-10-29 | First versioned release, from VisionX 1.17 |
