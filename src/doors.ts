// How a door shows that it is one: a piece that carries a link (transitions.ts). Three cues, each a link can turn
// down with its `cue`:
//   - a portal marker on it (a ring with an arrow, unlike a story's dot), for a door without a story of its own;
//   - a glow while the pointer is on it, with the link's words by the pointer;
//   - once per visit, when the story reaches the door's section, the door pulses and the marker ripples.
// 'full' (the default) is all three; 'hover' shows only the glow and the words, once the pointer finds the door;
// 'none' shows nothing (an easter egg: the door still works, and the pointer still says so).
import * as THREE from 'three';
import type { Editable } from './layout';
import type { Transition } from './transitions';

export type DoorCue = 'full' | 'hover' | 'none';

export interface Door {
  key: string;
  link: Transition;
  /** the link's words, for the label by the pointer */
  label: string;
  cue: DoorCue;
  /** the piece has a story of its own (its dot and card stand in for the marker) */
  hasStory: boolean;
  obj: THREE.Object3D;
  marker: THREE.Sprite | null;
  /** the piece's own copies of its glowing materials, made on its first glow, and their resting light */
  glow: { mat: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }[] | null;
  /** when the beckon started (ms), and whether it has played this visit */
  beckonAt: number | null;
  beckoned: boolean;
  phase: number;
}

const markerTextures = new Map<string, THREE.Texture>();

/** a ring with an arrow through it, in the colour, with a soft halo: "a way through" */
function drawMarker(color: string) {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const rgb = new THREE.Color(color).convertLinearToSRGB();
  const tint = (a: number) => `rgba(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)},${a})`;
  const halo = g.createRadialGradient(s / 2, s / 2, s * 0.22, s / 2, s / 2, s / 2);
  halo.addColorStop(0, tint(0.5)); halo.addColorStop(1, tint(0));
  g.fillStyle = halo; g.fillRect(0, 0, s, s);
  g.lineWidth = s * 0.07; g.strokeStyle = '#FFFFFF';
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.25, 0, Math.PI * 2); g.stroke();
  g.lineWidth = s * 0.045; g.strokeStyle = color;
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.25, 0, Math.PI * 2); g.stroke();
  // the arrow
  g.fillStyle = '#FFFFFF'; g.strokeStyle = color; g.lineWidth = s * 0.02; g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(s * 0.36, s * 0.45); g.lineTo(s * 0.52, s * 0.45); g.lineTo(s * 0.52, s * 0.37); g.lineTo(s * 0.66, s * 0.5);
  g.lineTo(s * 0.52, s * 0.63); g.lineTo(s * 0.52, s * 0.55); g.lineTo(s * 0.36, s * 0.55); g.closePath();
  g.fill(); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Doors for a home's pieces that carry a link: `links` by piece key, with the words each shows. */
export function addDoors(editables: Editable[], links: Map<string, { link: Transition; label: string }>, hasStory: (key: string) => boolean, cueDefault: DoorCue, color = '#2F6BFF'): Door[] {
  let texture = markerTextures.get(color);
  if (!texture) markerTextures.set(color, texture = drawMarker(color));
  const out: Door[] = [];
  const box = new THREE.Box3(), inv = new THREE.Matrix4();
  for (const [key, { link, label }] of links) {
    const e = editables.find((x) => x.key === key);
    if (!e) continue;
    const cue = link.cue ?? cueDefault;
    const story = hasStory(key);
    let marker: THREE.Sprite | null = null;
    if (cue === 'full' && !story) {
      // in front of the piece's middle (a door is usually on a wall, seen from the front)
      const saved = e.obj.scale.clone();
      e.obj.scale.copy(e.pop?.scale ?? saved);
      e.obj.updateWorldMatrix(true, true);
      box.makeEmpty();
      e.obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) box.expandByObject(o, true); });
      box.applyMatrix4(inv.copy(e.obj.matrixWorld).invert());
      e.obj.scale.copy(saved);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.95 }));
        marker.position.set(c.x, c.y, box.max.z + 0.1);
        marker.scale.setScalar(0.42);
        marker.renderOrder = 5;
        e.obj.add(marker);
      }
    }
    out.push({ key, link, label, cue, hasStory: story, obj: e.obj, marker, glow: null, beckonAt: null, beckoned: false, phase: out.length * 1.7 });
  }
  return out;
}

const BECKON_MS = 1400;

/** the piece's own copies of its lit materials, so its glow does not light other pieces that share them */
function glowOf(d: Door) {
  if (d.glow) return d.glow;
  d.glow = [];
  d.obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || o === d.marker) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    const own = list.map((mat) => {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std.isMeshStandardMaterial) return mat;
      const copy = std.clone();
      d.glow!.push({ mat: copy, color: copy.emissive.clone(), intensity: copy.emissiveIntensity });
      return copy;
    });
    m.material = Array.isArray(m.material) ? own : own[0];
  });
  return d.glow;
}

const warm = new THREE.Color('#FFE9B0');

/**
 * Each frame: show or hide the markers (like story dots: not while their piece is hidden or an effect plays),
 * ripple them on a beckon, and light the hovered door. `hovered` is the door under the pointer.
 */
export function updateDoors(doors: Door[], time: number, show: boolean, hovered: Door | null, now: number) {
  for (const d of doors) {
    const shown = show && d.obj.visible && !d.obj.userData.hidden;
    const beckon = d.beckonAt === null ? 0 : Math.max(0, Math.sin(Math.PI * Math.min(1, (now - d.beckonAt) / BECKON_MS)));
    if (d.beckonAt !== null && now - d.beckonAt > BECKON_MS) d.beckonAt = null;
    if (d.marker) {
      d.marker.visible = shown;
      d.marker.scale.setScalar(0.42 * (1 + Math.sin(time * 2.4 + d.phase) * 0.08 + beckon * 0.6));
      (d.marker.material as THREE.SpriteMaterial).opacity = 0.95 - beckon * 0.3;
    }
    const lit = d.cue === 'none' ? 0 : Math.max(hovered === d && shown ? 0.55 : 0, d.cue === 'full' ? beckon * 0.8 : 0);
    if (lit > 0 || d.glow) {
      for (const g of glowOf(d)) {
        g.mat.emissive.copy(g.color).lerp(warm, Math.min(1, lit * 1.5));
        g.mat.emissiveIntensity = g.intensity + lit;
      }
      if (lit === 0) for (const g of d.glow!) { g.mat.emissive.copy(g.color); g.mat.emissiveIntensity = g.intensity; }
    }
  }
}

/** Start each door's beckon the first time the story reaches its section (`atBeat`: the beat the story rests at). */
export function beckonAt(doors: Door[], atBeat: string | null, now: number) {
  if (!atBeat) return;
  for (const d of doors) {
    if (d.cue !== 'full' || d.beckoned || d.link.from !== atBeat || !d.obj.visible) continue;
    d.beckoned = true;
    d.beckonAt = now;
  }
}

/** Is any door still beckoning (so the scene keeps drawing)? */
export const doorsBusy = (doors: Door[], now: number) => doors.some((d) => d.beckonAt !== null && now - d.beckonAt <= BECKON_MS);
