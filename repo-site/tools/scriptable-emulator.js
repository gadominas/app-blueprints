// Scriptable emulator for repository screenshots.
//
// Runs an app's real single-file Scriptable script in Node with the Scriptable APIs stubbed,
// and backs every WebView with a headless Chromium page (Playwright). Network requests from
// the script (Request) and from every page (fetch, XHR, images, navigations) are answered by
// the scenario's fixtures; nothing reaches the real network unless a fixture says so.
// Widgets (ListWidget and friends) are rendered to HTML so they can be screenshotted too.
//
// Used by capture.js. See repo-site/REBUILD.md.

'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const os = require('os');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────── Image helpers ─────────
function imageSize(buf) {
  if (!buf || buf.length < 24) return { width: 1, height: 1 };
  if (buf[0] === 0x89 && buf[1] === 0x50) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (buf.slice(0, 4).toString() === 'RIFF') return { width: 1 + (buf.readUIntLE(24, 3)), height: 1 + buf.readUIntLE(27, 3) };
  const s = buf.slice(0, 400).toString();
  if (/<svg/.test(s)) {
    const w = /width="(\d+)/.exec(s), h = /height="(\d+)/.exec(s);
    return { width: w ? +w[1] : 100, height: h ? +h[1] : 100 };
  }
  return { width: 1, height: 1 };
}
function mimeOf(buf) {
  if (!buf) return 'application/octet-stream';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'RIFF') return 'image/webp';
  if (/<svg/.test(buf.slice(0, 400).toString())) return 'image/svg+xml';
  return 'application/octet-stream';
}

// ───────── The emulator ─────────
class Emulator {
  /**
   * @param {object} o
   * @param {import('playwright').Browser} o.browser
   * @param {string} o.scriptPath   the app's script
   * @param {object} o.fixtures     { routes: [{ match: RegExp|string|fn, respond: (req)=>response }], files, keychain, alerts }
   * @param {number} o.now          fixed "now" (ms) the app and its pages start from
   * @param {boolean} o.dark        dark appearance
   * @param {string} o.locale       e.g. 'en_US'
   * @param {string} o.timezone     IANA zone
   * @param {object} o.viewport     { width, height }
   * @param {number} o.scale        device scale factor
   * @param {object} o.config       Scriptable `config` overrides (runsInWidget, widgetFamily, ...)
   * @param {object} o.args         Scriptable `args` overrides
   * @param {function} o.log        logger
   */
  constructor(o) {
    this.o = Object.assign({ now: Date.UTC(2026, 9, 29, 6, 12), dark: false, locale: 'en_US', timezone: 'Europe/Vilnius',
      viewport: { width: 390, height: 844 }, scale: 2, config: {}, args: {}, log: () => {} }, o);
    this.fx = this.o.fixtures || {};
    this.routes = this.fx.routes || [];
    this.offset = this.o.now - Date.now();
    this.webviews = [];
    this.presented = null;        // the WebView the user sees
    this.widget = null;           // the ListWidget passed to Script.setWidget
    this.errors = [];
    this.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptable-'));
    this.files = new Map();       // virtual file system: path -> Buffer
    for (const [p, v] of Object.entries(this.fx.files || {})) this.files.set(p, Buffer.isBuffer(v) ? v : Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)));
    this.keychain = new Map(Object.entries(this.fx.keychain || {}));
    this.alerts = (this.fx.alerts || []).slice();   // scripted answers for Alert.present*(): numbers or {index, text:[...]}
    this.requests = [];
  }

  now() { return Date.now() + this.offset; }

  // ── fixtures ──
  async respond(req) {
    const url = req.url;
    for (const r of this.routes) {
      const m = typeof r.match === 'function' ? r.match(url, req) : (typeof r.match === 'string' ? url.includes(r.match) : (r.match.lastIndex = 0, r.match.exec(url)));
      if (!m) continue;
      let res = typeof r.respond === 'function' ? await r.respond(req, m) : r.respond;
      if (res == null) continue;
      const n = normalize(res);
      if (res && typeof res === 'object' && !Buffer.isBuffer(res)) { if (res.delay) n.delay = res.delay; if (res.throw) n.throw = res.throw; }
      return n;
    }
    return null;
    function normalize(res) {
      if (Buffer.isBuffer(res)) return { status: 200, body: res, contentType: mimeOf(res) };
      if (typeof res === 'string') return { status: 200, body: Buffer.from(res), contentType: /^\s*</.test(res) ? (/^\s*<\?xml|<rss|<feed/.test(res) ? 'application/xml' : 'text/html') : 'text/plain' };
      if (res.file) { const b = fs.readFileSync(res.file); return { status: res.status || 200, body: b, contentType: res.contentType || mimeOf(b), headers: res.headers }; }
      if ('json' in res) return { status: res.status || 200, body: Buffer.from(JSON.stringify(res.json)), contentType: 'application/json', headers: res.headers };
      if ('body' in res) return { status: res.status || 200, body: Buffer.isBuffer(res.body) ? res.body : Buffer.from(String(res.body)), contentType: res.contentType || 'text/plain', headers: res.headers };
      return { status: 200, body: Buffer.from(JSON.stringify(res)), contentType: 'application/json' };
    }
  }

  // ── a page for each WebView ──
  async newPage() {
    const ctx = await this.o.browser.newContext({
      viewport: this.o.viewport, deviceScaleFactor: this.o.scale, isMobile: true, hasTouch: true,
      colorScheme: this.o.dark ? 'dark' : 'light', locale: this.o.locale.replace('_', '-'), timezoneId: this.o.timezone,
      reducedMotion: 'no-preference',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    });
    const offset = this.offset;
    await ctx.addInitScript(`(() => { const off = ${offset}; const RD = Date; class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } } window.Date = FD; })();`);
    if (this.fx.pageInit) await ctx.addInitScript(this.fx.pageInit);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { this.errors.push('page: ' + e.message); this.o.log('  ! page error: ' + e.message); });
    page.on('console', (m) => { if (m.type() === 'error') this.o.log('  ! console: ' + m.text().slice(0, 200)); });
    return page;
  }

  // ── run the script ──
  async run() {
    const code = fs.readFileSync(this.o.scriptPath, 'utf8');
    const ctx = this.makeContext();
    vm.createContext(ctx);
    const wrapped = `(async () => {\n${code}\n})()`;
    this.done = vm.runInContext(wrapped, ctx, { filename: path.basename(this.o.scriptPath) })
      .catch((e) => { this.errors.push('script: ' + (e && e.stack || e)); this.o.log('  ! script error: ' + (e && e.stack || e)); });
    return this.done;
  }

  // Wait until the app presents its WebView (or sets a widget).
  async waitForPresent(ms = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (this.presented && this.presented._page) return this.presented;
      if (this.widget) return null;
      await sleep(50);
    }
    throw new Error('The app did not present a WebView within ' + ms + ' ms. Errors: ' + this.errors.join(' | '));
  }

  async close() {
    this.closed = true;
    for (const w of this.webviews) if (w._page) await w._page.context().close().catch(() => {});
  }

  makeContext() {
    const emu = this;
    const o = this.o;
    const RD = Date;
    class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + emu.offset); } static now() { return RD.now() + emu.offset; } }

    // ── Data / Image ──
    class Data {
      constructor(buf) { this._b = buf || Buffer.alloc(0); }
      static fromString(s) { return new Data(Buffer.from(String(s))); }
      static fromBase64String(s) { return new Data(Buffer.from(String(s), 'base64')); }
      static fromFile(p) { return emu.files.has(p) ? new Data(emu.files.get(p)) : null; }
      static fromPNG(img) { return new Data(img._b); }
      static fromJPEG(img) { return new Data(img._b); }
      toRawString() { return this._b.toString('utf8'); }
      toBase64String() { return this._b.toString('base64'); }
      getBytes() { return Array.from(this._b); }
    }
    class Image {
      constructor(buf) { this._b = buf || Buffer.alloc(0); this.size = new Size(...Object.values(imageSize(this._b))); }
      static fromData(d) { return d && d._b && d._b.length ? new Image(d._b) : null; }
      static fromFile(p) { return emu.files.has(p) ? new Image(emu.files.get(p)) : null; }
    }
    class Size { constructor(w = 0, h = 0) { this.width = w; this.height = h; } }
    class Point { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
    class Rect { constructor(x = 0, y = 0, w = 0, h = 0) { this.x = x; this.y = y; this.width = w; this.height = h; this.origin = new Point(x, y); this.size = new Size(w, h); this.minX = x; this.minY = y; this.maxX = x + w; this.maxY = y + h; } }
    class Color {
      constructor(hex = '#000000', alpha = 1) { this.hex = String(hex).replace('#', ''); this.alpha = alpha; }
      static dynamic(light, dark) { const c = o.dark ? dark : light; return new Color(c.hex, c.alpha); }
      static white() { return new Color('ffffff'); } static black() { return new Color('000000'); } static clear() { return new Color('000000', 0); }
      static gray() { return new Color('808080'); } static red() { return new Color('ff3b30'); } static green() { return new Color('34c759'); } static blue() { return new Color('007aff'); }
      static orange() { return new Color('ff9500'); } static yellow() { return new Color('ffcc00'); } static darkGray() { return new Color('555555'); } static lightGray() { return new Color('aaaaaa'); }
      toCss() { let h = this.hex; if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1; const n = parseInt(h.slice(0, 6), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${(a * this.alpha).toFixed(3)})`; }
    }
    class Font {
      constructor(name, size) { this.name = name; this.size = size; this.weight = 400; }
      static w(n, s) { const f = new Font('system', s); f.weight = n; return f; }
      static systemFont(s) { return Font.w(400, s); } static regularSystemFont(s) { return Font.w(400, s); } static mediumSystemFont(s) { return Font.w(500, s); }
      static semiboldSystemFont(s) { return Font.w(600, s); } static boldSystemFont(s) { return Font.w(700, s); } static heavySystemFont(s) { return Font.w(800, s); }
      static blackSystemFont(s) { return Font.w(900, s); } static lightSystemFont(s) { return Font.w(300, s); } static thinSystemFont(s) { return Font.w(200, s); } static ultraLightSystemFont(s) { return Font.w(100, s); }
      static italicSystemFont(s) { const f = Font.w(400, s); f.italic = true; return f; }
      static boldRoundedSystemFont(s) { return Font.w(700, s); } static semiboldRoundedSystemFont(s) { return Font.w(600, s); } static mediumRoundedSystemFont(s) { return Font.w(500, s); } static regularRoundedSystemFont(s) { return Font.w(400, s); }
      static regularMonospacedSystemFont(s) { const f = Font.w(400, s); f.mono = true; return f; } static mediumMonospacedSystemFont(s) { const f = Font.w(500, s); f.mono = true; return f; }
      static semiboldMonospacedSystemFont(s) { const f = Font.w(600, s); f.mono = true; return f; } static boldMonospacedSystemFont(s) { const f = Font.w(700, s); f.mono = true; return f; }
      static headline() { return Font.w(600, 17); } static body() { return Font.w(400, 17); } static caption1() { return Font.w(400, 12); } static caption2() { return Font.w(400, 11); }
      static footnote() { return Font.w(400, 13); } static subheadline() { return Font.w(400, 15); } static title1() { return Font.w(400, 28); } static title2() { return Font.w(400, 22); } static title3() { return Font.w(400, 20); } static largeTitle() { return Font.w(400, 34); } static callout() { return Font.w(400, 16); }
    }
    class LinearGradient { constructor() { this.colors = []; this.locations = []; this.startPoint = new Point(0, 0); this.endPoint = new Point(0, 1); } }

    // ── Widgets: a tree we render to HTML ──
    class WNode {
      constructor(kind) { this.kind = kind; this.children = []; this.padding = null; this.layout = 'h'; this.align = 'center'; }
      addStack() { const s = new WNode('stack'); this.children.push(s); return s; }
      addText(t) { const n = new WNode('text'); n.text = String(t); this.children.push(n); return Object.assign(n, { leftAlignText() { n.talign = 'left'; }, centerAlignText() { n.talign = 'center'; }, rightAlignText() { n.talign = 'right'; } }); }
      addDate(d) { const n = this.addText(new FD(d).toLocaleTimeString()); return n; }
      addImage(img) { const n = new WNode('image'); n.img = img; this.children.push(n); return Object.assign(n, { centerAlignImage() {}, leftAlignImage() {}, rightAlignImage() {}, applyFittingContentMode() {}, applyFillingContentMode() {} }); }
      addSpacer(len) { const n = new WNode('spacer'); n.len = len; this.children.push(n); return n; }
      setPadding(t, l, b, r) { this.padding = [t, l, b, r]; }
      useDefaultPadding() { this.padding = [16, 16, 16, 16]; }
      layoutHorizontally() { this.layout = 'h'; } layoutVertically() { this.layout = 'v'; }
      topAlignContent() { this.align = 'start'; } centerAlignContent() { this.align = 'center'; } bottomAlignContent() { this.align = 'end'; }
    }
    class ListWidget extends WNode { constructor() { super('widget'); this.layout = 'v'; this.align = 'start'; } async presentSmall() { emu.widget = this; } async presentMedium() { emu.widget = this; } async presentLarge() { emu.widget = this; } }

    // ── DrawContext (enough for logo tiles drawn in code) ──
    class DrawContext {
      constructor() { this.size = new Size(100, 100); this.respectScreenScale = false; this.opaque = true; this.ops = []; this.fill = '#000'; this.strokeC = '#000'; this.lw = 1; this.font = { size: 17, weight: 400 }; this.tcolor = '#000'; this.talign = 'start'; }
      setFillColor(c) { this.fill = c.toCss(); } setStrokeColor(c) { this.strokeC = c.toCss(); } setLineWidth(w) { this.lw = w; }
      setFont(f) { this.font = f; } setTextColor(c) { this.tcolor = c.toCss(); } setTextAlignedCenter() { this.talign = 'middle'; } setTextAlignedLeft() { this.talign = 'start'; } setTextAlignedRight() { this.talign = 'end'; }
      fillRect(r) { this.ops.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${this.fill}"/>`); }
      fillEllipse(r) { this.ops.push(`<ellipse cx="${r.x + r.width / 2}" cy="${r.y + r.height / 2}" rx="${r.width / 2}" ry="${r.height / 2}" fill="${this.fill}"/>`); }
      strokeRect(r) { this.ops.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="${this.strokeC}" stroke-width="${this.lw}"/>`); }
      strokeEllipse(r) { this.ops.push(`<ellipse cx="${r.x + r.width / 2}" cy="${r.y + r.height / 2}" rx="${r.width / 2}" ry="${r.height / 2}" fill="none" stroke="${this.strokeC}" stroke-width="${this.lw}"/>`); }
      addPath() {} fillPath() {} strokePath() {}
      drawImageInRect(img, r) { if (img && img._b) this.ops.push(`<image x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" preserveAspectRatio="none" href="data:${mimeOf(img._b)};base64,${img._b.toString('base64')}"/>`); }
      drawImageAtPoint(img, p) { if (img && img._b) this.ops.push(`<image x="${p.x}" y="${p.y}" width="${img.size.width}" height="${img.size.height}" href="data:${mimeOf(img._b)};base64,${img._b.toString('base64')}"/>`); }
      drawText(t, p) { this.ops.push(`<text x="${p.x}" y="${p.y + this.font.size}" font-family="Inter,sans-serif" font-size="${this.font.size}" font-weight="${this.font.weight}" fill="${this.tcolor}">${String(t).replace(/[<&]/g, '')}</text>`); }
      drawTextInRect(t, r) { const x = this.talign === 'middle' ? r.x + r.width / 2 : this.talign === 'end' ? r.x + r.width : r.x; this.ops.push(`<text x="${x}" y="${r.y + this.font.size}" text-anchor="${this.talign}" font-family="Inter,sans-serif" font-size="${this.font.size}" font-weight="${this.font.weight}" fill="${this.tcolor}">${String(t).replace(/[<&]/g, '')}</text>`); }
      getImage() { const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.size.width}" height="${this.size.height}">${this.ops.join('')}</svg>`; return new Image(Buffer.from(svg)); }
    }
    class Path { move() {} addLine() {} addCurve() {} addQuadCurve() {} addRect() {} addEllipse() {} addRoundedRect() {} closeSubpath() {} addLines() {} addRects() {} }

    // ── Request ──
    class Request {
      constructor(url) { this.url = url; this.method = 'GET'; this.headers = {}; this.body = null; this.timeoutInterval = 60; this.response = null; this.allowInsecureRequest = false; }
      addParameterToMultipart() {} addFileDataToMultipart() {} addImageToMultipart() {} addFileToMultipart() {}
      async _load() {
        const body = this.body == null ? null : (this.body instanceof Data ? this.body.toRawString() : String(this.body));
        const req = { url: String(this.url), method: this.method, headers: this.headers, body, json() { try { return JSON.parse(body); } catch (e) { return null; } } };
        emu.requests.push(req);
        const res = await emu.respond(req);
        if (!res) {
          emu.o.log('  · Request without fixture: ' + this.method + ' ' + req.url.slice(0, 140));
          this.response = { statusCode: 404, headers: {}, url: req.url, mimeType: 'text/plain' };
          if (emu.fx.strictRequests) throw new Error('No fixture for ' + req.url);
          return Buffer.from('');
        }
        if (res.delay) await sleep(res.delay);
        this.response = { statusCode: res.status, headers: Object.assign({ 'Content-Type': res.contentType }, res.headers || {}), url: req.url, mimeType: res.contentType, cookies: [] };
        if (res.throw) throw new Error(res.throw);
        return res.body;
      }
      async load() { return new Data(await this._load()); }
      async loadString() { return (await this._load()).toString('utf8'); }
      async loadJSON() { const s = (await this._load()).toString('utf8'); return JSON.parse(s); }
      async loadImage() { const b = await this._load(); if (!b.length) throw new Error('The resource could not be loaded as an image.'); return new Image(b); }
    }

    // ── FileManager (virtual, in memory) ──
    const base = { documents: '/var/mobile/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents', local: '/var/mobile/Containers/Data/Application/SCRIPTABLE/Documents' };
    const fm = (root) => ({
      documentsDirectory: () => root, libraryDirectory: () => root.replace(/Documents$/, 'Library'), cacheDirectory: () => root.replace(/Documents$/, 'Library/Caches'),
      temporaryDirectory: () => '/tmp/scriptable', bookmarkedPath: (n) => root + '/' + n, bookmarkExists: () => false, allFileBookmarks: () => [],
      joinPath: (a, b) => (String(a).replace(/\/$/, '') + '/' + String(b).replace(/^\//, '')),
      fileExists: (p) => emu.files.has(p) || [...emu.files.keys()].some((k) => k.startsWith(p.replace(/\/$/, '') + '/')) || (emu._dirs || new Set()).has(p),
      isDirectory: (p) => (emu._dirs || new Set()).has(p) || [...emu.files.keys()].some((k) => k.startsWith(p.replace(/\/$/, '') + '/')),
      createDirectory: (p) => { (emu._dirs = emu._dirs || new Set()).add(p); },
      listContents: (p) => { const pre = p.replace(/\/$/, '') + '/'; return [...new Set([...emu.files.keys(), ...(emu._dirs || [])].filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length).split('/')[0]))]; },
      readString: (p) => emu.files.has(p) ? emu.files.get(p).toString('utf8') : null,
      writeString: (p, s) => { emu.files.set(p, Buffer.from(String(s))); },
      read: (p) => emu.files.has(p) ? new Data(emu.files.get(p)) : null,
      write: (p, d) => { emu.files.set(p, d._b); },
      readImage: (p) => emu.files.has(p) ? new Image(emu.files.get(p)) : null,
      writeImage: (p, img) => { emu.files.set(p, img._b); },
      remove: (p) => { for (const k of [...emu.files.keys()]) if (k === p || k.startsWith(p + '/')) emu.files.delete(k); if (emu._dirs) emu._dirs.delete(p); },
      move: (a, b) => { if (emu.files.has(a)) { emu.files.set(b, emu.files.get(a)); emu.files.delete(a); } },
      copy: (a, b) => { if (emu.files.has(a)) emu.files.set(b, emu.files.get(a)); },
      downloadFileFromiCloud: async () => {}, isFileDownloaded: () => true, isFileStoredIniCloud: () => false,
      modificationDate: (p) => emu.files.has(p) ? new FD() : null, creationDate: (p) => emu.files.has(p) ? new FD() : null,
      fileSize: (p) => emu.files.has(p) ? emu.files.get(p).length / 1000 : 0,
      fileName: (p, ext) => { const b = String(p).split('/').pop(); return ext ? b : b.replace(/\.[^.]*$/, ''); },
      fileExtension: (p) => (String(p).split('.').pop() || ''),
      getUTI: () => 'public.data', listTags: () => [], addTag() {}, removeTag() {},
    });
    const FileManager = { local: () => fm(base.local), iCloud: () => fm(base.documents) };
    emu.paths = base;

    // ── Keychain ──
    const Keychain = {
      contains: (k) => emu.keychain.has(k), get: (k) => { if (!emu.keychain.has(k)) throw new Error('Keychain item not found: ' + k); return emu.keychain.get(k); },
      set: (k, v) => { emu.keychain.set(k, String(v)); }, remove: (k) => { emu.keychain.delete(k); },
    };

    // ── Alert (answers come from fixtures.alerts, else the cancel/last action) ──
    class Alert {
      constructor() { this.title = ''; this.message = ''; this.actions = []; this.fields = []; this.cancel = null; }
      addAction(t) { this.actions.push(t); } addDestructiveAction(t) { this.actions.push(t); } addCancelAction(t) { this.cancel = t; }
      addTextField(p, v) { const f = { placeholder: p, value: v || '' }; this.fields.push(f); return Object.assign(f, { setDefaultKeyboard() {}, setNumberPadKeyboard() {}, setEmailAddressKeyboard() {}, setURLKeyboard() {}, setDecimalPadKeyboard() {}, leftAlignText() {} }); }
      addSecureTextField(p, v) { return this.addTextField(p, v); }
      textFieldValue(i) { return (this._answer && this._answer.text && this._answer.text[i]) != null ? this._answer.text[i] : (this.fields[i] || {}).value || ''; }
      async _present() { emu.o.log('  · Alert: ' + this.title + ' ' + (this.message || '').slice(0, 80)); const a = emu.alerts.shift(); this._answer = typeof a === 'object' ? a : { index: a }; return this._answer.index != null ? this._answer.index : (this.cancel != null ? -1 : 0); }
      present() { return this._present(); } presentAlert() { return this._present(); } presentSheet() { return this._present(); }
    }

    // ── WebView: a Playwright page ──
    class WebView {
      constructor() { this.shouldAllowRequest = null; this._page = null; this._ready = null; emu.webviews.push(this); this._id = emu.webviews.length; }
      async _ensure() {
        if (this._page) return this._page;
        if (!this._ready) this._ready = (async () => {
          const page = await emu.newPage();
          // Every request from the page: custom schemes go to shouldAllowRequest; http(s) to the fixtures.
          page.on('request', (r) => {
            const url = r.url();
            if (/^(https?|data|blob|about):/i.test(url)) return;
            if (typeof this.shouldAllowRequest === 'function') { try { this.shouldAllowRequest({ url, method: r.method(), headers: r.headers() }); } catch (e) { emu.o.log('  ! shouldAllowRequest: ' + e.message); } }
          });
          await page.route('**/*', async (route) => {
            const r = route.request();
            const url = r.url();
            if (this._html && url === this._base) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: this._html });
            if (r.isNavigationRequest() && r.frame() === page.mainFrame() && typeof this.shouldAllowRequest === 'function' && url !== this._loadingURL) {
              let ok = true; try { ok = this.shouldAllowRequest({ url, method: r.method() }) !== false; } catch (e) {}
              if (!ok) return route.abort('aborted');
            }
            const res = await emu.respond({ url, method: r.method(), headers: r.headers(), body: r.postData(), fromPage: true, json() { try { return JSON.parse(r.postData()); } catch (e) { return null; } } });
            if (!res) { if (!/fonts\.g|favicon/.test(url)) emu.o.log('  · page request without fixture: ' + url.slice(0, 140)); return route.fulfill({ status: 404, body: '' }); }
            return route.fulfill({ status: res.status, contentType: res.contentType, body: res.body, headers: Object.assign({ 'access-control-allow-origin': '*' }, res.headers || {}) });
          });
          this._page = page;
          return page;
        })();
        return this._ready;
      }
      async loadHTML(html, baseURL) {
        if (emu.closed) return;
        const page = await this._ensure();
        this._html = String(html);
        this._base = baseURL || 'https://app.scriptable.local/';
        if (!/\/$/.test(this._base) && !/\.[a-z]+$/i.test(this._base)) this._base += '/';
        this._loadingURL = this._base;
        await page.goto(this._base, { waitUntil: 'load' }).catch((e) => emu.o.log('  ! loadHTML: ' + e.message));
        this._loadingURL = null;
      }
      async loadURL(url) { const page = await this._ensure(); this._html = null; this._loadingURL = url; await page.goto(url, { waitUntil: 'load' }).catch((e) => emu.o.log('  ! loadURL: ' + e.message)); this._loadingURL = null; }
      async loadRequest(req) { return this.loadURL(req.url); }
      async loadFile(p) { return this.loadHTML(emu.files.has(p) ? emu.files.get(p).toString() : ''); }
      async waitForLoad() { const page = await this._ensure(); await page.waitForLoadState('load').catch(() => {}); }
      async getHTML() { const page = await this._ensure(); return page.content(); }
      async evaluateJavaScript(js, useCallback) {
        if (emu.closed) return null;
        const page = await this._ensure();
        try {
          return await page.evaluate(({ js, cb }) => new Promise((resolve, reject) => {
            if (cb) { window.completion = (v) => resolve(v === undefined ? null : v); }
            try {
              // eslint-disable-next-line no-eval
              const v = (0, eval)(js);
              if (!cb) { if (v && typeof v.then === 'function') resolve(null); else { try { resolve(JSON.parse(JSON.stringify(v === undefined ? null : v))); } catch (e) { resolve(null); } } }
            } catch (e) { reject(e); }
          }), { js: String(js), cb: !!useCallback });
        } catch (e) {
          const msg = String(e.message || e).replace(/^page\.evaluate: /, '');
          if (/Execution context was destroyed|Target closed|navigat/i.test(msg)) return null;
          throw new Error(msg);
        }
      }
      async present() { await this._ensure(); emu.presented = this; return new Promise(() => {}); }
      static async loadHTML(html) { const w = new WebView(); await w.loadHTML(html); return w.present(); }
      static async loadURL(url) { const w = new WebView(); await w.loadURL(url); return w.present(); }
    }

    // ── odds and ends ──
    const Timer = {
      schedule(ms, repeats, fn) { const t = repeats ? setInterval(fn, ms) : setTimeout(fn, ms); return { invalidate() { clearInterval(t); clearTimeout(t); } }; },
    };
    function TimerCtor() { this.timeInterval = 1000; this.repeats = false; this.schedule = (fn) => { this._t = this.repeats ? setInterval(fn, this.timeInterval) : setTimeout(fn, this.timeInterval); }; this.invalidate = () => { clearInterval(this._t); clearTimeout(this._t); }; }
    TimerCtor.schedule = Timer.schedule;
    class DateFormatter {
      constructor() { this.dateFormat = 'yyyy-MM-dd'; this.locale = o.locale; }
      useShortDateStyle() {} useMediumDateStyle() {} useLongDateStyle() {} useFullDateStyle() {} useNoDateStyle() {} useShortTimeStyle() {} useMediumTimeStyle() {} useLongTimeStyle() {} useNoTimeStyle() {} useFullTimeStyle() {}
      string(d) {
        const p = (n) => String(n).padStart(2, '0');
        const loc = String(this.locale || o.locale).replace('_', '-');
        const name = (opt) => new Intl.DateTimeFormat(loc, opt).format(d);
        const T = { yyyy: () => d.getFullYear(), yy: () => String(d.getFullYear()).slice(2), MMMM: () => name({ month: 'long' }), MMM: () => name({ month: 'short' }), MM: () => p(d.getMonth() + 1), M: () => d.getMonth() + 1,
          dd: () => p(d.getDate()), d: () => d.getDate(), EEEE: () => name({ weekday: 'long' }), EEE: () => name({ weekday: 'short' }), HH: () => p(d.getHours()), H: () => d.getHours(),
          hh: () => p(d.getHours() % 12 || 12), h: () => d.getHours() % 12 || 12, mm: () => p(d.getMinutes()), m: () => d.getMinutes(), ss: () => p(d.getSeconds()), s: () => d.getSeconds(), a: () => (d.getHours() < 12 ? 'AM' : 'PM') };
        return String(this.dateFormat).replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|m|ss|s|a/g, (t, lit) => (lit != null ? lit : String(T[t]())));
      }
      date(s) { const d = new FD(s); return isNaN(d) ? null : d; }
    }
    class RelativeDateTimeFormatter { useNamedDateTimeStyle() {} useNumericDateTimeStyle() {} string(d, r) { const m = Math.round((d - r) / 60000); return m === 0 ? 'now' : (m < 0 ? Math.abs(m) + ' min. ago' : 'in ' + m + ' min.'); } }
    class CallbackURL { constructor(u) { this.u = u; this.params = {}; } addParameter(k, v) { this.params[k] = v; } async open() { emu.o.log('  · CallbackURL ' + this.u); const f = emu.fx.callback; return f ? f(this.u, this.params) : {}; } getURL() { return this.u; } }
    class Notification {
      constructor() { this.title = ''; this.body = ''; this.identifier = String(Math.random()); }
      async schedule() { (emu.notifications = emu.notifications || []).push({ title: this.title, body: this.body }); }
      setTriggerDate() {} setDailyTrigger() {} setWeeklyTrigger() {} addAction() {} remove() {}
      static async allPending() { return []; } static async allDelivered() { return []; } static removePending() {} static removeDelivered() {} static removeAllPending() {} static removeAllDelivered() {} static resetCurrent() {} static current() { return null; }
    }
    const configObj = Object.assign({ runsInApp: true, runsInWidget: false, runsInAccessoryWidget: false, runsWithSiri: false, runsInActionExtension: false, runsInNotification: false, runsFromHomeScreen: false, widgetFamily: null }, o.config);
    const argsObj = Object.assign({ all: [], plainTexts: [], urls: [], fileURLs: [], images: [], queryParameters: {}, shortcutParameter: null, widgetParameter: null, notification: null }, o.args);

    const ctx = {
      console: { log: (...a) => (o.verbose ? emu.o.log('  console: ' + a.join(' ').slice(0, 300)) : null), warn: (...a) => emu.o.log('  console.warn: ' + a.join(' ').slice(0, 300)), error: (...a) => emu.o.log('  console.error: ' + a.join(' ').slice(0, 300)) },
      setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController,
      atob: (s) => Buffer.from(s, 'base64').toString('binary'), btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
      Date: FD, Intl, Math, JSON, Promise, Buffer: undefined,
      Data, Image, Size, Point, Rect, Color, Font, LinearGradient, ListWidget, DrawContext, Path, Request, FileManager, Keychain, Alert, WebView,
      Timer: TimerCtor, DateFormatter, RelativeDateTimeFormatter, CallbackURL, Notification,
      config: configObj, args: argsObj,
      module: { filename: emu.paths.documents + '/' + path.basename(o.scriptPath), exports: {} },
      Script: { name: () => path.basename(o.scriptPath, '.js'), complete() {}, setShortcutOutput() {}, setWidget(w) { emu.widget = w; } },
      Device: { locale: () => o.locale, language: () => o.locale.split('_')[0], preferredLanguages: () => [o.locale.replace('_', '-')], isUsingDarkAppearance: () => o.dark, model: () => 'iPhone', name: () => 'iPhone', systemName: () => 'iOS', systemVersion: () => '18.1', isPhone: () => true, isPad: () => false, screenSize: () => new Size(o.viewport.width, o.viewport.height), screenResolution: () => new Size(o.viewport.width * 3, o.viewport.height * 3), screenScale: () => 3, screenBrightness: () => 0.8, setScreenBrightness() {}, isInPortrait: () => true, batteryLevel: () => 0.8, isCharging: () => false, volume: () => 0.5 },
      Safari: { open: async (u) => emu.o.log('  · Safari.open ' + u), openInApp: async (u) => emu.o.log('  · Safari.openInApp ' + u) },
      Pasteboard: { copy: (s) => { emu.pasteboard = s; }, paste: () => emu.pasteboard || '', copyString: (s) => { emu.pasteboard = s; }, pasteString: () => emu.pasteboard || '', copyImage() {}, pasteImage: () => null },
      URLScheme: { forRunningScript: () => 'scriptable:///run/' + encodeURIComponent(path.basename(o.scriptPath, '.js')), forOpeningScript: () => 'scriptable:///open/x', forOpeningScriptSettings: () => 'scriptable:///settings/x', allParameters: () => ({}), parameter: () => null },
      Location: { current: async () => ({ latitude: 54.687, longitude: 25.279, altitude: 120, horizontalAccuracy: 10, verticalAccuracy: 10 }), setAccuracyToBest() {}, setAccuracyToTenMeters() {}, setAccuracyToHundredMeters() {}, setAccuracyToKilometer() {}, setAccuracyToThreeKilometers() {}, reverseGeocode: async () => [{ locality: 'Vilnius', country: 'Lithuania' }] },
      Speech: { speak() {} }, Dictation: { start: async () => '' }, QuickLook: { present: async () => {} }, Photos: { fromLibrary: async () => null, fromCamera: async () => null, latestPhoto: async () => null, removeLatestPhoto() {} },
      UUID: { string: () => require('crypto').randomUUID().toUpperCase() },
      SFSymbol: { named: (n) => ({ image: new Image(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>')), applyFont() {}, applyLightWeight() {}, applyRegularWeight() {}, applyMediumWeight() {}, applySemiboldWeight() {}, applyBoldWeight() {}, applyHeavyWeight() {}, name: n }) },
      importModule: (n) => { throw new Error('importModule not supported in the emulator: ' + n); },
      Calendar: { forEvents: async () => [], defaultForEvents: async () => null }, CalendarEvent: { today: async () => [], thisWeek: async () => [], between: async () => [] }, Reminder: { allIncomplete: async () => [], all: async () => [] },
      Contact: { all: async () => [] }, ContactsContainer: { all: async () => [] }, Mail: class { async send() {} }, Message: class { async send() {} },
      ShareSheet: { present: async () => ({ completed: false }) }, DocumentPicker: { open: async () => [], openFile: async () => null, exportString: async () => [], export: async () => [] },
      UITable: class { constructor() { this.rows = []; } addRow(r) { this.rows.push(r); } removeAllRows() { this.rows = []; } reload() {} async present() {} },
      UITableRow: class { constructor() { this.cells = []; } addText(t) { return { t }; } addButton(t) { return { t }; } addImage() { return {}; } addImageAtURL() { return {}; } },
      XMLParser: class { constructor(s) { this.s = s; } parse() { return false; } },
      Event: class {},
    };
    // Event is used by some scripts for CustomEvent-style plumbing; keep Node's when available.
    if (typeof globalThis.Event === 'function') ctx.Event = globalThis.Event;
    ctx.globalThis = ctx;
    ctx.self = ctx;
    if (this.fx.globals) Object.assign(ctx, typeof this.fx.globals === 'function' ? this.fx.globals(ctx, this) : this.fx.globals);
    return ctx;
  }

  // ── widget → HTML ──
  widgetHTML(family) {
    const w = this.widget;
    if (!w) return null;
    const sizes = { small: [170, 170], medium: [364, 170], large: [364, 382], extraLarge: [715, 382], accessoryRectangular: [172, 76], accessoryCircular: [76, 76], accessoryInline: [257, 26] };
    const [W, H] = sizes[family] || sizes.medium;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const accessory = String(family).startsWith('accessory');
    const node = (n, parentLayout) => {
      if (n.kind === 'spacer') return n.len == null ? `<div style="flex:1 1 0"></div>` : `<div style="flex:0 0 ${n.len}px"></div>`;
      if (n.kind === 'text') {
        const f = n.font || { size: 17, weight: 400 };
        const color = n.textColor ? n.textColor.toCss() : (accessory ? '#fff' : '#000');
        const lines = n.lineLimit || 0;
        const clamp = lines ? `display:-webkit-box;-webkit-line-clamp:${lines};-webkit-box-orient:vertical;overflow:hidden;` : '';
        return `<div style="font-size:${f.size}px;font-weight:${f.weight};${f.mono ? 'font-family:ui-monospace,Menlo,monospace;' : ''}color:${color};opacity:${n.textOpacity == null ? 1 : n.textOpacity};text-align:${n.talign || 'left'};line-height:1.2;white-space:${lines === 1 ? 'pre' : 'pre-wrap'};${clamp}${lines === 1 ? 'overflow:hidden;text-overflow:ellipsis;' : ''}min-width:0;flex:0 1 auto">${esc(n.text)}</div>`;
      }
      if (n.kind === 'image') {
        const b64 = n.img && n.img._b ? n.img._b.toString('base64') : '';
        const sz = n.imageSize || (n.img ? n.img.size : { width: 20, height: 20 });
        return `<img src="data:${mimeOf(n.img && n.img._b)};base64,${b64}" style="width:${sz.width}px;height:${sz.height}px;border-radius:${n.cornerRadius || 0}px;flex:0 0 auto;object-fit:cover">`;
      }
      const pad = n.padding ? `padding:${n.padding[0]}px ${n.padding[3]}px ${n.padding[2]}px ${n.padding[1]}px;` : '';
      const bg = n.backgroundColor ? `background:${n.backgroundColor.toCss()};` : '';
      const size = n.size && (n.size.width || n.size.height) ? `${n.size.width ? `width:${n.size.width}px;flex:0 0 ${n.size.width}px;` : ''}${n.size.height ? `height:${n.size.height}px;` : ''}` : '';
      const al = { start: 'flex-start', center: 'center', end: 'flex-end' }[n.align];
      const dir = n.layout === 'v' ? 'column' : 'row';
      const inner = n.children.map((c) => node(c, n.layout)).join('');
      const gap = n.spacing ? `gap:${n.spacing}px;` : '';
      return `<div style="display:flex;flex-direction:${dir};${dir === 'row' ? `align-items:${al};` : 'align-items:stretch;'}${pad}${bg}${size}border-radius:${n.cornerRadius || 0}px;min-width:0;${gap}">${inner}</div>`;
    };
    let bg = '#fff';
    if (w.backgroundGradient) { const g = w.backgroundGradient; bg = `linear-gradient(180deg, ${g.colors.map((c, i) => c.toCss() + ' ' + Math.round((g.locations[i] || 0) * 100) + '%').join(', ')})`; }
    else if (w.backgroundColor) bg = w.backgroundColor.toCss();
    if (accessory) bg = 'rgba(255,255,255,0.0)';
    const pad = w.padding || (accessory ? [0, 0, 0, 0] : [16, 16, 16, 16]);
    const kids = w.children.map((c) => node(c, 'v')).join('');
    const wgap = w.spacing ? `gap:${w.spacing}px;` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{margin:0;background:transparent;font-family:-apple-system,"SF Pro Text","Inter","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
      .w{width:${W}px;height:${H}px;box-sizing:border-box;border-radius:${accessory ? (family === 'accessoryCircular' ? 38 : 12) : 22}px;overflow:hidden;background:${bg};display:flex;flex-direction:column;${wgap}padding:${pad[0]}px ${pad[3]}px ${pad[2]}px ${pad[1]}px;${accessory ? `background:rgba(30,30,34,.92);padding:${family === 'accessoryCircular' ? 8 : 6}px ${family === 'accessoryCircular' ? 8 : 10}px;` : ''}}
    </style></head><body><div class="w" id="widget">${kids}</div></body></html>`;
  }
}

module.exports = { Emulator, sleep, imageSize, mimeOf };
