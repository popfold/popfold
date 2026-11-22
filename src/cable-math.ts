// Plain numbers for cables that draw themselves in as a floor opens (flow.ts, tower.ts): how far each cable is
// along, from the floor's zone, and how much of a tube that draws. No three.js here, so the tests run in Node.

/** Where in a floor's zone (0 → 1) its cables are drawn: once its pieces are springing in (they start at 0.4, the last ones near 0.65), done just before the beat. */
export const CABLES_FROM = 0.6;
export const CABLES_TO = 0.98;

/**
 * How far one cable is drawn (0 → 1, eased) at zone value v. A floor's cables go in steps: step 0 (the spine's
 * branch) first, then 1, 2 … Cables with the same step draw together; a fractional step (1.3) starts part-way
 * through step 1's turn, for a ripple. `steps` is how many turns the floor has (its highest step + 1).
 */
export function cableReveal(v: number, step: number, steps: number, from = CABLES_FROM, to = CABLES_TO): number {
  const turn = (to - from) / Math.max(1, steps);
  const t = Math.min(1, Math.max(0, (v - (from + step * turn)) / turn));
  return t * t * (3 - 2 * t); // eased: a cable is pulled, then slows as it reaches its port
}

/** How many of a tube's indices to draw to show it `p` of the way along: whole segments, rounded up so the tip is never short. */
export function tubeDrawCount(p: number, tubularSegments: number, radialSegments: number): number {
  if (p <= 0) return 0;
  return Math.min(tubularSegments, Math.ceil(p * tubularSegments)) * radialSegments * 6;
}
