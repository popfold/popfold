// Piece keys and layouts: the keys stories and saved layouts hang on, and what a layout entry does to a piece.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { applyEntry, applyPlaces, collectEditables, entryFor, piece as withId } from '../src/layout.ts';

const piece = (name?: string, at: [number, number, number] = [0, 0, 0]) => {
  const obj = new THREE.Object3D();
  if (name) obj.userData.propName = name;
  obj.position.set(...at);
  return { obj };
};
const room = (name: string, ...items: { obj: THREE.Object3D }[]) => ({ room: name, parent: new THREE.Object3D(), items });

test('keys are <room>/<piece>, numbered from the second of a kind in the order they were added', () => {
  const es = collectEditables([room('center', piece('chair'), piece('desk'), piece('chair'), piece('chair')), room('left', piece('chair'), piece())]);
  assert.deepEqual(es.map((e) => e.key), ['center/chair', 'center/desk', 'center/chair#2', 'center/chair#3', 'left/chair', 'left/piece']);
  assert.equal(es[2].obj.userData.editKey, 'center/chair#2');
  assert.deepEqual([es[4].room, es[4].name], ['left', 'chair']);
});

test('a piece with an id is <room>/<id>, whatever is added around it', () => {
  const lamp = () => withId(piece('lamp').obj, 'reading-lamp');
  const before = collectEditables([room('left', piece('lamp'), { obj: lamp() })]);
  const after = collectEditables([room('left', piece('lamp'), piece('lamp'), { obj: lamp() }, piece('lamp'))]);
  assert.deepEqual(before.map((e) => e.key), ['left/lamp', 'left/reading-lamp']);
  assert.deepEqual(after.map((e) => e.key), ['left/lamp', 'left/lamp#2', 'left/reading-lamp', 'left/lamp#3']);
  assert.deepEqual([after[2].id, after[2].name, after[0].id], ['reading-lamp', 'lamp', undefined]);
  // an id with nothing else to name the piece is its name too; a repeated id is still given a key of its own
  const twice = collectEditables([room('left', { obj: withId(piece().obj, 'vase') }, { obj: withId(piece().obj, 'vase') })]);
  assert.deepEqual(twice.map((e) => [e.key, e.name]), [['left/vase', 'vase'], ['left/vase#2', 'vase']]);
});

test('an entry moves, turns, scales and hides a piece; no entry puts it back', () => {
  const [e] = collectEditables([room('center', piece('desk', [1, 2, 3]))]);
  applyEntry(e, { p: [4, 5, 6], r: [0, 1.5, 0], s: 2, hide: true });
  assert.deepEqual(e.obj.position.toArray(), [4, 5, 6]);
  assert.equal(e.obj.rotation.y, 1.5);
  assert.deepEqual(e.obj.scale.toArray(), [2, 2, 2]);
  assert.equal(e.obj.visible, false);
  applyEntry(e, undefined);
  assert.deepEqual(e.obj.position.toArray(), [1, 2, 3]);
  assert.equal(e.obj.rotation.y, 0);
  assert.deepEqual(e.obj.scale.toArray(), [1, 1, 1]);
  assert.equal(e.obj.visible, true);
});

test('a layout only touches the pieces it names', () => {
  const es = collectEditables([room('center', piece('desk'), piece('chair', [1, 0, 0]))]);
  applyPlaces(es, { 'center/chair': { p: [2, 0, 0] }, 'center/gone': { p: [9, 9, 9] } });
  assert.deepEqual(es[0].obj.position.toArray(), [0, 0, 0]);
  assert.deepEqual(es[1].obj.position.toArray(), [2, 0, 0]);
});

test('entryFor() records only what differs from the default, rounded', () => {
  const [e] = collectEditables([room('center', piece('desk', [1, 2, 3]))]);
  assert.equal(entryFor(e, 1, false), null, 'a piece at its default has no entry');
  e.obj.position.set(1.123456, 2, 3);
  assert.deepEqual(entryFor(e, 1, false), { p: [1.1235, 2, 3] });
  e.obj.rotation.y = 0.5;
  assert.deepEqual(entryFor(e, 1.25, true), { p: [1.1235, 2, 3], r: [0, 0.5, 0], s: 1.25, hide: true });
});

test('what entryFor() writes, applyEntry() reads back to the same placement', () => {
  const [a] = collectEditables([room('center', piece('desk', [1, 2, 3]))]);
  a.obj.position.set(0.5, 2, -1);
  a.obj.rotation.y = -2.3;
  const entry = entryFor(a, 1.5, false)!;
  const [b] = collectEditables([room('center', piece('desk', [1, 2, 3]))]);
  applyEntry(b, entry);
  assert.deepEqual(b.obj.position.toArray(), [0.5, 2, -1]);
  assert.equal(b.obj.rotation.y, -2.3);
  assert.deepEqual(b.obj.scale.toArray(), [1.5, 1.5, 1.5]);
});
