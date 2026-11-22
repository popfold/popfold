// Popfold as a package: what a site that installs it from a git tag needs to find in it.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { THREE_FILES } from '../src/vite-plugin.ts';

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));

test('the dev server pre-bundles every three.js file Popfold imports (it does not pre-bundle Popfold itself)', () => {
  const used = new Set<string>();
  for (const f of files('src')) for (const m of readFileSync(f, 'utf8').matchAll(/(?:from |import\()'(three(?:\/[^']*)?)'/g)) used.add(m[1]);
  assert.deepEqual([...used].filter((u) => !THREE_FILES.includes(u)), []);
});

test("the package's entries exist, and the Vite plugin is plain JavaScript a site's vite.config.ts can load", () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const target of Object.values(pkg.exports as Record<string, string | Record<string, string>>).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)))) {
    assert.doesNotThrow(() => statSync(target), `${target} is missing`);
  }
  assert.equal(pkg.exports['./vite'].default, './lib/vite-plugin.js');
  // it is published to npm as @popfold/engine, and sites install it as `popfold`
  assert.equal(pkg.name, '@popfold/engine');
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.publishConfig.access, 'public');
  for (const t of ['compact', 'tower', 'diorama', 'storybook']) {
    assert.equal(JSON.parse(readFileSync(`templates/${t}/package.json`, 'utf8')).dependencies.popfold, 'workspace:@popfold/engine@*');
  }
  // the command a site runs and the tools it needs come with Popfold, not from a workspace
  for (const tool of ['playwright-core', 'sharp', '@gltf-transform/core', 'meshoptimizer', 'parse5']) assert.ok(pkg.dependencies[tool], `${tool} is not a dependency`);
});
