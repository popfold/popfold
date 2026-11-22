// Listed pieces: their keys, the stories they carry, and that the page without 3D uses the same keys.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lateModels, pieceKey, storiesOf } from '../src/pieces.ts';
import { popfoldFallback } from '../src/vite-plugin.ts';
import type { PieceSpec } from '../src/types.ts';

const story = (title: string) => ({ title, text: 'Why.', tags: [] });
const PIECES: PieceSpec[] = [
  { id: 'desk', room: 'center', kind: 'desk', at: [0, 0], story: story('Desk') },
  { id: 'board', room: 'center', wall: true, kind: 'board', at: [0, 2], story: story('Board') },
  { id: 'lamp', room: 'left', kind: 'lamp', at: [1, 1] },
  { id: 'bench', room: 'right', kind: 'bench', at: [0, 0], story: story('Bench') },
];
const ROOMS = { center: 'studio', left: 'library', right: 'workshop' };

test('a listed piece is <room>/<id>, <room>-wall/<id> on a wall, with the recipe\'s own room names', () => {
  assert.deepEqual(PIECES.map((p) => pieceKey(p)), ['center/desk', 'center-wall/board', 'left/lamp', 'right/bench']);
  assert.deepEqual(PIECES.map((p) => pieceKey(p, ROOMS)), ['studio/desk', 'studio-wall/board', 'library/lamp', 'workshop/bench']);
});

test('a home\'s stories are the ones its pieces carry, then the recipe\'s own', () => {
  const stories = storiesOf({ pieces: PIECES, stories: { 'left/extra': story('Extra'), 'center/desk': story('Desk, again') } });
  assert.deepEqual(Object.keys(stories), ['center/desk', 'center-wall/board', 'right/bench', 'left/extra']);
  assert.equal(stories['center/desk'].title, 'Desk, again');
  assert.deepEqual(storiesOf({}), {});
});

test('the page without 3D gives listed pieces\' stories the same keys as the scene', () => {
  for (const rooms of [undefined, ROOMS]) {
    const plugin = popfoldFallback({ siteName: 'Test', pieces: PIECES, rooms, stories: { 'left/extra': story('Extra') } }) as any;
    assert.deepEqual(plugin.api.pages[0].stories, Object.keys(storiesOf({ pieces: PIECES, rooms, stories: { 'left/extra': story('Extra') } })));
  }
});

test('lateModels(): the models only later rooms need can wait', () => {
  const pieces: PieceSpec[] = [
    { id: 'sofa', room: 'center', kind: 'sofa', at: [0, 0] },
    { id: 'lamp', room: 'center', kind: 'lamp', at: [1, 0] },
    { id: 'lamp', room: 'left', kind: 'lamp', at: [0, 0] },
    { id: 'bed', room: 'right', kind: 'bed', at: [0, 0] },
    { id: 'clock', room: 'left', kind: 'clock', at: [1, 1] },
    { id: 'rug', room: 'left', kind: 'rug', at: [0, 1] },
  ];
  const recipe = { pieces, props: ['sofa', 'lamp', 'bed', 'clock', 'spare'], kinds: { rug: () => null as never } };
  // lamp is in the centre too, so it comes first; rug is built in code; spare is used by no listed piece, so it
  // stays up front (something else may want it)
  assert.deepEqual(lateModels(recipe, ['center']), ['bed', 'clock']);
  assert.deepEqual(lateModels(recipe, ['center', 'left']), ['bed']);
  assert.deepEqual(lateModels(recipe, ['center', 'left', 'right']), []);
  // a model the site says something about (`models`) is still a model, and still waits its turn
  assert.deepEqual(lateModels({ ...recipe, models: { bed: { glow: 0.4 }, clock: { loop: false } } }, ['center']), ['bed', 'clock']);
  // but a name that has a code kind is built in code: it is no model to wait for
  assert.deepEqual(lateModels({ ...recipe, kinds: { ...recipe.kinds, bed: () => null as never } }, ['center']), ['clock']);
});

test('lateModels(): a home that also places pieces in code keeps every model up front', () => {
  const pieces: PieceSpec[] = [{ id: 'bed', room: 'right', kind: 'bed', at: [0, 0] }];
  assert.deepEqual(lateModels({ pieces, props: ['bed'], furnish: () => undefined }, ['center']), []);
  assert.deepEqual(lateModels({ pieces, props: ['bed'], tower: { floors: [{ id: 'a', label: 'A', color: '#fff', build: () => undefined }] } }, ['a']), []);
  assert.deepEqual(lateModels({ props: ['bed'] }, ['center']), [], 'no listed pieces: nothing is known to be late');
});
