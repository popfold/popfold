// The diorama template's room, made from simple shapes so Popfold owns every part of it and can ship it:
// node tools/demo-room.mjs [out.glb]   (default templates/diorama/public/models/room.glb)
// Then, in the template: pnpm exec popfold optimize && pnpm exec popfold split-room public/models/room.glb
//
// It follows the room contract diorama.ts reads (docs/models.md, "A whole room"): a "room" root holding "floor",
// "wall_back" and "wall_right" (empties on each wall's bottom edge, holding the wall and what hangs on it), and
// "piece_*" empties with extras { zone, piece, wall? }. Metres, y up. The floor's top is at y = 0, the room spans
// x -4..4 and z -3..3; the back wall stands at z = -3, the right wall at x = 4.
// Three zones: "lounge" (left), "gallery" (the middle of the back wall) and "desk" (right). Materials named art_*
// are painted by the site (`diorama.art`); the lamps are "floor-lamp" and "desk-lamp".
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Document, NodeIO } from '@gltf-transform/core';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, '../templates/diorama/public/models/room.glb'));

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('room');

// ---- materials, by name (a site paints art_* and may recolour the rest by name) ----
const mats = new Map();
const mat = (name, color, { rough = 0.7, metal = 0, glow } = {}) => {
  if (mats.has(name)) return mats.get(name);
  const c = new THREE.Color(color);
  const m = doc.createMaterial(name).setBaseColorFactor([c.r, c.g, c.b, 1]).setRoughnessFactor(rough).setMetallicFactor(metal);
  if (glow) { const g = new THREE.Color(glow); m.setEmissiveFactor([g.r, g.g, g.b]); }
  mats.set(name, m);
  return m;
};
const M = {
  floor: () => mat('floor', '#C9A27E', { rough: 0.6 }),
  wall: () => mat('wall', '#EFE6D8', { rough: 0.9 }),
  trim: () => mat('trim', '#FBF8F3', { rough: 0.6 }),
  wood: () => mat('wood', '#8A5A3B', { rough: 0.55 }),
  oak: () => mat('oak', '#D6B48C', { rough: 0.55 }),
  ink: () => mat('ink', '#1E2A44', { rough: 0.45 }),
  sofa: () => mat('fabric_sofa', '#3F6E8C', { rough: 0.85 }),
  cushion: () => mat('fabric_cushion', '#F2B544', { rough: 0.85 }),
  chair: () => mat('fabric_chair', '#E0664A', { rough: 0.8 }),
  rug: () => mat('rug', '#E7D3C1', { rough: 0.95 }),
  metal: () => mat('metal', '#2B2F36', { rough: 0.35, metal: 0.6 }),
  brass: () => mat('brass', '#C8A050', { rough: 0.3, metal: 0.8 }),
  leaf: () => mat('leaf', '#4F8A5B', { rough: 0.7 }),
  pot: () => mat('pot', '#D9744F', { rough: 0.6 }),
  shade: () => mat('lampshade', '#FFF1D6', { rough: 0.8, glow: '#3A2A10' }),
  stone: () => mat('stone', '#BFC3C9', { rough: 0.5 }),
  book: (i) => mat(`book_${i}`, ['#E0664A', '#3F6E8C', '#F2B544', '#4F8A5B', '#1E2A44'][i % 5], { rough: 0.7 }),
  board: () => mat('art_board', '#FFFFFF', { rough: 0.5 }),
  screen: () => mat('art_screen', '#20283A', { rough: 0.3 }),
  poster: () => mat('art_poster', '#FFFFFF', { rough: 0.6 }),
};

// ---- three.js shapes, written as glTF meshes ----
function meshOf(geo, material, name) {
  const prim = doc.createPrimitive().setMaterial(material);
  const attr = (n, array, type) => prim.setAttribute(n, doc.createAccessor().setType(type).setArray(array).setBuffer(buffer));
  attr('POSITION', new Float32Array(geo.attributes.position.array), 'VEC3');
  attr('NORMAL', new Float32Array(geo.attributes.normal.array), 'VEC3');
  // glTF's texture coordinates start at the top of the image, three.js's at the bottom
  if (geo.attributes.uv) attr('TEXCOORD_0', new Float32Array(geo.attributes.uv.array).map((v, i) => (i % 2 ? 1 - v : v)), 'VEC2');
  if (geo.index) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(geo.index.array)).setBuffer(buffer));
  return doc.createMesh(name).addPrimitive(prim);
}
let count = 0;
/** a part: a shape at a place (and turn about y), as a child node */
function part(parent, geo, material, [x, y, z], ry = 0, name = `part_${++count}`) {
  const n = doc.createNode(name).setMesh(meshOf(geo, material, name)).setTranslation([x, y, z]);
  if (ry) n.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry).toArray());
  parent.addChild(n);
  return n;
}
const box = (w, h, d, r = 0.02) => (r ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)) : new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
const plane = (w, h) => new THREE.PlaneGeometry(w, h);

/** a piece: an empty node with its zone and name, at a place on the floor (or on a wall), turned about y */
function piece(parent, zone, name, [x, y, z], ry = 0, wall) {
  const n = doc.createNode(`piece_${name}`).setTranslation([x, y, z]).setExtras({ zone, piece: name, ...(wall ? { wall } : {}) });
  if (ry) n.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry).toArray());
  parent.addChild(n);
  return n;
}

// ---- the room ----
const room = doc.createNode('room');
scene.addChild(room);
const floor = doc.createNode('floor').setMesh(meshOf(new THREE.BoxGeometry(8, 0.2, 6).translate(0, -0.1, 0), M.floor(), 'floor'));
room.addChild(floor);

const wallBack = doc.createNode('wall_back').setTranslation([0, 0, -3]);
room.addChild(wallBack);
part(wallBack, new THREE.BoxGeometry(8.15, 3, 0.15).translate(0.075, 1.5, -0.075), M.wall(), [0, 0, 0], 0, 'wall_back_panel');
part(wallBack, new THREE.BoxGeometry(8, 0.12, 0.03), M.trim(), [0, 0.06, 0.015], 0, 'wall_back_skirting');

const wallRight = doc.createNode('wall_right').setTranslation([4, 0, 0]);
room.addChild(wallRight);
part(wallRight, new THREE.BoxGeometry(0.15, 3, 6).translate(0.075, 1.5, 0), M.wall(), [0, 0, 0], 0, 'wall_right_panel');
part(wallRight, new THREE.BoxGeometry(0.03, 0.12, 6), M.trim(), [-0.015, 0.06, 0], 0, 'wall_right_skirting');

// lounge (left): a sofa against the back wall, a rug and a table in front, a floor lamp and a plant
{
  const p = piece(room, 'lounge', 'sofa', [-2.5, 0, -2.45]);
  part(p, box(2.2, 0.4, 0.9, 0.08), M.sofa(), [0, 0.3, 0.05]);
  part(p, box(2.2, 0.55, 0.22, 0.08), M.sofa(), [0, 0.6, -0.34]);
  for (const x of [-1.04, 1.04]) part(p, box(0.2, 0.42, 0.9, 0.08), M.sofa(), [x, 0.5, 0.05]);
  for (const x of [-0.55, 0.55]) part(p, box(0.95, 0.14, 0.7, 0.06), M.cushion(), [x, 0.56, 0.1]);
  for (const [x, z] of [[-1, -0.35], [1, -0.35], [-1, 0.45], [1, 0.45]]) part(p, cyl(0.03, 0.025, 0.1, 10), M.wood(), [x, 0.05, z]);
}
{
  const p = piece(room, 'lounge', 'rug', [-2.5, 0, -1.1]);
  part(p, box(2.6, 0.02, 1.8, 0.01), M.rug(), [0, 0.01, 0]);
}
{
  const p = piece(room, 'lounge', 'coffee-table', [-2.5, 0, -1.15]);
  part(p, cyl(0.5, 0.5, 0.05, 32), M.oak(), [0, 0.42, 0]);
  part(p, cyl(0.06, 0.12, 0.4, 16), M.ink(), [0, 0.2, 0]);
  part(p, box(0.3, 0.05, 0.22, 0.01), M.book(0), [0.12, 0.47, 0.05]);
  part(p, cyl(0.06, 0.05, 0.1, 16), M.pot(), [-0.2, 0.5, -0.1]);
}
{
  const p = piece(room, 'lounge', 'floor-lamp', [-3.6, 0, -2.5]);
  part(p, cyl(0.18, 0.2, 0.04, 24), M.metal(), [0, 0.02, 0]);
  part(p, cyl(0.02, 0.02, 1.5, 10), M.brass(), [0, 0.77, 0]);
  part(p, cyl(0.16, 0.26, 0.32, 24), M.shade(), [0, 1.62, 0]);
}
{
  const p = piece(room, 'lounge', 'plant', [-3.5, 0, 2.3]);
  part(p, cyl(0.24, 0.18, 0.42, 20), M.pot(), [0, 0.21, 0]);
  part(p, cyl(0.02, 0.025, 0.7, 8), M.wood(), [0, 0.75, 0]);
  for (const [x, y, z, s] of [[0, 1.15, 0, 0.3], [0.18, 0.95, 0.08, 0.22], [-0.16, 0.9, -0.06, 0.24], [0.05, 0.78, -0.18, 0.2]]) {
    part(p, new THREE.IcosahedronGeometry(s, 1), M.leaf(), [x, y, z]);
  }
}

// gallery (middle of the back wall): a big board on the wall, a bench and a plinth with a stone
{
  const p = piece(wallBack, 'gallery', 'board', [0.25, 1.55, 0.04], 0, 'back');
  part(p, box(1.9, 1.25, 0.05, 0.02), M.oak(), [0, 0, 0]);
  part(p, plane(1.78, 1.13), M.board(), [0, 0, 0.028], 0, 'board_face');
}
{
  const p = piece(room, 'gallery', 'bench', [0.25, 0, -1.4]);
  part(p, box(1.6, 0.08, 0.42, 0.03), M.oak(), [0, 0.45, 0]);
  for (const x of [-0.7, 0.7]) part(p, box(0.06, 0.42, 0.38, 0.01), M.ink(), [x, 0.21, 0]);
}
{
  const p = piece(room, 'gallery', 'plinth', [1.4, 0, -2.4]);
  part(p, box(0.45, 0.9, 0.45, 0.02), M.trim(), [0, 0.45, 0]);
  part(p, new THREE.DodecahedronGeometry(0.2, 0), M.stone(), [0, 1.1, 0]);
}

// desk (right): a desk with a screen and a lamp, a chair, a poster and a shelf of books on the right wall
{
  const p = piece(room, 'desk', 'desk', [2.9, 0, -2.45]);
  part(p, box(1.8, 0.06, 0.8, 0.02), M.oak(), [0, 0.75, 0]);
  for (const x of [-0.82, 0.82]) for (const z of [-0.32, 0.32]) part(p, cyl(0.025, 0.025, 0.72, 10), M.metal(), [x, 0.36, z]);
  part(p, box(0.8, 0.48, 0.04, 0.015), M.ink(), [-0.15, 1.12, -0.18]);
  part(p, plane(0.74, 0.42), M.screen(), [-0.15, 1.12, -0.158], 0, 'screen_face');
  part(p, cyl(0.03, 0.03, 0.22, 10), M.ink(), [-0.15, 0.89, -0.2]);
}
{
  const p = piece(room, 'desk', 'desk-lamp', [3.6, 0.78, -2.6]);
  part(p, cyl(0.08, 0.09, 0.03, 16), M.metal(), [0, 0.015, 0]);
  part(p, cyl(0.012, 0.012, 0.36, 8), M.brass(), [0, 0.2, 0]);
  part(p, cyl(0.06, 0.12, 0.14, 16), M.shade(), [0, 0.42, 0]);
}
{
  const p = piece(room, 'desk', 'chair', [2.75, 0, -1.6], Math.PI);
  part(p, box(0.5, 0.08, 0.5, 0.04), M.chair(), [0, 0.48, 0]);
  part(p, box(0.48, 0.55, 0.07, 0.04), M.chair(), [0, 0.8, 0.22]);
  part(p, cyl(0.03, 0.03, 0.4, 10), M.metal(), [0, 0.25, 0]);
  part(p, cyl(0.26, 0.26, 0.04, 20), M.metal(), [0, 0.04, 0]);
}
{
  const p = piece(room, 'desk', 'cabinet', [3.55, 0, 1.6]);
  part(p, box(0.6, 0.8, 1.2, 0.02), M.wood(), [0, 0.4, 0]);
  for (const z of [-0.3, 0.3]) part(p, cyl(0.015, 0.015, 0.06, 8), M.brass(), [-0.32, 0.55, z]);
}
{
  const p = piece(wallRight, 'desk', 'poster', [-0.03, 1.65, -1.6], 0, 'right');
  part(p, box(0.04, 1.0, 0.72, 0.01), M.ink(), [0, 0, 0]);
  part(p, plane(0.64, 0.92), M.poster(), [-0.022, 0, 0], -Math.PI / 2, 'poster_face');
}
{
  const p = piece(wallRight, 'desk', 'shelf', [-0.16, 1.55, 1.3], 0, 'right');
  part(p, box(0.28, 0.04, 1.3, 0.01), M.oak(), [0, 0, 0]);
  for (let i = 0; i < 7; i++) part(p, box(0.2, 0.26 + (i % 3) * 0.04, 0.06, 0.01), M.book(i), [0, 0.16 + (i % 3) * 0.02, -0.5 + i * 0.12]);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await new NodeIO().writeBinary(doc));
console.log(`demo room: ${out} (${Math.round((await import('node:fs')).statSync(out).size / 1000)} KB)`);
