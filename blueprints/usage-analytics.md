---
id: usage-analytics
title: Anonymous usage analytics for Scriptable apps
version: 1.0.0
updated: 2026-10-31
author: Gediminas Siutilas
reference: StravaFeed 1.24.0 (https://github.com/gadominas/StravaFeed/blob/main/Strava%20Daily%20Digest.js)
depends_on: [settings, in-app-updates]
---

# Anonymous usage analytics for Scriptable apps

## Overview

Knowing how many people use an app, and which features they actually reach for, tells you what to build next. This blueprint adds that to any app in about an hour, the same way everywhere: **opt-in**, **anonymous** counts sent to [PostHog](https://posthog.com) (free up to 1 million events a month), with nothing personal and nothing that slows the app down. Each app sends its own small set of events; every app sends the same core ones, so one PostHog project can show all your apps side by side.

What the user sees, in every app:

- **A one-time question** at the top of the app's main page: "Help improve <App>?", one line on what is and isn't shared, **Yes, share** and **No thanks**. It's part of the page, not a sheet, so it never covers anything.
- **Settings › Privacy › Share anonymous usage**: the same choice, any time. Turning it off stops sending and deletes the install ID.
- **Settings › Privacy › Test the connection**: **Send test** sends one event now and shows PostHog's own answer ("Last sent 18:42: 1 event, accepted (us.i.posthog.com)", or the error).
- **Nothing else.** No banners, no slowdowns, no errors: if sending fails, those counts are simply dropped. The start-up log notes every send.

What you see in PostHog: unique users per day, week and month (one per install), how often each feature is used, which app versions are in use, and the choices people make (layout, theme, AI on or off).

The pieces, all inside the app's single script:

| Piece | Lives in | Job |
| --- | --- | --- |
| `USAGE` | Top of the script, near `APP_ID` | PostHog host (the project's region) and project key; an empty key turns everything off |
| `shareUsage`, `usageAsked` | `settings` (settings blueprint) | The person's choice, and whether they were asked |
| `installId`, `track`, `postUsage`, `flushUsage`, `usageStatus`, `setUsage` | Scriptable side | Random install ID, queue, sending, status line, switching on and off |
| `track('…')` calls | Scriptable side, where things happen | One line per event, counts only |
| `usage-consent`, `usage-test`, `set shareUsage` | Bridge actions | The question's answer, the test button, the Settings switch |
| `#usageask` card, Privacy rows | The page | The one-time question and the Settings section |

**Opt-in and anonymous: nothing is sent until a key is set and the person says yes; events carry a random install ID and counts, never anything the person wrote, saw or is called.**

Reference implementation: [Strava Daily Digest.js](https://github.com/gadominas/StravaFeed/blob/main/Strava%20Daily%20Digest.js) 1.24.0 (search for `USAGE`). The code below is the same code, with names kept, so the two can be compared line by line. One difference: this blueprint adds `app: APP_ID` and sets `$lib` to `APP_ID` on every event; StravaFeed 1.24.0 sends `$lib: 'strava-daily-digest'` and no `app`.

## The rules

| Rule | What it means |
| --- | --- |
| Opt-in | `shareUsage` starts `false`. Nothing is queued or sent until the person taps **Yes, share** or turns the switch on. **No thanks** is remembered; the card never comes back. |
| No key, no feature | With `USAGE.KEY` empty, the card and the Privacy section are hidden and `track` does nothing. An app can ship the code before it has a PostHog project. |
| Anonymous | Every event has `$process_person_profile: false` (no person profiles, PostHog's cheapest kind) and a random `distinct_id` made on the phone, not linked to any account. |
| Off deletes the ID | Turning sharing off empties the queue and deletes the install ID from the Keychain; turning it on again makes a new one. |
| Counts, never content | Event properties are app version, small numbers, booleans and fixed choices (layout, theme, mood, language). Never names, account or athlete IDs, free text, titles, descriptions, URLs, photos, locations, or anything the app read from a service. |
| The project's own region | `USAGE.HOST` is the region the PostHog project was created in (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). The other region answers "accepted" and then drops the events, so there is no automatic fallback. |
| Never in the way | Events are queued and sent together 3 s after the first one, at 25 events, and when the window closes. A failed send is logged and dropped; nothing retries, waits or shows an error. |
| App only | Track only where the app's page is presented. Never from the widget, a Shortcut or a background run. |
| Said in the README | The app's README privacy section names the service, the region and the events (Step 8). |

The state lives in `settings.json` (settings blueprint), with no UI beyond the Privacy section:

| Field | Meaning |
| --- | --- |
| `shareUsage` | The person agreed to share (default `false`) |
| `usageAsked` | The one-time question was answered, either way (default `false`) |

## Step 0: the PostHog project

Done once, by the app's owner, before the key goes into any app.

1. Sign up at [posthog.com](https://posthog.com) and **note the region** the project is created in: the address bar says `us.posthog.com` or `eu.posthog.com`. The EU cloud keeps the data in Europe; pick it at sign-up if that matters (the default sign-up is US).
2. Copy the **Project API key** (starts with `phc_`) from **Settings → Project → General**. It is made to sit in public apps and can only add events. Never use a personal API key (`phx_`).
3. Optional: in the project settings, turn on **Discard client IP data**.
4. One project can serve every app: events carry `app`, so filter or break down by it. Use separate projects only if you want separate free allowances.

## Step 1: constants and settings

Next to `APP_ID` and `VERSION`:

```javascript
// ── Anonymous usage counts (opt-in), sent to PostHog (app-blueprints · usage-analytics) ──
// Nothing is sent until KEY is filled in AND the person agrees. Each event carries a random install ID
// (made on this iPhone, not linked to any account), the app version and counts: never names, IDs from
// other services, text, photos or anything the app read. Events are anonymous (no person profiles).
// The key is PostHog's project key, made to sit in public apps: it can only add events.
// HOST must be the region the project lives in: PostHog's other region answers "accepted" and then drops the events.
const USAGE = { HOST: 'https://us.i.posthog.com', KEY: '' };
const KC_INSTALL = 'myapp-install-id';
```

In the `settings` object and the `set` allow-list (settings blueprint):

```javascript
  shareUsage: false, usageAsked: false,  // anonymous usage counts: off until the person agrees
```

```javascript
  shareUsage: ["bool", ""],
```

## Step 2: queue and send

On the Scriptable side, after `saveSettings` and `startLog` exist:

```javascript
let usageQueue = [], usageTimer = null;
const usageAvailable = () => !!USAGE.KEY;
const usageOn = () => usageAvailable() && !!settings.shareUsage;
function installId() {
  if (Keychain.contains(KC_INSTALL)) return Keychain.get(KC_INSTALL);
  const id = UUID.string().toLowerCase();
  Keychain.set(KC_INSTALL, id);
  return id;
}
function track(event, props = {}) {
  if (!usageOn()) return;
  try {
    usageQueue.push({ event, timestamp: new Date().toISOString(),
      properties: Object.assign({ distinct_id: installId(), $process_person_profile: false, app: APP_ID, app_version: VERSION, $lib: APP_ID }, props) });
    if (usageQueue.length >= 25) flushUsage();
    else if (!usageTimer) usageTimer = Timer.schedule(3000, false, () => { usageTimer = null; flushUsage(); });
  } catch (e) {}
}
let usageLast = null;   // { at, events, ok, status, host, error }: shown in Settings › Privacy
async function postUsage(host, batch) {
  const r = new Request(host + '/batch/');
  r.method = 'POST'; r.timeoutInterval = 10; r.headers = { 'Content-Type': 'application/json' };
  r.body = JSON.stringify({ api_key: USAGE.KEY, batch });
  let body = '';
  try { body = await r.loadString(); } catch (e) { return { ok: false, status: 0, host, error: String(e.message || e) }; }
  const status = (r.response && r.response.statusCode) || 0;
  return { ok: status >= 200 && status < 300, status, host, error: status >= 200 && status < 300 ? '' : String(body || '').slice(0, 200) };
}
// Sends what's queued in one request. Never slows the app; if it fails, those counts are gone (and the log says why).
async function flushUsage() {
  if (!usageQueue.length) return usageLast;
  if (!usageOn()) { usageQueue = []; return usageLast; }
  const batch = usageQueue.splice(0, usageQueue.length);
  const res = await postUsage(USAGE.HOST, batch);
  usageLast = Object.assign({ at: Date.now(), events: batch.length }, res);
  try { startLog(`usage: ${batch.length} event${batch.length === 1 ? '' : 's'} → ${res.ok ? 'sent to ' + res.host.replace('https://', '') : 'not sent: ' + (res.status ? 'HTTP ' + res.status + ' ' : '') + res.error}`); } catch (e) {}
  return usageLast;
}
function usageStatus() {
  const u = usageLast;
  if (!u) return '';
  const t = new Date(u.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return u.ok ? `Last sent ${t}: ${u.events} event${u.events === 1 ? '' : 's'}, accepted (${u.host.replace('https://', '')})`
              : `Last try ${t} failed: ${u.status ? 'HTTP ' + u.status + ' ' : ''}${u.error}`;
}
function setUsage(on) {
  settings.shareUsage = !!on; settings.usageAsked = true; saveSettings();
  if (on) track('usage_opt_in');
  else { usageQueue = []; if (Keychain.contains(KC_INSTALL)) Keychain.remove(KC_INSTALL); }   // a fresh ID if switched on again
}
```

Rules:

- `track` never throws and never awaits: call it anywhere, including inside handlers that are about to reply to the page.
- Read PostHog's answer (`r.response.statusCode`): `loadString` doesn't throw on 4xx or 5xx, so ignoring the status makes a refusal look like success.
- `startLog` is the safe-startup recipe's start-up log; every send leaves one line there.
- PostHog's batch format: `{ api_key, batch: [{ event, timestamp, properties: { distinct_id, … } }] }` to `<host>/batch/`.

## Step 3: wiring on the Scriptable side

Add `usageAvailable` and `usageStatus` to the state the Settings sheet receives (settings blueprint, `settingsState()`):

```javascript
    usageAvailable: usageAvailable(), usageStatus: usageStatus(),
```

In the bridge, before the generic `set`, route the switch through `setUsage`, so turning it off also deletes the ID:

```javascript
        if (head === 'set' && p.k === 'shareUsage') setUsage(p.v === true || p.v === 'true' || p.v === '1');
        else if (head === 'set') { /* the settings blueprint's set, unchanged */ }
```

The question's answer and the test button:

```javascript
    if (head === 'usage-consent') { setUsage(p.on === '1'); flushUsage(); return; }
    if (head === 'usage-test') {
      let ok = false, msg = '';
      if (!usageOn()) msg = 'Turn on Share anonymous usage first.';
      else { track('usage_test'); const r = await flushUsage(); ok = !!(r && r.ok); msg = usageStatus() || 'Nothing was sent.'; }
      await js(`window.__done(${JSON.stringify(p.req)}, ${ok}, ${JSON.stringify(msg)})`);
      return;
    }
```

Send what's left when the window closes (safe-startup recipe, where the window is presented):

```javascript
  presented.then(() => { closed = true; releaseLock(); flushUsage(); });
```

## Step 4: the events

Every app sends these, with these names and properties:

| Event | Where | Properties |
| --- | --- | --- |
| `app_open` | Once per run, when the first real screen is on (not the launch screen) | `layout`, `theme`, `ai_key` (bool, apps with AI), plus up to three of the app's own main choices |
| `app_updated` | After `applyUpdate` succeeds (in-app updates blueprint), then `flushUsage()` | `from`, `to` (versions) |
| `usage_opt_in` | Sent by `setUsage(true)` | none |
| `usage_test` | Sent by **Send test** | none |

Then one event per feature the app wants to understand, named `object_verb` in snake case (`kudos_sent`, `story_made`, `comment_posted`), tracked where the action **succeeds**, never on a tap that may fail. Properties are fixed choices, booleans and small numbers only (`mode`, `language`, `photos: 2`, `like: true`).

The reference app's catalog, for comparison:

| Event | Properties |
| --- | --- |
| `app_open` | `layout`, `theme`, `ai_key`, `language`, `has_style` |
| `day_viewed` | `days_back` |
| `kudos_sent` | none |
| `comment_posted` | none |
| `comment_liked` | `like` |
| `ai_ideas` | `mode`, `language`, `photos`, `provider` |
| `story_made` | `people`, `photos` |
| `story_image` | none |
| `style_learned` | `found`, `wanted`, `pages_opened`, `stopped` |
| `own_activity_opened` | none |
| `app_updated` | `from`, `to` |

```javascript
// examples, from the reference
track('app_open', { layout: settings.density, theme: settings.theme, ai_key: !!aiKey(), language: settings.aiLang });
if (ok) { feed.update(p.id, a => { a.hasKudoed = true; a.kudos++; }); saveSnapshot(feed); track('kudos_sent'); }
track('ai_ideas', { mode: p.mode || settings.aiMode, language: p.lang || settings.aiLang, photos: r.photosRead || 0, provider: aiSettings.aiProvider });
```

## Step 5: the one-time question

At the top of the app's main page, under its title and before its content, only while there is a key and no answer yet. Inline in the page, so it never stacks with the update sheet or the AI invitation.

```javascript
    ${usageAvailable() && !settings.usageAsked && !settings.shareUsage ? `<section id="usageask" aria-label="Anonymous usage"><b>Help improve MyApp?</b><p>Share anonymous counts, like app opens and the features you use. Never your content, names or accounts. You can change this in Settings.</p><div class="uabtns"><button data-act="usage-yes">Yes, share</button><button class="ghost" data-act="usage-no">No thanks</button></div></section>` : ''}
```

In the page's click handler (ES5, inside the template string):

```javascript
  if(t.dataset.act==='usage-yes'||t.dataset.act==='usage-no'){ send('usage-consent',{on:t.dataset.act==='usage-yes'?'1':'0'}); var ua=document.getElementById('usageask'); if(ua) ua.remove(); toast(t.dataset.act==='usage-yes'?'Thank you! Change it any time in Settings.':'No problem. Nothing is shared.'); return; }
```

```css
#usageask{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 16px;margin:0 0 14px}
#usageask b{font-size:calc(16px * var(--ts))}
#usageask p{margin:6px 0 12px;color:var(--mut);font-size:calc(14px * var(--ts));line-height:1.4}
.uabtns{display:flex;gap:10px}
.uabtns button{flex:1}
```

Use the app's own colour tokens (settings blueprint) for `--card`, `--line` and `--mut`. The one line on what is shared names the app's real features ("like app opens, kudos given and AI features used") and what is never shared ("Never names, comments, photos or your Strava account").

## Step 6: Settings › Privacy

A **Privacy** section, the last of the app's own sections, right before **Updates**, shown only when `SET.usageAvailable`. It holds the switch and the test row, built with the settings blueprint's switch and action rows:

```javascript
    (SET.usageAvailable?'<h3 class="sec">Privacy</h3>'+
      swRow('shareUsage','Share anonymous usage','Counts like app opens and the features you use, with a random install ID. Never your content, names or accounts. Off removes the ID.')+
      '<div class="srow"><div class="grow"><b>Test the connection</b><small id="usagemsg" class="muted" aria-live="polite">'+escH(SET.usageStatus||'Sends one test event now and shows PostHog’s answer.')+'</small></div><button class="sm" data-act="usage-test">Send test</button></div>':'')+
```

In the sheet's action handler (and add `usage-test` to its list of actions):

```javascript
  if(act==='usage-test'){ var um=document.getElementById('usagemsg'); if(um) um.textContent='Sending…'; t.disabled=true; send('usage-test',{},function(ok,msg){ t.disabled=false; var m=document.getElementById('usagemsg'); if(m) m.textContent=(ok?'✓ ':'✗ ')+msg; }); return; }
```

On settings 1.1.0, put the two rows in the section's card (`.grp`) like every other section.

## Step 7: verify in PostHog

1. Update the app on the phone, tap **Yes, share** (or turn the switch on), then **Send test**: the line must say "accepted (<host>)".
2. In PostHog (the project's region), open **Activity**: `usage_opt_in`, `usage_test` and `app_open` appear within a minute. **Persons** stays empty by design.
3. Create an insight: **Trends** → event `app_open` → **Unique users**, daily and weekly, broken down by `app_version` (and by `app` when one project serves several apps). Save it to a dashboard.

## Step 8: the README

Change "nothing is collected" wording in the app's privacy section, and add:

```markdown
- **Anonymous usage, only if you agree.** A one-time question (and **Settings › Privacy › Share anonymous usage**) decides whether the app sends anonymous counts to PostHog's <US|EU> cloud: <the app's events in plain words>, the app version and a few display settings. Each event carries a random install ID made on your phone, not linked to <service>. Never sent: <names, IDs, text, photos, anything from the service>. Turning it off stops sending and deletes the install ID.
```

## Testing checklist

Run these on a phone, in light and dark mode.

- [ ] With `KEY` empty: no question card, no Privacy section, and the start-up log has no `usage:` lines
- [ ] With a key: the card appears once on the main page; **No thanks** hides it for good and nothing is sent
- [ ] **Yes, share**: a toast thanks you; within 3 s the start-up log shows `usage: … sent to <host>`
- [ ] **Settings › Privacy › Send test** says "✓ Last sent …: 1 event, accepted (<host>)"
- [ ] PostHog's **Activity** shows `usage_opt_in`, `usage_test` and `app_open` within a minute, in the right project and region
- [ ] Each of the app's own events appears after its action succeeds, and not after one that fails
- [ ] No event property holds a name, ID, text, URL or photo (open a few in **Activity** and read them)
- [ ] Opening and closing the app quickly still delivers `app_open` (sent on close)
- [ ] Airplane mode: the app works normally; the log shows `not sent: …`; nothing retries later
- [ ] Turning the switch off: **Send test** says "Turn on Share anonymous usage first."; nothing more is sent; on again, PostHog sees a new `distinct_id`
- [ ] The widget and Shortcuts runs send nothing
- [ ] The README privacy section names the service, region and events

## Pitfalls

- **The wrong region swallows everything** (hit in StravaFeed). PostHog's EU address answered HTTP 200 "accepted" for a key whose project lived in the US cloud, then dropped every event: the phone said sent, PostHog showed nothing. The docs say a 200 means the key is valid; in practice it doesn't. Set `USAGE.HOST` from the address bar of the PostHog project (Step 0), and don't add an automatic fallback: StravaFeed 1.23.1 tried the other region only on a refusal, never got one, and remembered the wrong region.
- **A refusal that looks like success** (hit in StravaFeed). `Request.loadString()` doesn't throw on 4xx or 5xx. Reading `r.response.statusCode`, logging every send and the **Send test** row are what made the region problem visible at all.
- **Events lost on a quick close** (hit in StravaFeed). With an 8 s delay, opening and closing the app in a few seconds lost `app_open`. Send after 3 s and again when the window closes.
- **Escaped twice** (hit in StravaFeed). The page's code lives inside a template string: no backticks or `${` in it, and a regex like `\s` needs `\\s`. The card above is built on the Scriptable side on purpose.
- **The switch sends text.** The settings sheet's `toggle` sends `true`/`false`, which arrive through the bridge as the strings `'true'`/`'false'`; `setUsage(p.v === true || p.v === 'true' || p.v === '1')` accepts all forms.
- **Counting taps instead of results.** Track after the action succeeds (inside `if (ok)`), or failed kudos and timed-out AI calls are counted as used features.
- **Personal data by accident.** It is tempting to add "just the activity type" or "the athlete's name for debugging". Properties are fixed choices and small numbers only; anything the app read from a service stays out, even when it seems harmless.

## Prompt for Claude

Paste this into a chat about another app, with this doc's link. Replace the bracketed parts.

```markdown
Add anonymous usage analytics to [App], following the attached doc "Anonymous usage analytics for Scriptable apps" exactly, with StravaFeed's script as the reference:

- Repository: github.com/gadominas/[App], branch main, script file [App.js]
- The app already follows settings and in-app updates (apply those first if not)
- PostHog: region [US|EU], project key [phc_… or "leave empty for now"]
- Install-ID Keychain name: [myapp-install-id]
- The app's own events: [list the 4–8 features to count, each with its fixed-choice properties]; show me the event catalog before writing code
- The one line on the question card: what is shared, in this app's words, and what is never shared
- Update the README privacy section (Step 8)
- Run the testing checklist in light and dark mode, bump VERSION, add a releases.json entry, then commit and push to main
- Record it in the app's trace (AGENTS.md › 4): the `BLUEPRINTS` line, Settings › Built with, and docs/BLUEPRINTS.md
```

## Version history

| Version | Date | Changes |
| --- | --- | --- |
| 1.0.0 | 2026-10-31 | First versioned release, from StravaFeed 1.23.0–1.24.0; adds `app: APP_ID` and `$lib: APP_ID` to every event so one PostHog project can serve several apps |
