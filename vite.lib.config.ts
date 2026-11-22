// The library bundle: `pnpm build:lib` writes dist/popfold.js (the engine and three.js, as an ES module that defines
// <popfold-home>) and dist/cases/ (the two modelled cases, found beside the bundle at run time). A site built with
// Vite does not use this: it takes Popfold's source, as before.
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve as resolveFrom } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));
const resolve = (...parts: string[]) => resolveFrom(here, ...parts);

const CASES = { round: 'compact.glb', crisp: 'compact-crisp.glb' };

export default defineConfig({
  root: here,
  base: './',
  publicDir: false,
  plugins: [{
    name: 'popfold-lib-cases',
    // the cases, beside the bundle: the address is made at run time, so Vite neither inlines nor moves the files
    resolveId: (id) => (id === 'virtual:popfold-cases' ? '\0popfold-cases' : undefined),
    load: (id) => (id === '\0popfold-cases'
      ? `const at = (file) => new URL(['cases', file].join('/'), import.meta.url).href;\nexport default { ${Object.entries(CASES).map(([k, f]) => `${k}: at(${JSON.stringify(f)})`).join(', ')} };\n`
      : undefined),
    closeBundle() {
      mkdirSync(resolve('dist/cases'), { recursive: true });
      for (const f of Object.values(CASES)) copyFileSync(resolve('assets', f), resolve('dist/cases', f));
    },
  }],
  define: { __POPFOLD_BUILD__: 'undefined' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    lib: { entry: { popfold: resolve('src/lib.ts') }, formats: ['es'] },
    chunkSizeWarningLimit: 1200,
  },
});
