#!/usr/bin/env node
// Blueprint inventory: which app follows which blueprint version, and which are behind.
// Run from the repository root:  node tools/inventory.js [--strict] [--json]
//   --strict  exit with code 1 when any app is behind, untraced or inconsistent
//   --json    print the full result as JSON instead of tables
// Needs Node 18+ (global fetch). Public repositories only; no token required.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'apps.json'), 'utf8'));
const RAW = (repo, ref, file) => `https://raw.githubusercontent.com/${repo}/${ref}/${file.split('/').map(encodeURIComponent).join('/')}`;
const args = new Set(process.argv.slice(2));
const SEMVER = /^\d+\.\d+\.\d+$/;
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; };

async function get(url) {
  // GitHub's raw cache can serve a copy minutes old; a unique query string always gets the current file.
  try { const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } }); return r.ok ? await r.text() : null; }
  catch (e) { return null; }
}

// Front matter: simple "key: value" lines between the first two "---" lines.
function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  return Object.fromEntries(m[1].split('\n').map(l => l.match(/^([a-z_]+):\s*(.*)$/)).filter(Boolean).map(x => [x[1], x[2].trim()]));
}

// The app's trace: the BLUEPRINTS block, read with a pattern, never executed.
function readTrace(script) {
  const block = /const BLUEPRINTS = \[([\s\S]*?)\];/.exec(script);
  if (!block) return null;
  const items = [], re = /\{ id: '([a-z0-9-]+)', name: '([^']+)', version: '([^']+)', since: '([^']+)' \}/g;
  let m; while ((m = re.exec(block[1]))) items.push({ id: m[1], name: m[2], version: m[3], since: m[4] });
  const lines = block[1].split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length;
  return { items, malformed: lines !== items.length };
}

// docs/BLUEPRINTS.md rows: | [id](…) | 1.0.0 | since | deviations |  (older files had a date column instead)
function readDocs(md) {
  if (!md) return null;
  const rows = {};
  for (const l of md.split('\n')) {
    const m = /^\|\s*\[?([a-z0-9-]+)\]?(?:\([^)]*\))?\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(l);
    if (m && m[1] !== 'blueprint' && !/^-+$/.test(m[1])) rows[m[1]] = { version: m[2], since: m[3] };
  }
  return rows;
}

(async () => {
  // 1. Blueprints: front matter, version history row, and the version tag.
  const blueprints = [], problems = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'blueprints')).filter(f => f.endsWith('.md')).sort()) {
    const text = fs.readFileSync(path.join(ROOT, 'blueprints', f), 'utf8'), fm = frontMatter(text) || {};
    const id = f.replace(/\.md$/, ''), v = fm.version;
    const bp = { id, title: fm.title, version: v, issues: [] };
    if (fm.id !== id) bp.issues.push(`front matter id "${fm.id}" doesn't match the file name`);
    if (!SEMVER.test(v || '')) bp.issues.push(`version "${v}" isn't x.y.z`);
    else {
      if (!new RegExp(`^\\| ${v.replace(/\./g, '\\.')} \\|`, 'm').test(text)) bp.issues.push(`no Version history row for ${v}`);
      if (!(await get(RAW(CFG.blueprintsRepo, `${id}-v${v}`, `blueprints/${id}.md`)))) bp.issues.push(`tag ${id}-v${v} not found on GitHub`);
    }
    bp.issues.forEach(i => problems.push(`${id}: ${i}`));
    blueprints.push(bp);
  }
  const latest = Object.fromEntries(blueprints.map(b => [b.id, b.version]));

  // 2. Apps: script trace vs docs vs latest versions.
  const apps = [];
  for (const app of CFG.apps) {
    // The full ref name: GitHub's raw cache can keep resolving a short branch name to an old commit for many minutes.
    const ref = `refs/heads/${app.branch}`;
    const script = await get(RAW(app.repo, ref, app.script));
    const docs = readDocs(await get(RAW(app.repo, ref, 'docs/BLUEPRINTS.md')));
    const out = { app: app.name, repo: app.repo, version: null, rows: [], notes: [] };
    if (!script) { out.notes.push(`couldn't fetch ${app.script}`); apps.push(out); continue; }
    out.version = (/const VERSION = '([^']+)'/.exec(script) || [])[1] || '?';
    const trace = readTrace(script);
    if (!trace) out.notes.push('no BLUEPRINTS block (predates traces)');
    else if (trace.malformed) out.notes.push('BLUEPRINTS block has lines in an unexpected shape');
    const ids = new Set([...(trace ? trace.items.map(i => i.id) : []), ...Object.keys(docs || {})]);
    for (const id of ids) {
      const t = trace && trace.items.find(i => i.id === id), d = docs && docs[id];
      let status;
      if (!latest[id]) status = 'unknown blueprint';
      else if (!t) status = d ? 'docs only, no trace' : 'missing';
      else if (!SEMVER.test(t.version) || !blueprints.find(b => b.id === id)) status = 'invalid version';
      else status = cmp(t.version, latest[id]) === 0 ? 'current' : cmp(t.version, latest[id]) < 0 ? `behind (latest ${latest[id]})` : 'ahead of latest';
      if (t && d && (d.version !== t.version || d.since !== t.since)) status += '; docs disagree';
      if (t && !d) status += '; not in docs';
      out.rows.push({ blueprint: id, version: t ? t.version : (d && SEMVER.test(d.version) ? d.version : '—'), since: t ? t.since : (d ? d.since : '—'), status });
    }
    apps.push(out);
  }

  if (args.has('--json')) { console.log(JSON.stringify({ blueprints, apps, problems }, null, 2)); }
  else {
    console.log('## Blueprints\n\n| Blueprint | Version | Check |\n| --- | --- | --- |');
    blueprints.forEach(b => console.log(`| ${b.id} | ${b.version} | ${b.issues.length ? b.issues.join('; ') : 'ok'} |`));
    console.log('\n## Apps\n\n| App | App version | Blueprint | Follows | Since | Status |\n| --- | --- | --- | --- | --- | --- |');
    for (const a of apps) {
      if (!a.rows.length) console.log(`| ${a.app} | ${a.version || '?'} | — | — | — | ${a.notes.join('; ') || 'no blueprints recorded'} |`);
      a.rows.forEach((r, i) => console.log(`| ${i ? '' : a.app} | ${i ? '' : a.version} | ${r.blueprint} | ${r.version} | ${r.since} | ${r.status}${i === 0 && a.notes.length ? ' — ' + a.notes.join('; ') : ''} |`));
    }
  }
  const bad = problems.length || apps.some(a => a.notes.length || a.rows.some(r => r.status !== 'current'));
  if (args.has('--strict') && bad) process.exit(1);
})();
