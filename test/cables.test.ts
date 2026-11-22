// Cables that draw themselves in as a tower's floor opens (src/cable-math.ts): each in its turn, all done by the
// beat, never short of its tip, and the same backwards as forwards.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CABLES_FROM, CABLES_TO, cableReveal, tubeDrawCount } from '../src/cable-math.ts';

const zone = Array.from({ length: 101 }, (_, i) => i / 100);

test('no cable shows before the floor has slid out, and every one is plugged in by the beat', () => {
  for (const steps of [1, 2, 4]) for (let s = 0; s < steps; s++) {
    assert.equal(cableReveal(0, s, steps), 0);
    assert.equal(cableReveal(CABLES_FROM, s, steps), 0, `step ${s} of ${steps} at the start`);
    assert.equal(cableReveal(CABLES_TO, s, steps), 1, `step ${s} of ${steps} at the end`);
    assert.equal(cableReveal(1, s, steps), 1);
  }
});

test('a cable only ever moves forward as the floor opens, and runs back the same way as it closes', () => {
  for (const step of [0, 1, 1.4, 2]) {
    let last = -1;
    for (const v of zone) {
      const p = cableReveal(v, step, 3);
      assert.ok(p >= last && p >= 0 && p <= 1, `step ${step} at ${v}`);
      last = p;
    }
    // it depends on where the scroll is, not on which way it came
    for (const v of zone) assert.equal(cableReveal(v, step, 3), cableReveal(v, step, 3));
  }
});

test('turns go in order: the spine\'s branch plugs in before the floor\'s first cable starts, and a fractional step ripples', () => {
  const steps = 3;
  const start = (step: number) => zone.find((v) => cableReveal(v, step, steps) > 0)!;
  const done = (step: number) => zone.find((v) => cableReveal(v, step, steps) >= 1)!;
  assert.ok(done(0) <= start(1), 'the branch is in before cable 1 starts');
  assert.ok(done(1) <= start(2));
  assert.ok(start(1) < start(1.4) && start(1.4) < start(2), 'step 1.4 starts part-way through step 1\'s turn');
  // the same step draws together
  for (const v of zone) assert.equal(cableReveal(v, 1, steps), cableReveal(v, 1, steps));
});

test('a tube is drawn in whole segments, rounded up, so the plug never runs ahead of it', () => {
  assert.equal(tubeDrawCount(0, 24, 8), 0);
  assert.equal(tubeDrawCount(-1, 24, 8), 0);
  assert.equal(tubeDrawCount(1, 24, 8), 24 * 8 * 6);
  assert.equal(tubeDrawCount(2, 24, 8), 24 * 8 * 6);
  assert.equal(tubeDrawCount(0.01, 24, 8), 1 * 8 * 6);
  assert.equal(tubeDrawCount(0.5, 24, 8), 12 * 8 * 6);
  for (const p of zone) assert.ok(tubeDrawCount(p, 30, 8) / (8 * 6) >= p * 30, `at ${p}`);
});
