---
id: ai-invitation
title: AI invitation for Scriptable apps
version: 1.0.0
updated: 2026-10-30
author: Gediminas Siutilas
reference: none yet (the first app to adopt it becomes the reference; the code below was tested in a harness, in light and dark mode)
depends_on: [ai-configuration, in-app-updates, settings]
---

# AI invitation for Scriptable apps

## Overview

Most of the apps do far more with an AI key than without one, but an app without a key hides its AI features (AI configuration, Step 8), so a new user may never learn they exist. The AI invitation closes that gap: a short, animated card that names three things AI adds to *this* app, says it takes three steps, and takes the user straight to **AI settings** with **Add key** highlighted. It shows up on launch at a calm pace (about twice a week at first, weekly after a few "Later"s), never when a key exists, never over anything else, and stops for good with one tap.

What the user sees, in every app:

- **The invitation**: the page dims, a card springs up with a twinkling ✦, a punchy title ("Give MyApp superpowers"), three perks that slide in one after another, three short steps, a glowing **Turn on AI** button, then **Later** and **Don't remind me again**.
- **Turn on AI**: the card drops away, the AI settings sheet slides up, and the **Add key** button of the provider in use pulses twice.
- **Later**, or a tap on the dimmed backdrop: the card drops away; it comes back in 3 days (7 days after the fourth "Later").
- **Don't remind me again**: the card drops away and never returns; AI settings stays where it always is, in Settings.
- **With Reduce Motion on**: the same card, without movement.

The pieces, all inside the app's single script:

| Piece | Lives in | Job |
| --- | --- | --- |
| `AI_INVITE` | Top of the script | What this app promises: a title and exactly three perks |
| `aiInviteDue`, `aiInviteNote` | Scriptable side | The schedule, kept in `settings.aiInvite` |
| `inviteIfDue` | Scriptable side, at start-up | Offers the invitation once the update check has settled, unless an update is being offered |
| `aiinvite` bridge action | Scriptable side | Records what the user did: shown, open, later, never |
| `window.__aiInvite`, `showInvite`, `closeInvite` | The page's script | Waits until nothing else is on screen, shows the card, hands over to AI settings |
| `#aiinv` CSS and `aiinv*` keyframes | The page's `<style>` | The card and its animation, Reduce Motion aware |

**An invitation, not a nag: at most one every 3 days, never when there's a key, never on top of anything, and one tap ends it for good.**

Reference implementation: none yet. The first app to adopt this becomes the reference and is recorded here; until then, the code below is the reference. It was tested end to end in a harness (schedule over eight weeks, the page in a browser, light and dark).

## The rules

| Rule | What it means |
| --- | --- |
| Only without AI | Shown only when no AI key exists (`aiKey()` is empty). |
| Once there was a key, never again | When a key is found, `aiInvite.keyed` is set; even if the key is removed later, the invitation does not return. A user who removed AI did so on purpose. |
| Not on the first day | The first launch only starts the clock. The earliest invitation is 24 hours later, so the app gets to speak for itself first. |
| Pace | At most once every **3 days** (about twice a week). After the **4th "Later"** the gap becomes **7 days**. Eight weeks of always tapping "Later" means 10 invitations. |
| One offer per launch | Never on a launch that offers an update: `inviteIfDue` runs after the update check and does nothing when `pendingUpdate` is set. |
| Never on top of anything | The page waits until the launch screen is gone and no sheet is open (Settings, AI settings, the update sheet, the app's own `.sheet.open`), then 0.6 s more. An app can also hold it back with `window.canInvite()` (during a recording, a game round, a form). |
| Counted only when seen | The schedule moves only when the card actually appeared (`shown`). If the page stays busy for 20 s, it gives up quietly and the next launch may try again. |
| App only | Never from the widget, a Shortcut or a background run: only where the app's page is presented. |
| Same words everywhere | The lead line, the three steps and the three buttons are fixed text (below); only the title and the perks are the app's own. |

The state lives in `settings.json` (settings blueprint) as `settings.aiInvite`, with no UI of its own:

| Field | Meaning |
| --- | --- |
| `first` | When the app first ran with this blueprint (ms) |
| `next` | Earliest time for the next invitation (ms) |
| `shown` | How many times the card appeared |
| `later` | How many times the user chose Later (or tapped the backdrop) |
| `off` | The user chose **Don't remind me again** |
| `keyed` | A key existed at some point; never invite again |

## Step 1: the promise

Declare what AI adds to this app, near the top of the script with the other constants.

```javascript
// ───────── AI invitation (app-blueprints · ai-invitation) ─────────
// What the invitation promises. Exactly three perks, each a real feature that needs a key.
const AI_INVITE = {
  title: "Give MyApp superpowers",              // punchy, names the app, at most 32 characters
  perks: [                                      // icon + at most 48 characters each
    { icon: "✦", text: "A one-line summary on every item" },
    { icon: "💬", text: "Ask anything about your data" },
    { icon: "🏷️", text: "Smart tags, sorted for you" },
  ],
};
```

Writing rules:

- **Title**: punchy, names the app, at most 32 characters. The default formula is **"Give <App> superpowers"**; an app may use its own line in the same spirit ("Your feed, explained", "Train smarter with AI").
- **Perks**: exactly three, each a feature that really exists in the app and is hidden or replaced by a fallback without a key (AI configuration, Step 8). Lead with the outcome, not the technology: "A one-line summary on every item", not "GPT summaries". At most 48 characters, one emoji each. The first perk may use ✦, the AI mark.
- **Fixed text** (do not change per app): the lead "Add an AI key and these switch on:", the steps "Get a key from Claude or OpenAI", "Paste it in AI settings", "That's it: these turn on at once", and the buttons **Turn on AI**, **Later**, **Don't remind me again**.

## Step 2: the schedule

Scriptable side, next to the AI configuration code. `saveAll`, `aiKey`, `js` and `pendingUpdate` are the names the other blueprints already use.

```javascript
// When it may appear. Its state lives in settings.json as settings.aiInvite (no UI of its own).
const INVITE_DAY = 864e5;
const INVITE_GAP = 3;          // days between invitations (about twice a week)
const INVITE_GAP_SLOW = 7;     // days between invitations after the 4th "Later"
function aiInviteDue(now = Date.now()) {
  const s = settings.aiInvite || (settings.aiInvite = {});
  if (aiKey()) { if (!s.keyed) { s.keyed = true; saveAll(); } return false; }   // has a key, or had one: never again
  if (!s.first) { s.first = now; saveAll(); return false; }   // first launch: let the app speak for itself first
  if (s.off || s.keyed) return false;
  if (now - s.first < INVITE_DAY) return false;
  return now >= (s.next || 0);
}
// The page reports what happened: "shown", "open", "later" or "never".
function aiInviteNote(what, now = Date.now()) {
  const s = settings.aiInvite || (settings.aiInvite = {});
  if (what === "shown") { s.shown = (s.shown || 0) + 1; s.next = now + INVITE_GAP * INVITE_DAY; }
  else if (what === "later") { s.later = (s.later || 0) + 1; s.next = now + (s.later >= 4 ? INVITE_GAP_SLOW : INVITE_GAP) * INVITE_DAY; }
  else if (what === "never") s.off = true;
  else return;   // "open": the AI sheet takes over; "shown" already set the next date
  saveAll();
}
```

## Step 3: wiring on the Scriptable side

Three small changes, all in code the other blueprints already added.

**Start-up.** Offer the invitation once the update check has settled, so an update offer always wins and the two never appear on the same launch. Add the function next to `offerUpdate`, and chain it onto the update check (in-app updates, Step 5):

```javascript
// One offer per launch, and an update wins: call this once the update check has settled.
function inviteIfDue() {
  if (!pendingUpdate && aiInviteDue()) js(`window.__aiInvite && window.__aiInvite(${JSON.stringify(AI_INVITE)})`);
}

// In the app branch only (never the widget, Shortcuts or background runs), where the update check starts:
checkForUpdate().then(u => { pendingUpdate = u; offerUpdate(); }).catch(() => {}).then(inviteIfDue);
```

**Bridge action.** The page reports what happened; there is nothing to send back.

```javascript
case "aiinvite": aiInviteNote(m.v); return;
```

| Action | Params | Effect |
| --- | --- | --- |
| `aiinvite` | `v`: `shown`, `open`, `later` or `never` | `aiInviteNote(v)`: schedules the next invitation or stops them |

**A key ends it for good.** In the `aikey` action (AI configuration, Step 6), right after `askKey` succeeds, mark it, so the invitation stops even before the next launch would notice:

```javascript
settings.aiInvite = Object.assign(settings.aiInvite || {}, { keyed: true });
```

## Step 4: the page

Add this to the page's script, after `send` exists. It is ES5 with no backticks or `${`, so it can sit inside the page's template string like the update sheet.

```javascript
// ── AI invitation (app-blueprints · ai-invitation) ── ES5, no backticks: this sits inside the page's template string.
window.__aiInvite = function (c) {
  var tries = 0;
  (function wait() {
    // Never over the launch screen, another sheet, or a task the app says can't be interrupted.
    var busy = document.getElementById("splash") || document.getElementById("upd") || document.getElementById("aiinv") ||
      document.querySelector(".sheet.open, #cfgsheet.open, #aisheet.open") || (window.canInvite && !window.canInvite());
    if (busy) { if (++tries < 40) setTimeout(wait, 500); return; }   // gives up after 20 s; it comes back another day
    setTimeout(function () { if (!document.getElementById("aiinv")) showInvite(c); }, 600);
  })();
};
function escI(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
function showInvite(c) {
  var el = document.createElement("div");
  el.id = "aiinv";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "aiinv-t");
  el.innerHTML = '<div class="aiinv-card">' +
    '<div class="aiinv-spark" aria-hidden="true">✦</div>' +
    '<h2 id="aiinv-t">' + escI(c.title) + '</h2>' +
    '<p class="aiinv-lead">Add an AI key and these switch on:</p>' +
    '<ul class="aiinv-perks">' + c.perks.slice(0, 3).map(function (p, i) {
      return '<li style="--i:' + i + '"><span class="aiinv-ico" aria-hidden="true">' + escI(p.icon) + '</span>' + escI(p.text) + '</li>';
    }).join("") + '</ul>' +
    '<ol class="aiinv-steps"><li>Get a key from Claude or OpenAI</li><li>Paste it in AI settings</li><li>That’s it: these turn on at once</li></ol>' +
    '<button class="aiinv-go" data-inv="open">Turn on AI</button>' +
    '<div class="aiinv-row"><button class="aiinv-later" data-inv="later">Later</button>' +
    '<button class="aiinv-never" data-inv="never">Don’t remind me again</button></div></div>';
  el.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-inv]") : null;
    if (!b && e.target !== el) return;      // taps inside the card do nothing
    closeInvite(b ? b.dataset.inv : "later");   // a tap on the dimmed backdrop counts as Later
  });
  document.body.appendChild(el);
  send("aiinvite", { v: "shown" });
  var go = el.querySelector(".aiinv-go"); if (go && go.focus) go.focus();
}
function closeInvite(what) {
  var el = document.getElementById("aiinv"); if (!el || el.classList.contains("out")) return;
  el.classList.add("out");
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
  send("aiinvite", { v: what });
  if (what === "open") setTimeout(function () {
    window.__aiOpen();   // the same thing the Settings row's "aiopen" action does
    var add = document.querySelector('#aisheet [data-act="aikey"]');   // the provider in use comes first
    if (add) { add.classList.add("aiinv-nudge"); if (add.scrollIntoView) add.scrollIntoView({ block: "center" }); setTimeout(function () { add.classList.remove("aiinv-nudge"); }, 2600); }
  }, 280);
}
```

Rules:

1. **`window.__aiOpen()`** must open the AI settings sheet, exactly as the Settings row's `aiopen` action does. If the app has no such function yet, add the one-liner next to that action: `window.__aiOpen = function () { aiOpen = true; renderAI(); };`.
2. **`window.canInvite`** (optional): return `false` while the user must not be interrupted (a recording, a round of a game, a half-filled form). Leave it undefined if the app has no such moment.
3. **The busy check names the shared layers** (`#splash`, `#upd`, `#cfgsheet`, `#aisheet`, `.sheet.open`). If the app has another overlay, add its selector there.
4. **Escape everything** from `AI_INVITE` with `escI`: the title and perks are plain text.

## Step 5: the look

Add this to the page's `<style>`. It uses only the shared colour tokens and `var(--ts)` from the settings blueprint, so it follows every palette and text size.

```css
/* AI invitation (app-blueprints · ai-invitation): above Settings and the AI sheet, below the update sheet and the launch screen */
#aiinv{position:fixed;inset:0;z-index:47;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.45);animation:aiinvFade .25s ease both}
#aiinv.out{animation:aiinvFadeOut .24s ease both}
.aiinv-card{position:relative;width:100%;max-width:380px;background:var(--sheet);color:var(--ink);border:1px solid var(--rule);border-radius:24px;padding:26px 22px 16px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.35);animation:aiinvUp .5s cubic-bezier(.2,.9,.3,1.2) both}
#aiinv.out .aiinv-card{animation:aiinvDown .24s ease both}
.aiinv-spark{width:56px;height:56px;margin:-4px auto 10px;border-radius:18px;display:grid;place-items:center;font-size:calc(30px * var(--ts));color:var(--signal);background:var(--signal-wash);animation:aiinvTwinkle 2.4s ease-in-out .5s infinite}
#aiinv h2{margin:0 0 6px;font-family:var(--display);font-size:calc(23px * var(--ts));line-height:1.2;font-weight:800}
.aiinv-lead{margin:0 0 14px;color:var(--ink-2);font-size:calc(15px * var(--ts))}
.aiinv-perks{list-style:none;margin:0 0 14px;padding:0;text-align:left}
.aiinv-perks li{display:flex;gap:10px;align-items:center;padding:9px 12px;margin-bottom:6px;border-radius:12px;background:var(--signal-wash);font-size:calc(15px * var(--ts));font-weight:600;animation:aiinvPerk .4s ease both;animation-delay:calc(.25s + var(--i) * .09s)}
.aiinv-ico{flex:none;width:22px;text-align:center}
.aiinv-steps{margin:0 0 16px;padding-left:22px;text-align:left;color:var(--muted);font-size:calc(13px * var(--ts));line-height:1.6}
.aiinv-go{display:block;width:100%;border:0;border-radius:14px;padding:14px;font:700 calc(17px * var(--ts)) var(--display);color:var(--sheet);background:var(--signal);animation:aiinvGlow 1.6s ease-in-out .9s 2}
.aiinv-go:focus{outline:none}
.aiinv-go:focus-visible{box-shadow:0 0 0 4px var(--signal-wash)}
.aiinv-row{display:flex;justify-content:space-between;gap:8px;margin-top:6px}
.aiinv-later,.aiinv-never{border:0;background:none;padding:12px 6px;color:var(--muted);font:600 calc(14px * var(--ts)) var(--sans, inherit)}
.aiinv-later{color:var(--ink-2)}
.aiinv-nudge{animation:aiinvGlow 1.2s ease-in-out 2}
@keyframes aiinvFade{from{opacity:0}to{opacity:1}}
@keyframes aiinvFadeOut{from{opacity:1}to{opacity:0}}
@keyframes aiinvUp{from{opacity:0;transform:translateY(40px) scale(.94)}to{opacity:1;transform:none}}
@keyframes aiinvDown{to{opacity:0;transform:translateY(24px) scale(.97)}}
@keyframes aiinvPerk{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
@keyframes aiinvTwinkle{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.12) rotate(12deg)}}
@keyframes aiinvGlow{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 6px var(--signal-wash)}}
@media (prefers-reduced-motion:reduce){
  #aiinv,#aiinv.out,.aiinv-card,#aiinv.out .aiinv-card,.aiinv-perks li,.aiinv-spark,.aiinv-go,.aiinv-nudge{animation:none}
  #aiinv.out{opacity:0;transition:opacity .2s}
}
```

The animation, in order:

| Time | What moves |
| --- | --- |
| 0–0.25 s | The page dims |
| 0–0.5 s | The card springs up from 40 px below, scaling from 94 % with a slight overshoot |
| 0.25–0.75 s | The three perks slide in from the left, 90 ms apart |
| from 0.5 s | The ✦ tile twinkles (a gentle scale and tilt every 2.4 s) |
| 0.9–4.1 s | **Turn on AI** glows twice, then rests |
| on close | The card drops 24 px and fades with the backdrop in 0.24 s |

Layering: `z-index: 47` puts the card above Settings (13) and the AI sheet (14) and below the update sheet (48) and the launch screen (90), so it can never cover either.

## Testing checklist

Run these on a phone, in light and dark mode, with and without Reduce Motion.

- [ ] First launch without a key: no invitation. Set `settings.aiInvite.first` back 2 days and relaunch: the card appears after the launch screen has gone.
- [ ] The card springs up, the perks slide in one by one, the ✦ twinkles, **Turn on AI** glows twice; nothing moves with Reduce Motion on.
- [ ] Title and perks fit without overflow at **Larger** text, on the smallest supported phone.
- [ ] **Turn on AI**: the card closes, AI settings slides up, **Add key** pulses; adding a key there ends the invitations for good.
- [ ] **Later**, and a tap on the dimmed backdrop: the card closes; it doesn't return on the next launch the same day.
- [ ] **Don't remind me again**: it never returns, however long you wait.
- [ ] With an update available (bump `VERSION` down), only the update sheet appears that launch.
- [ ] With a key saved, the invitation never appears, even after removing the key.
- [ ] Opening the widget or a Shortcut never shows it.
- [ ] Every palette: the button text is readable on the accent, and the card's edge is visible on dark pages.

## Pitfalls

- **Hard-coded white on the button** (hit while building this). On dark palettes the accent is light and white text disappears. The button's text uses `var(--sheet)`, which is light on light palettes and dark on dark ones.
- **The card's edge vanishes in dark mode** (hit while building this). A dark card on a dimmed dark page has no visible edge; the 1 px `var(--rule)` border fixes it.
- **Counting invitations the user never saw.** If `shown` is recorded when the Scriptable side asks rather than when the page shows the card, a busy launch eats an invitation. Only the page sends `shown`.
- **Two offers on one launch.** Calling `inviteIfDue` straight after the first render races the update check; chain it after the check settles, as in Step 3.
- **A focus ring on the button.** Focusing **Turn on AI** for VoiceOver draws the browser's ring; the CSS hides it except for keyboard focus.
- **Inviting in the wrong moment.** An invitation in the middle of a recording or a game round is worse than none: use `window.canInvite`.

## Prompt for Claude

Paste this into a chat about another app, with this doc's link. Replace the bracketed parts.

```markdown
Add the AI invitation to [App], following the attached doc "AI invitation for Scriptable apps" exactly:

- Repository: github.com/gadominas/[App], branch main, script file [App.js]
- The app already follows ai-configuration, in-app-updates and settings (apply those first if not)
- Title: "[Give App superpowers]"; perks: [three real AI-only features, outcome first, at most 48 characters each]
- Moments that must not be interrupted (for window.canInvite): [none, or which]
- Show me the title and perks before writing code
- Run the testing checklist in light and dark mode and with Reduce Motion, bump VERSION, add a releases.json entry, then commit and push to main
- Record it in the app's trace (AGENTS.md › 4): the `BLUEPRINTS` line, Settings › Built with, and docs/BLUEPRINTS.md
```

## Version history

| Version | Date | Changes |
| --- | --- | --- |
| 1.0.0 | 2026-10-30 | First versioned release |
