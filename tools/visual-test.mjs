// The visual test: capture a site's stills (or the templates') as they were before a change and as they are after
// it, on this machine, and fail if any picture differs. Each side captures with its own `popfold stills`, so a change
// to the command itself does not count, and the stills kept in the repository (made on someone's own GPU) play no
// part. Run by CI on a GPU runner (.github/workflows/visual.yml here, and the one `popfold init` gives a site).
//
// node tools/visual-test.mjs --before <checkout> --after <checkout> [--report <dir>] [folder ...]
//   <checkout>  a copy of the repository: Popfold itself, or a site (with Popfold installed in node_modules/popfold)
//   folder      the sites to capture within it (default: templates/* in Popfold, the site's own root in a site)
// Prints what differs; exits 1 if anything does, with the stills before and after in --report.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const before = resolve(option('--before') ?? '../before');
const after = resolve(option('--after') ?? '.');
const report = resolve(option('--report') ?? join(after, '..', 'visual-report'));

/** the `popfold` command of a checkout: its own (Popfold) or the one installed in it (a site) */
const commandOf = (root) => [join(root, 'bin/popfold.mjs'), join(root, 'node_modules/popfold/bin/popfold.mjs')].find(existsSync);
/** the sites in a checkout: Popfold's templates, or the site itself */
const sitesOf = (root) => (existsSync(join(root, 'templates')) && existsSync(join(root, 'bin/popfold.mjs'))
  ? readdirSync(join(root, 'templates')).filter((t) => existsSync(join(root, 'templates', t, 'package.json'))).map((t) => `templates/${t}`)
  : ['.']);
const capture = (root, site) => {
  const command = commandOf(root);
  if (!command) throw new Error(`${root} has no popfold command (bin/popfold.mjs, or node_modules/popfold/bin/popfold.mjs after pnpm install)`);
  execFileSync(process.execPath, [command, 'stills'], { cwd: join(root, site), stdio: 'inherit' });
};
const webps = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.webp')) : []);

const sites = args.length ? args : sitesOf(after);
rmSync(report, { recursive: true, force: true });
let differ = 0, compared = 0;
for (const site of sites) {
  const label = site === '.' ? basename(after) : site;
  if (!existsSync(join(before, site, 'package.json'))) { console.log(`${label}: new, nothing to compare it with`); continue; }
  // before: as the change found it
  capture(before, site);
  // the stills a page shows (public/stills) and those of homes only the studio has (stills)
  const folders = ['public/stills', 'stills'];
  // after: start from the stills before, so the command rewrites exactly those that look different
  for (const folder of folders) {
    const was = join(before, site, folder), now = join(after, site, folder);
    mkdirSync(now, { recursive: true });
    for (const f of webps(now)) rmSync(join(now, f));
    for (const f of webps(was)) copyFileSync(join(was, f), join(now, f));
  }
  capture(after, site);
  for (const folder of folders) {
    const was = join(before, site, folder), now = join(after, site, folder);
    for (const f of webps(now)) {
      if (!existsSync(join(was, f))) { console.log(`${label}: ${f} is new`); continue; }
      compared++;
      if (readFileSync(join(was, f)).equals(readFileSync(join(now, f)))) continue;
      differ++;
      mkdirSync(report, { recursive: true });
      const name = `${label.replace(/[\\/]/g, '-')}-${f.replace(/\.webp$/, '')}`;
      copyFileSync(join(was, f), join(report, `${name}-before.webp`));
      copyFileSync(join(now, f), join(report, `${name}-after.webp`));
      console.log(`::error file=${join(site, folder, f)}::this still looks different with this change`);
    }
  }
}
console.log(`${compared} stills compared, ${differ} differ${differ ? ` (before and after are in ${report})` : ''}`);
process.exitCode = differ ? 1 : 0;
