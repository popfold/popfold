#!/usr/bin/env node
// The one part of Popfold that Node loads as it is: the Vite plugin, which a site's vite.config.ts imports. Node
// will not strip TypeScript from a file inside node_modules, so a site that takes Popfold as a package (from a git
// tag) needs it as JavaScript: lib/vite-plugin.js, made from src/vite-plugin.ts by taking its types out (Node's own
// stripTypeScriptTypes; every line stays where it was). Everything else is TypeScript that Vite compiles.
//
//   node tools/build-pkg.mjs           write lib/vite-plugin.js
//   node tools/build-pkg.mjs --check   fail if it is not what src/vite-plugin.ts makes (pnpm test and pnpm release run this)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'src/vite-plugin.ts'), OUT = resolve(root, 'lib/vite-plugin.js');

/** lib/vite-plugin.js as src/vite-plugin.ts makes it now */
export function pluginJs() {
  const js = stripTypeScriptTypes(readFileSync(SRC, 'utf8'), { mode: 'strip' });
  return `// Made from src/vite-plugin.ts by tools/build-pkg.mjs: edit that file, then run \`pnpm build:pkg\`.\n${js}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const want = pluginJs();
  if (process.argv.includes('--check')) {
    if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== want) {
      console.error('build-pkg: lib/vite-plugin.js is not what src/vite-plugin.ts makes; run pnpm build:pkg');
      process.exit(1);
    }
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, want);
    console.log('build-pkg: wrote lib/vite-plugin.js');
  }
}
