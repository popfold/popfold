// The object view's list: every kind a home can use (its own, Popfold's built-ins, model files), where each is used,
// which model files a home does not load, and the dev server's list of model files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_IN_KINDS, libraryOf, readHome } from '../src/pieces.ts';
import { modelFiles } from '../src/vite-plugin.ts';
import type { HomeRecipe } from '../src/types.ts';

const build = () => { throw new Error('not built in a test'); };
const office = {
  id: 'office', props: ['lamp', 'sh3d/frame'], propDir: 'models/office',
  kinds: { desk: build, chair: build },
  pieces: [
    { id: 'desk', room: 'center', kind: 'desk', at: [0, 0] },
    { id: 'chair', room: 'center', kind: 'chair', at: [0, 1] },
    { id: 'chair-2', room: 'center', kind: 'chair', at: [1, 1] },
    { id: 'sofa', room: 'left', kind: 'builtin/sofa', at: [0, 0] },
    { id: 'odd', room: 'left', kind: 'nothing', at: [0, 0] },
  ],
} as unknown as HomeRecipe;
const loft = { id: 'loft', props: [], propDir: 'models/props', kinds: { chair: build }, pieces: [{ id: 'c', room: 'right', kind: 'chair', at: [0, 0] }] } as unknown as HomeRecipe;

test('a home can use its own kinds, the built-ins and its model files, in that order', () => {
  const list = libraryOf([office, loft], 'office');
  assert.deepEqual(list.filter((e) => e.from === 'site' && e.usable).map((e) => e.kind), ['chair', 'desk']);
  assert.equal(list.filter((e) => e.from === 'built-in').length, BUILT_IN_KINDS.length);
  assert.deepEqual(list.filter((e) => e.from === 'model').map((e) => [e.kind, e.file]), [['lamp', 'models/office/lamp.glb'], ['sh3d/frame', 'models/props/sh3d/frame.glb']]);
  assert.deepEqual(list.map((e) => e.from).slice(0, 2), ['site', 'site']);
});

test('each kind says where it is used, in every home', () => {
  const list = libraryOf([office, loft], 'office');
  assert.deepEqual(list.find((e) => e.kind === 'chair')?.used, [{ home: 'office', room: 'center', count: 2 }, { home: 'loft', room: 'right', count: 1 }]);
  assert.deepEqual(list.find((e) => e.kind === 'builtin/sofa')?.used, [{ home: 'office', room: 'left', count: 1 }]);
  assert.deepEqual(list.find((e) => e.kind === 'builtin/bed')?.used, []);
});

test('a kind the list names that the home cannot build is listed, and cannot be added', () => {
  const odd = libraryOf([office], 'office').find((e) => e.kind === 'nothing');
  assert.equal(odd?.usable, false);
  assert.match(odd?.why ?? '', /no way to build it/);
});

test('model files in a home\'s folders that it does not load are listed as such', () => {
  const files = [
    { path: 'models/office/lamp.glb', bytes: 2000, modified: 5 },
    { path: 'models/office/stool.glb', bytes: 3000, modified: 6 },
    { path: 'models/props/sh3d/plant.glb', bytes: 4000, modified: 7 },
    { path: 'models/props/loose.glb', bytes: 1, modified: 1 }, // the shared folder's own files have no kind name here
    { path: 'models/room.glb', bytes: 1, modified: 1 },
  ];
  const list = libraryOf([office], 'office', files);
  assert.deepEqual(list.find((e) => e.kind === 'lamp'), { kind: 'lamp', from: 'model', file: 'models/office/lamp.glb', bytes: 2000, modified: 5, usable: true, used: [] });
  const stool = list.find((e) => e.kind === 'stool');
  assert.equal(stool?.usable, false);
  assert.match(stool?.why ?? '', /props in code/);
  assert.equal(list.find((e) => e.kind === 'sh3d/plant')?.usable, false);
  assert.equal(list.some((e) => e.kind === 'loose' || e.kind === 'room'), false);
});

test('nothing is added to a diorama from the list', () => {
  const room = { id: 'room', props: [], propDir: 'models/props', diorama: { url: 'models/room.glb' } } as unknown as HomeRecipe;
  assert.equal(libraryOf([room], 'room').some((e) => e.usable), false);
});

test('a book takes its own kinds from the list, not furniture or model files', () => {
  const book = { id: 'book', props: ['lamp'], propDir: 'models/props', kinds: { tree: build }, book: { pages: [] } } as unknown as HomeRecipe;
  const list = libraryOf([book], 'book');
  assert.deepEqual(list.filter((e) => e.usable).map((e) => e.kind), ['tree']);
  assert.match(list.find((e) => e.kind === BUILT_IN_KINDS[0])?.why ?? '', /pop-ups/);
});

test('a home file may name a built-in kind, and only one that exists', () => {
  const home = (kind: string) => ({ id: 'h', name: 'H', pieces: [{ id: 'p', room: 'center', kind, at: [0, 0] }] });
  assert.doesNotThrow(() => readHome(home('builtin/sofa')));
  assert.throws(() => readHome(home('builtin/throne')), /no built-in "builtin\/throne"/);
});

test('the dev server lists the model files under the public folder, without stills or art', () => {
  const dir = mkdtempSync(join(tmpdir(), 'popfold-lib-'));
  try {
    for (const d of ['models/props/sh3d', 'stills', 'art']) mkdirSync(join(dir, d), { recursive: true });
    for (const f of ['models/props/lamp.glb', 'models/props/sh3d/plant.glb', 'models/props/notes.txt', 'stills/x.glb', 'art/y.glb']) writeFileSync(join(dir, f), 'glTF');
    assert.deepEqual(modelFiles(dir).map((f) => [f.path, f.bytes]), [['models/props/lamp.glb', 4], ['models/props/sh3d/plant.glb', 4]]);
    assert.deepEqual(modelFiles(join(dir, 'missing')), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
