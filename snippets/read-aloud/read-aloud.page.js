// ─────────────────────────────────────────────────────────────────────────────
// Read aloud (app-blueprints · read-aloud 1.0.0) — PAGE SIDE
// Engine, player, sentence highlighting and the read-along view.
// Taken from BlogPulse 1.15.0 with names kept. Paste inside the page script (BlogPulse: inside clientApp()).
//
// The app provides (same names as in every app):
//   $(sel)            querySelector shortcut            esc(text)        HTML-escape
//   send(type, data, cb)  bridge to Scriptable (cb gets (ok, msg) via window.__done)
//   toast(msg)        short message                     S.settings       the settings pushed by Scriptable
//   lockBody()        re-evaluates body.locked (add `|| raOpen` to it)
//   cfgOpen, renderCfg()  from the settings blueprint (Settings › Listening shows the voices)
//   refreshInPlace()  re-renders any view showing the text being read in place (may be empty: function refreshInPlace() {})
//   byId(id), srcMap()  only used by the BlogPulse item builders in section 7; write your own builders
// ─────────────────────────────────────────────────────────────────────────────

// ── Read aloud: system voices through the Web Speech API ──
const SYN = window.speechSynthesis;
const SPK = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`;
const GENDER = {};
("Samantha Karen Moira Tessa Fiona Veena Victoria Allison Ava Susan Zoe Nicky Kate Serena Martha Catherine Isha Agnes Kathy Princess Vicki Joelle Flo Sandy Shelley Grandma " +
 "Amélie Audrey Aurélie Marie Anna Petra Helena Alice Federica Paulina Mónica Monica Marisol Luciana Joana Milena Katya Yuna Kyoko Ting-Ting Tingting Sin-ji Mei-Jia Meijia " +
 "Lekha Sara Nora Ellen Laura Zuzana Ioana Mariska Melina Yelda Damayanti Kanya Lesya Carmit Laila Amira Tünde Linh Montse Ewa Zosia Iveta Lana Satu Klara Alva Kristina Ellen Soumya Vani")
  .split(" ").forEach(n => GENDER[n] = "f");
("Daniel Alex Fred Aaron Arthur Rishi Oliver Tom Gordon Lee Evan Nathan Rocko Eddy Reed Ralph Grandpa Thomas Jacques Markus Yannick Luca Diego Jorge Juan Carlos Felipe Xander " +
 "Maged Majed Tarik Otoya Hattori Li-mu Yu-shu Aman Neel Dariush Rodrigo Martin Henrik Magnus Oskar Viktor Tünde")
  .split(" ").forEach(n => GENDER[n] = GENDER[n] || "m");
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical)\b/i;
const baseName = v => v.name.replace(/\s*\((Enhanced|Premium|Compact)\)/i, "").replace(/\s*\(.*\)\s*$/, "").trim();
const quality = v => /premium/i.test(v.name + v.voiceURI) ? "Premium" : /enhanced/i.test(v.name + v.voiceURI) ? "Enhanced" : "";
const genderOf = v => GENDER[baseName(v)] || "";
let voices = [];
function loadVoices() { voices = SYN ? SYN.getVoices().filter(v => !NOVELTY.test(v.name)) : []; if (cfgOpen) renderCfg(); }   // settings blueprint: re-render Settings if it is open
if (SYN) { loadVoices(); SYN.addEventListener ? SYN.addEventListener("voiceschanged", loadVoices) : (SYN.onvoiceschanged = loadVoices); }
function currentVoice() {
  if (!voices.length) return null;
  const saved = voices.find(v => v.voiceURI === S.settings.voiceURI);
  if (saved) return saved;
  const en = voices.filter(v => /^en(-|_|$)/i.test(v.lang));   // posts are mostly English
  const rank = v => (quality(v) === "Premium" ? 3 : quality(v) === "Enhanced" ? 2 : 0) + (v.default ? 1 : 0) + (/en-(US|GB)/i.test(v.lang) ? 0.5 : 0);
  return (en.length ? en : voices).slice().sort((x, y) => rank(y) - rank(x))[0];
}
const langName = code => { try { return new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(code) || code; } catch (e) { return code; } };
const clean = t => String(t || "").replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").replace(/\*\*|__/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
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
const tts = { parts: [], segs: [], i: 0, label: "", items: [], token: 0, paused: false, on: false, timer: null, engine: "device", loading: false, kind: "", id: "", nowSeg: -1 };
// AI voice: OpenAI speech, played through one <audio> element that a tap unlocks first
const OAI_VOICES = [["alloy", "n"], ["ash", "m"], ["ballad", "m"], ["coral", "f"], ["echo", "m"], ["fable", "m"], ["nova", "f"], ["onyx", "m"], ["sage", "f"], ["shimmer", "f"], ["verse", "m"], ["marin", "f"], ["cedar", "m"]];
const LEGACY_TTS = new Set(["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"]);
const aiTTS = () => S.settings.speechEngine === "ai" && S.settings.hasOpenAI;
const au = new Audio(); au.preload = "auto"; au.setAttribute("playsinline", "");
const SILENT = (() => {   // 0.1 s of silence as a WAV, to unlock audio inside the tap
  const n = 800, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
  const w = (o, t) => { for (let i = 0; i < t.length; i++) buf[o + i] = t.charCodeAt(i); };
  w(0, "RIFF"); dv.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, "data"); dv.setUint32(40, n, true); buf.fill(128, 44);
  let str = ""; buf.forEach(b => { str += String.fromCharCode(b); }); return "data:audio/wav;base64," + btoa(str);
})();
function unlockAudio() { try { au.src = SILENT; const p = au.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
function aiFetch(part) {
  if (part.audio) return Promise.resolve(part.audio);
  if (!part.pending) part.pending = new Promise((res, rej) => send("ttsaudio", { text: part.t }, (ok, msg) => ok ? res(part.audio = msg) : rej(msg)));
  return part.pending;
}
function aiPlayPart() {
  const my = ++tts.token, part = tts.parts[tts.i];
  if (!part) return stopSpeaking();
  tts.loading = !part.audio; renderPlayer();
  aiFetch(part).then(b64 => {
    if (my !== tts.token) return;
    tts.loading = false;
    au.onended = () => { if (my !== tts.token) return; part.audio = null; tts.i++; aiPlayPart(); };
    au.ontimeupdate = () => {
      if (my !== tts.token || !au.duration || !isFinite(au.duration)) return;
      tts.pos = Math.round(part.t.length * au.currentTime / au.duration);
      tts.cps = part.t.length / au.duration;   // this voice's speed, for the time-left estimate
      renderProgress();
    };
    tts.pos = 0;
    au.src = "data:audio/mpeg;base64," + b64;
    if (!tts.paused) {
      const pr = au.play();
      if (pr && pr.catch) pr.catch(() => { if (my === tts.token) { tts.paused = true; renderPlayer(); toast("Tap play to start the AI voice"); } });
    }
    renderPlayer();
    const nx = tts.parts[tts.i + 1]; if (nx) aiFetch(nx).catch(() => {});   // the next piece is ready before this one ends
  }).catch(err => {
    if (my !== tts.token) return;
    const rest = tts.items.slice(part.k), label = tts.label;
    toast(`AI voice failed: ${String(err || "").slice(0, 70)}. Using the iPhone voice.`);
    if (SYN && voices.length) speak(label, rest, "device", tts.kind); else stopSpeaking();
  });
}
const playSoon = () => { clearTimeout(tts.timer); tts.timer = setTimeout(playPart, 60); };   // iOS needs a beat after cancel()
function speak(label, items, engine, kind) {
  const ai = engine ? engine === "ai" : aiTTS();
  if (!ai && (!SYN || !voices.length)) {   // no Web Speech: hand the text to Scriptable's system voice
    send("speak", { text: items.map(x => clean(x.text || (x.paras || []).map(p => p.text).join(". "))).join(" ") });
    return toast("Reading aloud with the system voice");
  }
  stopSpeaking(true);
  if (ai) unlockAudio();   // has to happen inside the tap, before any waiting
  tts.engine = ai ? "ai" : "device";
  tts.items = items; tts.label = label; tts.i = 0; tts.paused = false; tts.on = true;
  tts.kind = kind || ""; tts.id = (items[0] && items[0].id) || ""; tts.nowSeg = -1;
  const plan = buildPlan(items, ai);
  tts.parts = plan.parts; tts.segs = plan.segs; tts.total = plan.total; tts.pos = 0;
  if (!tts.parts.length) return stopSpeaking();
  refreshReadingViews();   // wrap the text being read in highlightable sentences
  playSoon();
}
function playPart() {
  if (tts.engine === "ai") return aiPlayPart();
  const my = ++tts.token, part = tts.parts[tts.i];
  if (!part) return stopSpeaking();
  const u = new SpeechSynthesisUtterance(part.t), v = currentVoice();
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = Number(S.settings.voiceRate) || 1; u.pitch = Number(S.settings.voicePitch) || 1;
  const next = () => { if (my !== tts.token) return; tts.i++; playPart(); };
  u.onend = next; u.onerror = e => { if (e.error !== "interrupted" && e.error !== "canceled") next(); };
  u.onboundary = e => { if (my !== tts.token) return; tts.pos = e.charIndex || 0; renderProgress(); };
  tts.pos = 0; SYN.speak(u); renderPlayer();
}
function stopSpeaking(quiet) {
  tts.token++; tts.on = false; tts.paused = false; tts.loading = false; clearTimeout(tts.timer);
  au.onended = null; try { au.pause(); } catch (e) {}
  if (SYN) SYN.cancel();
  document.querySelectorAll(".rs-now,.rs-done").forEach(el => el.classList.remove("rs-now", "rs-done"));
  tts.nowSeg = -1;
  if (!quiet) { renderPlayer(); if (raOpen) { raOpen = false; renderReadAlong(); } }
}
function togglePause() {
  if (!tts.on) return;
  if (tts.engine === "ai") {
    if (tts.paused) { tts.paused = false; if (!tts.loading) { const pr = au.play(); if (pr && pr.catch) pr.catch(() => {}); } }
    else { tts.paused = true; au.pause(); }
  } else if (tts.paused) { SYN.resume(); tts.paused = false; } else { SYN.pause(); tts.paused = true; }
  renderPlayer();
}
function skipItem() {
  if (!tts.on) return;
  const k = (tts.parts[tts.i] || {}).k, j = tts.parts.findIndex((p, n) => n > tts.i && p.k !== k);
  if (j < 0) return stopSpeaking();
  tts.token++; if (tts.engine === "ai") { au.onended = null; au.pause(); } else SYN.cancel();
  tts.i = j; tts.paused = false; playSoon();
}
function renderProgress() {
  if (!tts.on || !tts.total) return;
  const part = tts.parts[tts.i] || { c0: tts.total };
  const done = Math.min(tts.total, part.c0 + (tts.pos || 0)), pct = done / tts.total;
  $("#plBar").style.width = (pct * 100).toFixed(1) + "%";
  const cps = (tts.engine === "ai" ? tts.cps || 14 : 15 * (Number(S.settings.voiceRate) || 1));   // characters per second
  const left = Math.round((tts.total - done) / cps / 60);
  $("#plTime").textContent = `${Math.round(pct * 100)}% — ${left < 1 ? "less than a minute" : "about " + left + " min"} left`;
  $("#plProg").setAttribute("aria-valuenow", String(Math.round(pct * 100)));
  paintSegs(segAt(done));
}
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
function seekTo(f) { if (tts.on && tts.total) seekChar(f * tts.total); }   // tap on the bar
function seekChar(c) {   // jump to that sentence (or that second, within the piece playing)
  if (!tts.on || !tts.total) return;
  const target = Math.max(0, Math.min(tts.total - 1, c));
  const j = tts.parts.findIndex(p => target >= p.c0 && target < p.c0 + p.t.length);
  if (j < 0) return;
  const p = tts.parts[j];
  if (tts.engine === "ai" && j === tts.i && au.duration && isFinite(au.duration)) {
    au.currentTime = au.duration * (target - p.c0) / p.t.length; tts.pos = target - p.c0; renderProgress(); return;
  }
  tts.token++;
  if (tts.engine === "ai") { au.onended = null; au.pause(); } else SYN.cancel();
  tts.i = j; tts.pos = 0; tts.paused = false; playSoon(); renderProgress();
}
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
const PLAY_ICO = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`, PAUSE_ICO = `<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`;
const srcTitle = a => (srcMap()[a.src] || {}).title || "";
const head = (a) => [{ key: "title", head: true, text: a.title }, { key: "from", text: "From " + srcTitle(a) }];
const postItem = a => ({ id: a.id, title: a.title, paras: head(a).concat(a.desc ? [{ key: "desc", text: a.desc }] : []) });
function tldrItems(a, d) {
  return [{ id: a.id, title: a.title, paras: head(a).concat([{ key: "lead", text: d.lead }],
    (d.points || []).map((x, i) => ({ key: "pt" + i, text: x })), d.why ? [{ key: "why", text: "Why it matters: " + d.why }] : []) }];
}
function storyItems(st) {
  const items = [{ title: st.headline, paras: [{ head: true, text: st.headline }].concat(st.dek ? [{ text: st.dek }] : []) }];
  if (st.tldr && st.tldr.length) items.push({ title: "In short", paras: [{ head: true, text: "In short" }].concat(st.tldr.map(x => ({ text: x }))) });
  st.sections.forEach(x => items.push({ title: x.title, paras: [{ head: true, text: x.title }].concat(String(x.body).split(/\n\s*\n/).filter(t => t.trim()).map(t => ({ text: t }))) }));
  return items;
}
// Sentences of the text being read, as tappable spans (tap one to jump there).
function segSpans(filter) {
  const out = [];
  tts.segs.forEach((sg, i) => { if (filter(sg)) out.push(`<span class="rs ${segCls(i)}" data-act="rsseek" data-s="${i}">${esc(sg.show)}</span>`); });
  return out.join(" ");
}
// While a post's TL;DR is read, its TL;DR text is shown sentence by sentence (inline and in the TL;DR screen).
const readingTldr = a => tts.on && tts.kind === "tldr" && tts.id === a.id;
const tldrPart = (a, key, plain) => readingTldr(a) ? segSpans(sg => sg.k === 0 && sg.key === key) || plain : plain;
function refreshReadingViews() {
  refreshInPlace();   // app hook: re-render any view that shows the text being read in place (BlogPulse: the TL;DR)
  if (raOpen) renderReadAlong();
}
// Read-along: the whole text being read, following the voice; read sentences dim.
let raOpen = false, raHold = 0;
document.addEventListener("touchstart", e => { if (raOpen && e.target.closest && e.target.closest("#readsheet")) raHold = Date.now() + 6000; }, { passive: true });
function renderReadAlong() {
  const el = $("#readsheet");
  el.classList.toggle("open", raOpen); lockBody();
  if (!raOpen) return;
  const first = tts.items[0] || {}, mode = MODES[tts.kind] || "Reading";
  let body = "";
  if (!tts.on) body = `<p class="muted pad">Nothing is being read right now.</p>`;
  else tts.items.forEach((it, k) => {
    const paras = {};
    tts.segs.forEach((sg, i) => { if (sg.k === k) (paras[sg.pi] = paras[sg.pi] || { head: sg.head, ids: [] }).ids.push(i); });
    if (tts.items.length > 1 && k > 0) body += `<hr class="ra-sep">`;
    Object.keys(paras).sort((x, y) => x - y).forEach(pi => {
      const pr = paras[pi], html = pr.ids.map(i => `<span class="rs ${segCls(i)}" data-act="rsseek" data-s="${i}">${esc(tts.segs[i].show)}</span>`).join(" ");
      body += pr.head ? `<h2 class="ra-h">${html}</h2>` : `<p class="ra-p">${html}</p>`;
    });
  });
  el.innerHTML = `<div class="sh-head"><div class="ra-top"><span class="pl-mode m-${tts.kind || "x"}">${esc(mode)}</span><small>${esc(tts.label)}</small></div><button class="link" data-act="raclose">Done</button></div>
    <div class="ra-body">${body}<p class="note ra-hint">Tap a sentence to jump there. Read sentences are dimmed.</p></div>`;
  const now = el.querySelector(".rs-now"); if (now && now.scrollIntoView) now.scrollIntoView({ block: "center" });
}
window.onArticleText = (id, r) => {
  const a = byId(id); if (!a) return;
  if (r.error) return toast(r.error);
  speak(srcTitle(a), [{ id, title: a.title, paras: head(a).concat(r.paras.map((t, i) => ({ key: "p" + i, text: t }))) }], undefined, "article");
  if (r.partial) toast("The full page couldn't be read, so this is the excerpt");
};
