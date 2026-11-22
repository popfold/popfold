// The geometry of paper pop-ups, as plain numbers (no 3D code, so it can be tested on its own).
//
// A spread is two pages hinged on the spine. Seen end-on (looking along the spine), each page is a line from the
// spine at an angle: 0 is a page lying flat to the right, π one lying flat to the left. A spread lying open is
// { left: π, right: 0 }; closed, the two angles meet. Everything a pop-up does follows from those two angles:
//   δ  half the angle between the pages (π/2 open flat, 0 shut)
//   μ  the bisector between them (π/2 open flat: straight up)
// A piece stays between the two pages at every angle, so it folds flat as they close and never goes through one.

export interface SpreadAngles {
  /** the left page's angle about the spine (π: lying open to the left) */
  left: number;
  /** the right page's angle about the spine (0: lying open to the right) */
  right: number;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Half the angle between a spread's pages: π/2 lying open flat, 0 shut. */
export const halfOpen = (s: SpreadAngles) => Math.max(0, (s.left - s.right) / 2);
/** The direction halfway between a spread's pages (π/2, straight up, when it lies open). */
export const bisector = (s: SpreadAngles) => (s.left + s.right) / 2;
/** How open a spread is, 0 shut to 1 lying flat. */
export const openness = (s: SpreadAngles) => clamp(halfOpen(s) / (Math.PI / 2), 0, 1);

/**
 * A V-fold: a card folded in half along a crease, its two halves glued to the two pages along lines that leave
 * the spine at `gamma` to it. The halves are square to the crease (a 90° card). Returns the crease's angle from
 * the spine, in the plane halfway between the pages: π/2 (upright) when the spread lies open, γ + π/2 (lying
 * flat along the pages, folded on itself) when it is shut. `delta` is the spread's half-open angle.
 */
export function vfoldCrease(gamma: number, delta: number): number {
  const a = Math.cos(gamma), b = Math.sin(gamma) * Math.cos(delta);
  // the crease c = cos κ·spine + sin κ·bisector must stay square to each glue line g: c·g = a cos κ + b sin κ = 0
  return Math.atan2(b, a) + Math.PI / 2;
}

/**
 * A box fold across the gutter: two walls stand on the pages `d` from the spine, kept parallel to the plane
 * halfway between the pages, and a roof of two boards, each `slope` long, meets over the gutter. Returns how far
 * the ridge stands above the walls' tops (along the bisector). Lying open the ridge is sqrt(slope² - d²) up; as
 * the spread shuts the walls lean together and the ridge rises, until all of it lies flat (d + slope).
 * A flat top (slope = d) creases upwards into a ridge as it closes.
 */
export function gableRise(d: number, slope: number, delta: number): number {
  const s = Math.sin(delta), c = Math.cos(delta);
  return d * c + Math.sqrt(Math.max(0, slope * slope - d * d * s * s));
}

/**
 * A stand: a card hinged across its page, `inner` from the spine at its nearest, `height` tall. It leans back from
 * upright just as much as it must to stay under the plane halfway between the pages, and lies flat when they shut.
 * Returns its angle from its page (π/2 upright).
 */
export function standAngle(inner: number, height: number, delta: number): number {
  if (delta >= Math.PI / 2 - 1e-6) return Math.PI / 2;
  const room = Math.max(0.02, inner) * Math.tan(Math.max(0, delta)) / Math.max(1e-6, height);
  return room >= 1 ? Math.PI / 2 : Math.asin(room);
}

/**
 * The angle of each leaf of a book about its spine, from how far each has been turned (0 lying on the right, 1
 * turned over onto the left). Leaves turn in order, so one never passes the leaf before it; lying in a stack they
 * fan very slightly apart (`fan` radians between neighbours) so that each spread has room for its folded pieces.
 * `cover` is how far a book that starts shut has had its front cover opened (1: open, the default): no leaf turns
 * further than the cover has.
 */
export function leafAngles(turns: number[], fan = 0.008, cover = 1): number[] {
  const n = turns.length;
  let before = clamp(cover, 0, 1);
  return turns.map((t, j) => {
    const turn = clamp(Math.min(t, before), 0, 1);
    before = turn;
    const right = fan * (n - j), left = Math.PI - fan * (j + 1);
    return right + (left - right) * turn;
  });
}

/**
 * The front cover's angle about the spine, from how far it has been opened (0 shut, lying on top of the `leaves`
 * stacked on the right; 1 lying open on the left).
 */
export function coverAngle(open: number, leaves: number, fan = 0.008): number {
  const shut = fan * (leaves + 1);
  return shut + (Math.PI - shut) * clamp(open, 0, 1);
}

/**
 * The spreads of a book from its leaves' angles: spread k lies between leaf k-1 (or the front cover, at `cover`:
 * π lying open) and leaf k (or the back cover).
 */
export function spreadsOf(leaves: number[], cover = Math.PI): SpreadAngles[] {
  return Array.from({ length: leaves.length + 1 }, (_, k) => ({ left: k === 0 ? cover : leaves[k - 1], right: k === leaves.length ? 0 : leaves[k] }));
}
