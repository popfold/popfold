// Popfold's TypeScript imports its own files without an extension, as Vite and tsc expect; Node's test runner
// needs one. This names the .ts file such an import means (node --import ./test/resolve-ts.mjs).
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier) && context.parentURL?.endsWith('.ts')) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
    return next(specifier, context);
  },
});
