#!/usr/bin/env node
// The part of Popfold that Node loads as it is: the Vite plugin, which a site's vite.config.ts imports, and the home
// file's commands, which the plugin runs. Node will not strip TypeScript from a file inside node_modules, so a site
// that takes Popfold as a package needs them as JavaScript: lib/vite-plugin.js and lib/home-commands.js, made from
// src/ by taking their types out (Node's own stripTypeScriptTypes; every line stays where it was) and naming the
// one import between them with its .js. Everything else is TypeScript that Vite compiles.
//
//   node tools/build-pkg.mjs           write lib/
//   node tools/build-pkg.mjs --check   fail if lib/ is not what src/ makes (pnpm test and pnpm release run this)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['vite-plugin', 'home-commands'];

/** lib/<name>.js as src/<name>.ts makes it now */
export function libJs(name) {
  const js = stripTypeScriptTypes(readFileSync(resolve(root, `src/${name}.ts`), 'utf8'), { mode: 'strip' })
    .replace(/from '\.\/home-commands'/g, "from './home-commands.js'");
  return `// Made from src/${name}.ts by tools/build-pkg.mjs: edit that file, then run \`pnpm build:pkg\`.\n${js}`;
}
/** lib/vite-plugin.js as src/vite-plugin.ts makes it now */
export const pluginJs = () => libJs('vite-plugin');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  for (const name of FILES) {
    const out = resolve(root, `lib/${name}.js`), want = libJs(name);
    if (check) {
      if (!existsSync(out) || readFileSync(out, 'utf8') !== want) {
        console.error(`build-pkg: lib/${name}.js is not what src/${name}.ts makes; run pnpm build:pkg`);
        process.exit(1);
      }
    } else {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, want);
      console.log(`build-pkg: wrote lib/${name}.js`);
    }
  }
}
