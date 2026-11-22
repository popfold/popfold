import * as THREE from 'three';
import * as tex from './textures';

/** Twinkling sparkles floating around the house. */
export function sparkles(count = 70) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 4 + Math.random() * 6;
    const a = Math.random() * Math.PI * 2;
    p[i * 3] = Math.cos(a) * r;
    p[i * 3 + 1] = 0.5 + Math.random() * 5;
    p[i * 3 + 2] = Math.sin(a) * r * 0.7;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({
    map: tex.sparkle(), color: '#FFF4C2', size: 0.32, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.9,
  });
  return new THREE.Points(geo, mat);
}
