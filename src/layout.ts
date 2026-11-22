import type * as THREE from 'three';
import type { PopItem } from './compact';
import type { PieceSpec } from './types';

// Prop layouts: every movable piece in a home has a key, "<room>/<piece>". A piece given an id with piece() is
// "<room>/<id>" whatever is added around it; the rest are named after what they are and numbered from the second
// of a kind in a room ("left/shopping-bag#2"), so adding one earlier in the code renumbers the later ones.
// A compact's rooms are named by its recipe (default center, left, right); a diorama's by its zones; a tower's by its floors. The room code in compact.ts places each piece at its default spot;
// a home's places (in its file) hold the changes made in Popfold Studio, applied on top.

/** One prop's change from its default. Positions and rotations are in its room's own coordinates. */
export interface Place {
  p?: [number, number, number];
  /** rotation in radians (x, y, z) */
  r?: [number, number, number];
  /** uniform scale, relative to the default size */
  s?: number;
  hide?: boolean;
}
export type Places = Record<string, Place>;

export interface Editable {
  key: string;
  /** the room, zone or floor the piece is in; "<room>-wall" for pieces on a wall */
  room: string;
  /** prop file or built-in piece name */
  name: string;
  /** the id the site gave this piece with piece(), if it did */
  id?: string;
  obj: THREE.Object3D;
  /** its pop-in record, if it springs in with its room (the pop animation owns the scale) */
  pop?: PopItem;
  home: { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3; hide: boolean };
  /** a listed piece (one from the recipe's `pieces`): its entry, and how to read its placement back off the object */
  listed?: Listed;
}

/** Where a listed piece stands, in the words of its entry in the home file. */
export type Placement = Pick<PieceSpec, 'at' | 'turn' | 'lift' | 'out' | 'scale' | 'hidden'>;
/** What a shell leaves on a listed piece (obj.userData.listed) so its placement can be written back as data. */
export interface Listed {
  spec: PieceSpec;
  /** the shell's own values for fields the entry leaves out (how far a wall piece stands out, for one) */
  defaults: Partial<Record<'turn' | 'lift' | 'out' | 'scale', number>>;
  /** the piece's placement as it stands now: the reverse of how the shell placed it */
  read: () => Placement;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Give one piece an id of its own: its key is then "<room>/<id>", and stays that when pieces are added or removed
 * around it. Use it for every piece that has a story, and for pieces a room has several of.
 */
export function piece<T extends THREE.Object3D>(obj: T, id: string): T {
  obj.userData.pieceId = id;
  return obj;
}

/** Give every piece a key and remember its default placement. */
export function collectEditables(groups: { room: string; parent: THREE.Object3D; items: { obj: THREE.Object3D; pop?: PopItem }[] }[]) {
  const out: Editable[] = [];
  const seen: Record<string, number> = {};
  for (const g of groups) {
    for (const { obj, pop } of g.items) {
      const id = obj.userData.pieceId as string | undefined;
      const name = (obj.userData.propName as string | undefined) ?? id ?? 'piece';
      const base = `${g.room}/${id ?? name}`;
      const n = (seen[base] = (seen[base] ?? 0) + 1);
      // two pieces with one id in a room is a mistake (popfold check reports it); the number keeps the keys apart
      const key = `${base}${n > 1 ? `#${n}` : ''}`;
      obj.userData.editKey = key;
      out.push({ key, room: g.room, name, id, obj, pop, listed: obj.userData.listed as Listed | undefined, home: { p: obj.position.clone(), r: obj.rotation.clone(), s: (pop?.scale ?? obj.scale).clone(), hide: !!(obj.userData.listed as Listed | undefined)?.spec.hidden } });
    }
  }
  return out;
}

/** Put one piece where its entry says (or back to its default when there is none). */
export function applyEntry(e: Editable, entry: Place | undefined) {
  e.obj.position.copy(e.home.p);
  e.obj.rotation.copy(e.home.r);
  if (entry?.p) e.obj.position.fromArray(entry.p);
  if (entry?.r) e.obj.rotation.set(entry.r[0], entry.r[1], entry.r[2]);
  const s = e.home.s.clone().multiplyScalar(entry?.s ?? 1);
  if (e.pop) e.pop.scale.copy(s); else e.obj.scale.copy(s);
  const hide = entry?.hide ?? e.home.hide; // a listed piece may be hidden by its own entry in the home file
  e.obj.userData.hidden = hide;
  if (!e.pop) e.obj.visible = !hide;
}

export function applyPlaces(editables: Editable[], layout: Places) {
  for (const e of editables) applyEntry(e, layout[e.key]);
}

/** The entry that describes a piece's current placement, or null when it is at its default. */
export function entryFor(e: Editable, scale: number, hide: boolean): Place | null {
  const entry: Place = {};
  if (e.obj.position.distanceTo(e.home.p) > 1e-4) entry.p = e.obj.position.toArray().map((v) => round(v)) as [number, number, number];
  const r = e.obj.rotation, h = e.home.r;
  if (Math.abs(r.x - h.x) + Math.abs(r.y - h.y) + Math.abs(r.z - h.z) > 1e-4) entry.r = [round(r.x), round(r.y), round(r.z)];
  if (Math.abs(scale - 1) > 1e-4) entry.s = round(scale);
  if (hide !== e.home.hide) entry.hide = hide;
  return Object.keys(entry).length ? entry : null;
}

/**
 * What a listed piece's entry in the home file must change to, to say where the piece is now: only the fields
 * that differ from the entry (and from the shell's defaults for fields the entry leaves out). null when the
 * piece is where its entry says, or is not a listed piece. `scale` is the layout's scale on top of the entry's.
 */
export function placementChange(e: Editable, scale = 1): Placement | null {
  if (!e.listed) return null;
  const { spec, defaults, read } = e.listed;
  const now = { ...read(), scale: (spec.scale ?? 1) * scale };
  const near = (a: number, b: number) => Math.abs(a - b) < 5e-4;
  const out = {} as Placement;
  if (!near(now.at[0], spec.at[0]) || !near(now.at[1], spec.at[1])) out.at = [round(now.at[0], 3), round(now.at[1], 3)];
  for (const f of ['turn', 'lift', 'out', 'scale'] as const) {
    const cur = now[f];
    if (cur === undefined) continue;
    const was = spec[f] ?? defaults[f] ?? (f === 'scale' ? 1 : 0);
    if (!near(cur, was)) out[f] = round(cur, 3);
  }
  const hidden = !!e.obj.userData.hidden;
  if (hidden !== !!spec.hidden) out.hidden = hidden;
  return Object.keys(out).length ? out : null;
}
