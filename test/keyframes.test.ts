// Run with: pnpm test   (Node's own test runner; it reads TypeScript directly)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIELDS, beat, keyframe, sample, type State } from '../src/keyframes.ts';

const rest = { glow: 0, badges: 0, hero: 0, side: 0, av: 0, ax: 0, az: 0, wave: 0 };
const A = keyframe({ c: 0, L: 0, R: 0, ...rest }, [0, 0, 10], [0, 0, 0]);
const B = keyframe({ c: 1, L: 0.5, R: 0, ...rest }, [10, 0, 10], [0, 1, 0], { lab: 1 });
const out = () => ({}) as State;

test('keyframe() spreads the camera and prefixes zones', () => {
  assert.deepEqual([B.cx, B.cy, B.cz, B.tx, B.ty, B.tz], [10, 0, 10, 0, 1, 0]);
  assert.equal(B['z:lab'], 1);
  for (const f of FIELDS) assert.equal(typeof A[f], 'number', f);
});

test('sample() rests on a keyframe at whole stages', () => {
  assert.equal(sample([A, B], 0, out()).c, 0);
  assert.equal(sample([A, B], 1, out()).c, 1);
});

test('sample() holds still for the first and last fifth between two stages', () => {
  assert.equal(sample([A, B], 0.2, out()).c, 0);
  assert.equal(sample([A, B], 0.8, out()).c, 1);
});

test('sample() is halfway in the middle, and eases', () => {
  assert.ok(Math.abs(sample([A, B], 0.5, out()).c - 0.5) < 1e-9);
  const early = sample([A, B], 0.35, out()).c;
  assert.ok(early > 0 && early < 0.25, `eased start, got ${early}`);
});

test('sample() clamps outside the story', () => {
  assert.equal(sample([A, B], -3, out()).c, 0);
  assert.equal(sample([A, B], 99, out()).c, 1);
});

test('a zone a keyframe does not mention is closed there', () => {
  assert.equal(sample([A, B], 0, out())['z:lab'], 0);
  assert.equal(sample([A, B], 1, out())['z:lab'], 1);
  assert.ok(Math.abs(sample([A, B], 0.5, out())['z:lab'] - 0.5) < 1e-9);
});

test('a story of one keyframe does not divide by zero', () => {
  assert.equal(sample([B], 0, out()).c, 1);
  assert.equal(sample([B], 5, out()).L, 0.5);
});

test('beat() is a keyframe with its section and a name', () => {
  const b = beat('lab', 'The lab', { c: 1, L: 0.5, R: 0, ...rest }, [10, 0, 10], [0, 1, 0], { lab: 1 });
  assert.deepEqual([b.id, b.name], ['lab', 'The lab']);
  assert.deepEqual(b.key, B);
});

test('each beat shows its own home, or the one before it showed', async () => {
  const { beatHomes } = await import('../src/keyframes.ts');
  assert.deepEqual(beatHomes([{}, { home: 'toy' }, {}, { home: 'refined' }, {}]), [null, 'toy', 'toy', 'refined', 'refined']);
  assert.deepEqual(beatHomes([{}, {}]), [null, null]);
});

test('a zone neither neighbouring keyframe mentions is shut, even if a beat further away left it open', () => {
  const C = keyframe({ c: 1, L: 1, R: 1, ...rest }, [0, 0, 10], [0, 0, 0], { lab: 1, shop: 1 });
  const o = sample([A, B, C], 2, out());
  assert.equal(o['z:shop'], 1);
  sample([A, B, C], 0.5, o); // a jump back from the last beat
  assert.equal(o['z:shop'], 0);
});
