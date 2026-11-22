// The studio's Look for a home made in code: what it shows of the recipe, how a change is made to the recipe, and
// the changes as code to put back into it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookAsCode, lookOfRecipe, withLook } from '../src/studio/look.ts';
import type { HomeRecipe } from '../src/types.ts';

const surface = () => { throw new Error('not drawn in a test'); };
const compact = { id: 'c', name: 'C', props: [], look: { base: '#111111', lid: '#222222', heart: '#333333', leftSlab: '#444444', rightSlab: '#555555', centerFloor: surface, lidPaper: surface, leftFloor: surface, leftWall: surface, rightFloor: surface, rightWall: surface }, emblem: { title: 'T', heart: false } } as unknown as HomeRecipe;
const tower = { id: 't', name: 'T', props: [], tower: { floors: [{ id: 'a', label: 'A', color: '#aaaaaa' }, { id: 'b', label: 'B', color: '#bbbbbb' }], wall: '#010101', spine: { color: '#020202' } } } as unknown as HomeRecipe;

test('a home made in code shows its plain colours, emblem and a tower\'s floors and building', () => {
  assert.deepEqual(lookOfRecipe(compact), { look: { base: '#111111', lid: '#222222', heart: '#333333', leftSlab: '#444444', rightSlab: '#555555' }, emblem: { title: 'T', heart: false } });
  assert.deepEqual(lookOfRecipe(tower), { floors: [{ id: 'a', label: 'A', color: '#aaaaaa' }, { id: 'b', label: 'B', color: '#bbbbbb' }], tower: { wall: '#010101', spine: '#020202' } });
});

test('a Look change makes a new recipe, and leaves the one it came from alone', () => {
  const c = withLook(compact, { look: { base: '#ff0000' }, emblem: { title: 'New' } });
  assert.equal(c.look?.base, '#ff0000');
  assert.equal(c.look?.centerFloor, surface); // (a surface drawn in code stays)
  assert.deepEqual(c.emblem, { title: 'New', heart: false });
  assert.equal(compact.look?.base, '#111111');
  const t = withLook(tower, { floors: [{ id: 'b', color: '#00ff00' }], tower: { slab: '#030303', spine: null } });
  assert.deepEqual(t.tower?.floors.map((f) => f.color), ['#aaaaaa', '#00ff00']);
  assert.equal(t.tower?.slab, '#030303');
  assert.equal(t.tower?.spine, undefined);
  assert.equal(tower.tower?.spine?.color, '#020202');
});

test('the changes tried on a home made in code are written as code for its recipe', () => {
  const code = lookAsCode('c', { look: { base: '#ff0000' }, emblem: { title: 'New' }, floors: [{ id: 'b', color: '#00ff00' }], tower: { spine: null } });
  assert.match(code, /look: \{ \.\.\.look, base: "#ff0000" \},/);
  assert.match(code, /emblem: \{ title: "New" \},/);
  assert.match(code, /the floor "b": color: "#00ff00"/);
  assert.match(code, /tower: no spine/);
});

test('a diorama made in code shows its paint, and a change paints it or gives a material its colour back', () => {
  const room = { id: 'd', name: 'D', props: [], diorama: { url: 'room.glb', zones: { center: 'a', left: 'b', right: 'c' }, paint: { wall: '#111111' } } } as unknown as HomeRecipe;
  assert.deepEqual(lookOfRecipe(room), { diorama: { paint: { wall: '#111111' } } });
  const next = withLook(room, { paint: { wall: null, floor: '#222222' } });
  assert.deepEqual(next.diorama?.paint, { floor: '#222222' });
  assert.match(lookAsCode('d', { paint: { wall: null, floor: '#222222' } }), /diorama\.paint: wall: the model's own, floor: "#222222"/);
});
