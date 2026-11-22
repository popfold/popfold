import { hinge as foldHinge, type Hinge } from './fold';
import * as THREE from 'three';
import type { FurnishContext, HomeRecipe, Lamp, PieceSpec } from './types';
import * as tex from './textures';
import * as Praw from './props';
import { collectEditables, piece, type Editable, type Listed } from './layout';
import { kindOf } from './builtins';
import { C, rbox, toy } from './props';
import { clamp01, easeInOut, type FrameContext, type FrameResult, type House } from './shell';

// The code-built pieces, each tagged with its builder's name ("shopping-bag", "rug") so the studio can list it.
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
export const P = new Proxy(Praw, {
  get(t, k: string) {
    const f = (t as Record<string, unknown>)[k];
    if (typeof f !== 'function' || k === 'toy' || k === 'rbox') return f;
    return (...args: unknown[]) => {
      const r = (f as (...a: unknown[]) => unknown)(...args) as { isObject3D?: boolean; group?: THREE.Object3D; userData?: Record<string, unknown> };
      const o = (r?.isObject3D ? r : r?.group) as THREE.Object3D | undefined;
      if (o?.isObject3D) o.userData.propName ??= kebab(k);
      return r;
    };
  },
}) as typeof Praw;

// The "pocket home": a glossy clamshell compact. Layout (units ≈ metres, origin = base bottom centre):
//   base 4×0.7×4, lid hinged on the back edge, and two drawers that slide out sideways
//   with a wall that pops up and furniture that springs in.

export const W = 4;
export const D = 4;
export const BASE_H = 0.7;
export const LID_H = 0.45;
export const DRAWER_OUT = 4.1;
export const DRAWER_FLOOR = 0.55;

export interface PopItem {
  obj: THREE.Object3D; delay: number; scale: THREE.Vector3;
  /** it folds up from lying flat about this hinge instead of springing in (a listed piece's `fold`) */
  fold?: Hinge;
  /** when it joined a home that was already built (performance.now()): it springs in from then, even into an open room */
  since?: number;
}
export interface Room { drawer: THREE.Group; wall: THREE.Group; props: PopItem[] }
/** A generated prop (public/models/props/<name>.glb): its scene plus any animation clips. */
export interface GenAsset { scene: THREE.Object3D; animations: THREE.AnimationClip[] }
export type GenAssets = Record<string, GenAsset | null | undefined>;

export interface Spinner { obj: THREE.Object3D; spin: number; bob: number; baseY: number; baseRot: number }

/** The compact as built: a House with its lid, its centre room's pieces and two drawers. */
export interface Compact extends House {
  lid: THREE.Group;
  center: PopItem[];
  left: Room;
  right: Room;
}

export function pop(list: PopItem[], obj: THREE.Object3D, delay: number) {
  list.push({ obj, delay, scale: obj.scale.clone() });
  obj.visible = false;
  return obj;
}

export function place<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

function floorDecal(w: number, d: number, map: THREE.Texture, y: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshPhysicalMaterial({ map, roughness: 0.5, clearcoat: 0.4 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

/** Take a named part from the Blender model, sit it on its pivot group and swap in the site's materials. */
function part(model: THREE.Object3D, name: string, mats: Record<string, THREE.Material>, clone = false) {
  const src = model.getObjectByName(name);
  if (!src) return null;
  const o = clone ? src.clone() : src;
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.material = mats[(m.material as THREE.Material).name] ?? m.material;
  });
  return o;
}

/** The case models a compact's parts come from: each part's own, or null where that part is built in code. */
export type CaseModels = Record<'base' | 'lid' | 'drawers' | 'walls' | 'clasp' | 'heart', THREE.Object3D | null>;

function buildRoom(side: -1 | 1, floorMap: THREE.Texture, wallMap: THREE.Texture, slabColor: string, models: CaseModels, gold: THREE.Material, drawerWall?: string): Room {
  const drawer = new THREE.Group();
  drawer.visible = false;
  drawer.userData.pick = side < 0 ? 'left' : 'right';

  const slabMat = toy(slabColor, { iridescence: 0.4, iridescenceIOR: 1.3 });
  const mats = { Drawer: slabMat, Gold: gold, WallWhite: toy(drawerWall ?? C.white) };
  let slab: THREE.Object3D | null = models.drawers && part(models.drawers, 'Drawer', mats, true);
  if (!slab) {
    slab = rbox(W - 0.2, 0.4, D - 0.2, 0.1, slabMat);
    slab.position.y = 0.35;
  }
  drawer.add(slab, floorDecal(W - 0.4, D - 0.4, floorMap, DRAWER_FLOOR + 0.004));

  const wall = new THREE.Group();
  wall.position.set(0, DRAWER_FLOOR, -(D - 0.2) / 2 + 0.06);
  let panel: THREE.Object3D | null = models.walls && part(models.walls, 'Wall', mats, true);
  if (!panel) {
    panel = rbox(W - 0.2, 2.2, 0.12, 0.05, mats.WallWhite);
    panel.position.set(0, 1.1, 0.06);
  }
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.5, 2.0), new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.85 }));
  paper.position.set(0, 1.08, 0.125);
  wall.add(panel, paper);
  drawer.add(wall);

  return { drawer, wall, props: [] };
}

/**
 * `models` are the Blender-built cases each part comes from (assets/compact.glb, or another case for a part the
 * look takes from it); a part with none is built from primitives.
 */
export function buildCompact(models: CaseModels, assets: GenAssets, recipe: HomeRecipe, siteBase = import.meta.env.BASE_URL): Compact {
  const root = new THREE.Group();
  if (!recipe.look || !(recipe.furnish || recipe.pieces)) throw new Error(`home "${recipe.id}" needs a look, and pieces or furnish (or a diorama)`);
  const look = recipe.look;

  // Generated props are 1 unit along their longest side, sit on their base and face +Z.
  // Each returns null when its file did not load, so the caller falls back to a code-built piece.
  const mixers: THREE.AnimationMixer[] = [];
  const gen = (name: string, size: number, glow = 0, play = true): THREE.Object3D | null => {
    const a = assets[name];
    if (!a) return null;
    // animated props are used as loaded; still ones are copied so a theme can place the same piece twice
    const scene = a.animations.length ? a.scene : a.scene.clone();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.metalness = 0;
      // each model keeps its own roughness: fabric ~0.85, ceramic ~0.6, generated toy plastic ~0.45
      if (glow) {
        mat.emissive.set('#ffffff');
        mat.emissiveMap = mat.map;
        mat.emissiveIntensity = glow;
      }
    });
    scene.scale.setScalar(size);
    if (a.animations.length && play) {
      const mixer = new THREE.AnimationMixer(scene);
      const action = mixer.clipAction(a.animations[0]);
      action.setLoop(THREE.LoopPingPong, Infinity); // back and forth, so nothing snaps at the loop point
      action.play();
      mixers.push(mixer);
    }
    const g = new THREE.Group();
    g.userData.propName = name;
    g.add(scene);
    return g;
  };

  // ---------- shell ----------
  const shellBase = toy(look.base, { roughness: 0.22, clearcoat: 1, iridescence: 0.55, iridescenceIOR: 1.35, iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 420 });
  const shellLid = toy(look.lid, { roughness: 0.2, clearcoat: 1, iridescence: 0.7, iridescenceIOR: 1.3, iridescenceThicknessMinimum: 100, iridescenceThicknessMaximum: 380 });
  const gold = toy(look.trim ?? C.gold, { metalness: 0.75, roughness: 0.25 });

  // the code-built shell: every big corner radius follows look.corner (1 = soft, 0 = nearly sharp)
  const round = (r: number) => Math.max(0.02, r * Math.min(1, Math.max(0, look.corner ?? 1)));
  const shellMats = { ShellBase: shellBase, ShellLid: shellLid, Gold: gold, Heart: toy(look.heart, { roughness: 0.18, clearcoat: 1 }) };
  const baseModel = models.base && part(models.base, 'Base', shellMats);
  const lidModel = models.lid && part(models.lid, 'Lid', shellMats);
  // the clasp and the heart ride on the lid: parts of their own in Popfold's cases (an older case of a site's own
  // may have them in its lid)
  const claspModel = models.clasp && part(models.clasp, 'Clasp', shellMats, true);
  const heartModel = models.heart && part(models.heart, 'Heart', shellMats, true);
  let base: THREE.Object3D;
  if (baseModel) base = baseModel;
  else {
    base = rbox(W, BASE_H, D, round(0.28), shellBase);
    base.position.y = BASE_H / 2;
  }
  base.userData.pick = 'center';
  root.add(base);
  root.add(floorDecal(W - 0.3, D - 0.3, look.centerFloor(), BASE_H + 0.004));

  if (!baseModel) {
    const trim = rbox(W + 0.06, 0.07, D + 0.06, round(0.3), gold);
    trim.position.y = BASE_H - 0.035;
    root.add(trim);
  }

  // ---------- lid (pivot on the back edge) ----------
  const lid = new THREE.Group();
  lid.position.set(0, BASE_H, -D / 2);
  lid.userData.pick = 'center';
  // a raised heart, if the home asks for one: the case's Heart part, or one modelled into a site's own lid
  let raisedHeart = false;
  if (lidModel) {
    lid.add(lidModel);
    lidModel.traverse((o) => {
      if ((o as THREE.Mesh).material !== shellMats.Heart) return;
      o.visible = recipe.emblem?.heart === true;
      raisedHeart ||= o.visible;
    });
  }
  if (claspModel) lid.add(claspModel);
  if (heartModel && recipe.emblem?.heart === true && !raisedHeart) { lid.add(heartModel); raisedHeart = true; }
  if (!lidModel) {
    const lidShell = rbox(W, LID_H, D, round(0.28), shellLid);
    lidShell.position.set(0, LID_H / 2, D / 2);
    lid.add(lidShell);
  }

  const lidPaper = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, D - 0.3), new THREE.MeshStandardMaterial({ map: look.lidPaper(), roughness: 0.8 }));
  lidPaper.rotation.x = Math.PI / 2; // faces -Y (the inside); its "up" points along +Z, which is world-up when open
  lidPaper.position.set(0, -0.006, D / 2);
  lid.add(lidPaper);

  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), new THREE.MeshStandardMaterial({ map: tex.emblem({ ...recipe.emblem, heart: recipe.emblem?.heart === true && !raisedHeart }), transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.set(0, LID_H + 0.004, D / 2);
  lid.add(emblem);

  if (!lidModel && !claspModel) {
    const clasp = rbox(0.9, 0.26, 0.16, 0.07, gold);
    clasp.position.set(0, LID_H / 2 - 0.05, D + 0.04);
    lid.add(clasp);
  }

  // Wall art for this home: public/art/<recipe.artDir>/<name>.jpg; the drawn fallback shows if the file is missing.
  const art = (name: string, fallback: THREE.Texture) => {
    const t = new THREE.TextureLoader().load(`${siteBase}art/${recipe.artDir ?? recipe.id}/${name}.jpg`, undefined, undefined, () => {
      t.image = fallback.image as HTMLImageElement;
      t.needsUpdate = true;
    });
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };

  root.add(lid);

  const center: PopItem[] = [];
  const y0 = BASE_H, fy = DRAWER_FLOOR;
  const left = buildRoom(-1, look.leftFloor(), look.leftWall(), look.leftSlab, models, gold, look.drawerWall);
  const right = buildRoom(1, look.rightFloor(), look.rightWall(), look.rightSlab, models, gold, look.drawerWall);

  // ---------- the home's own pieces: the recipe's list first, then whatever its furnish() adds in code ----------
  const lamps: Lamp[] = []; // the pieces marked lamp, and any furnish() adds through ctx.setLamp
  const ctx: FurnishContext = {
    recipe, root, lid, center, left, right, y0, fy, gen, place, pop, assets, art,
    setLamp: (l) => { lamps.push(l); },
  };
  const listed: Record<string, number> = { center: 0, left: 0, right: 0 };
  const waiting: PieceSpec[] = []; // listed pieces whose model has not arrived yet (see engine.ts, lazyModels)
  /** Build one listed piece and put it in its room. null when its model did not load. */
  const placeListed = (s: PieceSpec): { obj: THREE.Object3D; parent: THREE.Object3D; pop?: PopItem } | null => {
    const kind = kindOf(recipe, s.kind);
    const model = kind ? undefined : recipe.models?.[s.kind]; // what the site says about this model file
    const made = kind ? kind(s, ctx) : gen(s.kind, s.size ?? 1, model?.glow, model?.loop !== false);
    if (!made) return null; // a model that did not load: the home opens without it
    const obj = made instanceof THREE.Object3D ? made : made.group;
    piece(obj, s.id);
    obj.userData.propName ??= s.kind;
    const side = s.room === 'left' ? left : s.room === 'right' ? right : null;
    const delay = s.delay ?? Math.min(0.4, listed[s.room]++ * 0.06);
    if (s.scale) obj.scale.multiplyScalar(s.scale);
    // each way of placing a piece comes with its reverse (`read`), so the studio can write a moved piece back
    // into the home file in the same words
    const at = obj.position;
    let listedAs: Pick<Listed, 'defaults' | 'read'>;
    if (!s.wall) {
      const floor = side ? fy : y0;
      place(obj, s.at[0], floor + (s.lift ?? 0), s.at[1], s.turn);
      (side ? side.drawer : root).add(pop(side ? side.props : center, obj, delay));
      listedAs = { defaults: {}, read: () => ({ at: [at.x, at.z], lift: at.y - floor, turn: obj.rotation.y }) };
    } else if (side) {
      side.wall.add(pop(side.props, place(obj, s.at[0], s.at[1], s.out ?? 0.14), delay));
      listedAs = { defaults: { out: 0.14 }, read: () => ({ at: [at.x, at.y], out: at.z }) };
    } else {
      // the open lid is the centre room's back wall; it lies flat while shut, so its pieces lie with it
      obj.rotation.x = Math.PI / 2;
      obj.position.set(s.at[0], -(s.out ?? 0.04), s.at[1]);
      lid.add(obj);
      listedAs = { defaults: { out: 0.04 }, read: () => ({ at: [at.x, at.z], out: -at.y }) };
    }
    obj.userData.listed = { spec: s, ...listedAs } satisfies Listed;
    // the site's own touches on a model, now that it is built and in its room
    const fitted = model?.ready?.(obj, { clip: assets[s.kind]?.animations[0], spec: s, ctx });
    if (s.lamp) {
      const asLamp = made instanceof THREE.Object3D ? fitted : made;
      if (!asLamp) throw new Error(`home "${recipe.id}": the piece "${s.id}" is marked as the lamp, so its kind "${s.kind}" must return { group, bulb } (a model's \`ready\` may return it)`);
      lamps.push(asLamp);
    }
    const list = side ? side.props : center;
    const item = list.find((it) => it.obj === obj);
    if (item && s.fold) item.fold = foldHinge(obj, s.fold); // (after ready(): what it adds folds with the piece)
    return { obj, parent: obj.parent!, pop: item };
  };
  for (const s of recipe.pieces ?? []) {
    if (!(s.room in listed)) throw new Error(`home "${recipe.id}": the piece "${s.id}" is in the room "${s.room}"; a compact's rooms are center, left and right`);
    if (!kindOf(recipe, s.kind) && !recipe.props.includes(s.kind)) {
      throw new Error(`home "${recipe.id}": the piece "${s.id}" is a "${s.kind}", which is neither one of the recipe's kinds (${Object.keys(recipe.kinds ?? {}).join(', ') || 'none'}), a built-in one (builtin/…) nor one of its props`);
    }
    // a model that is still on its way (not in `assets` at all, where one that failed is there as null): later
    if (!kindOf(recipe, s.kind) && !(s.kind in assets)) { waiting.push(s); continue; }
    placeListed(s);
  }
  recipe.furnish?.(ctx);
  if (!lamps.length) {
    // no lamp: an invisible stand-in keeps one light in every home, so switching homes never changes their number
    const group = new THREE.Group();
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshStandardMaterial());
    bulb.visible = false;
    group.add(bulb);
    root.add(group);
    lamps.push({ group, bulb });
  }

  // Each lamp's light hangs on the house, not inside the lamp. A light counts only while everything above it is
  // visible, and the lamp is hidden until its room opens: inside it, the number of lights would change at that
  // moment, and three.js builds every material on screen again when that number changes (a long, visible stall).
  // The engine moves it to its anchor each frame (see engine.ts), so it shines from the lamp all the same.
  const lit = lamps.map(({ group, bulb }) => {
    const light = new THREE.PointLight('#FFC66B', 0, 7, 1.6);
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 1.45, 0);
    group.add(anchor);
    root.add(light);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow(), color: '#FFD27A', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    halo.position.set(0, 1.5, 0);
    halo.scale.setScalar(1.3);
    group.add(halo);
    return { light, anchor, bulb, halo };
  });


  root.add(left.drawer, right.drawer);

  // ---------- step badges for "How it works" ----------
  const badgeColors: [string, string][] = look.badges ?? [['#FFD84D', '#1B1630'], ['#E5484D', '#FFFFFF'], ['#2F6BFF', '#FFFFFF']];
  const badgePos = [new THREE.Vector3(0, 3.4, 0.6), new THREE.Vector3(-DRAWER_OUT, 3.0, 0.4), new THREE.Vector3(DRAWER_OUT, 3.0, 0.4)];
  const badges = badgeColors.map(([bg, fg], i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.badge(String(i + 1), bg, fg, look.badgeRing), transparent: true, depthTest: false }));
    s.position.copy(badgePos[i]);
    s.userData.basePos = badgePos[i].clone();
    s.renderOrder = 10;
    s.visible = false;
    root.add(s);
    return s;
  });

  // ---------- shadows + animated bits ----------
  const spinners: Spinner[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = !o.userData.noShadow;
      m.receiveShadow = true;
    }
    if (o.userData.spin || o.userData.bob) spinners.push({ obj: o, spin: o.userData.spin ?? 0, bob: o.userData.bob ?? 0, baseY: o.position.y, baseRot: o.rotation.y });
  });
  lidPaper.castShadow = false;
  emblem.castShadow = false;

  // ---------- movable pieces, keyed per room ----------
  const items = (list: PopItem[], parent: THREE.Object3D) => list.filter((it) => it.obj.parent === parent).map((it) => ({ obj: it.obj, pop: it }));
  const rooms = recipe.rooms ?? { center: 'center', left: 'left', right: 'right' };
  const editables = collectEditables([
    { room: rooms.center, parent: root, items: items(center, root) },
    { room: `${rooms.center}-wall`, parent: lid, items: lid.children.filter((o) => o.userData.propName || o.userData.pieceId).map((obj) => ({ obj })) },
    { room: rooms.left, parent: left.drawer, items: items(left.props, left.drawer) },
    { room: `${rooms.left}-wall`, parent: left.wall, items: items(left.props, left.wall) },
    { room: rooms.right, parent: right.drawer, items: items(right.props, right.drawer) },
    { room: `${rooms.right}-wall`, parent: right.wall, items: items(right.props, right.wall) },
  ]);

  /** Place a listed piece whose model has arrived since the home was built, ready for layouts and stories. */
  const addLate = (s: PieceSpec): Editable | null => {
    const placed = placeListed(s);
    if (!placed) return null;
    placed.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = !o.userData.noShadow; m.receiveShadow = true; }
      if (o.userData.spin || o.userData.bob) spinners.push({ obj: o, spin: o.userData.spin ?? 0, bob: o.userData.bob ?? 0, baseY: o.position.y, baseRot: o.rotation.y });
    });
    const room = `${rooms[s.room as 'center' | 'left' | 'right']}${s.wall ? '-wall' : ''}`;
    return collectEditables([{ room, parent: placed.parent, items: [{ obj: placed.obj, pop: placed.pop }] }])[0];
  };

  return {
    root, lid, center, left, right, lamps: lit, badges,
    // the guide stands on the centre floor, a little lower on a drawer's (past the case's edge, W / 2)
    ground: (x) => 0.7 - 0.146 * clamp01((Math.abs(x) - (W / 2 - 0.05)) / 0.3), spinners, mixers,
    pickables: [base, lid, left.drawer, right.drawer], editables,
    late: { specs: waiting, add: addLate },
    update: (cur, f) => compactFrame({ lid, center, left, right }, cur, f),
  };
}

// Book fold: each side room is a page hinged next to the centre room. Closed, both pages lie face down on
// top of the shut lid, the right page above the left; the hinge heights stack them without touching.
const PAGE_HINGE_X = 2.1;
const PAGE_HINGE_Y = { left: 0.87, right: 1.08 };
const hinge = new THREE.Vector3();

/** How far the home is open, from the story's c: the lid's opening (the walls' rise in a diorama). */
export function opening(c: number, fold: 'compact' | 'book') {
  return easeInOut(fold === 'book' ? clamp01((c - 0.3) / 0.3) : clamp01(c / 0.45));
}

/** One frame of the compact: the lid opens with c, each drawer slides out and fills with L or R. */
function compactFrame(h: Pick<Compact, 'lid' | 'center' | 'left' | 'right'>, cur: Record<string, number>, f: FrameContext): FrameResult {
  // book: the top (right) page turns first, then the left, then the centre wall rises once they are clear
  const book = f.fold === 'book';
  const pageR = book ? clamp01(cur.c / 0.28) : 1;
  const pageL = book ? clamp01((cur.c - 0.1) / 0.28) : 1;
  const lidOpen = opening(cur.c, f.fold);
  h.lid.rotation.x = -lidOpen * THREE.MathUtils.degToRad(102);
  const centerProps = clamp01((cur.c - 0.5) / 0.5);
  f.pop(h.center, centerProps);
  room(h.left, -1, cur.L, pageL, f);
  room(h.right, 1, cur.R, pageR, f);
  return { open: lidOpen, lit: centerProps };
}

function room(r: Room, sideSign: -1 | 1, value: number, page: number, f: FrameContext) {
  const slide = clamp01(value / 0.4);
  const wall = clamp01((value - 0.4) / 0.2);
  const props = clamp01((value - 0.55) / 0.45);
  if (f.fold === 'book') {
    // the page opens with the cover (page: 0 folded over the centre, 1 flat); the room still pops up on its own beat
    const a = sideSign * Math.PI * (1 - easeInOut(page)); // right page turns anticlockwise onto the centre, left clockwise
    hinge.set(sideSign * PAGE_HINGE_X, sideSign < 0 ? PAGE_HINGE_Y.left : PAGE_HINGE_Y.right, 0);
    const dx = sideSign * DRAWER_OUT - hinge.x, dy = -hinge.y;
    r.drawer.visible = true;
    r.drawer.position.set(hinge.x + dx * Math.cos(a) - dy * Math.sin(a), hinge.y + dx * Math.sin(a) + dy * Math.cos(a), 0);
    r.drawer.rotation.z = a;
  } else {
    r.drawer.visible = slide > 0.002;
    r.drawer.position.set(sideSign * DRAWER_OUT * easeInOut(slide), 0, 0);
    r.drawer.rotation.z = 0;
  }
  r.wall.rotation.x = (1 - easeInOut(wall)) * (Math.PI / 2);
  f.pop(r.props, props);
}
