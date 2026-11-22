// The story is a list of beats: one per page section, in order. Each beat names its section and holds a keyframe.
// The scroll position blends between neighbouring keyframes.
//
//   c       centre room: 0 closed → 0.45 lid open → 1 furniture in
//   L / R   left / right room: 0 inside → 0.4 slid out (or page open) → 0.6 wall up → 1 furniture in
//   glow    centre lamp glow
//   badges  numbered step badges over the three rooms
//   hero    idle float/wobble of the closed shell
//   av      guide figure: 0 tucked away → 1 out in the house
//   ax / az her position on the floor (house coordinates); wave = waving hello
//   side    where the house sits on wide screens: -1 left, 0 centre, 1 right (text goes opposite)
//   cx..cz / tx..tz   camera position and look-at point
//   z:<id>  any number of named zones (tower floors, …): 0 closed → 0.3 slid out / lit → 1 furniture in

export const FIELDS = ['c', 'L', 'R', 'glow', 'badges', 'hero', 'side', 'av', 'ax', 'az', 'wave', 'cx', 'cy', 'cz', 'tx', 'ty', 'tz'] as const;
export type Field = (typeof FIELDS)[number];
/** The fixed fields plus any number of zone fields named "z:<id>". */
export type State = Record<Field, number> & { [zone: string]: number };

/** Build a keyframe from the room/guide values plus a camera position and look-at point. */
export const keyframe = (s: Omit<Record<Field, number>, 'cx' | 'cy' | 'cz' | 'tx' | 'ty' | 'tz'>, cam: [number, number, number], tgt: [number, number, number],
  zones: Record<string, number> = {}): State => ({
  ...s, cx: cam[0], cy: cam[1], cz: cam[2], tx: tgt[0], ty: tgt[1], tz: tgt[2],
  ...Object.fromEntries(Object.entries(zones).map(([id, v]) => [`z:${id}`, v])),
}) as State;

/** One step of the story: the page section it belongs to, a short name for tools, and what the home does there. */
export interface Beat {
  /** the id of this beat's <section class="stage"> */
  id: string;
  /** a short name, for the studio's stop buttons and for messages */
  name: string;
  key: State;
  /**
   * the home this beat shows, on a page with more than one: the story moves from home to home as it is scrolled
   * (with an effect between them). Left out, the beat shows the home the beat before it showed.
   */
  home?: string;
}

/** Build a beat: the section's id, a short name, then the same values as keyframe(). */
export const beat = (id: string, name: string, s: Parameters<typeof keyframe>[0], cam: [number, number, number], tgt: [number, number, number],
  zones: Record<string, number> = {}): Beat => ({ id, name, key: keyframe(s, cam, tgt, zones) });

/** The fields a beat can set besides its camera, and the value each has when a beat leaves it out. */
export const BEAT_DEFAULTS = { c: 0, L: 0, R: 0, glow: 0, badges: 0, hero: 0, side: 0, av: 0, ax: 0, az: 0.8, wave: 0 } as const;

/** A beat as it is kept in a home file: only what differs from BEAT_DEFAULTS needs saying. */
export interface BeatData {
  /** the id of this beat's <section class="stage"> */
  id: string;
  /** a short name, for the studio's stop buttons and for messages */
  name: string;
  /** where the camera is, and the point it looks at */
  camera: [number, number, number];
  lookAt: [number, number, number];
  /** what the home does: any of c, L, R, glow, badges, hero, side, av, ax, az, wave (see the top of keyframes.ts) */
  set?: Partial<Record<keyof typeof BEAT_DEFAULTS, number>>;
  /** named zones (a tower's floors): 0 closed, 0.3 slid out and lit, 1 furnished */
  zones?: Record<string, number>;
  /** the home this beat shows, on a page with more than one (see Beat) */
  home?: string;
}

/** The beat a home file's entry describes. */
export const beatFromData = (d: BeatData): Beat => ({ ...beat(d.id, d.name, { ...BEAT_DEFAULTS, ...d.set }, d.camera, d.lookAt, d.zones), ...(d.home ? { home: d.home } : {}) });

/** The home each beat shows: its own, or else the one the beat before it showed (null until a beat names one). */
export function beatHomes(beats: { home?: string }[]): (string | null)[] {
  let last: string | null = null;
  return beats.map((b) => (last = b.home ?? last));
}

/** The story a home file tells, ready for startScene() and mountStudio(). Empty if the file has no beats. */
export const beatsOf = (home: { beats?: BeatData[] }): Beat[] => (home.beats ?? []).map(beatFromData);

/** The blend between two beats as the scroll goes from one to the next: still near each, eased in between. */
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Blend keyframes at a fractional stage index. Each stage holds still around its middle. */
export function sample(keys: State[], stage: number, out: State): State {
  const n = keys.length - 1;
  const s = Math.min(n, Math.max(0, stage));
  const i = Math.max(0, Math.min(n - 1, Math.floor(s)));
  const f = n === 0 ? 0 : smooth(0.2, 0.8, s - i);
  const a = keys[i], b = keys[Math.min(n, i + 1)];
  for (const key of FIELDS) out[key] = a[key] + (b[key] - a[key]) * f;
  // zone fields: a zone a keyframe doesn't mention is closed (0) there, and so is one that neither of the two
  // mentions (a zone left over in `out` from a beat further away: a jump back must not leave it open)
  for (const key of new Set([...Object.keys(out), ...Object.keys(a), ...Object.keys(b)])) {
    if (key.startsWith('z:')) out[key] = (a[key] ?? 0) + ((b[key] ?? 0) - (a[key] ?? 0)) * f;
  }
  return out;
}
