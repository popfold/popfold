import * as THREE from 'three';
import { opening, type PopItem } from './compact';
import { clamp01, easeInOut, type House } from './shell';
import { collectEditables } from './layout';
import * as tex from './textures';
import type { HomeRecipe } from './types';

// The "diorama" shell: one modelled cutaway room (a GLB from tools/blender/room_to_glb.py) instead of the compact.
// Closed, its walls lie flat around the floor like an unfolded box; as the story opens (field c) they swing up,
// and each zone's pieces spring in on their own beat: the centre zone with c, the left zone with L, the right with R.
//
// GLB layout expected: "floor", "wall_back" / "wall_right" (empties on each wall's bottom edge, holding the wall
// and what hangs on it) and "piece_*" empties with glTF extras { zone, piece, wall? }.
//
// Staged: `popfold split-room` cuts such a GLB in two, the room (floor and walls) and its pieces (`pieces`). The
// room shows as soon as it is in, folded flat, and the pieces are grafted onto it, by their parents' names, when
// their file lands; they spring in as the story opens their zones, so a first view needs only the room.

export interface DioramaSpec {
  /** the room GLB, relative to the site */
  url: string;
  /**
   * The room's pieces in a file of their own (`popfold split-room` makes it), relative to the site: the room is
   * shown without waiting for them
   */
  pieces?: string;
  /** metres to scene units (default 0.5: a 12 m room becomes 6 units wide) */
  scale?: number;
  /** which zone the story's centre (c), left (L) and right (R) fields open */
  zones: { center: string; left: string; right: string };
  /** paint materials by name: e.g. { art_tv: () => myCanvasTexture } (screens and posters glow) */
  art?: Record<string, () => THREE.Texture>;
  /** the piece (or pieces) whose light the story's glow field controls */
  lamp?: string | string[];
  /** artwork laid on the floor while the room is folded flat (fades as the walls rise), e.g. a wordmark */
  cover?: () => THREE.Texture;
  /** the model's own colours, changed: a colour for a material, by its name (art keeps its art) */
  paint?: Record<string, string>;
}

/** wall hinge: which axis it turns on and the angle that lays it flat (outward) */
const FOLD: Record<string, { axis: 'x' | 'z'; flat: number }> = {
  wall_back: { axis: 'x', flat: -Math.PI / 2 }, // top falls back (-z)
  wall_right: { axis: 'z', flat: -Math.PI / 2 }, // top falls right (+x)
  wall_left: { axis: 'z', flat: Math.PI / 2 },
  wall_front: { axis: 'x', flat: Math.PI / 2 },
};

export interface Wall { obj: THREE.Object3D; axis: 'x' | 'z'; rest: number; flat: number }

/**
 * Build the room. `pieces`, when given, is its pieces' model on its way: the house is returned at once without
 * them, and its `arriving` settles with their editables once they are grafted on.
 */
export function buildDiorama(model: THREE.Object3D, recipe: HomeRecipe & { diorama: DioramaSpec }, pieces?: Promise<THREE.Object3D | null>): House {
  const spec = recipe.diorama;
  const root = new THREE.Group();
  const room = model;
  const k = spec.scale ?? 0.5;
  room.scale.setScalar(k);
  root.add(room);
  root.updateMatrixWorld(true);

  // centre the floor on the origin
  const floor = room.getObjectByName('floor');
  const box = new THREE.Box3().setFromObject(floor ?? room);
  const mid = box.getCenter(new THREE.Vector3());
  room.position.set(-mid.x, -box.min.y, -mid.z);
  root.updateMatrixWorld(true);
  /** where the guide figure stands: the top of the floor */
  const floorTop = box.max.y - box.min.y;

  // materials: shadows everywhere, colours changed, art painted in, art and lights glow
  const art = new Map<string, THREE.Texture>();
  // a changed colour goes on a copy of the material, one per build: the model is cached, and its clones share
  // their materials, so painting the model's own would carry into every later build
  const painted = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const recolour = (mat: THREE.MeshStandardMaterial) => {
    const colour = spec.paint?.[mat.name];
    if (!colour || spec.art?.[mat.name] || !mat.color) return mat;
    let copy = painted.get(mat);
    if (!copy) { copy = mat.clone(); copy.color.set(colour); painted.set(mat, copy); }
    return copy;
  };
  const paint = (part: THREE.Object3D) => part.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    if (spec.paint) m.material = Array.isArray(m.material) ? m.material.map((x) => recolour(x as THREE.MeshStandardMaterial)) : recolour(m.material as THREE.MeshStandardMaterial);
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
      const paint = spec.art?.[mat.name];
      if (!paint) continue;
      let t = art.get(mat.name);
      if (!t) {
        t = paint();
        t.flipY = false; // glTF UVs
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        art.set(mat.name, t);
      }
      mat.map = t;
      mat.color.set('#FFFFFF');
      mat.emissive.set('#FFFFFF');
      mat.emissiveMap = t;
      mat.emissiveIntensity = 0.9;
      mat.roughness = 0.35;
      mat.metalness = 0;
      mat.needsUpdate = true;
    }
  });
  paint(room);

  // walls that fold
  const walls: Wall[] = [];
  for (const [name, f] of Object.entries(FOLD)) {
    const w = room.getObjectByName(name);
    if (w) walls.push({ obj: w, axis: f.axis, rest: w.rotation[f.axis], flat: f.flat });
  }

  // pieces by zone, each springing in with its zone (filled by takePieces, below)
  const zoneOf = { [spec.zones.center]: 'center', [spec.zones.left]: 'left', [spec.zones.right]: 'right' } as Record<string, 'center' | 'left' | 'right'>;
  const lists: Record<'center' | 'left' | 'right', PopItem[]> = { center: [], left: [], right: [] };

  // the lights whose glow the story controls, one per lamp piece (placed over it once the pieces are in)
  const lampNames = spec.lamp === undefined ? [] : Array.isArray(spec.lamp) ? spec.lamp : [spec.lamp];
  const lamps = lampNames.map(() => {
    const light = new THREE.PointLight('#FFC27A', 0, 9, 1.4);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow(), color: '#FFC27A', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshStandardMaterial());
    bulb.visible = false;
    const spot = new THREE.Group();
    spot.position.set(0, 1.5, 0);
    // the engine sizes the halo for the compact's lamp; a room is seen from closer, so hold it smaller
    const haloHolder = new THREE.Group();
    haloHolder.scale.setScalar(0.35);
    haloHolder.add(halo);
    spot.add(light, haloHolder, bulb);
    root.add(spot);
    return { light, bulb, halo, spot, piece: null as THREE.Object3D | null };
  });

  // number badges just above each zone's furniture
  const zoneTop = (list: PopItem[]) => {
    const b = new THREE.Box3();
    for (const it of list) if (!it.obj.userData.wall) b.expandByObject(it.obj, false);
    if (b.isEmpty()) return new THREE.Vector3(0, 1.5, 0);
    const c = b.getCenter(new THREE.Vector3());
    return root.worldToLocal(new THREE.Vector3(c.x, b.max.y + 0.45, c.z));
  };
  const badgeColors: [string, string][] = [['#FFD66B', '#141B2D'], ['#FF6B4A', '#FFFFFF'], ['#9CC3E6', '#141B2D']];
  const badges = (['center', 'left', 'right'] as const).map((_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.badge(String(i + 1), ...badgeColors[i]), transparent: true, depthTest: false }));
    s.userData.basePos = new THREE.Vector3(0, 1.5, 0);
    s.position.copy(s.userData.basePos);
    s.renderOrder = 10;
    s.visible = false;
    root.add(s);
    return s;
  });

  /** the room's pieces, once they are on it: sorted into their zones, keyed, and the badges and lamp set over them */
  const takePieces = () => {
    const pieces: THREE.Object3D[] = [];
    room.traverse((o) => { if (o.userData.zone && o.name.startsWith('piece_')) pieces.push(o); });
    // floor pieces first, then what hangs on the walls, each zone in its own order
    pieces.sort((a, b) => Number(!!a.userData.wall) - Number(!!b.userData.wall));
    const counts = { center: 0, left: 0, right: 0 };
    for (const p of pieces) {
      const part = zoneOf[p.userData.zone as string] ?? 'center';
      p.userData.propName = p.userData.piece ?? p.name.replace(/^piece_/, '');
      // a custom property "id" on the node is the piece's own id (see piece() in layout.ts)
      if (typeof p.userData.id === 'string') p.userData.pieceId = p.userData.id;
      p.userData.pick = part;
      const delay = Math.min(0.42, counts[part]++ * 0.06);
      lists[part].push({ obj: p, delay, scale: p.scale.clone() });
      p.visible = false;
    }
    root.updateMatrixWorld(true);
    lampNames.forEach((name, i) => {
      const piece = pieces.find((p) => p.userData.propName === name);
      lamps[i].piece = piece ?? null;
      if (piece) lamps[i].spot.position.copy(root.worldToLocal(new THREE.Box3().setFromObject(piece).getCenter(new THREE.Vector3())));
    });
    // badges just above each zone's furniture (measured at full size: pieces wait at scale 0 until they pop)
    (['center', 'left', 'right'] as const).forEach((part, i) => { const pos = zoneTop(lists[part]); badges[i].position.copy(pos); badges[i].userData.basePos = pos.clone(); });
    const found = collectEditables((['center', 'left', 'right'] as const).flatMap((part) => {
      const zone = spec.zones[part];
      return [
        { room: zone, parent: room, items: lists[part].filter((it) => !it.obj.userData.wall).map((it) => ({ obj: it.obj, pop: it })) },
        { room: `${zone}-wall`, parent: room, items: lists[part].filter((it) => it.obj.userData.wall).map((it) => ({ obj: it.obj, pop: it })) },
      ];
    }));
    for (const l of Object.values(lists)) for (const it of l) it.obj.scale.setScalar(0.0001);
    return found;
  };

  /** graft a pieces file onto the room: each piece goes under the part of the same name it hangs from there */
  const graft = (from: THREE.Object3D) => {
    const found: THREE.Object3D[] = [];
    from.traverse((o) => { if (o.name.startsWith('piece_')) found.push(o); });
    for (const p of found) {
      if (found.includes(p.parent!)) continue; // (a piece inside a piece comes with it)
      const onto = p.parent?.name ? room.getObjectByName(p.parent.name) ?? room : room;
      paint(p);
      onto.add(p); // its local place is the same, as its parent's is
    }
  };

  const editables = pieces ? [] : takePieces();
  const arriving = pieces?.then((from) => {
    if (!from) { console.warn(`home "${recipe.id}": its pieces (${spec.pieces}) could not be loaded`); return []; }
    graft(from);
    return takePieces();
  });

  // the cover: a decal just above the floor, sized to it, shown only while folded flat
  let cover: THREE.Mesh | undefined;
  if (spec.cover && floor) {
    const fb = new THREE.Box3().setFromObject(floor);
    const size = fb.getSize(new THREE.Vector3());
    const t = spec.cover();
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cover = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 0.92, size.z * 0.92),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
    cover.rotation.x = -Math.PI / 2;
    cover.position.copy(root.worldToLocal(new THREE.Vector3((fb.min.x + fb.max.x) / 2, fb.max.y + 0.01, (fb.min.z + fb.max.z) / 2)));
    cover.renderOrder = 2;
    root.add(cover);
  }

  room.userData.pick = 'center';
  return {
    root, lamps: lamps.map((l) => ({ light: l.light, bulb: l.bulb, halo: l.halo, shown: () => !!l.piece?.visible && l.piece.scale.x > 0.01 })), badges, ground: () => floorTop,
    // the figure is about 1.65 tall at size 1: a person, in this room's metres
    guideSize: k, spinners: [], mixers: [], pickables: [room], editables, arriving,
    // the walls swing up from flat as the story opens (c), the cover fades as they do, and each zone's pieces
    // spring in on its own field: the centre zone with c, the left with L, the right with R
    update: (cur, f) => {
      const up = easeInOut(clamp01(cur.c / 0.45));
      for (const w of walls) w.obj.rotation[w.axis] = w.rest + w.flat * (1 - up);
      if (cover) {
        const show = 1 - clamp01(cur.c / 0.3);
        (cover.material as THREE.MeshBasicMaterial).opacity = show;
        cover.visible = show > 0.01;
      }
      const centerProps = clamp01((cur.c - 0.5) / 0.5);
      f.pop(lists.center, centerProps);
      f.pop(lists.left, clamp01((cur.L - 0.55) / 0.45));
      f.pop(lists.right, clamp01((cur.R - 0.55) / 0.45));
      return { open: opening(cur.c, f.fold), lit: centerProps };
    },
  };
}
