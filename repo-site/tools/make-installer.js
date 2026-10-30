#!/usr/bin/env node
// Writes an app's install.js from repo-site/templates/install.js (see repo-site/INSTALL-GUIDE.md):
//   node repo-site/tools/make-installer.js <app-repo-dir> [more dirs…]          write install.js
//   node repo-site/tools/make-installer.js --check <app-repo-dir> [more dirs…]  exit 1 if install.js is missing or out of date
// Read from the app: its script (the one .js at the root besides install.js), APP_ID and icon colour from the script,
// the GitHub repository and branch from git, and install.kept / install.firstRun from docs/site/repo.json.
// It never reads or changes anything else; the app's own script is only read.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEMPLATE = path.join(__dirname, '..', 'templates', 'install.js');

function appInfo(dir) {
  const scripts = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'install.js' && !/^install /i.test(f));
  if (scripts.length !== 1) throw new Error(`expected one app script at the root, found: ${scripts.join(', ') || 'none'}`);
  const file = scripts[0], src = fs.readFileSync(path.join(dir, file), 'utf8');
  const id = (src.match(/^const APP_ID = '([^']+)'/m) || [])[1];
  if (!id) throw new Error(`${file} has no "const APP_ID = '…'" line`);
  const color = (src.match(/icon-color: ([a-z-]+);/) || [])[1] || 'blue';
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'docs', 'site', 'repo.json'), 'utf8')); } catch (e) {}
  const inst = meta.install || {};
  const git = (c) => { try { return execSync(c, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };
  const remote = git('git remote get-url origin');
  const repo = inst.repo || (remote.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/) || [])[1];
  const branch = inst.branch || git('git rev-parse --abbrev-ref HEAD') || 'main';
  if (!repo) throw new Error('no GitHub repository: set install.repo in docs/site/repo.json');
  if (!inst.kept || !inst.firstRun) throw new Error('docs/site/repo.json needs install.kept and install.firstRun');
  return { file, name: file.replace(/\.js$/, ''), id, color, repo, branch, kept: inst.kept, firstRun: inst.firstRun };
}

const jsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
function render(a) {
  return fs.readFileSync(TEMPLATE, 'utf8')
    .replace(/\{\{ICON_COLOR\}\}/g, a.color).replace(/\{\{NAME\}\}/g, a.name).replace(/\{\{FILE\}\}/g, a.file)
    .replace(/\{\{FILE_URL\}\}/g, a.file.split('/').map(encodeURIComponent).join('/'))
    .replace(/\{\{REPO\}\}/g, a.repo).replace(/\{\{BRANCH\}\}/g, a.branch).replace(/\{\{APP_ID\}\}/g, a.id)
    .replace(/\{\{KEPT\}\}/g, jsText(a.kept)).replace(/\{\{FIRST_RUN\}\}/g, jsText(a.firstRun));
}

module.exports = { appInfo, render };
if (require.main === module) {
  const args = process.argv.slice(2), check = args[0] === '--check', dirs = check ? args.slice(1) : args;
  let bad = 0;
  for (const dir of dirs) {
    try {
      const a = appInfo(dir), out = render(a), p = path.join(dir, 'install.js');
      if (check) {
        const ok = fs.existsSync(p) && fs.readFileSync(p, 'utf8') === out;
        console.log((ok ? '✓ ' : '✗ ') + dir + (ok ? '' : ': install.js is missing or out of date; run make-installer.js'));
        if (!ok) bad++;
      } else { fs.writeFileSync(p, out); console.log('✓ ' + dir + ': install.js for ' + a.name + ' (' + a.repo + ', ' + a.branch + ')'); }
    } catch (e) { console.log('✗ ' + dir + ': ' + e.message); bad++; }
  }
  process.exit(bad ? 1 : 0);
}
