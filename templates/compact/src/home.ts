// The starter's home: an office in a box (the compact shell). What is in it, and where, is data: home.json.
// This file is the code that data needs: how each kind of piece is built (no model files here). Swap colours, pieces and stories freely.
import * as THREE from 'three';
import json from './home.json';
import { P, homeFromFile, rbox, tex, toy, type PieceKind } from 'popfold';

// the pieces' palette: ink navy, warm sand, coral accent, sage and butter for small things (the case's own colours
// and the rooms' surfaces are in home.json, under "look")
export const K = { navy: '#1E2A44', ink: '#141B2D', sand: '#EFE6D8', paper: '#FBF8F3', coral: '#FF6B4A', sage: '#8DB59A', butter: '#FFD66B', sky: '#9CC3E6', walnut: '#7A5236' };

/** A desk with a laptop and a mug. Origin = floor under the desk's centre. */
function desk() {
  const g = new THREE.Group();
  const wood = toy(K.walnut, { roughness: 0.55, clearcoat: 0.3 });
  const top = rbox(1.7, 0.08, 0.8, 0.03, wood);
  top.position.y = 0.76;
  g.add(top);
  for (const x of [-0.78, 0.78]) {
    const leg = rbox(0.06, 0.74, 0.7, 0.02, toy(K.ink, { roughness: 0.4 }));
    leg.position.set(x, 0.37, 0);
    g.add(leg);
  }
  const base = rbox(0.56, 0.03, 0.38, 0.02, toy('#C9CDD6', { roughness: 0.3 }));
  base.position.set(0.1, 0.815, 0.08);
  const screen = rbox(0.56, 0.36, 0.025, 0.02, toy(K.ink, { roughness: 0.3 }));
  screen.position.set(0.1, 0.99, -0.1);
  screen.rotation.x = -0.18;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshStandardMaterial({ color: K.sky, emissive: K.sky, emissiveIntensity: 0.7 }));
  glow.position.set(0.1, 0.99, -0.085);
  glow.rotation.x = -0.18;
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 20), toy(K.coral));
  mug.position.set(-0.55, 0.855, 0.15);
  g.add(base, screen, glow, mug);
  return g;
}

/** A swivel chair. */
function chair() {
  const g = new THREE.Group();
  const fabric = toy(K.coral, { roughness: 0.7, clearcoat: 0.1 });
  const seat = rbox(0.5, 0.1, 0.48, 0.05, fabric);
  seat.position.y = 0.48;
  const back = rbox(0.48, 0.5, 0.08, 0.05, fabric);
  back.position.set(0, 0.78, -0.22);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 12), toy(K.ink));
  post.position.y = 0.24;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 24), toy(K.ink));
  foot.position.y = 0.03;
  g.add(seat, back, post, foot);
  return g;
}

/** A whiteboard covered in sticky notes, drawn on canvas. */
function whiteboard() {
  const board = tex.canvasTexture((g, s) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, s, s);
    g.strokeStyle = K.navy; g.lineWidth = s * 0.01;
    g.beginPath(); g.moveTo(s * 0.08, s * 0.82); g.bezierCurveTo(s * 0.3, s * 0.7, s * 0.5, s * 0.5, s * 0.9, s * 0.18); g.stroke();
    const notes = [K.butter, K.coral, K.sage, K.sky, K.butter, K.coral, K.sage];
    notes.forEach((c, i) => {
      const x = s * (0.1 + (i % 4) * 0.21), y = s * (0.12 + Math.floor(i / 4) * 0.3);
      g.save(); g.translate(x, y); g.rotate(((i * 37) % 9 - 4) * 0.02);
      g.fillStyle = c; g.fillRect(0, 0, s * 0.16, s * 0.16);
      g.fillStyle = 'rgba(20,27,45,.55)';
      for (let l = 0; l < 3; l++) g.fillRect(s * 0.02, s * (0.04 + l * 0.04), s * (0.1 - l * 0.02), s * 0.012);
      g.restore();
    });
  }, 512);
  return P.pictureFrame(1.6, 1.1, board, '#C9CDD6');
}

/** A long workbench with two monitors, for the build room. */
function workbench() {
  const g = new THREE.Group();
  const top = rbox(2.4, 0.08, 0.7, 0.03, toy(K.sand, { roughness: 0.5 }));
  top.position.y = 0.74;
  g.add(top);
  for (const x of [-1.1, 1.1]) {
    const leg = rbox(0.08, 0.72, 0.6, 0.02, toy(K.navy));
    leg.position.set(x, 0.36, 0);
    g.add(leg);
  }
  for (const x of [-0.55, 0.55]) {
    const mon = rbox(0.62, 0.38, 0.04, 0.02, toy(K.ink));
    mon.position.set(x, 1.1, -0.15);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.32), new THREE.MeshStandardMaterial({ color: x < 0 ? K.sage : K.butter, emissive: x < 0 ? K.sage : K.butter, emissiveIntensity: 0.5 }));
    scr.position.set(x, 1.1, -0.128);
    const stand = rbox(0.06, 0.2, 0.06, 0.02, toy(K.ink));
    stand.position.set(x, 0.88, -0.15);
    g.add(mon, scr, stand);
  }
  return g;
}

/** A low two-seat sofa in sage with navy cushions. */
function loveseat() {
  const g = new THREE.Group();
  const fabric = toy(K.sage, { roughness: 0.8, clearcoat: 0.05 });
  const seat = rbox(1.7, 0.22, 0.72, 0.08, fabric);
  seat.position.y = 0.3;
  const back = rbox(1.7, 0.5, 0.2, 0.08, fabric);
  back.position.set(0, 0.6, -0.27);
  g.add(seat, back);
  for (const x of [-0.8, 0.8]) {
    const arm = rbox(0.18, 0.4, 0.72, 0.07, fabric);
    arm.position.set(x, 0.44, 0);
    g.add(arm);
  }
  for (const x of [-0.42, 0.42]) {
    const cushion = rbox(0.42, 0.34, 0.12, 0.06, toy(x < 0 ? K.navy : K.coral, { roughness: 0.75 }));
    cushion.position.set(x, 0.58, -0.12);
    cushion.rotation.x = -0.18;
    g.add(cushion);
  }
  for (const x of [-0.7, 0.7]) for (const z of [-0.26, 0.26]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.2, 10), toy(K.walnut));
    leg.position.set(x, 0.1, z);
    g.add(leg);
  }
  return g;
}

/** A round-backed armchair in coral. */
function armchair() {
  const g = new THREE.Group();
  const fabric = toy(K.coral, { roughness: 0.8, clearcoat: 0.05 });
  const seat = rbox(0.66, 0.2, 0.62, 0.08, fabric);
  seat.position.y = 0.3;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.5, 28, 1, true, Math.PI * 0.6, Math.PI * 0.8), fabric);
  back.material = fabric.clone();
  (back.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
  back.position.set(0, 0.6, 0.02);
  g.add(seat, back);
  for (const x of [-0.25, 0.25]) for (const z of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.2, 10), toy(K.walnut));
    leg.position.set(x, 0.1, z);
    g.add(leg);
  }
  return g;
}

/** A round walnut coffee table with a stack of books. */
function coffeeTable() {
  const g = new THREE.Group();
  const wood = toy(K.walnut, { roughness: 0.5, clearcoat: 0.35 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 36), wood);
  top.position.y = 0.38;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.35, 16), wood);
  stem.position.y = 0.18;
  g.add(top, stem);
  [K.navy, K.butter, K.coral].forEach((c, i) => {
    const book = rbox(0.3 - i * 0.03, 0.05, 0.22 - i * 0.02, 0.01, toy(c, { roughness: 0.6 }));
    book.position.set(-0.08, 0.435 + i * 0.05, 0.02);
    book.rotation.y = i * 0.25;
    g.add(book);
  });
  return g;
}

/** A leafy plant in a terracotta pot. `h` = overall height. */
function plant(h = 1.1) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.32, 24), toy('#C96F4A', { roughness: 0.7, clearcoat: 0.1 }));
  pot.position.y = 0.16;
  g.add(pot);
  const leaf = toy('#4F8A5B', { roughness: 0.55 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, h - 0.3, 8), toy('#5B4632'));
  stem.position.y = 0.3 + (h - 0.3) / 2;
  g.add(stem);
  for (let i = 0; i < 9; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), leaf);
    l.scale.set(1, 0.35, 0.6);
    const a = i * 2.4, y = 0.45 + (i / 8) * (h - 0.5);
    l.position.set(Math.cos(a) * 0.14, y, Math.sin(a) * 0.14);
    l.rotation.set(0.5, -a, 0.3);
    g.add(l);
  }
  return g;
}

/** A tall walnut bookcase, shelves full of books and a few objects. */
function bookcase() {
  const g = new THREE.Group();
  const wood = toy(K.walnut, { roughness: 0.55, clearcoat: 0.3 });
  const w = 1.2, h = 1.9, d = 0.38;
  for (const x of [-w / 2, w / 2]) {
    const side = rbox(0.05, h, d, 0.015, wood);
    side.position.set(x, h / 2, 0);
    g.add(side);
  }
  const back = rbox(w, h, 0.03, 0.01, toy('#5E3E28', { roughness: 0.7 }));
  back.position.set(0, h / 2, -d / 2 + 0.015);
  g.add(back);
  const colors = [K.navy, K.coral, K.butter, K.sage, K.sky, K.paper, K.ink];
  for (let r = 0; r < 5; r++) {
    const y = r * 0.45 + 0.03;
    const shelf = rbox(w, 0.04, d, 0.01, wood);
    shelf.position.set(0, y, 0);
    g.add(shelf);
    if (r === 4) break;
    let x = -w / 2 + 0.06;
    let n = r * 3;
    while (x < w / 2 - 0.12) {
      if ((r + n) % 7 === 3) { // now and then a small vase instead of books
        const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 16), toy(colors[(n + 2) % colors.length]));
        vase.position.set(x + 0.08, y + 0.12, 0);
        g.add(vase);
        x += 0.18;
      } else {
        const bw = 0.04 + ((n * 13) % 4) * 0.012, bh = 0.26 + ((n * 7) % 5) * 0.025;
        const book = rbox(bw, bh, 0.24, 0.006, toy(colors[n % colors.length], { roughness: 0.6 }));
        book.position.set(x + bw / 2, y + 0.02 + bh / 2, 0.02);
        g.add(book);
        x += bw + 0.008;
      }
      n++;
    }
  }
  return g;
}

/** A framed chart: rising bars and a trend line, drawn on canvas. */
function chartFrame() {
  const t = tex.canvasTexture((g, s) => {
    g.fillStyle = K.paper; g.fillRect(0, 0, s, s);
    const bars = [0.25, 0.35, 0.32, 0.5, 0.62, 0.78];
    bars.forEach((b, i) => { g.fillStyle = i === bars.length - 1 ? K.coral : K.navy; g.fillRect(s * (0.12 + i * 0.13), s * (0.88 - b * 0.8), s * 0.09, s * b * 0.8); });
    g.strokeStyle = K.coral; g.lineWidth = s * 0.02; g.beginPath();
    bars.forEach((b, i) => { const x = s * (0.165 + i * 0.13), y = s * (0.8 - b * 0.8); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  }, 256);
  return P.pictureFrame(0.8, 0.6, t, K.walnut);
}

/** A kanban board: three columns of sticky notes. */
function kanban() {
  const t = tex.canvasTexture((g, s) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, s, s);
    g.fillStyle = K.navy; g.font = `700 ${s * 0.06}px "DM Sans Variable", sans-serif`;
    ['To do', 'Doing', 'Done'].forEach((h, c) => g.fillText(h, s * (0.05 + c * 0.33), s * 0.1));
    g.fillStyle = '#D5DBE6';
    for (const c of [1, 2]) g.fillRect(s * c * 0.33 - s * 0.01, s * 0.04, s * 0.006, s * 0.92);
    const notes: [number, number, string][] = [[0, 0, K.butter], [0, 1, K.sky], [0, 2, K.butter], [1, 0, K.coral], [1, 1, K.sage], [2, 0, K.sage], [2, 1, K.sage], [2, 2, K.sky], [2, 3, K.sage]];
    for (const [c, r, col] of notes) {
      g.fillStyle = col;
      g.fillRect(s * (0.05 + c * 0.33), s * (0.16 + r * 0.2), s * 0.24, s * 0.15);
    }
  }, 512);
  return P.pictureFrame(1.3, 0.85, t, '#C9CDD6');
}

// How to build each kind of piece that home.json names. Built-in pieces come from P; the rest are the functions above.
const kinds: Record<string, PieceKind> = {
  'striped-rug': () => P.rug(2.4, 1.8, tex.stripes([K.sand, K.paper, K.coral, K.paper], 10)),
  'dotted-rug': () => P.rug(2.4, 1.6, tex.dots(K.sage, K.paper, 6, 2)),
  runner: () => P.rug(3.0, 1.3, tex.stripes([K.navy, K.paper], 12)),
  'floor-lamp': () => P.floorLamp(K.coral),
  spark: () => P.spark(),
  plant: (s) => plant(Number(s.opts?.height ?? 1.1)),
  desk, chair, armchair, whiteboard, chart: chartFrame, bookcase, loveseat, 'coffee-table': coffeeTable, workbench, kanban,
};

// The home and its story come from home.json (checked: a mistake in the file is reported in words). The file says
// what the home is: its look, its story and what is in it. This file adds what data cannot hold: how each kind
// of piece is built.
export const { recipe: OFFICE, beats: BEATS, transitions: LINKS } = homeFromFile(json, { kinds });
