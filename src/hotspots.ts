import * as THREE from 'three';
import type { PropStory } from './types';
import type { Editable } from './layout';

// A soft glowing dot on every piece that has a story (src/stories.ts). The dot is a child of the piece,
// so it follows the piece's layout, springs in with it and rides its drawer.

export interface Hotspot { key: string; story: PropStory; obj: THREE.Object3D; dot: THREE.Sprite; wall: boolean; phase: number }

const dotTextures = new Map<string, THREE.Texture>();

/** a dot of the given colour in a white ring, with a soft halo of the same colour */
function drawDot(color: string) {
  const s = 128, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const rgb = new THREE.Color(color).convertLinearToSRGB();
  const tint = (a: number) => `rgba(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)},${a})`;
  const halo = g.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s / 2);
  halo.addColorStop(0, tint(0.55));
  halo.addColorStop(1, tint(0));
  g.fillStyle = halo; g.fillRect(0, 0, s, s);
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.2, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill();
  g.beginPath(); g.arc(s / 2, s / 2, s * 0.13, 0, Math.PI * 2); g.fillStyle = color; g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function addHotspots(editables: Editable[], stories: Record<string, PropStory>, color = '#2F6BFF'): Hotspot[] {
  let dotTexture = dotTextures.get(color);
  if (!dotTexture) dotTextures.set(color, dotTexture = drawDot(color));
  const out: Hotspot[] = [];
  const box = new THREE.Box3();
  const inv = new THREE.Matrix4();
  for (const [key, story] of Object.entries(stories)) {
    const e = editables.find((x) => x.key === key);
    if (!e) {
      if (import.meta.env.DEV) console.warn(`story for "${key}" has no matching piece`);
      continue;
    }
    // the piece's bounds in its own space, so the dot sits right whatever room or angle it is in
    const savedScale = e.obj.scale.clone();
    e.obj.scale.copy(e.pop?.scale ?? savedScale); // pieces wait at scale ~0 until they pop in
    e.obj.updateWorldMatrix(true, true);
    // solid parts only: glow halos and other sprites would push the dot into the air
    box.makeEmpty();
    e.obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) box.expandByObject(o, true); });
    box.applyMatrix4(inv.copy(e.obj.matrixWorld).invert());
    e.obj.scale.copy(savedScale);
    if (box.isEmpty()) continue;
    const c = box.getCenter(new THREE.Vector3());
    const wall = e.room.endsWith('-wall');
    const where = story.dot ?? (wall ? 'front' : 'top');
    const pos = where === 'front' ? new THREE.Vector3(c.x, c.y, box.max.z + 0.08)
      : where === 'below' ? new THREE.Vector3(c.x, box.min.y - 0.14, c.z)
      : new THREE.Vector3(c.x, box.max.y + 0.12, c.z);

    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture, color: '#FFFFFF', transparent: true, depthWrite: false, opacity: 0.95 }));
    dot.position.copy(pos);
    dot.scale.setScalar(0.34);
    dot.renderOrder = 5;
    dot.userData.storyKey = key;
    e.obj.add(dot);
    out.push({ key, story, obj: e.obj, dot, wall, phase: out.length * 1.3 });
  }
  return out;
}

/** Pulse the dots; hide them while their piece is hidden or (for lid pieces) while the lid is shut. */
export function updateHotspots(spots: Hotspot[], time: number, show: boolean, lidOpen: number) {
  for (const h of spots) {
    const onLid = h.obj.parent?.userData.pick === 'center' && !h.obj.parent?.userData.isRoot;
    h.dot.visible = show && h.obj.visible && !h.obj.userData.hidden && (!onLid || lidOpen > 0.9);
    const s = 1 + Math.sin(time * 3 + h.phase) * 0.12;
    h.dot.scale.setScalar(0.34 * s);
  }
}
