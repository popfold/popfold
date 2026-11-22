// Paper pop-up pieces: flat cards and folded shapes hinged to the pages of a spread, which stand up as the
// spread opens and fold flat as it closes. Each piece is built once and then posed from the spread's two page
// angles (popup-math.ts), so it looks right at every angle in between and runs backwards as well as forwards.
//
// The spread's own space: the spine is the z axis (+z towards the reader), the right page lies along +x and the
// left along -x when the spread is open, and up is +y. A piece is built around z = 0; whoever places it moves it
// along the spine.
//
//   card   a card parallel to the spine, on a page or in the gutter (a parallel fold: it stays parallel to the
//          plane halfway between the pages)
//   stand  a card hinged across its page, facing the reader; it leans back as the spread closes
//   vfold  a card folded in half, its halves glued either side of the gutter (a V-fold, the pop-up's main move);
//          with `fins`, a honeycomb of more cards fanned between the halves
//   box    a box fold: walls parallel to the spine, a roof or flat top that creases as it closes. Across the
//          gutter (a house) or on one page (a crate)
//   fan    cards fanned around the spine between the two pages: a dome (half-discs), a tube or a cone
import * as THREE from 'three';
import { bisector, gableRise, halfOpen, standAngle, vfoldCrease, type SpreadAngles } from './popup-math';
import type { OptValue } from './types';

/** A posed piece: its group (built around z = 0 on the spine) and how to pose it for a spread's page angles. */
export interface Popup {
  group: THREE.Group;
  pose: (s: SpreadAngles) => void;
}

/** One part of a cut-out: the right half of its outline (x >= 0, from the top of the middle line round to its foot), and which of the piece's colours it takes. */
interface Part { pts: [number, number][]; tone: 0 | 1 | 2 }

/** The cut-out shapes a card, a stand or a V-fold can have. Every one is symmetric about its middle, so a V-fold can be cut down it. */
export const SHAPES = ['rect', 'gable', 'pine', 'tree', 'bush', 'hill', 'hills', 'hills-sun', 'waves-sun', 'mountain', 'disc', 'sun', 'star', 'cloud', 'wave', 'flower', 'castle', 'turret', 'boat', 'fence', 'mushroom'] as const;
export type ShapeName = (typeof SHAPES)[number];

/** Colours a shape takes by default for its second and third tones (a trunk, a snow cap). */
const TONE_DEFAULTS: Partial<Record<ShapeName, [string, string]>> = {
  pine: ['#8A5A3C', '#FFFFFF'], tree: ['#8A5A3C', '#FFFFFF'], flower: ['#4F9A5A', '#FFD34D'], mountain: ['#FFFFFF', '#FFFFFF'],
  castle: ['#5A4A6A', '#FFD34D'], turret: ['#D35D47', '#5A4A6A'], 'hills-sun': ['#FFD34D', '#FFFFFF'], 'waves-sun': ['#FFD34D', '#FFFFFF'], boat: ['#FFFFFF', '#FFFFFF'], mushroom: ['#F4EBDD', '#FFFFFF'], sun: ['#FFB23F', '#FFFFFF'],
};

const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 18, wobble?: (a: number) => number) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = from + (to - from) * (i / n); const k = wobble ? wobble(a) : 1; return [cx + rx * Math.cos(a) * k, cy + ry * Math.sin(a) * k] as [number, number]; });

/** The parts of a cut-out `w` wide and `h` tall, standing on y = 0. */
export function cutout(shape: ShapeName, w: number, h: number): Part[] {
  const r = w / 2;
  switch (shape) {
    case 'rect': return [{ tone: 0, pts: [[0, h], [r, h], [r, 0], [0, 0]] }];
    case 'gable': return [{ tone: 0, pts: [[0, h], [r, h * 0.62], [r, 0], [0, 0]] }];
    case 'pine': return [
      { tone: 1, pts: [[0, h * 0.2], [w * 0.07, h * 0.2], [w * 0.07, 0], [0, 0]] },
      { tone: 0, pts: [[0, h], [w * 0.22, h * 0.68], [w * 0.13, h * 0.68], [w * 0.36, h * 0.42], [w * 0.24, h * 0.42], [r, h * 0.16], [0, h * 0.16]] },
    ];
    case 'tree': return [
      { tone: 1, pts: [[0, h * 0.45], [w * 0.07, h * 0.45], [w * 0.09, 0], [0, 0]] },
      { tone: 0, pts: [...arc(0, h * 0.67, r, h * 0.33, Math.PI / 2, -Math.PI / 2, 20, (a) => 1 + 0.05 * Math.cos(a * 7))] },
    ];
    case 'bush': return [{ tone: 0, pts: [...arc(0, 0, r, h, Math.PI / 2, 0, 20, (a) => 1 + 0.07 * Math.sin(a * 8)), [0, 0]] }];
    case 'hill': return [{ tone: 0, pts: [...Array.from({ length: 17 }, (_, i) => { const t = i / 16; return [t * r, h * (0.5 + 0.5 * Math.cos(Math.PI * t))] as [number, number]; }), [0, 0]] }];
    case 'hills': return [{ tone: 0, pts: [...Array.from({ length: 25 }, (_, i) => { const t = i / 24; return [t * r, h * (0.72 + 0.16 * Math.cos(Math.PI * t * 1.6) + 0.12 * Math.cos(Math.PI * t * 4.2)) * (1 - 0.35 * t * t)] as [number, number]; }), [r, 0], [0, 0]] }];
    // a backdrop: a sun (or a moon) on the middle line, half behind rolling hills or the sea
    case 'hills-sun':
    case 'waves-sun': {
      const R = Math.min(r * 0.5, h * 0.22);
      const ground = cutout(shape === 'hills-sun' ? 'hills' : 'wave', w, h * 0.62)[0];
      return [{ tone: 1, pts: arc(0, h - R * 1.05, R, R, Math.PI / 2, -Math.PI / 2, 18) }, { tone: 0, pts: ground.pts }];
    }
    case 'turret': return [
      { tone: 0, pts: [[0, h * 0.7], [r * 0.78, h * 0.7], [r * 0.78, 0], [0, 0]] },
      { tone: 1, pts: [[0, h], [r, h * 0.66], [0, h * 0.66]] },
      { tone: 2, pts: [[0, h * 0.56], [r * 0.2, h * 0.56], [r * 0.2, h * 0.42], [0, h * 0.42]] },
    ];
    case 'mountain': return [
      { tone: 0, pts: [[0, h], [r, 0], [0, 0]] },
      { tone: 1, pts: [[0, h], [r * 0.3, h * 0.7], [r * 0.2, h * 0.74], [r * 0.1, h * 0.68], [0, h * 0.73]] },
    ];
    case 'disc': return [{ tone: 0, pts: arc(0, h / 2, Math.min(r, h / 2), Math.min(r, h / 2), Math.PI / 2, -Math.PI / 2, 20) }];
    case 'sun': {
      const R = Math.min(r, h / 2), cy = h / 2;
      const rays = Array.from({ length: 13 }, (_, i) => { const a = Math.PI / 2 - (i / 12) * Math.PI; const k = i % 2 ? 1 : 0.78; return [R * k * Math.cos(a), cy + R * k * Math.sin(a)] as [number, number]; });
      return [{ tone: 1, pts: rays }, { tone: 0, pts: arc(0, cy, R * 0.6, R * 0.6, Math.PI / 2, -Math.PI / 2, 18) }];
    }
    case 'star': {
      const R = Math.min(r, h / 2), cy = h / 2;
      return [{ tone: 0, pts: Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 2 - (i / 5) * Math.PI; const k = i % 2 ? 0.42 : 1; return [R * k * Math.cos(a), cy + R * k * Math.sin(a)] as [number, number]; }) }];
    }
    case 'cloud': return [{ tone: 0, pts: [...arc(0, h * 0.3, r, h * 0.7, Math.PI / 2, 0, 24, (a) => 1 + 0.1 * Math.cos(a * 9)), [r * 0.9, 0], [0, 0]] }];
    case 'wave': return [{ tone: 0, pts: [...Array.from({ length: 25 }, (_, i) => { const t = i / 24; return [t * r, h * (0.78 + 0.22 * Math.cos(t * Math.PI * 4))] as [number, number]; }), [r, 0], [0, 0]] }];
    case 'flower': return [
      { tone: 0, pts: Array.from({ length: 21 }, (_, i) => { const a = Math.PI / 2 - (i / 20) * Math.PI; const k = 1 + 0.25 * Math.cos(a * 5 - Math.PI / 2 * 5); return [r * k * 0.8 * Math.cos(a), h * 0.72 + r * k * 0.8 * Math.sin(a)] as [number, number]; }) },
      { tone: 1, pts: [[0, h * 0.7], [w * 0.05, h * 0.7], [w * 0.05, 0], [0, 0]] },
      { tone: 2, pts: arc(0, h * 0.72, r * 0.32, r * 0.32, Math.PI / 2, -Math.PI / 2, 12) },
    ];
    case 'castle': {
      const top: [number, number][] = [];
      const n = 4;
      for (let i = 0; i < n; i++) { const x0 = (i / n) * r, x1 = ((i + 0.5) / n) * r, x2 = ((i + 1) / n) * r; top.push([x0, h], [x1, h], [x1, h * 0.88], [x2, h * 0.88]); }
      return [
        { tone: 0, pts: [...top, [r, h * 0.88], [r, 0], [0, 0]] },
        { tone: 1, pts: [...arc(0, h * 0.32, w * 0.12, w * 0.12, Math.PI / 2, 0, 8), [w * 0.12, 0], [0, 0]] },
      ];
    }
    case 'boat': return [
      { tone: 0, pts: [[0, h * 0.32], [r, h * 0.32], [r * 0.72, 0], [0, 0]] },
      { tone: 1, pts: [[0, h], [r * 0.62, h * 0.4], [0, h * 0.4]] },
    ];
    case 'fence': {
      const top: [number, number][] = [];
      const n = 5;
      for (let i = 0; i < n; i++) { const x0 = (i / n) * r, x1 = ((i + 0.5) / n) * r; top.push([x0, h], [x1, h * 0.8]); }
      return [{ tone: 0, pts: [...top, [r, h * 0.8], [r, 0], [0, 0]] }];
    }
    case 'mushroom': return [
      { tone: 1, pts: [[0, h * 0.5], [w * 0.13, h * 0.5], [w * 0.16, 0], [0, 0]] },
      { tone: 0, pts: [...arc(0, h * 0.45, r, h * 0.55, Math.PI / 2, 0, 16), [0, h * 0.45]] },
    ];
  }
}

// ---------- materials and card meshes ----------

const papers = new Map<string, THREE.MeshStandardMaterial>();
let grain: THREE.Texture | null = null;
/** a faint paper grain, shared by every card */
function paperGrain() {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 128, 128);
  // a fixed scatter (the same every load, so stills compare)
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(90,70,40,${0.03 + rnd() * 0.05})`; g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 1.5, 1); }
  grain = new THREE.CanvasTexture(c);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.colorSpace = THREE.SRGBColorSpace;
  return grain;
}

/** Card stock in a colour (one material per colour, shared). Both sides show: a cut-out is the same colour front and back. */
export function paper(color: string) {
  let m = papers.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, map: paperGrain() });
    papers.set(color, m);
  }
  return m;
}

/** The colours of a piece's tones: its own colour, then its second and third (or the shape's defaults). */
function tones(shape: ShapeName, colors: string[]): [string, string, string] {
  const d = TONE_DEFAULTS[shape] ?? ['#FFFFFF', '#FFFFFF'];
  return [colors[0] ?? '#E8D9B8', colors[1] ?? d[0], colors[2] ?? d[1]];
}

/**
 * A cut-out card in its own plane (x across, y up, facing +z), standing on y = 0. `half` cuts it down its middle
 * and keeps the right half (x from 0 to w/2): a V-fold's halves and a honeycomb's fins are half cards.
 */
export function cardMesh(shape: ShapeName, w: number, h: number, colors: string[], half = false): THREE.Group {
  const g = new THREE.Group();
  const cols = tones(shape, colors);
  cutout(shape, w, h).forEach((part, i) => {
    const pts = half ? [...part.pts] : [...part.pts, ...[...part.pts].reverse().map(([x, y]) => [-x, y] as [number, number])];
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ShapeGeometry(s, 4);
    // the grain is in world-ish units: scale its uvs to the card's size
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.9, uv.getY(k) * 0.9);
    const mesh = new THREE.Mesh(geo, paper(cols[part.tone]));
    mesh.position.z = i * 0.0025; // later parts lie on top of earlier ones, like pasted paper
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  });
  return g;
}

// ---------- posing ----------

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const dir = (a: number) => v(Math.cos(a), Math.sin(a), 0);
const Z = v(0, 0, 1);
/** how far a piece sits off its page, so the two do not flicker where they touch */
const LIFT = 0.008;

/** Put an object's own x and y axes along `x` and `y` (unit, square to each other), its origin at `o`. */
function setFrame(obj: THREE.Object3D, o: THREE.Vector3, x: THREE.Vector3, y: THREE.Vector3) {
  const zz = new THREE.Vector3().crossVectors(x, y);
  obj.matrixAutoUpdate = false;
  obj.matrix.makeBasis(x, y, zz).setPosition(o);
  obj.matrixWorldNeedsUpdate = true;
}

/** A page's direction from the spine and its normal (into the spread), for a page on the left or right. */
function page(s: SpreadAngles, left: boolean) {
  const a = left ? s.left : s.right;
  const along = dir(a);
  const normal = left ? v(Math.sin(a), -Math.cos(a), 0) : v(-Math.sin(a), Math.cos(a), 0);
  return { along, normal };
}

/** Options every piece takes from its entry's `opts`. */
export type PopupOpts = Record<string, OptValue | OptValue[] | undefined>;
const num = (o: PopupOpts, k: string, d: number) => (typeof o[k] === 'number' ? (o[k] as number) : d);
const str = (o: PopupOpts, k: string, d: string) => (typeof o[k] === 'string' ? (o[k] as string) : d);
const shapeOf = (o: PopupOpts, d: ShapeName): ShapeName => (SHAPES as readonly string[]).includes(o.shape as string) ? (o.shape as ShapeName) : d;
const colorsOf = (o: PopupOpts, d: string) => [str(o, 'color', d), ...(typeof o.color2 === 'string' ? [o.color2] : []), ...(typeof o.color3 === 'string' ? [o.color3] : [])];

/**
 * A card parallel to the spine, `x` from it (negative: the left page; 0: standing in the gutter). It is linked to the
 * gutter like the rungs of a ladder, so it stays parallel to the plane halfway between the pages: upright when the
 * spread lies open, lying flat outwards on its page when it shuts.
 * opts: shape, w (along the spine), h, color, color2, color3.
 */
export function card(x: number, o: PopupOpts = {}): Popup {
  const group = new THREE.Group();
  const w = num(o, 'w', 1), h = num(o, 'h', 1);
  const mesh = cardMesh(shapeOf(o, 'rect'), w, h, colorsOf(o, '#E8D9B8'));
  group.add(mesh);
  return {
    group,
    pose: (s) => {
      const p = page(s, x < 0);
      const up = dir(bisector(s));
      const at = p.along.clone().multiplyScalar(Math.abs(x)).addScaledVector(x === 0 ? up : p.normal, LIFT);
      setFrame(mesh, at, Z, up);
    },
  };
}

/**
 * A stand: a card hinged across its page, `x` from the spine (its middle), facing the reader. It stands upright
 * while the spread lies open and leans back as the pages close, never further up than the plane halfway between
 * them, so it is lying flat on its page when they shut. It lies down backwards (away from the reader), or forwards
 * with lean "front" (for a stand near the far edge, which would lie over it).
 * opts: shape, w (across the page), h, lean, color, color2, color3.
 */
export function stand(x: number, o: PopupOpts = {}): Popup {
  const w = num(o, 'w', 0.8), h = num(o, 'h', 1);
  return standFor(x, w, h, cardMesh(shapeOf(o, 'tree'), w, h, colorsOf(o, '#5FAF5A')), str(o, 'lean', 'back') === 'front' ? 'front' : 'back');
}

/** Any object as a stand: built facing +z, standing on y = 0 under its middle, `w` wide and `h` tall. */
export function standFor(x: number, w: number, h: number, obj: THREE.Object3D, lean: 'back' | 'front' = 'back'): Popup {
  const group = new THREE.Group();
  const mount = new THREE.Group();
  const tilt = new THREE.Group(); // turns about the hinge, the bottom edge of the card
  tilt.add(obj);
  mount.add(tilt);
  group.add(mount);
  const inner = Math.abs(x) - w / 2;
  return {
    group,
    pose: (s) => {
      const p = page(s, x < 0);
      const across = x < 0 ? p.along.clone().negate() : p.along; // the card's own +x, towards the right of the page
      setFrame(mount, p.along.clone().multiplyScalar(Math.abs(x)).addScaledVector(p.normal, LIFT), across, p.normal);
      // lean back (its top towards the far end of the spine) as far as the closing pages need
      tilt.rotation.x = (lean === 'back' ? 1 : -1) * (standAngle(inner, h, halfOpen(s)) - Math.PI / 2);
    },
  };
}

/**
 * A V-fold: a card folded down its middle, the crease on the spine and each half glued along a line that leaves
 * the spine at `angle` degrees (45: a corner, 75 or more: a backdrop that faces the reader). `toward` is the way
 * the glue lines run along the spine: "back" (the corner points at the reader) or "front" (it opens towards the
 * reader, like a stage). `fins` more half cards fan out between the halves, a honeycomb: a round tree, a cone.
 * opts: shape, w (the whole card's width), h (the crease's height), angle, toward, fins, color, color2, color3.
 */
export function vfold(o: PopupOpts = {}): Popup {
  const group = new THREE.Group();
  const w = num(o, 'w', 1.6), h = num(o, 'h', 1.2);
  const gamma = (num(o, 'angle', 45) * Math.PI) / 180;
  const toward = str(o, 'toward', 'back') === 'front' ? 1 : -1;
  const shape = shapeOf(o, 'hill');
  const colors = colorsOf(o, '#7FBF6A');
  const fins = Math.max(0, Math.round(num(o, 'fins', 0)));
  const halves = [cardMesh(shape, w, h, colors, true), cardMesh(shape, w, h, colors, true)];
  const finCards = Array.from({ length: fins }, () => cardMesh(shape, w, h, colors, true));
  group.add(...halves, ...finCards);
  const e = v(0, 0, toward);
  return {
    group,
    pose: (s) => {
      const delta = halfOpen(s), up = dir(bisector(s));
      const k = vfoldCrease(gamma, delta);
      const crease = e.clone().multiplyScalar(Math.cos(k)).addScaledVector(up, Math.sin(k));
      const glue = (left: boolean) => e.clone().multiplyScalar(Math.cos(gamma)).addScaledVector(page(s, left).along, Math.sin(gamma));
      const gl = glue(true), gr = glue(false);
      const o0 = v(0, 0, 0).addScaledVector(up, LIFT);
      setFrame(halves[0], o0, gl, crease);
      setFrame(halves[1], o0, gr, crease);
      // the honeycomb: cards turned evenly about the crease, from one half to the other
      const between = Math.acos(Math.min(1, Math.max(-1, gl.dot(gr))));
      finCards.forEach((f, i) => {
        const t = (i + 1) / (fins + 1);
        const d = between < 1e-4 ? gl.clone() : gl.clone().multiplyScalar(Math.sin((1 - t) * between)).addScaledVector(gr, Math.sin(t * between)).divideScalar(Math.sin(between));
        setFrame(f, o0, d.normalize(), crease);
      });
    },
  };
}

/** A strip of quads along the spine from a cross-section (points in x, y), from z0 to z1; its points move each frame. */
class Strip {
  readonly mesh: THREE.Mesh;
  private readonly pos: THREE.BufferAttribute;
  constructor(private readonly n: number, mat: THREE.Material, private readonly z0: number, private readonly z1: number, closed = false) {
    const segs = closed ? n : n - 1;
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3);
    geo.setAttribute('position', this.pos);
    const uv = new Float32Array(n * 2 * 2);
    for (let i = 0; i < n; i++) { uv.set([i / Math.max(1, n - 1), 0, i / Math.max(1, n - 1), 1], i * 4); }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let i = 0; i < segs; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
  set(points: THREE.Vector3[]) {
    for (let i = 0; i < this.n; i++) {
      const p = points[i];
      this.pos.setXYZ(i * 2, p.x, p.y, this.z0);
      this.pos.setXYZ(i * 2 + 1, p.x, p.y, this.z1);
    }
    this.pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

/** A flat polygon (the end of a box) in a plane z = const, as triangles from a fixed corner list; uvs from its open shape. */
class Face {
  readonly mesh: THREE.Mesh;
  private readonly pos: THREE.BufferAttribute;
  constructor(open: [number, number][], tris: number[], mat: THREE.Material, private readonly z: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(open.length * 3), 3);
    geo.setAttribute('position', this.pos);
    const xs = open.map((p) => p[0]), ys = open.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(open.flatMap(([x, y]) => [(x - x0) / (x1 - x0 || 1), (y - y0) / (y1 - y0 || 1)])), 2));
    geo.setIndex(tris);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
  set(points: THREE.Vector3[]) {
    points.forEach((p, i) => this.pos.setXYZ(i, p.x, p.y, this.z));
    this.pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

/** The front of a house: a door and windows drawn on its colour, for the end of a box that faces the reader. */
function frontArt(wall: string, trim: string, aspect: number) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = Math.round(256 * aspect);
  const g = c.getContext('2d')!;
  const W = c.width, H = c.height;
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  // the door, in the middle at the bottom; a window either side
  const unit = W / 8;
  g.fillStyle = trim;
  const doorH = Math.min(H * 0.5, unit * 3.2);
  g.beginPath(); g.roundRect(W / 2 - unit * 0.8, H - doorH, unit * 1.6, doorH + 2, [unit * 0.8, unit * 0.8, 0, 0]); g.fill();
  for (const x of [W * 0.2, W * 0.8]) {
    g.fillStyle = trim; g.fillRect(x - unit * 0.75, H - doorH - unit * 0.2, unit * 1.5, unit * 1.5);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x - unit * 0.06, H - doorH - unit * 0.2, unit * 0.12, unit * 1.5); g.fillRect(x - unit * 0.75, H - doorH + unit * 0.49, unit * 1.5, unit * 0.12);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A box fold. At `x` = 0 it stands across the gutter: two walls on the pages `w` / 2 from the spine and a roof
 * (`roof` high, or a flat top) that creases over the gutter: a house. Anywhere else it stands on that one page
 * from `x` - w/2 to `x` + w/2: a crate whose walls lean over together as the spread closes.
 * opts: w (across), h (the walls), d (along the spine), roof (the ridge's height over the walls, gutter only),
 * color (walls), color2 (roof or top), color3 (door and windows; set it to draw them on the front).
 */
export function box(x: number, o: PopupOpts = {}): Popup {
  const group = new THREE.Group();
  const w = num(o, 'w', 1.4), h = num(o, 'h', 0.9), d = num(o, 'd', 0.9);
  const wall = str(o, 'color', '#F2E3C6'), top = str(o, 'color2', '#D9644A');
  const trim = typeof o.color3 === 'string' ? o.color3 : null;
  const z0 = -d / 2, z1 = d / 2;
  const gutter = x === 0;
  const roof = gutter ? Math.max(0, num(o, 'roof', 0)) : 0;
  const half = w / 2;
  const slope = Math.hypot(half, roof);
  // the cross-section, open: the gutter box O, BL, TL, M, TR, BR; the page box B1, T1, T2, B2
  const open: [number, number][] = gutter
    ? [[0, 0], [-half, 0], [-half, h], [0, h + roof], [half, h], [half, 0]]
    : [[-half, 0], [-half, h], [half, h], [half, 0]];
  const tris = gutter ? [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5] : [0, 1, 2, 0, 2, 3];
  const wallMat = paper(wall), topMat = paper(top);
  const frontMat = trim ? new THREE.MeshStandardMaterial({ map: frontArt(wall, trim, (h + roof) / w), roughness: 0.92, side: THREE.DoubleSide }) : wallMat;
  const walls = [new Strip(2, wallMat, z0, z1), new Strip(2, wallMat, z0, z1)];
  const tops = gutter ? [new Strip(2, topMat, z0 - 0.04, z1 + 0.04), new Strip(2, topMat, z0 - 0.04, z1 + 0.04)] : [new Strip(2, topMat, z0, z1)];
  const front = new Face(open, tris, frontMat, z1), back = new Face(open, tris, wallMat, z0);
  group.add(...walls.map((s) => s.mesh), ...tops.map((s) => s.mesh), front.mesh, back.mesh);
  return {
    group,
    pose: (s) => {
      const delta = halfOpen(s), up = dir(bisector(s));
      if (gutter) {
        const L = page(s, true), R = page(s, false);
        const bl = L.along.clone().multiplyScalar(half).addScaledVector(L.normal, LIFT);
        const br = R.along.clone().multiplyScalar(half).addScaledVector(R.normal, LIFT);
        const tl = bl.clone().addScaledVector(up, h), tr = br.clone().addScaledVector(up, h);
        const m = up.clone().multiplyScalar(h + gableRise(half, slope, delta) + LIFT);
        walls[0].set([bl, tl]); walls[1].set([br, tr]);
        tops[0].set([tl, m]); tops[1].set([tr, m]);
        const o0 = up.clone().multiplyScalar(LIFT);
        front.set([o0, bl, tl, m, tr, br]); back.set([o0, bl, tl, m, tr, br]);
      } else {
        const P = page(s, x < 0);
        const near = Math.abs(x) - half, far = Math.abs(x) + half;
        const b1 = P.along.clone().multiplyScalar(near).addScaledVector(P.normal, LIFT), b2 = P.along.clone().multiplyScalar(far).addScaledVector(P.normal, LIFT);
        const t1 = b1.clone().addScaledVector(up, h), t2 = b2.clone().addScaledVector(up, h);
        walls[0].set([b1, t1]); walls[1].set([b2, t2]);
        tops[0].set([t1, t2]);
        // (in the open shape's order: left foot, left top, right top, right foot)
        const pts = x < 0 ? [b2, t2, t1, b1] : [b1, t1, t2, b2];
        front.set(pts); back.set(pts);
      }
    },
  };
}

/**
 * A fan: cards hinged on the spine and spread evenly between the two pages, a honeycomb that opens with them.
 * shape: "dome" (half-discs: half a ball), "tube" (oblongs: half a cylinder, `len` long) or "cone" (triangles:
 * half a cone lying along the spine, its point towards the reader).
 * opts: shape, r, len, fins, color, color2 (every other card).
 */
export function fan(o: PopupOpts = {}): Popup {
  const group = new THREE.Group();
  const r = num(o, 'r', 0.6), len = num(o, 'len', 1.2);
  const kind = str(o, 'shape', 'dome');
  const n = Math.max(2, Math.round(num(o, 'fins', 7)));
  const a = str(o, 'color', '#6FBF73'), b = str(o, 'color2', a);
  const outline: [number, number][] = kind === 'tube' ? [[-len / 2, 0], [-len / 2, r], [len / 2, r], [len / 2, 0]]
    : kind === 'cone' ? [[-len / 2, 0], [-len / 2, r], [len / 2, 0]]
    : arc(0, 0, r, r, Math.PI, 0, 24);
  const geo = new THREE.ShapeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y))), 4);
  const fins = Array.from({ length: n }, (_, i) => {
    const m = new THREE.Mesh(geo, paper(i % 2 ? b : a));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  });
  group.add(...fins);
  return {
    group,
    pose: (s) => {
      fins.forEach((f, i) => {
        const t = (i + 1) / (n + 1);
        // card x along the spine (towards the reader), card y out from the spine at its angle
        setFrame(f, v(0, 0, 0), Z, dir(s.right + (s.left - s.right) * t));
      });
    },
  };
}
