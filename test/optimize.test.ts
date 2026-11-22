// popfold optimize: a model comes out smaller, compressed, and with every part exactly where it was.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const command = fileURLToPath(new URL('../bin/popfold.mjs', import.meta.url));
const run = (cwd: string, ...args: string[]) => execFileSync(process.execPath, [command, 'optimize', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** A bumpy sheet of 80 x 80 squares, hung on a node that is moved, turned and scaled, with a custom property. */
async function model(file: string) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const n = 81, pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { pos.push(x / 40 - 1, Math.sin(x * 0.3) * Math.cos(y * 0.2) * 0.1, y / 40 - 1); nor.push(0, 1, 0); }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const a = y * n + x; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buffer))
    .setMaterial(doc.createMaterial('art_poster_1'));
  // a second part, the same in every way but its name and its material's name: a site paints each by name
  const twin = doc.createNode('piece_twin').setMesh(doc.createMesh('twin').addPrimitive(prim.clone().setMaterial(doc.createMaterial('art_poster_2'))));
  const part = doc.createNode('piece_sheet').setMesh(doc.createMesh('sheet').addPrimitive(prim))
    .setTranslation([1, 2, 3]).setRotation([0, 0.7071, 0, 0.7071]).setScale([2, 2, 2]).setExtras({ zone: 'left', id: 'sheet' });
  const pivot = doc.createNode('pivot').setTranslation([0, 0.5, 0]); // an empty node: Popfold may use it as a pivot
  doc.createScene().addChild(part).addChild(pivot).addChild(twin);
  await new NodeIO().write(file, doc);
}

test('popfold optimize shrinks a model and leaves its nodes, names, materials and custom properties alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'popfold-optimize-'));
  const file = join(dir, 'sheet.glb');
  await model(file);
  const was = statSync(file).size;

  assert.match(run(dir, '.', '--check'), /1 of 1 model would shrink.*nothing was changed/);
  assert.equal(statSync(file).size, was, '--check must not write');

  assert.match(run(dir, '.'), /sheet\.glb: \d+ KB -> \d+ KB/);
  assert.ok(statSync(file).size < was * 0.8, `${was} -> ${statSync(file).size}`);

  await MeshoptDecoder.ready;
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(file);
  assert.ok(doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression'));
  const node = (name: string) => doc.getRoot().listNodes().find((n) => n.getName() === name)!;
  const part = node('piece_sheet'), pivot = node('pivot'), twin = node('piece_twin');
  assert.deepEqual([part.getName(), part.getTranslation(), part.getScale(), part.getExtras()], ['piece_sheet', [1, 2, 3], [2, 2, 2], { zone: 'left', id: 'sheet' }]);
  assert.deepEqual([pivot.getName(), pivot.getTranslation()], ['pivot', [0, 0.5, 0]]);
  const prim = part.getMesh()!.listPrimitives()[0];
  assert.equal(prim.getMaterial()!.getName(), 'art_poster_1');
  // identical materials with different names are still two materials, each on its own part
  assert.equal(twin.getMesh()!.listPrimitives()[0].getMaterial()!.getName(), 'art_poster_2');
  assert.deepEqual(doc.getRoot().listMaterials().map((m) => m.getName()).sort(), ['art_poster_1', 'art_poster_2']);
  // positions are still plain numbers in the node's own space, not squeezed into whole numbers
  assert.equal(prim.getAttribute('POSITION')!.getComponentType(), 5126);
  assert.deepEqual(prim.getAttribute('POSITION')!.getMin([0, 0, 0]).map((v) => Math.round(v * 100) / 100), [-1, -0.1, -1]);

  assert.match(run(dir, '.'), /nothing to do/, 'a second run leaves an optimised model alone');
});
