// ─────────────────────────────────────────────────────────────────────────────
// Read aloud (app-blueprints · read-aloud 1.0.0) — TAP AND CHANGE HANDLERS (page side)
// BlogPulse has these cases inline in its one click handler; another app can call readAloudAct() first:
//   document.addEventListener("click", e => {
//     if (e.target.closest("select, option, input, textarea")) return;
//     const t = e.target.closest("[data-act]"); if (!t) return;
//     if (readAloudAct(t.dataset.act, t, e)) return;
//     …the app's own cases…
//   });
// The Listen buttons themselves (what to read) are per app: see the blueprint, Step 7.
// ─────────────────────────────────────────────────────────────────────────────

function readAloudAct(act, t, e) {
  const v = t.dataset.v;
  switch (act) {
    case "plpause": togglePause(); return true;
    case "plnext": skipItem(); return true;
    case "plstop": stopSpeaking(); return true;
    case "plread": raOpen = !raOpen; raHold = 0; renderReadAlong(); return true;
    case "raclose": raOpen = false; renderReadAlong(); return true;
    case "rsseek": { const sg = tts.segs[+t.dataset.s]; if (tts.on && sg) { raHold = 0; seekChar(sg.a0); } return true; }
    case "plseek": { const r = t.getBoundingClientRect(); seekTo((e.clientX - r.left) / Math.max(1, r.width)); return true; }
    case "voiceset": {
      const k = t.dataset.k, val = k === "voiceGender" || k === "speechEngine" ? v : +v;
      if (k === "speechEngine" && tts.on) stopSpeaking();
      S.settings[k] = val; send("set", { k, v: val }); renderCfg(); return true;
    }
    case "voicetest": speak("Voice test", [{ title: "Voice test", text: "Hello! This is the voice that will read to you." }], undefined, "test"); return true;
  }
  return false;
}

// Settings › Listening menus report through "change"
document.addEventListener("change", e => {
  if (e.target.classList && e.target.classList.contains("ttsvoicesel")) { S.settings.ttsVoice = e.target.value; send("set", { k: "ttsVoice", v: e.target.value }); return; }
  if (e.target.classList && e.target.classList.contains("ttsmodelsel")) { S.settings.ttsModel = e.target.value; send("set", { k: "ttsModel", v: e.target.value }); renderCfg(); return; }
  if (e.target.classList && e.target.classList.contains("ttsinstr")) { S.settings.ttsInstructions = e.target.value.trim(); send("set", { k: "ttsInstructions", v: S.settings.ttsInstructions }); return; }
  if (e.target.classList && e.target.classList.contains("voicesel")) {
    S.settings.voiceURI = e.target.value; send("set", { k: "voiceURI", v: e.target.value });
    if (tts.on && tts.engine === "device") { tts.token++; SYN.cancel(); playSoon(); }   // switch voice mid-sentence
  }
});
