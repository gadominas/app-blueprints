// ─────────────────────────────────────────────────────────────────────────────
// Read aloud (app-blueprints · read-aloud 1.0.1) — SCRIPTABLE SIDE
// Taken from BlogPulse 1.15.0 with names kept.
// ─────────────────────────────────────────────────────────────────────────────

// 1. Settings fields (add to the app's settings defaults) and the `set` allow-list
//    speechEngine: "device", ttsModel: "gpt-4o-mini-tts", ttsVoice: "coral", ttsInstructions: "",   // read aloud: iPhone voices or OpenAI
//    voiceURI: "", voiceRate: 1, voicePitch: 1, voiceGender: "all"
//    allow-list: "voiceURI", "voiceRate", "voicePitch", "voiceGender", "speechEngine", "ttsModel", "ttsVoice", "ttsInstructions"
//    clientState().settings also gets: hasOpenAI: !!keyFor("openai")   (and ttsModels: settings.ttsModels || null at the top level)

// 2. AI voice (needs the ai-configuration blueprint: keyFor, recordUsage). Skip in apps without AI.
const TTS_LEGACY_VOICES = ["alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"];   // all tts-1 and tts-1-hd can use
async function aiSpeech(text) {
  const key = keyFor("openai");
  if (!key) throw new Error("AI voices need an OpenAI key");
  const model = settings.ttsModel || "gpt-4o-mini-tts", legacy = /^tts-1/.test(model);
  let voice = settings.ttsVoice || "coral";
  if (legacy && !TTS_LEGACY_VOICES.includes(voice)) voice = "coral";
  const body = { model, voice, input: String(text).slice(0, 4096), response_format: "mp3" };
  if (!legacy && settings.ttsInstructions) body.instructions = String(settings.ttsInstructions).slice(0, 500);
  const speed = Number(settings.voiceRate) || 1;
  if (speed !== 1) body.speed = speed;
  const r = new Request("https://api.openai.com/v1/audio/speech");
  r.method = "POST"; r.timeoutInterval = 60;
  r.headers = { "Authorization": "Bearer " + key, "Content-Type": "application/json" };
  r.body = JSON.stringify(body);
  const data = await r.load();
  const code = r.response && r.response.statusCode;
  if (code !== 200) {
    let msg = `HTTP ${code}`;
    try { msg = JSON.parse(data.toRawString()).error.message || msg; } catch (e) {}
    throw new Error(msg);
  }
  recordUsage("openai", model, "speech", 0, 0, body.input.length);
  return data.toBase64String();
}

// recordUsage takes a 6th argument, chars, counted for speech (ai-configuration's recordUsage, extended):
function recordUsage(provider, model, feature, tin, tout, chars = 0) {   // chars: text sent for speech
  const P = usage.p[provider] = usage.p[provider] || { calls: 0, in: 0, out: 0, models: {}, features: {}, days: {} };
  const b = (o, k) => o[k] = o[k] || { calls: 0, in: 0, out: 0 };
  for (const x of [P, b(P.models, model), b(P.features, feature), b(P.days, dayKey())]) { x.calls++; x.in += tin; x.out += tout; if (chars) x.chars = (x.chars || 0) + chars; }
  const days = Object.keys(P.days).sort();
  while (days.length > 400) delete P.days[days.shift()];
  write("usage", usage);
}

// fetchModels("openai") also keeps the speech models for Settings › Listening, before it filters to chat models:
//   if (p === "openai") settings.ttsModels = { at: Date.now(), list: list.filter(m => /tts/.test(m.id)).sort((a, b) => b.t - a.t).map(m => ({ id: m.id, name: m.id })) };

// 3. The article's own text (for "Listen to the full article"). Text helpers first (most reader apps have them already):
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©" };
function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const c = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(c); } catch (_) { return m; }
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const cdata = s => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
const stripTags = s => s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
function toText(s, max) {
  if (!s) return "";
  let t = decode(stripTags(decode(stripTags(cdata(s))))).replace(/\s+/g, " ").trim();
  t = t.replace(/The post .{0,240}? appeared first on .{0,160}$/i, "")
       .replace(/(Continue reading|Read more)\s*(on Medium)?\s*[»›…]*\s*$/i, "").trim();
  if (max && t.length > max) {
    t = t.slice(0, max);
    t = t.slice(0, Math.max(t.lastIndexOf(" "), max - 25)).replace(/[,;:.\s]+$/, "") + "…";
  }
  return t;
}
function attr(t, name) {
  const m = t.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? "") : "";
}
async function fetchText(url, timeout = cfg("fetchTimeout")) {
  const r = new Request(url);
  r.timeoutInterval = timeout;
  r.headers = { "User-Agent": cfg("userAgent"), "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5" };
  const text = await r.loadString();
  const code = r.response && r.response.statusCode;
  if (code && code >= 400) throw new Error(`HTTP ${code}`);
  return { text: text || "", url: (r.response && r.response.url) || url };
}

// extractArticle: the page's paragraphs and subheadings, without menus, footers or sharing bars
function extractArticle(html) {
  const meta = name => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i")); return m ? toText(attr(m[0], "content")) : ""; };
  const desc = meta("og:description") || meta("description");
  let h = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|figure|button)\b[\s\S]*?<\/\1>/gi, " ");
  const main = h.match(/<article[\s>][\s\S]*<\/article>/i) || h.match(/<main[\s>][\s\S]*<\/main>/i);
  if (main) h = main[0];
  const blocks = (h.match(/<(p|h2|h3)\b[^>]*>[\s\S]*?<\/\1>/gi) || []).map(x => ({ tag: x.slice(1, 3).replace(/\W/g, "").toLowerCase(), text: toText(x) }));
  const paras = blocks.filter(b => b.tag === "p" && b.text.length >= 60).map(b => b.text);
  const heads = blocks.filter(b => b.tag !== "p" && b.text.length > 2 && b.text.length < 90).map(b => b.text);
  const text = paras.join("\n\n");
  return { desc, paras, heads, text, words: text ? text.split(/\s+/).length : 0 };
}

// 4. Bridge actions. BlogPulse has these cases inline in its action handler; another app can call this first:
//      if (await readAloudBridge(m)) return;
//    `call(fn, ...args)` runs window[fn](...args) in the page; `articles` is the app's store of items by id.
async function readAloudBridge(m) {
  const a = m.id ? articles[m.id] : null;
  switch (m.type) {
    case "articletext": {   // the article's own text, for "Listen to the full article"
      if (!a) return true;
      const excerpt = a.ex || a.ai || a.desc || "";
      let res;
      try {
        const r = await fetchText(a.link, 20), art = extractArticle(r.text);
        res = art.words > 80 ? { paras: art.paras.slice(0, 80) } : excerpt ? { paras: [excerpt], partial: true } : { error: "This article couldn't be read" };
      } catch (e) { res = excerpt ? { paras: [excerpt], partial: true } : { error: "This article couldn't be loaded" }; }
      call("onArticleText", a.id, res); return true;
    }
    case "ttsaudio":   // one piece of AI speech, returned to the page as base64 MP3
      try { call("__done", m.req, true, await aiSpeech(m.text)); }
      catch (e) { call("__done", m.req, false, String(e.message || e)); }
      return true;
    case "speak":   // fallback when the page can't speak: Scriptable's own system voice
      if (m.text) Speech.speak(String(m.text).slice(0, 8000));
      return true;
  }
  return false;
}
