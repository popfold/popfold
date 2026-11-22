// The pop-up geometry (src/popup-math.ts): pieces stand when a spread lies open, lie flat when it shuts, stay
// between the pages on the way, and leaves turn in order.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverAngle, gableRise, halfOpen, leafAngles, openness, spreadsOf, standAngle, vfoldCrease } from '../src/popup-math.ts';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const steps = Array.from({ length: 41 }, (_, i) => (i / 40) * (Math.PI / 2)); // half-open angles, shut to open

test('a V-fold crease stands upright when open and lies flat (folded over) when shut, for any glue angle', () => {
  for (const deg of [30, 45, 60, 78]) {
    const g = (deg * Math.PI) / 180;
    assert.ok(close(vfoldCrease(g, Math.PI / 2), Math.PI / 2), `${deg}° open`);
    assert.ok(close(vfoldCrease(g, 0), g + Math.PI / 2), `${deg}° shut`);
    // it falls steadily as the spread closes, never past flat
    let last = vfoldCrease(g, 0);
    for (const d of steps) { const k = vfoldCrease(g, d); assert.ok(k <= last + 1e-12 && k >= Math.PI / 2 - 1e-12); last = k; }
  }
});

test('a V-fold half stays square to the crease all the way (a 90° card does not stretch)', () => {
  const g = Math.PI / 4;
  for (const d of steps) {
    const k = vfoldCrease(g, d);
    // crease (cos k, sin k) and glue line (cos g, sin g · cos d) in (spine, bisector) terms: their dot product
    assert.ok(close(Math.cos(k) * Math.cos(g) + Math.sin(k) * Math.sin(g) * Math.cos(d), 0));
  }
});

test('a gable roof keeps its boards\' length: flat ridge height when open, everything in line when shut', () => {
  const d = 0.65, slope = Math.hypot(0.65, 0.5);
  assert.ok(close(gableRise(d, slope, Math.PI / 2), 0.5));
  assert.ok(close(gableRise(d, slope, 0), d + slope));
  for (const delta of steps) {
    const s = gableRise(d, slope, delta);
    // a wall top sits at d along the page and the ridge s further along the bisector: the board between is `slope` long
    const x = d * Math.sin(delta), y = s - d * Math.cos(delta); // the ridge from the wall top, across and along the bisector
    assert.ok(close(Math.hypot(x, y), slope, 1e-9), `delta ${delta}`);
  }
});

test('a stand is upright when open, flat when shut, and never above the plane halfway between the pages', () => {
  assert.equal(standAngle(1, 1, Math.PI / 2), Math.PI / 2);
  assert.ok(close(standAngle(1, 1, 0), 0));
  for (const delta of steps) {
    const phi = standAngle(0.8, 1.2, delta);
    // its top edge, nearest the spine: 0.8 out along the page, sin(phi)·1.2 up from it
    assert.ok(Math.atan2(Math.sin(phi) * 1.2, 0.8) <= delta + 1e-9);
  }
});

test('leaves turn in order, fan apart in their stacks, and make the spreads between them', () => {
  const open0 = leafAngles([0, 0, 0, 0]);
  assert.ok(open0.every((a, j) => j === 0 || a < open0[j - 1]), 'the right stack fans, top leaf highest');
  // a leaf cannot pass the one before it
  const jumbled = leafAngles([0.2, 1, 0, 0]);
  assert.ok(jumbled[1] <= jumbled[0]);
  const spreads = spreadsOf(leafAngles([1, 0.5, 0, 0]));
  assert.equal(spreads.length, 5);
  assert.ok(openness(spreads[0]) < 0.01, 'the first page is shut under the turned leaf');
  assert.ok(close(openness(spreads[1]), 0.5, 0.02) && close(openness(spreads[2]), 0.5, 0.02), 'the turning leaf half closes one page and half opens the next');
  assert.ok(halfOpen(spreads[4]) < 0.01);
  assert.ok(close(spreads[0].left, Math.PI) && spreads[4].right === 0, 'the covers lie flat');
});

test('a closed book\'s cover lies on its stack, holds every leaf back, and opens its first spread as it turns', () => {
  const fan = 0.008;
  // shut: just above the top leaf of the stack on the right; open: lying flat on the left
  assert.ok(Math.abs(coverAngle(0, 4, fan) - fan * 5) < 1e-9);
  assert.ok(Math.abs(coverAngle(1, 4, fan) - Math.PI) < 1e-9);
  assert.ok(coverAngle(0, 4, fan) > leafAngles([0, 0, 0, 0], fan)[0]);
  // no leaf turns further than the cover has opened, whatever its own field says
  const half = leafAngles([1, 1, 0, 0], fan, 0.5);
  const leafOpen = leafAngles([1, 0, 0, 0], fan)[0];
  assert.ok(half[0] < leafOpen && half[0] > leafAngles([0, 0, 0, 0], fan)[0]);
  assert.deepEqual(leafAngles([1, 1, 0, 0], fan, 1), leafAngles([1, 1, 0, 0], fan));
  // the first spread lies between the cover and the first leaf: shut with the cover, open flat once it is open
  assert.ok(openness(spreadsOf(leafAngles([0, 0, 0, 0], fan, 0), coverAngle(0, 4, fan))[0]) < 0.01);
  assert.ok(openness(spreadsOf(leafAngles([0, 0, 0, 0], fan, 1), coverAngle(1, 4, fan))[0]) > 0.97);
  assert.deepEqual(spreadsOf([1, 2]), spreadsOf([1, 2], Math.PI));
});
