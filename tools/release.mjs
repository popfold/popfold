#!/usr/bin/env node
// Cut a Popfold release, locally. Nothing is pushed.
//
//   pnpm release 0.2.0
//
// It checks the tree is clean, on main and not behind origin, moves the changelog's "Unreleased" notes under the new version, sets the
// version in package.json, the templates and the README, typechecks and builds everything, commits, and makes the
// tag v<version>. It then prints the two push commands. Sites move to the release with `popfold update`.
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';

const version = process.argv[2];
const sh = (cmd, quiet = false) => execSync(cmd, { stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' });
const out = (cmd) => sh(cmd, true).trim();
const fail = (msg) => { console.error(`release: ${msg}`); process.exit(1); };
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const num = (v) => v.split('.').map(Number);

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) fail('give the new version, e.g. pnpm release 0.2.0');
const current = json('package.json').version;
const [a, b] = [num(version), num(current)];
if (!(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]))))) fail(`${version} is not newer than ${current}`);
if (out('git status --porcelain')) fail('commit or stash your changes first');
if (out('git rev-parse --abbrev-ref HEAD') !== 'main') fail('releases are cut from main');
try { sh('git fetch --quiet --tags origin', true); } catch { console.warn('release: could not reach origin; checking against what is known locally'); }
if (out(`git tag -l v${version}`)) fail(`the tag v${version} already exists`);
try {
  if (Number(out('git rev-list --count HEAD..origin/main')) > 0) fail('main is behind origin/main; pull first, so the release holds everything that was merged');
} catch { /* no origin/main yet: a brand new repository */ }

// the changelog: what is under "## Unreleased" becomes this version's notes
const log = readFileSync('CHANGELOG.md', 'utf8');
const m = /^## Unreleased[^\n]*\n([\s\S]*?)(?=^## )/m.exec(log);
if (!m?.[1].trim()) fail('write what changed under "## Unreleased" in CHANGELOG.md first');
const now = new Date(); // the local date, not UTC: a release cut in the evening is dated today
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const stage = a[0] === 0 ? ' (alpha)' : '';
writeFileSync('CHANGELOG.md', log.replace(/^## Unreleased[^\n]*\n/m, `## Unreleased\n\n## ${version}${stage}, ${today}\n`));

// the version, everywhere it is written
const setVersion = (file) => { const d = json(file); d.version = version; writeFileSync(file, `${JSON.stringify(d, null, 2)}\n`); };
setVersion('package.json');
for (const t of existsSync('templates') ? readdirSync('templates') : []) {
  if (existsSync(`templates/${t}/package.json`)) setVersion(`templates/${t}/package.json`);
}
writeFileSync('README.md', readFileSync('README.md', 'utf8').replace(/(\*\*Status: alpha \()\d+\.\d+\.\d+(\)\.\*\*)/, `$1${version}$2`));

// prove it before it is tagged
sh('pnpm install');
sh('pnpm build:pkg'); // lib/vite-plugin.js, which a site's vite.config.ts loads as it is
sh('pnpm -r typecheck');
sh('pnpm -r build');

sh('git add -A CHANGELOG.md README.md package.json templates pnpm-lock.yaml lib');
sh(`git commit -q -m "Popfold ${version}${stage}"`);
sh(`git tag -a v${version} -m "Popfold ${version}${stage}"`);
console.log(`\nrelease: committed and tagged v${version}. Nothing is pushed. When you are ready:\n  git push origin main\n  git push origin v${version}\nThen, in each site:  pnpm exec popfold update v${version}`);
