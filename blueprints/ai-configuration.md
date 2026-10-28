# AI configuration for Scriptable apps

Oct 28, 2026 · @Gediminas Siutilas

## Overview

Every app gets the same AI settings screen, the same key handling and the same token counter, taken from BlogPulse 1.0.0. The user picks Claude or OpenAI, pastes or replaces a key, loads and chooses any model that key can use, tests the connection, and sees how many tokens each feature used per provider, model and day. Without a key the app still works, and AI-only features are hidden.

What the user sees, in every app:

- **Settings › AI settings**, one card per provider: the key masked as `sk-ant-…9f2c`, **Change key**, **Test connection**, **Remove** (tap twice), a model menu, **Load my models** or **Refresh model list**, and an **In use** badge or a **Use OpenAI** button.
- **What AI does**: one switch per background AI job, so the user decides what runs without asking.
- **Token usage**, per provider: total, input and output tokens; today and this month; a 14-day bar chart; tables by feature and by model; **Reset counters** (tap twice).
- **Labels**: everything AI wrote says so ("✦ AI summary by Claude"); anything made without AI says "no AI".

The pieces, all inside the app's single script:

| Piece | Lives in | Job |
| --- | --- | --- |
| `AI`, `PROVIDERS` constants | Top of the script | Provider ids, Keychain key names, default models |
| `aiProvider`, `model`, `models`, `ai` | The app's settings JSON | Provider in use, model per provider, cached model lists, background AI switch |
| `keyFor`, `aiKey`, `maskKey`, `askKey` | Scriptable side | Read and write keys in the Keychain; native secure prompt |
| `aiCall` | Scriptable side | The only way the app calls AI; records usage |
| `usage.json`, `recordUsage` | The app's data folder | Token counts by provider, model, feature and day |
| `fetchModels` | Scriptable side | Lists the models a key can use |
| Bridge actions | The app's `shouldAllowRequest` handler | The page asks, the Scriptable side acts |
| AI settings sheet | The page (HTML, CSS, JS) | Cards, menus, usage chart and tables |

One rule runs through all of it: **a key never enters the page**. It is typed into a native iOS alert, stored in the Keychain, and sent only to its own provider; the page only ever sees the masked form.

Reference implementation: [BlogPulse.js](https://github.com/gadominas/BlogPulse/blob/main/BlogPulse.js). The code below is taken from it, with names kept, so the two can be compared line by line.

## Step 1: constants and settings fields

Declare the providers once, near the top of the script, above any code that runs. The Keychain key names must be unique per app, so two apps never overwrite each other's keys; the default models are only used until the user picks one.

```javascript
// AI providers. Keychain names are unique per app; models are defaults until the user picks one.
const AI = {
  anthropic: { key: "MYAPP_ANTHROPIC_KEY", model: "claude-haiku-5-5" },
  openai:    { key: "MYAPP_OPENAI_KEY",    model: "gpt-4o-mini" },
};
const PROVIDERS = { anthropic: "Claude", openai: "OpenAI" };
```

Add four fields to the app's saved settings (the JSON file the app already loads at start):

```javascript
const settings = Object.assign({
  aiProvider: "anthropic",   // the provider marked "In use"
  ai: true,                  // background AI jobs on/off ("What AI does")
  // model:  { anthropic: "…", openai: "…" }   set when the user picks a model
  // models: { anthropic: { at, list: [{ id, name }] }, openai: … }   cached model lists
}, await load("settings", {}));
```

| Field | Type | Meaning |
| --- | --- | --- |
| `aiProvider` | `"anthropic"` or `"openai"` | The only provider the app calls |
| `ai` | boolean | Runs background AI jobs (summaries, sorting). Features the user taps run regardless |
| `model` | object, per provider | The chosen model id; missing means the default from `AI` |
| `models` | object, per provider | The last loaded model list and when it was loaded |

Keep keys out of this file. Settings are plain JSON in iCloud Drive; keys belong in the Keychain only.

## Step 2: keys in the Keychain

Keys are entered in a native secure alert, never in the page, so they can't leak through the page's history, logs or the bridge URL. The page asks for a key by action name; the Scriptable side shows the alert and stores the result.

```javascript
const keyFor  = p => Keychain.contains(AI[p].key) ? Keychain.get(AI[p].key) : null;
const aiKey   = () => keyFor(settings.aiProvider);   // the key of the provider in use
const modelFor = p => (settings.model && settings.model[p]) || AI[p].model;
const maskKey = k => k ? (k.length > 14 ? k.slice(0, 7) + "…" + k.slice(-4) : "…" + k.slice(-4)) : null;

async function askKey(p) {
  const cur = keyFor(p);
  const al = new Alert();
  al.title = `${PROVIDERS[p]} API key`;
  al.message = cur ? `The saved key ends in …${cur.slice(-4)}. Paste a new key to replace it.`
                   : "Paste your API key. It's stored in the iOS Keychain on this device only.";
  al.addSecureTextField(p === "openai" ? "sk-…" : "sk-ant-…", "");
  al.addAction("Save key");
  al.addCancelAction("Cancel");
  if (await al.present() !== 0) return false;
  const v = al.textFieldValue(0).trim();
  if (!v) return false;
  Keychain.set(AI[p].key, v);
  if (!aiKey()) settings.aiProvider = p;   // first key saved: use that provider
  return true;
}

function removeKey(p) {
  if (Keychain.contains(AI[p].key)) Keychain.remove(AI[p].key);
}
```

Rules:

- **Show only the masked form**: first seven and last four characters. Enough to tell two keys apart, useless to anyone reading over a shoulder.
- **Saving checks the key.** After a save, load the model list (Step 5). Success proves the key works: "Claude key saved — 12 models available". Failure keeps the key but says so: "Key saved, but checking it failed: …".
- **Removing takes two taps.** The first tap turns the button into **Confirm** for 3.5 seconds.
- **Switching providers needs a key.** Show **Use OpenAI** only on a card that has a key.

Refactoring an app that already stored a key somewhere else (an older Keychain name, or a constant in the script)? Move it once at start-up, so the user never has to paste it again:

```javascript
// Run once, before the first AI call. OLD_KEY_NAME = wherever the previous version kept it.
if (!Keychain.contains(AI.openai.key) && Keychain.contains("OLD_KEY_NAME")) {
  Keychain.set(AI.openai.key, Keychain.get("OLD_KEY_NAME"));
  Keychain.remove("OLD_KEY_NAME");
  if (!keyFor("anthropic")) settings.aiProvider = "openai";   // use the key that now exists
}
```

## Step 3: one aiCall for every AI request

Every AI request in the app goes through `aiCall`. That one function picks the provider and model, builds the right request shape, records the tokens, and returns plain text. Nothing else in the app talks to an AI API, so switching providers or models needs no other change.

````javascript
// feature: a short tag for the usage table ("summaries", "story", "tldr", "invite", "test", …)
// provider: defaults to the one in use; "Test connection" passes the card's provider.
async function aiCall(system, user, maxTokens = 2500, feature = "other", provider = settings.aiProvider) {
  const key = keyFor(provider);
  if (!key) throw new Error(`No ${PROVIDERS[provider]} key saved`);
  const openai = provider === "openai", model = modelFor(provider);
  const r = new Request(openai ? "https://api.openai.com/v1/chat/completions" : "https://api.anthropic.com/v1/messages");
  r.method = "POST";
  r.timeoutInterval = 90;
  if (openai) {
    r.headers = { "Authorization": "Bearer " + key, "Content-Type": "application/json" };
    r.body = JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  } else {
    r.headers = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
    r.body = JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  }
  const j = await r.loadJSON();
  if (j.error) throw new Error(j.error.message || "AI request failed");
  const u = j.usage || {};
  recordUsage(provider, model, feature,
    openai ? (u.prompt_tokens || 0) : (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
    openai ? (u.completion_tokens || 0) : (u.output_tokens || 0));
  return openai ? ((j.choices && j.choices[0] && j.choices[0].message.content) || "")
                : (j.content || []).map(c => c.text || "").join("");
}

// For prompts that ask for JSON: tolerate code fences and stray text around it.
function parseJSON(txt) {
  const s = String(txt).replace(/```json|```/g, "").trim();
  const a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  return JSON.parse(s.slice(a, b + 1));
}
````

How the two providers differ, so the function stays the only place that knows:

|  | Claude (Anthropic) | OpenAI |
| --- | --- | --- |
| Endpoint | `POST /v1/messages` | `POST /v1/chat/completions` |
| Auth header | `x-api-key` + `anthropic-version: 2023-06-01` | `Authorization: Bearer …` |
| System prompt | Top-level `system` | First message with `role: "system"` |
| Output limit | `max_tokens`, required | Left out: newer models reject `max_tokens` |
| Text back | `content[].text`, joined | `choices[0].message.content` |
| Tokens in | `input_tokens` + both `cache_*_input_tokens` | `prompt_tokens` |
| Tokens out | `output_tokens` | `completion_tokens` |

Feature tags are what the usage table shows, so name them for the user, not the code: tag a request by the feature the user turned on or tapped. Add each tag to the page's label map (Step 7).

## Step 4: token usage

Usage lives in its own file, `usage.json`, next to the app's other data. It counts requests, input tokens and output tokens four ways at once: per provider overall, per model, per feature, and per local day. The counts come from what the provider reports, so they match the provider's bill.

```javascript
let usage = await load("usage", { since: Date.now(), p: {} });
const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function recordUsage(provider, model, feature, tin, tout) {
  const P = usage.p[provider] = usage.p[provider] || { calls: 0, in: 0, out: 0, models: {}, features: {}, days: {} };
  const b = (o, k) => o[k] = o[k] || { calls: 0, in: 0, out: 0 };
  for (const x of [P, b(P.models, model), b(P.features, feature), b(P.days, dayKey())]) {
    x.calls++; x.in += tin; x.out += tout;
  }
  const days = Object.keys(P.days).sort();
  while (days.length > 400) delete P.days[days.shift()];   // keep about 13 months of days
  write("usage", usage);   // save after every call: the app can be closed at any moment
}

function resetUsage() { usage = { since: Date.now(), p: {} }; write("usage", usage); }
```

The file's shape, for one provider:

```json
{
  "since": 1761645600000,
  "p": {
    "anthropic": {
      "calls": 154, "in": 338000, "out": 64000,
      "models":   { "claude-haiku-5-5": { "calls": 145, "in": 236000, "out": 40000 } },
      "features": { "summaries": { "calls": 85, "in": 138000, "out": 19000 } },
      "days":     { "2026-10-28": { "calls": 20, "in": 43700, "out": 8300 } }
    }
  }
}
```

- **Days use the phone's local date**, so "today" matches the user's day, not UTC.
- **Group by the configured model id**, not the id the provider echoes back. OpenAI returns dated variants (`gpt-4o-mini-2024-07-18`) that would split one model into several rows.
- **Reset keeps history out of sight, not out of the bill.** Say "Usage counters reset" and show "Counting since" with the new date.
- **No cost estimate by default.** Prices differ per model and change often; tokens are exact. Add a cost column only with per-model prices the user enters.

## Step 5: load the models a key can use

The model menu shows what the user's own key can call, fetched from the provider, newest first. The list is cached in settings, so the menu works offline and opens instantly; **Refresh model list** fetches it again.

```javascript
async function fetchModels(p) {
  const key = keyFor(p);
  if (!key) throw new Error(`Add a ${PROVIDERS[p]} key first`);
  const r = new Request(p === "openai" ? "https://api.openai.com/v1/models" : "https://api.anthropic.com/v1/models?limit=100");
  r.headers = p === "openai" ? { "Authorization": "Bearer " + key } : { "x-api-key": key, "anthropic-version": "2023-06-01" };
  r.timeoutInterval = 20;
  const j = await r.loadJSON();
  if (j.error) throw new Error(j.error.message || "Couldn't load models");
  let list = (j.data || []).map(m => ({
    id: m.id, name: m.display_name || m.id,
    t: m.created_at ? Date.parse(m.created_at) : (m.created || 0) * 1000,
  }));
  // OpenAI lists every model the key can reach; keep only the ones that write text.
  if (p === "openai") list = list.filter(m => /^(gpt-|o\d|chatgpt-)/.test(m.id)
    && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation)/.test(m.id));
  list.sort((a, b) => b.t - a.t);
  settings.models = settings.models || {};
  settings.models[p] = { at: Date.now(), list: list.map(m => ({ id: m.id, name: m.name })) };
  return list.length;
}
```

- **Claude** returns a friendly `display_name` ("Claude Haiku 5.5"); the menu shows it with the id after a dash. **OpenAI** has ids only, which the menu shows as they are.
- **Keep the chosen model visible** even if it's missing from a fresh list (retired, or a typo in a default): put it first in the menu so the selection never jumps silently.
- **Picking a model saves it at once** and confirms: "Claude now uses claude-sonnet-5-5". The next AI request uses it; nothing else changes.

## Step 6: bridge actions and the state sent to the page

The page never calls an AI API and never holds a key. It sends an action through the app's bridge (a `myapp://` URL caught by `shouldAllowRequest`); the Scriptable side does the work and pushes fresh state back. Seven actions cover the whole screen:

| Action | Payload | What the Scriptable side does |
| --- | --- | --- |
| `aikey` | `v`: provider | `askKey`, then `fetchModels` to check the key; toast the result |
| `airm` | `v`: provider | Remove that key; toast "Claude key removed" |
| `aiprov` | `v`: provider | Set `aiProvider` |
| `aimodels` | `v`: provider | `fetchModels`; toast "12 Claude models found" or the error |
| `aimodel` | `p`: provider, `v`: model id | Save `settings.model[p]`; toast the new model |
| `aitest` | `v`: provider | A 10-token request tagged `test`; toast model and seconds |
| `usagereset` | none | `resetUsage()` |

```javascript
// Inside the app's action handler (m = the decoded message from the page)
case "aikey": {
  const p = PROVIDERS[m.v] ? m.v : settings.aiProvider;
  if (await askKey(p)) {
    settings.ai = true; saveAll(); push();
    try { const n = await fetchModels(p); toast(`${PROVIDERS[p]} key saved — ${n} models available`); }
    catch (e) { toast(`Key saved, but checking it failed: ${String(e.message || e).slice(0, 70)}`); }
  }
  saveAll(); return push();
}
case "airm": { const p = m.v; removeKey(p); toast(`${PROVIDERS[p]} key removed`); saveAll(); return push(); }
case "aiprov": if (PROVIDERS[m.v]) settings.aiProvider = m.v; saveAll(); return push();
case "aimodels":
  try { const n = await fetchModels(m.v); toast(`${n} ${PROVIDERS[m.v]} models found`); }
  catch (e) { toast(String(e.message || e).slice(0, 90)); }
  saveAll(); return push();
case "aimodel":
  if (PROVIDERS[m.p] && m.v) { settings.model = settings.model || {}; settings.model[m.p] = m.v; toast(`${PROVIDERS[m.p]} now uses ${m.v}`); }
  saveAll(); return push();
case "aitest": {
  const p = m.v, t0 = Date.now();
  try {
    await aiCall("Reply with the single word OK.", "Connection test.", 10, "test", p);
    toast(`${PROVIDERS[p]} works — ${modelFor(p)} answered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) { toast(`${PROVIDERS[p]} test failed: ${String(e.message || e).slice(0, 80)}`); }
  return push();
}
case "usagereset": resetUsage(); toast("Usage counters reset"); return push();
```

Add this to the state the app already sends the page (its `clientState()` or equivalent). Keys appear only masked:

```javascript
ai: {
  provider: settings.aiProvider,
  keys:  Object.fromEntries(Object.keys(PROVIDERS).map(p => [p, maskKey(keyFor(p))])),
  model: Object.fromEntries(Object.keys(PROVIDERS).map(p => [p, modelFor(p)])),
  models: settings.models || {}, usage, today: dayKey(),
},
settings: { /* …the app's own fields… */ ai: settings.ai, aiProvider: settings.aiProvider, hasKey: !!aiKey() },
```

`hasKey` is the one flag the rest of the page needs: it decides whether AI-only features are shown at all (Step 8).

## Step 7: the AI settings sheet

The sheet is a full-screen panel that slides up over the app's own Settings, with a **Done** button. Its order never changes from app to app: the provider in use first, then the other provider, then **What AI does**, then **Token usage**. That fixed order is most of the shared feel.

Entry point: one row in the app's Settings screen, which doubles as a status line.

```javascript
`<div class="srow"><div class="grow"><b>Keys, models and token usage</b><small class="muted">${S.settings.hasKey
   ? `${PN[S.ai.provider]} — ${esc(S.ai.model[S.ai.provider])}${S.ai.usage.p[S.ai.provider] ? " — " + fmtN(S.ai.usage.p[S.ai.provider].in + S.ai.usage.p[S.ai.provider].out) + " tokens used" : ""}`
   : "Add a Claude or OpenAI key for <the app's AI features>"}</small></div>
   <button class="sm ${S.settings.hasKey ? "" : "primary"}" data-act="aiopen">AI settings</button></div>`
```

The page script. `S` is the state the Scriptable side pushed; `send(action, data)` is the app's bridge; `esc` escapes text for HTML; `rel` formats "5 min ago". List each background AI job in **What AI does**, and every feature tag from Step 3 in `FEAT`.

```javascript
let aiOpen = false, aiArmed = null; const aiLoading = new Set();
const PN = { anthropic: "Claude", openai: "OpenAI" };
const FEAT = { summaries: "Summaries and categories", test: "Connection tests", other: "Other" };   // + this app's tags
const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n);
function arm(key) { aiArmed = key; renderAI(); setTimeout(() => { if (aiArmed === key) { aiArmed = null; renderAI(); } }, 3500); }

function usageBlock(p, P) {
  const days = [], now = new Date();
  for (let i = 13; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); }
  const tot = k => { const x = P.days[k]; return x ? x.in + x.out : 0; };
  const max = Math.max(1, ...days.map(tot)), month = S.ai.today.slice(0, 7);
  const monthTot = Object.entries(P.days).filter(([k]) => k.startsWith(month)).reduce((n, [, x]) => n + x.in + x.out, 0);
  const rows = (obj, label) => Object.entries(obj).sort((x, y) => (y[1].in + y[1].out) - (x[1].in + x[1].out))
    .map(([k, x]) => `<tr><td>${esc(label(k))}</td><td>${x.calls}</td><td>${fmtN(x.in)}</td><td>${fmtN(x.out)}</td></tr>`).join("");
  return `<div class="ucard"><div class="aic-h"><b>${PN[p]}</b><span class="muted small">${P.calls} request${P.calls === 1 ? "" : "s"}</span></div>
    <div class="ustat"><div><b>${fmtN(P.in + P.out)}</b><small>total tokens</small></div><div><b>${fmtN(P.in)}</b><small>input</small></div><div><b>${fmtN(P.out)}</b><small>output</small></div></div>
    <p class="note">Today ${fmtN(tot(S.ai.today))} tokens — this month ${fmtN(monthTot)} tokens</p>
    <div class="ubars" aria-label="Tokens per day, last 14 days">${days.map(k => `<span style="height:${Math.max(tot(k) ? 6 : 2, tot(k) / max * 100)}%" class="${tot(k) ? "" : "zero"}" title="${k}: ${tot(k)} tokens"></span>`).join("")}</div>
    <div class="ubars-l"><span>2 weeks ago</span><span>Today</span></div>
    <table class="utab"><tr><th>Feature</th><th>Requests</th><th>In</th><th>Out</th></tr>${rows(P.features, k => FEAT[k] || k)}</table>
    <table class="utab"><tr><th>Model</th><th>Requests</th><th>In</th><th>Out</th></tr>${rows(P.models, k => k)}</table></div>`;
}

function renderAI() {
  const el = document.getElementById("aisheet"), keep = el.scrollTop;
  el.classList.toggle("open", aiOpen);
  if (!aiOpen) return;
  const A = S.ai;
  const card = p => {
    const key = A.keys[p], ml = (A.models[p] || {}).list || [], cur = A.model[p];
    const opts = ml.some(m => m.id === cur) ? ml : [{ id: cur, name: cur }].concat(ml);   // keep the chosen model visible
    return `<div class="aicard ${A.provider === p ? "active" : ""}">
      <div class="aic-h"><b>${PN[p]}</b>${A.provider === p ? `<span class="badge-ai">In use</span>` : key ? `<button class="sm" data-act="aiprov" data-v="${p}">Use ${PN[p]}</button>` : ""}</div>
      <div class="aic-row"><span class="lbl">API key</span>${key ? `<code>${esc(key)}</code>` : `<span class="muted">Not set</span>`}</div>
      <div class="aic-btns"><button class="sm ${key ? "" : "primary"}" data-act="aikey" data-v="${p}">${key ? "Change key" : "Add key"}</button>
        ${key ? `<button class="sm" data-act="aitest" data-v="${p}">Test connection</button><button class="sm danger ${aiArmed === "rm" + p ? "armed" : ""}" data-act="airm" data-v="${p}">${aiArmed === "rm" + p ? "Confirm" : "Remove"}</button>` : ""}</div>
      <label class="aic-row lbl" for="ms-${p}">Model</label>
      <select id="ms-${p}" class="modelsel" data-p="${p}">${opts.map(m => `<option value="${esc(m.id)}" ${m.id === cur ? "selected" : ""}>${esc(m.name)}${m.name !== m.id ? " — " + esc(m.id) : ""}</option>`).join("")}</select>
      <div class="aic-btns"><button class="sm" data-act="aimodels" data-v="${p}" ${key && !aiLoading.has(p) ? "" : "disabled"}>${aiLoading.has(p) ? "Loading…" : ml.length ? "Refresh model list" : "Load my models"}</button>
        <span class="note">${ml.length ? `${ml.length} models, updated ${rel(A.models[p].at)}` : key ? "Loads the models your key can use" : "Add a key to load models"}</span></div>
    </div>`;
  };
  const order = A.provider === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];
  const used = Object.keys(A.usage.p).filter(p => A.usage.p[p].calls);
  el.innerHTML = `<div class="sh-head"><h2>AI</h2><button class="link" data-act="aiclose">Done</button></div><div class="sh-body">
    <p class="hint">Keys stay in this iPhone's Keychain. Only the provider marked “In use” is called.</p>
    ${order.map(card).join("")}
    <h3 class="sec">What AI does</h3>
    <div class="srow"><div class="grow"><b><Background job name></b><small class="muted"><When it runs and what it costs></small></div>
      <button class="switch ${S.settings.ai ? "on" : ""}" data-act="toggle" data-v="ai" aria-label="<Background job name>"></button></div>
    <h3 class="sec">Token usage</h3>
    ${used.length ? used.map(p => usageBlock(p, A.usage.p[p])).join("") : `<p class="muted pad">No AI requests yet.</p>`}
    ${used.length ? `<div class="aic-btns"><span class="note">Counting since ${new Date(A.usage.since).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</span>
      <button class="sm danger ${aiArmed === "reset" ? "armed" : ""}" data-act="usagereset">${aiArmed === "reset" ? "Confirm reset" : "Reset counters"}</button></div>` : ""}
  </div>`;
  el.scrollTop = keep;   // re-renders must not jump the user back to the top
}

// In the page's click handler (t = the clicked [data-act] element, v = t.dataset.v):
case "aiopen": aiOpen = true; renderAI(); break;
case "aiclose": aiOpen = false; renderAI(); break;
case "aikey": case "aitest": case "aiprov": send(act, { v }); break;
case "aimodels": aiLoading.add(v); renderAI(); send("aimodels", { v }); break;
case "airm": if (aiArmed === "rm" + v) { aiArmed = null; send("airm", { v }); } else arm("rm" + v); break;
case "usagereset": if (aiArmed === "reset") { aiArmed = null; send("usagereset", {}); } else arm("reset"); break;

// Model menus report through "change", not "click":
document.addEventListener("change", e => {
  if (e.target.classList.contains("modelsel")) send("aimodel", { p: e.target.dataset.p, v: e.target.value });
});
// When fresh state arrives from the Scriptable side: aiLoading.clear(); renderAI();
```

The click handler must ignore taps that land on form controls, or tapping the model menu also triggers whatever row action sits around it:

```javascript
document.addEventListener("click", e => {
  if (e.target.closest("select, option, input, textarea")) return;
  // …the app's [data-act] handling…
});
```

The CSS uses BlogPulse's colour variables. Rename them to each app's own (StravaFeed: `--sheet` → `--card`, `--paper` → `--soft`, `--muted` → `--mut`, `--signal` → `--accent`), so the sheet follows that app's themes in light and dark mode.

```css
#aisheet{position:fixed;inset:0;z-index:14;background:var(--paper);transform:translateY(102%);transition:transform .28s ease;overflow-y:auto}
#aisheet.open{transform:none}
.aicard,.ucard{background:var(--sheet);border:1px solid var(--rule);border-radius:14px;padding:14px;margin:14px 0}
.aicard.active{border-color:var(--signal);box-shadow:0 0 0 1px var(--signal)}
.aic-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:17px}
.aic-row{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:14px}
.aic-row.lbl,.aic-row .lbl{font-weight:600;color:var(--ink-2)}
.aicard code{font:13px ui-monospace,Menlo,monospace;background:var(--paper);border:1px solid var(--rule);border-radius:6px;padding:2px 6px}
.aic-btns{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}
.sm[disabled]{opacity:.5}
.modelsel{display:block;width:100%;margin-top:6px;font:16px var(--sans);color:var(--ink);background:var(--paper);border:1px solid var(--rule);border-radius:9px;padding:9px 10px}
.badge-ai{font-size:12px;font-weight:700;color:var(--signal);background:var(--signal-wash);border-radius:6px;padding:2px 8px}
.danger{color:var(--danger)} .danger.armed{background:var(--danger);color:#fff;border-color:var(--danger)}
.ustat{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 4px}
.ustat div{background:var(--paper);border-radius:10px;padding:8px 10px}
.ustat b{display:block;font-size:20px;font-weight:700}
.ustat small{color:var(--muted);font-size:12px}
.ubars{display:flex;align-items:flex-end;gap:3px;height:56px;margin-top:10px}
.ubars span{flex:1;background:var(--signal);border-radius:3px 3px 0 0;min-height:2px}
.ubars span.zero{background:var(--rule)}
.ubars-l{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-top:4px}
.utab{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
.utab th{text-align:left;font-weight:600;color:var(--muted);padding:4px 4px 4px 0;border-bottom:1px solid var(--rule)}
.utab td{padding:6px 4px 6px 0;border-bottom:1px solid var(--rule);color:var(--ink-2);word-break:break-word}
.utab th:not(:first-child),.utab td:not(:first-child){text-align:right;white-space:nowrap}
```

The model menu's font must stay at 16px or larger; anything smaller makes iOS zoom the page when the menu is tapped.

## Step 8: labelling AI output and working without a key

The user should always know what AI wrote, and an app with no key should feel complete rather than broken. Five rules, applied the same way in every app:

1. **Label everything AI wrote**, at the top of the text, in the accent colour: `✦ AI summary by Claude`, `✦ AI-written by OpenAI`. The provider comes from the result, so switching providers never mislabels old text.
2. **Label fallbacks too**, in a quieter style: `Extracted from the article — no AI`, `Template — no AI`. A dashed outline instead of a filled badge.
3. **Hide AI-only features without a key**: a tab, a button or a section that can't work without AI isn't shown at all. Never show it disabled with an error.
4. **Fall back where you can**: if a feature has a reasonable non-AI version (extract key sentences, fill a template), use it and label it. If the AI call fails, use the fallback and say why in one line.
5. **Point to the one place to fix it**: every "needs a key" hint names **Settings › AI settings**, and nowhere else asks for a key.

```css
.badge-ai{display:inline-block;font-size:12px;font-weight:700;color:var(--signal);background:var(--signal-wash);border-radius:6px;padding:2px 8px}
.badge-ex{display:inline-block;font-size:12px;font-weight:600;color:var(--ink-2);border:1px dashed var(--muted);border-radius:6px;padding:1px 8px}
```

Background jobs (summaries, sorting) run only when `settings.ai` is on and a key exists; anything the user taps runs whenever a key exists. Keep background jobs to one batched request per refresh, so **What AI does** can promise a predictable cost.

## Testing checklist

Run these on a phone before shipping the version that adds the AI sheet, in light and dark mode.

- [ ] With no keys, the app opens normally, AI-only features are hidden, and **AI settings** shows **Add key** on both cards.
- [ ] **Add key** opens a native secure alert; after saving, the card shows the masked key and a toast reports the model count.
- [ ] A wrong key is saved but the toast says checking it failed.
- [ ] **Change key** says which key is saved ("ends in …9f2c") and replaces it.
- [ ] **Load my models** fills the menu, newest first; for OpenAI, no embedding, audio or image models appear.
- [ ] Picking a model shows a toast, and the next AI request uses it (check the usage table's Model rows).
- [ ] **Test connection** reports the model and seconds, and adds a "Connection tests" row.
- [ ] With keys for both, **Use OpenAI** switches the **In use** badge, and the next request goes to OpenAI.
- [ ] **Remove** turns into **Confirm**, reverts after about 3.5 seconds, and removes the key on the second tap.
- [ ] Token usage shows total, input and output, today and this month, 14 bars with today's on the right, and Feature and Model tables.
- [ ] **Reset counters** needs two taps, then shows "No AI requests yet" and a new "Counting since" date.
- [ ] Turning **What AI does** off stops background requests; tapped features still work.
- [ ] Tapping the model menu doesn't trigger anything else on the screen, and doesn't zoom the page.
- [ ] Re-rendering (after a toast or a refresh) keeps the sheet's scroll position.
- [ ] Every AI-written text carries a ✦ label naming the provider; every fallback says "no AI".

To start from scratch while testing, remove the app's two Keychain entries in a scratch script, for example `Keychain.remove("MYAPP_ANTHROPIC_KEY")`, and delete `usage.json`.

## Pitfalls

The first two were hit on BlogPulse; the rest are why the code above is written the way it is.

- **Menus inside tappable rows** (hit). A `<select>` inside an element with a `data-act` fired that row's action too, closing the screen and leaving the iOS menu floating over the app. Keep menus outside action areas, and have the click handler ignore form controls (Step 7).
- **One key prompt for two providers** (hit). The first version asked "Save as Claude key" or "Save as OpenAI key" in one alert, and its remove button cleared both keys. One card, one key, one prompt per provider.
- **OpenAI and `max_tokens`.** Newer OpenAI models reject `max_tokens`. Leave it out for OpenAI; keep it for Claude, where it is required.
- **Dated model ids.** OpenAI echoes dated ids (`gpt-4o-mini-2024-07-18`); recording those would split one model into several usage rows. Record the configured id.
- **JSON with fences.** Models wrap JSON in code fences or add a sentence before it. Always go through `parseJSON`, never `JSON.parse` on the raw reply.
- **Stacked sheets.** The AI sheet opens from Settings, so it needs the higher `z-index` (Settings 13, AI 14), or **Done** closes the wrong one.
- **One home per switch.** Keep the background-AI switch only in **What AI does**; a second copy in another screen is one more place to keep in sync.
- **Save usage after every request.** iOS can end a Scriptable script at any moment; counts kept in memory until close would be lost.
- **Keychain names shared between apps.** Generic names (`OPENAI_KEY`) would let one app overwrite another's key. Prefix with the app's name.

## Prompt for Claude

Paste this into a chat about another app, with this doc's link, to add the pattern or bring an existing AI setup in line. Replace the bracketed parts.

```markdown
Add the shared AI configuration to [Go2FGym], following the attached doc "AI configuration for Scriptable apps" exactly, with BlogPulse.js as the reference:

- Repository: github.com/gadominas/[Go2FGym], branch main, script file [Go2FGym.js]
- Keychain names: [GO2FGYM_ANTHROPIC_KEY] and [GO2FGYM_OPENAI_KEY]; default models: claude-haiku-5-5 and gpt-4o-mini
- Existing AI code to replace: [the CONFIG.AI block, the OpenAI call in suggestComments()]. Route every AI request through aiCall with these feature tags: [suggestions: "Comment ideas", chat: "Chat"]
- Background AI jobs for "What AI does": [none / describe them]
- Add the AI settings sheet behind Settings › AI settings, mapped to this app's colour variables, and hide AI-only features when no key is saved
- Move any key the app stored before into the new Keychain name on first run, then remove the old one
- Label all AI output with ✦ and the provider; label fallbacks "no AI"
- Run the testing checklist in light and dark mode, bump VERSION, add a releases.json entry (highlights: choose Claude or OpenAI, pick any model, see your token usage), then commit and push to main
```
