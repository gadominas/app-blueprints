---
id: read-aloud
title: Read aloud for Scriptable apps
version: 1.0.1
updated: 2026-10-31
author: Gediminas Siutilas
reference: BlogPulse 1.15.1 (https://github.com/gadominas/BlogPulse/blob/main/BlogPulse.js)
depends_on: [settings]
---

# Read aloud for Scriptable apps

## Overview

Any app that shows text people read (posts, summaries, briefings, notes) can read it aloud the same way: one player at the bottom, a label that always says *what* is being read, a progress bar with time left, the sentence being read highlighted while read text dims, and a text view that follows the voice. It works with the iPhone's own voices out of the box, and with OpenAI's natural voices when the app has an OpenAI key (AI configuration).

What the user sees, in every app:

- **Listen buttons named after what they read**: **Article** on an item reads the whole original text, **Listen to TL;DR** reads a summary, **Summaries** next to a group reads that group's summaries, **Listen to the story** reads a briefing. Never a bare "Listen" when there is more than one kind.
- **The player**: a dark bar fixed at the bottom with bouncing bars, a coloured **mode label** (FULL ARTICLE teal, TL;DR purple, STORY amber, SUMMARIES blue), the title, the source and *n of m*, then **Text**, **Pause/Play**, **Next** and **Stop**.
- **Progress**: a thin bar under the player with "38% — about 4 min left". Tap the bar to jump: iPhone voices restart from that sentence, the AI voice jumps to that second within the piece playing.
- **Highlighting where the text already is**: while a summary that is on screen is read, its own sentences light up one by one (signal-blue wash with an underline) and the ones already read dim to 45%.
- **Text view**: the **Text** button opens the whole text being read in a full-screen sheet that scrolls itself to keep the current sentence in the middle. Scrolling by hand pauses the following for 6 seconds. Tap any sentence to jump there.
- **The item being read** gets an amber edge in the list.
- **Settings › Listening**: iPhone voice or ✦ AI voice; for iPhone voices a Female/Male/All filter, a voice menu grouped by language, speed and pitch; for the AI voice, voice, speech model and an optional speaking style; **Test the voice** in both.

The pieces, all inside the app's single script. The code is in [`snippets/read-aloud/`](../snippets/read-aloud), file for file, and is part of this blueprint (tagged with it):

| Piece | Snippet file | Lives in | Job |
| --- | --- | --- | --- |
| `sentences`, `buildPlan`, `MODES` | `read-aloud.page.js` | the page | Turns items → paragraphs → sentences into what the screen highlights (segments) and what the voice speaks (parts) |
| `speak`, `playPart`, `stopSpeaking`, `togglePause`, `skipItem` | `read-aloud.page.js` | the page | iPhone voices through the Web Speech API |
| `aiFetch`, `aiPlayPart`, `unlockAudio`, `SILENT` | `read-aloud.page.js` | the page | The AI voice: pieces fetched as MP3, the next one prefetched |
| `renderPlayer`, `renderProgress`, `seekTo`, `seekChar` | `read-aloud.page.js` | the page | The player, the progress bar and jumping |
| `segAt`, `segCls`, `paintSegs`, `segSpans`, `renderReadAlong` | `read-aloud.page.js` | the page | Highlighting and the text view |
| `readAloudAct` | `read-aloud.handlers.page.js` | the page | Taps on the player, the text and Settings › Listening |
| `listenHTML` | `listening-settings.page.js` | the page | Settings › Listening |
| `aiSpeech`, `readAloudBridge`, `extractArticle` | `read-aloud.scriptable.js` | Scriptable side | OpenAI speech, the article's own text, the system-voice fallback |
| Player and text-view markup | `read-aloud.html` | the page | `#player`, `#readsheet` |
| Styles | `read-aloud.css` | the page | Player, mode labels, highlighting, text view |
| Demo | `demo.html` | a browser | Runs the page side on its own with stubs: open it on a Mac or iPhone to try changes |

**One rule runs through all of it: the text is split into sentences once, and everything (the voice, the progress, the highlight, the jump, the text view) counts in the same sentences.**

Reference implementation: [BlogPulse.js](https://github.com/gadominas/BlogPulse/blob/main/BlogPulse.js) 1.15.1. The snippets are taken from it with names kept. Two places differ, on purpose, so another app can reuse them unchanged: BlogPulse inlines `refreshInPlace()` in `refreshReadingViews()`, and has the `readAloudAct` and `readAloudBridge` cases inline in its own handlers.

## The rules

- **Say what is being read.** Every Listen button names its mode (Article, Listen to TL;DR, Summaries, Listen to the story), and every reading passes a `kind` to `speak()` so the player shows its mode label. Kinds: `article`, `tldr`, `story`, `summaries`, `test`.
- **Start speaking inside the tap.** iOS only lets speech and audio start from a user gesture. A button that must fetch first (the full article) calls `speak()` straight away with a short placeholder ("Loading the article.") and the real text replaces it when it arrives.
- **Sentences, not characters, are the unit.** `buildPlan()` is the only place text is split. Never highlight or seek by re-splitting the displayed text.
- **Show text, say text.** A sentence carries `show` (what's on screen) and `say` (what's spoken: a full stop is added after titles and bullets so the voice pauses). Highlighting works per sentence, so the two may differ.
- **Short pieces for iPhone voices** (at most 220 characters, joined up to 160) because WebKit can stop part-way through long utterances. **AI voice pieces** are up to 2,000 characters, the first only 700 so audio starts quickly.
- **The AI voice falls back** to the iPhone voice from where it failed, with a toast, and never leaves the user in silence.
- **Colours**: shared tokens everywhere except the four mode labels, which are fixed so a mode looks the same in every app and palette.
- **Stacking**: player `z-index: 30`, text view `25` (above Settings 13 and the AI sheet 14, below the update sheet 48 and the launch screen 90).

## Step 1: settings

Add the fields to the app's settings defaults and to the `set` allow-list, and give the page `hasOpenAI` in `clientState().settings` (only with AI configuration):

```javascript
// settings defaults
speechEngine: "device", ttsModel: "gpt-4o-mini-tts", ttsVoice: "coral", ttsInstructions: "",   // read aloud: iPhone voices or OpenAI
voiceURI: "", voiceRate: 1, voicePitch: 1, voiceGender: "all",
// `set` allow-list
"voiceURI", "voiceRate", "voicePitch", "voiceGender", "speechEngine", "ttsModel", "ttsVoice", "ttsInstructions"
```

Insert `${listenHTML()}` in the Settings sheet as a **Listening** section, after the app's own reading sections and before Updates (`listening-settings.page.js`). Without AI configuration, drop `aiListenHTML` and the engine switch.

## Step 2: what to read

A reading is a list of **items**; each item has an `id` (to mark the item being read), a `title` (shown in the player) and **paragraphs**. A paragraph has `text`, and optionally `head: true` (shown as a heading in the text view) and a `key` (to highlight it in place, Step 6). Each app writes its own builders. BlogPulse's (`head`, `postItem`, `tldrItems`, `storyItems`, at the end of `read-aloud.page.js`) are the pattern:

```javascript
const head = (a) => [{ key: "title", head: true, text: a.title }, { key: "from", text: "From " + srcTitle(a) }];
const postItem = a => ({ id: a.id, title: a.title, paras: head(a).concat(a.desc ? [{ key: "desc", text: a.desc }] : []) });
function tldrItems(a, d) {
  return [{ id: a.id, title: a.title, paras: head(a).concat([{ key: "lead", text: d.lead }],
    (d.points || []).map((x, i) => ({ key: "pt" + i, text: x })), d.why ? [{ key: "why", text: "Why it matters: " + d.why }] : []) }];
}
```

## Step 3: the plan (sentences and pieces)

```javascript
// A reading is made of items (a post, a story section…), each made of paragraphs, each made of sentences.
// Sentences ("segments") are what the screen highlights; parts are what the voice speaks (sentences joined).
const sentences = t => (clean(t).match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || []).map(x => x.trim()).filter(Boolean);
function buildPlan(items, ai) {
  const segs = [], parts = [];
  let cur = null;
  const push = (seg, k) => {
    const room = ai ? (parts.length <= 1 ? 700 : 2000) : 160;   // AI: a short first piece so audio starts quickly
    if (!cur || cur.k !== k || (ai ? cur.t.length + seg.say.length + 1 > room : cur.t.length + seg.say.length >= room)) {
      cur = { t: "", k, segs: [] }; parts.push(cur);
    }
    seg.part = parts.length - 1; seg.l0 = cur.t ? cur.t.length + 1 : 0;
    cur.t = cur.t ? cur.t + " " + seg.say : seg.say;
    cur.segs.push(segs.length); segs.push(seg);
  };
  items.forEach((it, k) => (it.paras || [{ text: it.text }]).forEach((p, pi) => {
    const sens = sentences(p.text);
    sens.forEach((sen, si) => {
      const pieces = [];
      if (!ai) {   // WebKit can stop part-way through very long sentences: cut them at a comma or a space
        while (sen.length > 220) { let cut = sen.lastIndexOf(", ", 220); if (cut < 80) cut = sen.lastIndexOf(" ", 220); if (cut < 40) cut = 220; pieces.push(sen.slice(0, cut + 1).trim()); sen = sen.slice(cut + 1).trim(); }
      }
      pieces.push(sen);
      pieces.forEach((show, j) => {
        const last = si === sens.length - 1 && j === pieces.length - 1;
        const say = last && !/[.!?…:]["”’)]*$/.test(show) ? show + "." : show;   // a short pause after titles and bullets
        push({ show, say, len: say.length, k, pi, key: p.key || "", head: !!p.head }, k);
      });
    });
  }));
  let acc = 0;
  parts.forEach(pt => { pt.c0 = acc; acc += pt.t.length; });
  segs.forEach(sg => { sg.a0 = parts[sg.part].c0 + sg.l0; sg.a1 = sg.a0 + sg.len; });
  return { segs, parts, total: acc };
}

const MODES = { article: "Full article", tldr: "TL;DR", story: "Story", summaries: "Summaries", test: "Voice test" };
```

`speak(label, items, engine, kind)` builds the plan, stores `tts.kind` and `tts.id`, calls `refreshReadingViews()` so on-screen text is wrapped in sentences, and starts. `label` is the player's second line (BlogPulse: the blog's name).

## Step 4: the voices

iPhone voices come from `speechSynthesis.getVoices()`, minus novelty voices, grouped by language in Settings; `GENDER` is a hand-made list of Apple voice names (iOS doesn't say). `currentVoice()` prefers the saved voice, then an English Premium or Enhanced one. Each piece is one `SpeechSynthesisUtterance`; its `onboundary` gives the character being spoken, which drives the progress and the highlight.

The AI voice (only with AI configuration and an OpenAI key) sends each piece to `/v1/audio/speech` through `aiSpeech()` on the Scriptable side, gets base64 MP3 back through the bridge (`ttsaudio`), plays it in one `Audio` element and prefetches the next piece. `audio.ontimeupdate` gives the position. Usage is recorded as characters (`recordUsage(..., "speech", 0, 0, chars)`). `tts-1` and `tts-1-hd` offer only `TTS_LEGACY_VOICES`; `gpt-4o-mini-tts` also takes the speaking style (`instructions`).

## Step 5: the player

Markup in `read-aloud.html`, styles in `read-aloud.css`. `renderPlayer()` fills it:

```javascript
function renderPlayer() {
  const pl = $("#player"), on = tts.on;
  pl.hidden = !on; document.body.classList.toggle("playing", on);
  document.querySelectorAll(".speaking").forEach(el => el.classList.remove("speaking"));
  if (!on) return;
  const part = tts.parts[tts.i] || {}, it = tts.items[part.k] || {};
  $("#plTitle").textContent = it.title || tts.label;
  const mode = MODES[tts.kind] || "";
  $("#plMode").textContent = mode; $("#plMode").hidden = !mode;
  $("#plMode").className = "pl-mode m-" + (tts.kind || "x");
  $("#plSub").textContent = (tts.engine === "ai" ? "✦ AI voice — " : "") + tts.label + (tts.items.length > 1 ? ` — ${part.k + 1} of ${tts.items.length}` : "")
    + (tts.loading ? " — preparing…" : tts.paused ? " — paused" : "");
  pl.classList.toggle("paused", tts.paused);
  $("#plPause").innerHTML = tts.paused ? PLAY_ICO : PAUSE_ICO;
  $("#plPause").setAttribute("aria-label", tts.paused ? "Resume" : "Pause");
  if (it.id) { const c = document.getElementById("c-" + it.id); if (c) c.classList.add("speaking"); }
  renderProgress();
}
```

`renderProgress()` sets the bar and the "about N min left" text (iPhone voices: 15 characters a second × speed; AI voice: its measured pace), then calls `paintSegs()`. `seekTo(f)` turns a tap on the bar into a character and calls `seekChar()`.

## Step 6: highlighting

```javascript
function segAt(c) {   // the sentence containing character c (searching near the last one)
  const sg = tts.segs; if (!sg.length) return -1;
  let i = Math.max(0, Math.min(sg.length - 1, tts.nowSeg));
  while (i > 0 && c < sg[i].a0) i--;
  while (i < sg.length - 1 && c >= sg[i].a1) i++;
  return i;
}
const segCls = i => !tts.on || tts.nowSeg < 0 ? "" : i < tts.nowSeg ? "rs-done" : i === tts.nowSeg ? "rs-now" : "";
function paintSegs(now) {   // read sentences dim, the current one is highlighted
  const prev = tts.nowSeg;
  if (now === prev || now < 0) return;
  const lo = Math.max(0, Math.min(prev, now)), hi = Math.max(prev, now);
  tts.nowSeg = now;
  for (let i = lo; i <= hi; i++) document.querySelectorAll(`.rs[data-s="${i}"]`).forEach(el => { el.classList.toggle("rs-done", i < now); el.classList.toggle("rs-now", i === now); });
  if (raOpen && Date.now() > raHold) { const el = document.querySelector(`#readsheet .rs[data-s="${now}"]`); if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" }); }
}
```

- **In place**: a view that shows the text being read (BlogPulse: the TL;DR, inline and in its own screen) renders that text through `segSpans()` while it is being read, and plainly otherwise. BlogPulse's pattern:

```javascript
// While a post's TL;DR is read, its TL;DR text is shown sentence by sentence (inline and in the TL;DR screen).
const readingTldr = a => tts.on && tts.kind === "tldr" && tts.id === a.id;
const tldrPart = (a, key, plain) => readingTldr(a) ? segSpans(sg => sg.k === 0 && sg.key === key) || plain : plain;
```

  The app's `refreshInPlace()` re-renders those views; `speak()` calls it through `refreshReadingViews()`.
- **Text view**: `renderReadAlong()` draws every paragraph of the reading into `#readsheet`, headings as `.ra-h`, the rest as `.ra-p`, and scrolls to the current sentence. The app's `lockBody()` includes `|| raOpen`.
- **Clearing**: `stopSpeaking()` removes every highlight and closes the text view.

## Step 7: wiring

- **Listen buttons** (per app), each passing its kind:

```javascript
case "listenarticle":   // speak right away (iOS only lets speech start from a tap), then the article follows
  if (a) { speak(srcTitle(a), [{ id, title: a.title, paras: [{ text: "Loading the article." }] }], undefined, "article"); send("articletext", { id }); } break;
case "listentldr": { const d = tl[id]; if (a && d && d !== "loading" && !d.error) speak(srcTitle(a), tldrItems(a, d), undefined, "tldr"); break; }
case "listengroup": { const items = (groupIdx[v] || []).map(postItem); if (items.length) speak(label(+v)[0], items, undefined, "summaries"); break; }
case "listenstory": if (S.story) speak("Story", storyItems(S.story), undefined, "story"); break;
```

  Labels: the item's button reads `${SPK}Article` (`aria-label="Listen to the full article"`, icon only in the Tiny layout), a summary's reads `${SPK}Listen to TL;DR`, a group's `${SPK}Summaries`.
- **Player, text and Settings taps**: `readAloudAct(act, t, e)` first in the click handler; the `change` listener for the Listening menus (`read-aloud.handlers.page.js`).
- **Scriptable side**: `readAloudBridge(m)` first in the action handler (`articletext`, `ttsaudio`, `speak`). `articletext` fetches the original page, `extractArticle()` keeps its paragraphs and subheadings, and falls back to the excerpt (with `partial: true`, which the page announces).
- **Without speech in the page** (no Web Speech voices), `speak()` hands the whole text to Scriptable's `Speech.speak()` instead.
- **Usage analytics** (if the app has it): send `usage-listen` with the kind on each Listen tap.

## Testing checklist

Run these on a phone, in light and dark mode, with an iPhone voice and (if the app has AI) the AI voice.

- [ ] Every Listen button says what it reads; the player's label matches (FULL ARTICLE, TL;DR, STORY, SUMMARIES, VOICE TEST).
- [ ] **Article** starts speaking at once ("Loading the article."), then reads the title, the source and the article; a page that can't be read falls back to the excerpt with a toast.
- [ ] The progress bar moves smoothly and the time left is plausible; tapping the bar jumps.
- [ ] While a TL;DR on screen is read, its current sentence is highlighted and read sentences dim; stopping clears it.
- [ ] **Text** opens the text view; it follows the voice; scrolling by hand stops the following for about 6 seconds; tapping a sentence jumps there; **Done** closes it.
- [ ] Pause, play, next and stop work; the item being read has an amber edge.
- [ ] Settings › Listening: the voice menu, filter, speed, pitch and **Test the voice** work; switching voice mid-sentence carries on with the new voice.
- [ ] AI voice: audio starts within a couple of seconds; a wrong key falls back to the iPhone voice with a toast; usage shows characters.
- [ ] With Reduce Motion on, the bars don't bounce and the highlight doesn't fade.
- [ ] Toasts appear above the player, and the last item in the list can scroll clear of it.

## Pitfalls

- **Long utterances stop early** (hit in BlogPulse 1.3.0). WebKit sometimes ends a long utterance part-way. Pieces stay under 220 characters.
- **Speech after `cancel()`** (BlogPulse 1.3.0). Speaking immediately after `speechSynthesis.cancel()` can be dropped on iOS: `playSoon()` waits 60 ms.
- **Audio blocked outside a tap** (BlogPulse 1.4.0). The AI voice plays a 0.1 s silent WAV (`unlockAudio`) inside the tap, before any fetch, or iOS refuses to play the MP3 later.
- **Fetching before speaking loses the tap** (BlogPulse 1.10.0). That's why the full article starts with a placeholder.
- **Highlight drift** (BlogPulse 1.15.0). Re-splitting displayed text to find the sentence gives different boundaries than the spoken text. Use the plan's segments for both.
- **`scrollIntoView` with smooth behaviour fights the user's finger** (BlogPulse 1.15.0): following pauses for 6 s after a touch in the text view.
- **Later CSS rules undoing the player's room** (BlogPulse 1.15.1). An older `body.playing #list{padding-bottom:96px}` further down the stylesheet hid the last item and put toasts on the player once the player grew a second row. Keep one `body.playing` rule pair, in `read-aloud.css`.

## Prompt for Claude

Paste this into a chat about another app, with this doc's link. Replace the bracketed parts.

```markdown
Add read aloud to [App], following the blueprint "read-aloud" (github.com/gadominas/app-blueprints/blob/main/blueprints/read-aloud.md) and its snippets (snippets/read-aloud/) exactly, with BlogPulse.js as the reference:

- Repository: github.com/gadominas/[App], branch [main], script file [App.js]
- What can be read, and the kind and button label of each: [e.g. a note's full text → article, "Article"; a day's summaries → summaries, "Summaries"]
- Text shown in place while it's read: [e.g. the note's summary, or none]
- AI voice: [yes, the app follows ai-configuration / no, iPhone voices only]
- Run the testing checklist in light and dark mode, bump VERSION, add a releases.json entry, then commit and push to main
- Record it in the app's trace (AGENTS.md › 4): the BLUEPRINTS line, Settings › Built with, and docs/BLUEPRINTS.md
```

## Version history

| Version | Date | Changes |
| --- | --- | --- |
| 1.0.0 | 2026-10-31 | First versioned release, from BlogPulse 1.15.1: mode labels, progress with time left and jumping, sentence highlighting in place and in a text view, iPhone and AI voices, snippet files and a browser demo |
| 1.0.1 | 2026-10-31 | `listening-settings.page.js` no longer ends with the settings blueprint's `cardSections()` helper, which had been copied in from BlogPulse; an app pasting the whole file got a second copy. No change to how reading aloud works |
