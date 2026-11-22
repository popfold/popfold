// Cross-stitch from a picture (src/stitch.ts, stitchGrid): the cloth shows where the picture is cloth, every
// stitched cell is sewn exactly once each way, a thread is finished before the next starts, and the same picture
// always gives the same grid.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stitchGrid } from '../src/stitch.ts';

// a 24 × 16 picture on linen: a red square, a green bar, and a grey shadow in the bottom-left corner
const W = 24, H = 16;
function picture() {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = [226, 219, 206];
    if (x >= 6 && x < 12 && y >= 4 && y < 10) c = [168, 32, 40];
    else if (x >= 14 && x < 20 && y >= 6 && y < 8) c = [52, 104, 64];
    else if (x < 3 && y > H - 4) c = [170, 160, 150];
    px.set([...c, 255], (y * W + x) * 4);
  }
  return px;
}

test('the cloth, and a pale shadow joined to its edge, are left unsewn', () => {
  const g = stitchGrid(picture(), W, H, 5);
  assert.equal(g.cells[0], -1, 'a corner of plain linen');
  assert.equal(g.cells[(H - 1) * W + 1], -1, 'the shadow in the corner');
  assert.ok(g.cells[6 * W + 8] >= 0, 'the red square is sewn');
  assert.ok(g.cells[7 * W + 15] >= 0, 'the green bar is sewn');
});

test('every sewn cell has its / and its \\ exactly once, and nothing else is sewn', () => {
  const g = stitchGrid(picture(), W, H, 5);
  const seen = new Map<number, number>();
  for (const v of g.legs) seen.set(v, (seen.get(v) ?? 0) + 1);
  let sewn = 0;
  for (let i = 0; i < W * H; i++) {
    if (g.cells[i] < 0) { assert.ok(!seen.has(i * 2) && !seen.has(i * 2 + 1)); continue; }
    sewn++;
    assert.equal(seen.get(i * 2), 1); assert.equal(seen.get(i * 2 + 1), 1);
  }
  assert.equal(g.legs.length, sewn * 2);
});

test('one thread is finished before the next, reds first; in a row every / comes before its \\', () => {
  const g = stitchGrid(picture(), W, H, 5);
  const threadOf = (v: number) => g.cells[v >> 1];
  const order: number[] = [];
  for (const v of g.legs) if (order[order.length - 1] !== threadOf(v)) order.push(threadOf(v));
  assert.equal(new Set(order).size, order.length, 'no thread is taken up twice');
  assert.equal(threadOf(g.legs[0]), g.cells[6 * W + 8], 'the red is sewn first');
  const at = new Map<number, number>(); g.legs.forEach((v, j) => at.set(v, j));
  for (let i = 0; i < W * H; i++) if (g.cells[i] >= 0) assert.ok(at.get(i * 2)! < at.get(i * 2 + 1)!);
});

test('the same picture gives the same grid', () => {
  const a = stitchGrid(picture(), W, H, 5), b = stitchGrid(picture(), W, H, 5);
  assert.deepEqual([...a.cells], [...b.cells]);
  assert.deepEqual([...a.legs], [...b.legs]);
  assert.deepEqual(a.threads, b.threads);
});
