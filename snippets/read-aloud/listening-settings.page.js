// ─────────────────────────────────────────────────────────────────────────────
// Read aloud (app-blueprints · read-aloud 1.0.1) — SETTINGS › LISTENING (page side)
// Insert ${listenHTML()} in the Settings sheet as the "Listening" section (after the app's own reading sections).
// Uses SYN, voices, currentVoice, baseName, quality, genderOf, langName, OAI_VOICES, LEGACY_TTS, SPK from read-aloud.page.js.
// Without AI configuration, drop aiListenHTML and the engine switch: listenHTML() returns deviceListenHTML().
// ─────────────────────────────────────────────────────────────────────────────

const vseg = (k, opts) => `<div class="seg wide">${opts.map(([v, l]) => `<button class="${String(S.settings[k]) === String(v) ? "on" : ""}" data-act="voiceset" data-k="${k}" data-v="${v}">${l}</button>`).join("")}</div>`;
function listenHTML() {
  const eng = S.settings.speechEngine === "ai" ? "ai" : "device";
  return `<div class="lk-row"><span class="lk-l">Voice engine</span>${vseg("speechEngine", [["device", "iPhone voice"], ["ai", "✦ AI voice"]])}</div>` + (eng === "ai" ? aiListenHTML() : deviceListenHTML());
}
function aiListenHTML() {
  if (!S.settings.hasOpenAI) return `<p class="note">AI voices come from OpenAI, so they need an OpenAI key, even when Claude writes your summaries (Claude's API doesn't offer speech).</p>
    <div class="aic-btns"><button class="sm primary" data-act="aiopen">Add an OpenAI key</button></div>`;
  const model = S.settings.ttsModel || "gpt-4o-mini-tts", legacy = /^tts-1/.test(model), g = S.settings.voiceGender || "all";
  const vs = OAI_VOICES.filter(([v, gg]) => (!legacy || LEGACY_TTS.has(v)) && (g === "all" || gg === g || v === S.settings.ttsVoice));
  const loaded = ((S.ttsModels || {}).list || []).map(m => m.id);
  const mlist = [model].concat(loaded.length ? loaded : ["gpt-4o-mini-tts", "tts-1-hd", "tts-1"]).filter((x, i, a) => a.indexOf(x) === i);
  const gl = { f: " (female)", m: " (male)", n: " (neutral)" };
  return `<div class="lk-row"><span class="lk-l">Voice</span>${vseg("voiceGender", [["all", "All"], ["f", "Female"], ["m", "Male"]])}
      <select class="ttsvoicesel voicesel" aria-label="AI voice">${vs.map(([v, gg]) => `<option value="${v}" ${v === S.settings.ttsVoice ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}${gl[gg]}</option>`).join("")}</select></div>
    <div class="lk-row"><span class="lk-l">Speech model</span><select class="ttsmodelsel voicesel" aria-label="Speech model">${mlist.map(m => `<option value="${esc(m)}" ${m === model ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>
    ${legacy ? "" : `<div class="lk-row"><span class="lk-l">How it should sound</span><textarea class="ttsinstr cfgin wide" rows="2" placeholder="e.g. Calm, clear newsreader. Neutral accent.">${esc(S.settings.ttsInstructions || "")}</textarea></div>`}
    <div class="lk-row"><span class="lk-l">Speed</span>${vseg("voiceRate", [[0.85, "Slow"], [1, "Normal"], [1.15, "Fast"], [1.3, "Faster"]])}</div>
    <div class="aic-btns"><button class="sm" data-act="voicetest">${SPK}Test the voice</button></div>
    <p class="note">✦ Spoken by OpenAI with your key, one post or section at a time; the first piece takes a few seconds. OpenAI bills each use; BlogPulse counts the characters under AI settings › Token usage as “Read aloud”. Voice labels describe how each voice usually sounds.${loaded.length ? "" : " Load your OpenAI models in AI settings to see every speech model your key can use."}</p>`;
}
function deviceListenHTML() {
  if (!SYN || !voices.length) return `<p class="note">This device reads aloud with the system voice. Choose it in iOS Settings › Accessibility › Spoken Content.</p>`;
  const g = S.settings.voiceGender || "all", cur = currentVoice();
  const shown = voices.filter(v => g === "all" || genderOf(v) === g || v === cur);
  const langs = {};
  shown.forEach(v => (langs[v.lang] = langs[v.lang] || []).push(v));
  const mine = (navigator.languages || [navigator.language || "en"]).map(l => l.toLowerCase().split("-")[0]);
  const rankLang = l => { const b = l.toLowerCase().split(/[-_]/)[0]; const i = mine.indexOf(b); return i >= 0 ? i : b === "en" ? 50 : 100; };
  const order = Object.keys(langs).sort((x, y) => rankLang(x) - rankLang(y) || langName(x).localeCompare(langName(y)));
  const label = v => `${baseName(v)}${quality(v) ? " — " + quality(v) : ""}${genderOf(v) ? (genderOf(v) === "f" ? " (female)" : " (male)") : ""}`;
  const seg = (k, opts) => `<div class="seg wide">${opts.map(([v, l]) => `<button class="${String(S.settings[k]) === String(v) ? "on" : ""}" data-act="voiceset" data-k="${k}" data-v="${v}">${l}</button>`).join("")}</div>`;
  return `<div class="lk-row"><span class="lk-l">Voice</span>${seg("voiceGender", [["all", "All"], ["f", "Female"], ["m", "Male"]])}
    <select class="voicesel" aria-label="Voice">${order.map(l => `<optgroup label="${esc(langName(l))} (${esc(l)})">${langs[l].map(v => `<option value="${esc(v.voiceURI)}" ${cur && v.voiceURI === cur.voiceURI ? "selected" : ""}>${esc(label(v))}</option>`).join("")}</optgroup>`).join("")}</select></div>
    <div class="lk-row"><span class="lk-l">Speed</span>${seg("voiceRate", [[0.85, "Slow"], [1, "Normal"], [1.15, "Fast"], [1.3, "Faster"]])}</div>
    <div class="lk-row"><span class="lk-l">Pitch</span>${seg("voicePitch", [[0.85, "Lower"], [1, "Normal"], [1.15, "Higher"]])}</div>
    <div class="aic-btns"><button class="sm" data-act="voicetest">${SPK}Test the voice</button><span class="note">${voices.length} voices on this ${/iPad/.test(navigator.userAgent) ? "iPad" : "iPhone"}</span></div>
    <p class="note">More natural voices: iOS Settings › Accessibility › Spoken Content › Voices. Download an Enhanced or Premium voice and it appears here.</p>`;
}
