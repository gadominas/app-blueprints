#!/usr/bin/env node
// Checks an app README against repo-site/TEMPLATE.md:
//   node repo-site/tools/check-readme.js <app-repo-dir> [more dirs…]
// Header block and badges, section order, local image and link targets, in-page anchors,
// unused screenshot cards, docs/site/repo.json. Exit code 1 when anything is off.
'use strict';
const fs = require('fs');
const path = require('path');

const SECTIONS = ['Highlights', 'Screenshots', 'Install', 'How to use it', 'Widget', 'AI', 'Settings', 'Updates and what\'s new',
  'Privacy and security', 'How it works', 'Troubleshooting', 'Built with', 'Disclaimer', 'More apps like this', 'License'];
const OPTIONAL = new Set(['How it works', 'Troubleshooting']);
const BADGES = ['Version', 'Platform', 'AI', 'Blueprints', 'Last commit'];

const slug = (h) => h.trim().toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');

let bad = 0;
for (const dir of process.argv.slice(2)) {
  const problems = [];
  const md = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  const noCode = md.replace(/```[\s\S]*?```/g, '');
  // header
  if (!/^<div align="center">\s*\n\s*\n<img src="docs\/logo\.svg" width="96"/.test(md)) problems.push('header: must start with the centred logo block');
  for (const b of BADGES) if (!new RegExp('\\[!\\[' + b + '\\]').test(md)) problems.push('badge missing: ' + b);
  if (fs.existsSync(path.join(dir, 'LICENSE')) !== /\[!\[License\]/.test(md)) problems.push('License badge must be there exactly when LICENSE exists');
  if (!/> \[!NOTE\]/.test(md)) problems.push('missing the [!NOTE] about sample data');
  // sections
  const h2 = [...noCode.matchAll(/^## (.+)$/gm)].map((m) => m[1].replace(/\s*\(optional\)$/, '').trim());
  const want = SECTIONS.filter((s) => !OPTIONAL.has(s) || h2.includes(s));
  if (h2.join('|') !== want.join('|')) problems.push('sections: got [' + h2.join(', ') + ']\n      want [' + want.join(', ') + ']');
  // local targets
  const anchors = new Set([...noCode.matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])));
  const refs = [...noCode.matchAll(/(?:src|href)="([^"]+)"|\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1] || m[2]);
  for (const r of refs) {
    if (/^(https?:|mailto:)/.test(r)) continue;
    if (r.startsWith('#')) { if (!anchors.has(r.slice(1))) problems.push('anchor not found: ' + r); continue; }
    const p = decodeURIComponent(r.split('#')[0]);
    if (p && !fs.existsSync(path.join(dir, p))) problems.push('missing file: ' + r);
  }
  // unused cards
  const shots = path.join(dir, 'docs', 'screenshots');
  if (fs.existsSync(shots)) for (const f of fs.readdirSync(shots)) if (!md.includes('docs/screenshots/' + f)) problems.push('unused card: docs/screenshots/' + f);
  // About
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'docs', 'site', 'repo.json'), 'utf8'));
    if (!meta.description || meta.description.length > 350) problems.push('repo.json: description missing or over 350 characters');
    if (!/A Scriptable app\.$/.test(meta.description || '')) problems.push('repo.json: description should end with "A Scriptable app."');
    const shared = ['scriptable', 'scriptable-app', 'ios', 'iphone', 'javascript', 'app-blueprints'];
    if (!Array.isArray(meta.topics) || shared.some((t, i) => meta.topics[i] !== t)) problems.push('repo.json: topics must start with ' + shared.join(', '));
    if ((meta.topics || []).length > 20) problems.push('repo.json: more than 20 topics');
  } catch (e) { problems.push('docs/site/repo.json: ' + e.message); }

  console.log((problems.length ? '✗ ' : '✓ ') + dir);
  problems.forEach((p) => console.log('    ' + p));
  if (problems.length) bad++;
}
process.exit(bad ? 1 : 0);
