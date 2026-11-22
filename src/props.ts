import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as tex from './textures';

// Toy-like furniture built from primitives. Each builder returns a group whose
// origin is the point where it touches the floor, so "pop in" scales from the floor up.

/** The colours of the built-in pieces and the guide figure, by name. */
export interface Palette {
  pink: string; cherry: string; wine: string; butter: string; cobalt: string; mint: string; lilac: string;
  white: string; gold: string; orange: string; green: string;
}

/** The palette the built-in pieces ship with: bright toy colours. */
export const DEFAULT_PALETTE: Readonly<Palette> = Object.freeze({
  pink: '#FF8FC0', cherry: '#D0112B', wine: '#3B0A1E', butter: '#FFD84D', cobalt: '#2546F0',
  mint: '#7FDDB8', lilac: '#B79CFF', white: '#FFF8F2', gold: '#E8B04A', orange: '#FF7A3D', green: '#2FB36B',
});

/** The palette in use: every built-in piece reads its colours from here when it is built. */
export const C: Palette = { ...DEFAULT_PALETTE };

/**
 * Give the built-in pieces (`P.sofa()` and the rest) and the guide figure the site's colours, by name; names left
 * out keep the default. Call it before startScene(): a piece takes its colours when it is built. With no argument
 * it puts the default back.
 */
export function setPalette(colours: Partial<Palette> = {}) {
  Object.assign(C, DEFAULT_PALETTE, colours);
}

export function toy(color: string, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25, ...extra });
}

export function rbox(w: number, h: number, d: number, r: number, mat: THREE.Material) {
  const rr = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, rr), mat);
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function group(...children: THREE.Object3D[]) {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
}

export function rug(w: number, d: number, texture: THREE.Texture, round = false) {
  const geo = round ? new THREE.CircleGeometry(w / 2, 48) : new THREE.PlaneGeometry(w, d);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.receiveShadow = true;
  return group(m);
}

export function sofa() {
  const body = toy(C.butter);
  const cushion = toy(C.pink);
  return group(
    at(rbox(2.2, 0.32, 0.85, 0.12, body), 0, 0.24, 0),
    at(rbox(2.2, 0.62, 0.26, 0.12, body), 0, 0.55, -0.3),
    at(rbox(0.26, 0.5, 0.85, 0.12, body), -1.0, 0.35, 0),
    at(rbox(0.26, 0.5, 0.85, 0.12, body), 1.0, 0.35, 0),
    at(rbox(0.82, 0.14, 0.62, 0.07, cushion), -0.42, 0.46, 0.06),
    at(rbox(0.82, 0.14, 0.62, 0.07, cushion), 0.42, 0.46, 0.06),
    at(rbox(0.42, 0.42, 0.14, 0.1, toy(C.cobalt)), -0.6, 0.7, -0.12),
    at(rbox(0.06, 0.08, 0.06, 0.02, toy(C.wine)), -0.95, 0.04, 0.3),
    at(rbox(0.06, 0.08, 0.06, 0.02, toy(C.wine)), 0.95, 0.04, 0.3),
    at(rbox(0.06, 0.08, 0.06, 0.02, toy(C.wine)), -0.95, 0.04, -0.3),
    at(rbox(0.06, 0.08, 0.06, 0.02, toy(C.wine)), 0.95, 0.04, -0.3),
  );
}

/** Floor lamp; returns the group plus its bulb so the scene can make it glow. */
export function floorLamp(shadeColor = C.cobalt) {
  const gold = toy(C.gold, { metalness: 0.6, roughness: 0.3 });
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 20, 16),
    new THREE.MeshStandardMaterial({ color: '#FFF1C2', emissive: '#FFD27A', emissiveIntensity: 1 }),
  );
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.38, 0.38, 32, 1, true),
    toy(shadeColor, { side: THREE.DoubleSide }),
  );
  const g = group(
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 32), gold), 0, 0.025, 0),
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 12), gold), 0, 0.75, 0),
    at(shade, 0, 1.58, 0),
    at(bulb, 0, 1.5, 0),
  );
  return { group: g, bulb };
}

export function coffeeTable() {
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.09, 40),
    [toy(C.white), new THREE.MeshPhysicalMaterial({ map: tex.terrazzo('#FFF4EA', [C.pink, C.cobalt, C.butter, C.mint], 11), roughness: 0.3, clearcoat: 1 }), toy(C.white)],
  );
  return group(
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.32, 24), toy(C.cherry)), 0, 0.16, 0),
    at(top, 0, 0.365, 0),
    at(new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), toy(C.mint)), 0.15, 0.52, 0.05),
  );
}

export function plant() {
  const leaf = toy(C.green, { roughness: 0.5 });
  const g = group(at(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.36, 28), toy(C.cobalt)), 0, 0.18, 0));
  const spots: [number, number, number, number][] = [[0, 0.62, 0, 0.22], [0.14, 0.82, 0.05, 0.17], [-0.13, 0.78, -0.04, 0.18], [0.02, 1.0, -0.02, 0.15], [-0.05, 0.55, 0.14, 0.15]];
  spots.forEach(([x, y, z, r]) => g.add(at(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), leaf), x, y, z)));
  return g;
}

export function sculpture(color = C.lilac) {
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.22, 0.075, 120, 16), toy(color, { iridescence: 0.8, iridescenceIOR: 1.4 }));
  knot.position.y = 0.62;
  knot.userData.spin = 0.6;
  return group(at(rbox(0.36, 0.3, 0.36, 0.06, toy(C.white)), 0, 0.15, 0), knot);
}

export function spark() {
  const star = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2, 0),
    new THREE.MeshStandardMaterial({ color: C.butter, emissive: '#FFB800', emissiveIntensity: 0.9, flatShading: true }),
  );
  star.userData.spin = 1.4;
  star.userData.bob = 0.08;
  return group(star);
}

export function shelf(width: number, items: [number, string, 'box' | 'ball' | 'jar'][]) {
  const g = group(at(rbox(width, 0.08, 0.42, 0.03, toy(C.white)), 0, 0, 0));
  items.forEach(([x, color, kind]) => {
    const m = toy(color);
    const mesh =
      kind === 'ball' ? at(new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), m), x, 0.18, 0) :
      kind === 'jar' ? at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 20), m), x, 0.19, 0) :
      at(rbox(0.3, 0.3, 0.3, 0.05, m), x, 0.19, 0);
    g.add(mesh);
  });
  return g;
}

export function shoppingBag(color: string) {
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 10, 28, Math.PI), toy(C.wine));
  handle.position.y = 0.62;
  return group(at(rbox(0.5, 0.62, 0.26, 0.04, toy(color)), 0, 0.31, 0), handle);
}

export function clothesRack() {
  const gold = toy(C.gold, { metalness: 0.6, roughness: 0.3 });
  const g = group(
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 10), gold), -0.8, 0.75, 0),
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 10), gold), 0.8, 0.75, 0),
  );
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.66, 10), gold);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.48;
  g.add(bar);
  [C.cherry, C.butter, C.mint, C.lilac, C.orange].forEach((c, i) => {
    g.add(at(rbox(0.07, 0.8, 0.5, 0.03, toy(c)), -0.56 + i * 0.28, 1.0, 0));
  });
  return g;
}

export function mirror() {
  const chrome = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: 0.04 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 48), [toy(C.pink), chrome, toy(C.pink)]);
  disc.rotation.x = Math.PI / 2 - 0.18;
  disc.position.y = 0.52;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.06, 14, 48), toy(C.pink));
  ring.rotation.x = -0.18; // torus already faces +Z; match the disc's backward tilt
  ring.position.copy(disc.position);
  return group(disc, ring);
}

export function bed() {
  const frame = toy(C.lilac);
  // Half-disc headboard: after rotating the cylinder's axis onto Z, this theta range is the upper half.
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.16, 48, 1, false, Math.PI / 2, Math.PI), frame);
  arch.rotation.x = Math.PI / 2;
  arch.position.set(0, 0.7, -1.18);
  const duvet = new THREE.MeshPhysicalMaterial({ map: tex.checker(C.pink, '#FFD1E5', 6), roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#ffffff') });
  return group(
    at(rbox(2.1, 0.3, 2.4, 0.1, frame), 0, 0.15, 0),
    at(rbox(2.0, 0.24, 2.3, 0.1, toy(C.white, { roughness: 0.8, clearcoat: 0 })), 0, 0.42, 0),
    at(rbox(2.06, 0.14, 1.55, 0.07, duvet), 0, 0.56, 0.38),
    at(rbox(0.74, 0.2, 0.44, 0.1, toy(C.butter)), -0.46, 0.62, -0.8),
    at(rbox(0.74, 0.2, 0.44, 0.1, toy(C.butter)), 0.46, 0.62, -0.8),
    at(rbox(2.1, 0.7, 0.16, 0.06, frame), 0, 0.35, -1.18),
    arch,
  );
}

export function nightstand() {
  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: C.pink, emissive: '#FF6FAE', emissiveIntensity: 0.6, side: THREE.DoubleSide }),
  );
  shade.position.y = 0.88;
  return group(
    at(rbox(0.56, 0.52, 0.5, 0.08, toy(C.cobalt)), 0, 0.26, 0),
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.36, 16), toy(C.white)), 0, 0.7, 0),
    shade,
  );
}

export function discoBall() {
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.32, 2),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: 0.08, flatShading: true }),
  );
  ball.userData.spin = 0.5;
  ball.userData.bob = 0.06;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 6), toy(C.wine));
  string.position.y = 0.6;
  return group(ball, string);
}

export function pictureFrame(w: number, h: number, art: THREE.Texture, frameColor: string) {
  const frame = rbox(w, h, 0.07, 0.03, toy(frameColor));
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.8), new THREE.MeshStandardMaterial({ map: art, roughness: 0.9 }));
  canvas.position.z = 0.037;
  return group(frame, canvas);
}
