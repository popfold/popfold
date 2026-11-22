// The popfold command, as far as it can be checked without a browser.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const templates = new URL('../templates/', import.meta.url);

test('each template\'s README, whose table `popfold init` copies into a new site, names files the template has', () => {
  const names = readdirSync(templates);
  assert.ok(names.includes('compact') && names.includes('tower'));
  for (const name of names) {
    // its table rows: | `src/home.ts` | what to change |   (a row may name two files)
    const rows = readFileSync(new URL(`${name}/README.md`, templates), 'utf8').split(/\r?\n/).filter((l) => l.startsWith('| `'));
    assert.ok(rows.length >= 5, `templates/${name}/README.md has no table of files`);
    for (const row of rows) {
      for (const [, file] of row.split('|')[1].matchAll(/`([\w./-]+)`/g)) assert.ok(existsSync(new URL(`${name}/${file}`, templates)), `templates/${name} has no ${file}`);
    }
  }
});

test('a model is credited by its path, its file name or a folder below public/models/, not by public/models/ alone', async () => {
  const { uncredited } = await import('../bin/credits.mjs');
  const models = ['public/models/room.glb', 'public/models/props/chair.glb', 'public/models/props/refined/bed.glb', 'public/models/props/sh3d/lamp.glb', 'public/models/guide.glb', 'public/models/extra/vase.glb'];
  const credits = 'The room `public/models/room.glb`. Furniture in `models/props/`. The figure guide.glb.';
  assert.deepEqual(uncredited(models, credits), ['public/models/extra/vase.glb']);
  assert.deepEqual(uncredited(['public/models/props/chair.glb'], 'Everything in public/models/ is ours.'), ['public/models/props/chair.glb']);
  assert.deepEqual(uncredited(['public/models/props/chair.glb'], String.raw`see public\models\props\ `), []);
});
