import * as THREE from 'three';
import { opening, type GenAssets, type PopItem } from './compact';
import { clamp01, type House } from './shell';
import { place } from './compact';
import { Flow, type FlowOptions } from './flow';
import { cableReveal } from './cable-math';
import { hinge } from './fold';
import { collectEditables, piece, type Listed } from './layout';
import { kindOf } from './builtins';
import type { HomeRecipe, PieceSpec, PropStory } from './types';

// The "tower" shell: a cutaway building of stacked floors for a long, vertical story. Each floor is a zone
// (story field "z:<floor id>"): closed, it sits back inside the building and dark; as its zone opens it slides
// forward and lights up (0 → 0.3), then its pieces spring in (0.4 → 1). A glass shaft on the right holds an
// elevator car that rides to whichever floor is open, and an optional pipeline runs down beside it with a
// branch into every floor.

export interface FloorContext {
  /** the floor's interior: origin at the centre of the floor, y = 0 on the floor surface */
  group: THREE.Group;
  width: number;
  depth: number;
  height: number;
  /** the floor's neon colour */
  color: string;
  /** register a piece to spring in with the floor (delay 0..0.4 into the pop-in); name it for layouts and stories */
  pop: (obj: THREE.Object3D, name: string, delay?: number) => THREE.Object3D;
  place: typeof place;
  /**
   * a flow pipe inside the floor that lights with it. In a tower with `cables`, it is a cable drawn in as the
   * floor opens, after the spine's branch, in the order they are added (or by `step`), with the tower's plug on it
   */
  flow: (points: THREE.Vector3[], o?: FlowOptions) => Flow;
  /** where the spine's branch enters this floor (default: the right edge, waist height); onPlug: the branch plugs in (true) or out */
  port: (p: THREE.Vector3, onPlug?: (plugged: boolean) => void) => void;
  /**
   * a prop GLB from the recipe's props list, scaled so its longest side = size, or null if it didn't load.
   * tint recolours materials by name prefix, e.g. { led_: '#FF4FD8' } (glowing) or { Chair: '#3A2F5A' };
   * clip names an animation to loop (e.g. 'Idle'; default: none, or the only clip there is);
   * fit measures the model at load instead of assuming it was normalised (for animated files used as downloaded)
   */
  gen: (name: string, size: number, o?: { tint?: Record<string, string>; clip?: string; fit?: boolean }) => THREE.Object3D | null;
}

export interface FloorSpec {
  id: string;
  /** the neon sign on the floor's back wall */
  label: string;
  color: string;
  height?: number;
  /** places pieces in code, after the recipe's listed pieces for this floor; for what a list cannot say (pipes, a moved port) */
  build?: (ctx: FloorContext) => void;
}

export interface TowerSpec {
  floors: FloorSpec[];
  /** floor size (default 6 × 4) and storey height (default 2.4) */
  width?: number;
  depth?: number;
  floorHeight?: number;
  /** wall and slab colours */
  wall?: string;
  slab?: string;
  /** the pipeline beside the shaft: colour; branches go into every floor */
  spine?: { color: string };
  /**
   * the floors' pipes are cables, drawn in as each floor opens and pulled back as it closes: the spine's branch
   * first, then the floor's own in turn, each carrying packets once it is plugged in. Closed floors show none.
   * plug: a prop (from the recipe's props) riding each cable's tip, `size` long (default 0.12), its materials named
   * by `tint` (a prefix) taking the cable's colour. Left out, the pipes are always there, as before.
   */
  cables?: { plug?: string; size?: number; tint?: string };
  elevator?: boolean;
  /** stories by piece key "<floor id>/<piece>" (the recipe's stories also work) */
  stories?: Record<string, PropStory>;
}

export interface TowerZone { id: string; items: PopItem[]; update: (v: number, time: number) => void }

/** the sign on a floor's back wall: label in neon on a dark plate */
function signTexture(label: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,8,18,0.0)'; g.fillRect(0, 0, c.width, c.height);
  g.font = '800 104px "Bricolage Grotesque Variable", "Arial Black", sans-serif';
  g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 36; g.fillStyle = color;
  g.fillText(label, 24, c.height / 2);
  g.shadowBlur = 12; g.fillText(label, 24, c.height / 2);
  g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(label, 24, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTower(recipe: HomeRecipe & { tower: TowerSpec }, assets: GenAssets = {}): House & { zones: TowerZone[] } {
  const spec = recipe.tower;
  const W = spec.width ?? 6, D = spec.depth ?? 4, H = spec.floorHeight ?? 2.4;
  const root = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: spec.wall ?? '#1A1830', roughness: 0.85 });
  const slabMat = new THREE.MeshStandardMaterial({ color: spec.slab ?? '#24223D', roughness: 0.7 });
  const shaftX = W / 2 + 0.75;

  // floors from the top down; the ground floor's slab sits at y = 0
  const heights = spec.floors.map((f) => f.height ?? H);
  const total = heights.reduce((a, b) => a + b, 0);
  let top = total;
  const zones: TowerZone[] = [];
  const mixers: THREE.AnimationMixer[] = [];
  const gen: FloorContext['gen'] = (name, size, o = {}) => {
    const a = assets[name];
    if (!a) return null;
    const scene = a.animations.length ? a.scene : a.scene.clone();
    scene.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
      mesh.material = mats.map((mat) => {
        const hit = Object.entries(o.tint ?? {}).find(([prefix]) => mat.name.startsWith(prefix));
        if (!hit) return mat;
        const c = mat.clone();
        if (c.emissive && c.emissiveIntensity > 0 && (c.emissive.r + c.emissive.g + c.emissive.b) > 0) c.emissive.set(hit[1]);
        else c.color.set(hit[1]);
        return c;
      }) as unknown as THREE.Material;
      if (mats.length === 1) mesh.material = (mesh.material as unknown as THREE.Material[])[0];
      mesh.castShadow = true; mesh.receiveShadow = true;
    });
    if (o.fit) {
      // size it from its own bounds: longest side = size, base centre on the origin
      scene.scale.setScalar(1); scene.position.set(0, 0, 0); scene.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(scene, true);
      const dims = b.getSize(new THREE.Vector3());
      const k = size / Math.max(dims.x, dims.y, dims.z, 1e-6);
      scene.scale.setScalar(k);
      scene.position.set(-(b.min.x + b.max.x) / 2 * k, -b.min.y * k, -(b.min.z + b.max.z) / 2 * k);
    } else scene.scale.setScalar(size);
    const clip = o.clip ? a.animations.find((c) => c.name.endsWith(o.clip!)) : a.animations.length === 1 ? a.animations[0] : undefined;
    if (clip) { const mixer = new THREE.AnimationMixer(scene); mixer.clipAction(clip).play(); mixers.push(mixer); }
    const g = new THREE.Group();
    g.add(scene);
    return g;
  };
  const flows: Flow[] = [];
  const editGroups: Parameters<typeof collectEditables>[0] = [];
  const floorY: Record<string, number> = {};
  /** a floor's pipes, and with `cables` the turn each is drawn in */
  const branchFlows: { flow: Flow; id: string; step: number }[] = [];
  const cables = spec.cables;
  /** a cable's plug: the tower's plug prop, its tinted materials in the cable's colour (none if it did not load) */
  const plugFor = (color: string) =>
    (cables?.plug && gen(cables.plug, cables.size ?? 0.12, cables.tint ? { tint: { [cables.tint]: color } } : {})) || undefined;
  const waiting: PieceSpec[] = []; // listed pieces whose model has not arrived yet (see engine.ts, lazyModels)
  const placers: Record<string, (s: PieceSpec) => { obj: THREE.Object3D; parent: THREE.Object3D; pop: PopItem } | null> = {};

  spec.floors.forEach((f, i) => {
    const h = heights[i];
    const y = top - h;
    top = y;
    floorY[f.id] = y;
    const color = new THREE.Color(f.color);

    // the storey: slab, back wall, left wall; the front and right are cut away
    const storey = new THREE.Group();
    storey.position.y = y;
    storey.userData.zoneId = f.id;
    root.add(storey);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), slabMat);
    slab.position.y = -0.1;
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, h, 0.12), wallMat);
    back.position.set(0, h / 2 - 0.2, -D / 2 - 0.06);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, D), wallMat);
    side.position.set(-W / 2 - 0.06, h / 2 - 0.2, 0);
    // neon edge along the slab's front and the wall tops
    const edgeMat = new THREE.MeshStandardMaterial({ color: '#0B0B14', emissive: color, emissiveIntensity: 0.3 });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.05, 0.05), edgeMat);
    edge.position.set(0, 0.0, D / 2);
    const edgeTop = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, 0.05), edgeMat);
    edgeTop.position.set(0, h - 0.22, -D / 2 + 0.02);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.49), new THREE.MeshBasicMaterial({ map: signTexture(f.label, f.color), transparent: true, toneMapped: false }));
    sign.position.set(-W / 2 + 1.45, h - 0.47, -D / 2 + 0.015);
    const light = new THREE.PointLight(color, 0, 6, 1.6);
    light.position.set(0, h - 0.6, 0.3);
    storey.add(slab, back, side, edge, edgeTop, sign, light);
    for (const m of [slab, back, side]) { m.receiveShadow = true; m.castShadow = true; }

    // the floor's own pieces
    const group = new THREE.Group();
    storey.add(group);
    const items: PopItem[] = [];
    let port = new THREE.Vector3(W / 2 - 0.1, 0.9, 0);
    let portPlug: ((plugged: boolean) => void) | undefined;
    const ctx: FloorContext = {
      group, width: W, depth: D, height: h, color: f.color, place,
      pop: (obj, name, delay) => {
        obj.userData.propName = name;
        obj.userData.pick = 'center';
        items.push({ obj, delay: delay ?? Math.min(0.4, items.length * 0.06), scale: obj.scale.clone() });
        obj.visible = false;
        if (!obj.parent) group.add(obj);
        return obj;
      },
      flow: (points, o) => {
        const color = o?.color ?? f.color;
        // a cable comes after the spine's branch (step 0), in the order the floor adds them
        const step = o?.step ?? 1 + branchFlows.filter((b) => b.id === f.id).length;
        const fl = new Flow(points, cables ? { color, reveal: true, plug: plugFor(color), ...o } : { color, ...o });
        group.add(fl.group);
        branchFlows.push({ flow: fl, id: f.id, step });
        return fl;
      },
      port: (p, onPlug) => { port = p.clone(); portPlug = onPlug; },
      gen,
    };
    /** Build one listed piece and put it on this floor. null when its model did not load. */
    const placeOnFloor = (s: PieceSpec) => {
      const kind = kindOf(recipe, s.kind);
      const model = kind ? undefined : recipe.models?.[s.kind]; // what the site says about this model file
      const made = kind ? kind(s, ctx) : gen(s.kind, s.size ?? 1, { tint: model?.tint, clip: model?.clip, fit: model?.fit });
      if (!made) return null; // a model that did not load: the floor opens without it
      const obj = made instanceof THREE.Object3D ? made : made.group;
      piece(obj, s.id);
      if (s.scale) obj.scale.multiplyScalar(s.scale);
      const at = obj.position;
      if (s.wall) {
        // the floor's back wall; the piece is keyed "<floor>-wall/<id>", as wall pieces are in a compact
        obj.position.set(s.at[0], s.at[1], -D / 2 + (s.out ?? 0.06));
        obj.userData.onWall = true;
        obj.userData.listed = { spec: s, defaults: { out: 0.06 }, read: () => ({ at: [at.x, at.y], out: at.z + D / 2 }) } satisfies Listed;
      } else {
        place(obj, s.at[0], s.lift ?? 0, s.at[1], s.turn);
        obj.userData.listed = { spec: s, defaults: {}, read: () => ({ at: [at.x, at.z], lift: at.y, turn: obj.rotation.y }) } satisfies Listed;
      }
      ctx.pop(obj, (obj.userData.propName as string | undefined) ?? s.kind, s.delay);
      model?.ready?.(obj, { clip: assets[s.kind]?.animations[0], spec: s, ctx }); // the site's own touches on a model
      const item = items[items.length - 1];
      if (s.fold) item.fold = hinge(obj, s.fold); // (after ready(): what it adds folds with the piece)
      return { obj, parent: group as THREE.Object3D, pop: item };
    };
    placers[f.id] = placeOnFloor;
    // the recipe's listed pieces for this floor, then whatever the floor's own build() adds in code
    for (const s of (recipe.pieces ?? []).filter((p) => p.room === f.id)) {
      if (!kindOf(recipe, s.kind) && !recipe.props.includes(s.kind)) {
        throw new Error(`home "${recipe.id}": the piece "${s.id}" is a "${s.kind}", which is neither one of the recipe's kinds (${Object.keys(recipe.kinds ?? {}).join(', ') || 'none'}), a built-in one (builtin/…) nor one of its props`);
      }
      // a model that is still on its way (not in `assets` at all, where one that failed is there as null): later
      if (!kindOf(recipe, s.kind) && !(s.kind in assets)) { waiting.push(s); continue; }
      placeOnFloor(s);
    }
    f.build?.(ctx);
    group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) { m.castShadow = true; m.receiveShadow = true; } });

    // a branch from the spine into the floor
    if (spec.spine) {
      const from = new THREE.Vector3(shaftX - 0.45, h * 0.55, 0.9);
      const pts = [from, new THREE.Vector3(W / 2 + 0.15, port.y + 0.15, 0.9), new THREE.Vector3(port.x + 0.05, port.y, port.z + 0.2), port];
      const o = { color: spec.spine.color, radius: 0.03, packets: 3, speed: 0.35 };
      const br = new Flow(pts, cables ? { ...o, reveal: true, plug: plugFor(o.color), onPlug: portPlug } : o);
      storey.add(br.group);
      branchFlows.push({ flow: br, id: f.id, step: 0 });
    }

    const keyed = (wall: boolean) => items.filter((it) => !!it.obj.userData.onWall === wall).map((it) => ({ obj: it.obj, pop: it }));
    editGroups.push({ room: f.id, parent: group, items: keyed(false) }, { room: `${f.id}-wall`, parent: group, items: keyed(true) });
    const signMat = sign.material;
    zones.push({
      id: f.id, items,
      update: (v, time) => {
        const lit = Math.min(1, v / 0.3);
        const ease = lit < 0.5 ? 4 * lit ** 3 : 1 - (-2 * lit + 2) ** 3 / 2;
        storey.position.z = -1.6 * (1 - ease); // closed floors sit back inside the building
        edgeMat.emissiveIntensity = 0.25 + lit * 2.2 + Math.sin(time * 2 + i) * 0.1 * lit;
        signMat.opacity = 0.25 + lit * 0.75;
        light.intensity = lit * 5;
      },
    });
  });

  // the glass shaft and the elevator car
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.9, total + 0.6, 0.9), new THREE.MeshPhysicalMaterial({
    color: '#9FB4FF', transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0, depthWrite: false,
  }));
  shaft.position.set(shaftX, total / 2 - 0.1, -0.6);
  root.add(shaft);
  let car: THREE.Group | null = null;
  if (spec.elevator !== false) {
    car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), new THREE.MeshStandardMaterial({ color: '#2A2950', roughness: 0.4, metalness: 0.3 }));
    body.position.y = 0.45;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ color: '#FFD9A8', toneMapped: false }));
    win.position.set(0, 0.5, 0.351);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, total, 6), new THREE.MeshBasicMaterial({ color: '#555577' }));
    cable.position.y = 0.9 + total / 2;
    car.add(body, win, cable);
    car.position.set(shaftX, total - H, -0.6);
    root.add(car);
  }

  // the spine: down beside the shaft from the roof to the ground
  if (spec.spine) {
    const sp = new Flow([new THREE.Vector3(shaftX - 0.45, total + 0.4, 0.9), new THREE.Vector3(shaftX - 0.45, total / 2, 0.9), new THREE.Vector3(shaftX - 0.45, -0.05, 0.9)],
      { color: spec.spine.color, radius: 0.06, packets: 10, speed: 0.08 });
    root.add(sp.group);
    flows.push(sp);
  }

  const stray = (recipe.pieces ?? []).find((p) => !spec.floors.some((f) => f.id === p.room));
  if (stray) throw new Error(`home "${recipe.id}": the piece "${stray.id}" is on the floor "${stray.room}"; this tower's floors are ${spec.floors.map((f) => f.id).join(', ')}`);
  const editables = collectEditables(editGroups);
  for (const z of zones) for (const it of z.items) it.obj.scale.setScalar(0.0001);

  /** how many turns each floor's cables take (its highest step + 1) */
  const turns: Record<string, number> = {};
  for (const b of branchFlows) turns[b.id] = Math.max(turns[b.id] ?? 1, Math.floor(b.step) + 1);

  const tick = (cur: Record<string, number>, dt: number) => {
    let sum = 0, wsum = 0, any = 0;
    for (const z of zones) {
      const v = cur[`z:${z.id}`] ?? 0;
      any = Math.max(any, v);
      const w = v ** 3;
      sum += w * floorY[z.id]; wsum += w;
    }
    if (car && wsum > 1e-4) car.position.y += (sum / wsum - car.position.y) * Math.min(1, dt * 4);
    for (const fl of flows) { fl.intensity = 0.25 + any * 0.75; fl.update(dt); }
    for (const b of branchFlows) {
      const v = cur[`z:${b.id}`] ?? 0;
      b.flow.intensity = v;
      if (cables) b.flow.reveal = cableReveal(v, b.step, turns[b.id]);
      b.flow.update(dt);
    }
  };

  const spinners: { obj: THREE.Object3D; spin: number; bob: number; baseY: number; baseRot: number }[] = [];
  root.traverse((o) => { if (o.userData.spin || o.userData.bob) spinners.push({ obj: o, spin: o.userData.spin ?? 0, bob: o.userData.bob ?? 0, baseY: o.position.y, baseRot: o.rotation.y }); });

  return {
    root, badges: [], spinners, mixers, pickables: [root], editables, zones,
    // each floor opens on its own field (z:<floor id>): it slides out and lights up, then its pieces spring in;
    // the elevator rides to the open floors and the pipes run with them
    update: (cur, f) => {
      for (const z of zones) {
        const v = cur[`z:${z.id}`] ?? 0;
        z.update(v, f.still ? 0 : f.time); // (the pipes' flow is decoration)
        f.pop(z.items, clamp01((v - 0.4) / 0.6));
      }
      tick(cur, f.dt);
      return { open: opening(cur.c, f.fold), lit: clamp01((cur.c - 0.5) / 0.5) };
    },
    late: {
      specs: waiting,
      /** Place a listed piece whose model has arrived since the tower was built, ready for layouts and stories. */
      add: (s) => {
        const placed = placers[s.room]?.(s);
        if (!placed) return null;
        placed.obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) { m.castShadow = true; m.receiveShadow = true; } });
        return collectEditables([{ room: s.wall ? `${s.room}-wall` : s.room, parent: placed.parent, items: [{ obj: placed.obj, pop: placed.pop }] }])[0];
      },
    },
    reset: () => { for (const fl of flows) fl.reset(); for (const b of branchFlows) b.flow.reset(); },
  };
}
