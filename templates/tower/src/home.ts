// The starter's home: a small building of four floors (the tower shell). Its floors, what is on them and where
// are data: home.json. This file is the code that data needs: how each kind of piece is built (no model files). Each floor has a neon colour; pieces pick it up for their screens
// and lights, so one kind looks at home on any floor. Swap colours, pieces and stories freely.
import * as THREE from 'three';
import json from './home.json';
import { P, homeFromFile, rbox, tex, toy, type PieceKind } from 'popfold';

// palette: a dark building, pale furniture, and the floors' neon for anything that glows
export const K = { night: '#1A1830', slab: '#24223D', steel: '#3A3860', bone: '#E9E6F2', mist: '#B9B5D6', wood: '#8A6A4F', ink: '#0E0D1C' };

/** The neon colour of the floor a piece is being built for. */
const neon = (ctx: Parameters<PieceKind>[1]) => ('color' in ctx ? ctx.color : '#3EE6FF');
/** Something that gives off light in the floor's colour: a screen, a lamp, an LED. */
const lit = (color: string, strength = 1.6) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: strength, roughness: 0.4 });

/** A desk with a glowing monitor and a keyboard. Origin = floor under the desk's centre. */
function desk(color: string) {
  const g = new THREE.Group();
  const top = rbox(1.6, 0.07, 0.75, 0.03, toy(K.bone, { roughness: 0.5 }));
  top.position.y = 0.74;
  g.add(top);
  for (const x of [-0.72, 0.72]) {
    const leg = rbox(0.06, 0.72, 0.65, 0.02, toy(K.steel, { roughness: 0.4 }));
    leg.position.set(x, 0.36, 0);
    g.add(leg);
  }
  const monitor = rbox(0.7, 0.42, 0.04, 0.02, toy(K.ink, { roughness: 0.3 }));
  monitor.position.set(0, 1.08, -0.18);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), lit(color, 1.2));
  screen.position.set(0, 1.08, -0.158);
  const stand = rbox(0.06, 0.14, 0.06, 0.02, toy(K.ink));
  stand.position.set(0, 0.84, -0.18);
  const keys = rbox(0.42, 0.02, 0.14, 0.01, toy(K.steel));
  keys.position.set(0, 0.79, 0.14);
  g.add(monitor, screen, stand, keys);
  return g;
}

/** A swivel chair. Faces +z; turn it to face a desk. */
function chair() {
  const g = new THREE.Group();
  const fabric = toy(K.mist, { roughness: 0.7, clearcoat: 0.1 });
  const seat = rbox(0.48, 0.09, 0.46, 0.04, fabric);
  seat.position.y = 0.47;
  const back = rbox(0.46, 0.48, 0.07, 0.04, fabric);
  back.position.set(0, 0.76, -0.21);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 12), toy(K.steel));
  post.position.y = 0.24;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 24), toy(K.steel));
  foot.position.y = 0.03;
  g.add(seat, back, post, foot);
  return g;
}

/** A round stool. */
function stool(color: string) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 24), toy(color, { roughness: 0.5 }));
  seat.position.y = 0.52;
  g.add(seat);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.52, 8), toy(K.steel));
    leg.position.set(Math.cos(a) * 0.14, 0.26, Math.sin(a) * 0.14);
    g.add(leg);
  }
  return g;
}

/** A tall open shelf of books and boxes. */
function shelf(color: string) {
  const g = new THREE.Group();
  const frame = toy(K.steel, { roughness: 0.45 });
  const w = 1.5, h = 1.7, d = 0.36;
  for (const x of [-w / 2, w / 2]) {
    const side = rbox(0.05, h, d, 0.015, frame);
    side.position.set(x, h / 2, 0);
    g.add(side);
  }
  const colors = [K.bone, K.mist, color, K.wood, K.bone, K.mist];
  for (let r = 0; r < 4; r++) {
    const y = 0.05 + r * 0.52;
    const board = rbox(w, 0.04, d, 0.01, frame);
    board.position.set(0, y, 0);
    g.add(board);
    let x = -w / 2 + 0.08, n = r * 2;
    while (x < w / 2 - 0.14) {
      const bw = 0.05 + ((n * 13) % 4) * 0.014, bh = 0.26 + ((n * 7) % 5) * 0.03;
      const book = rbox(bw, bh, 0.24, 0.006, toy(colors[n % colors.length], { roughness: 0.6 }));
      book.position.set(x + bw / 2, y + 0.02 + bh / 2, 0);
      g.add(book);
      x += bw + ((n % 5) === 4 ? 0.12 : 0.01);
      n++;
    }
  }
  return g;
}

/** A leafy plant in a pot. */
function plant() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.32, 24), toy(K.bone, { roughness: 0.6 }));
  pot.position.y = 0.16;
  g.add(pot);
  const leaf = toy('#5FBF8A', { roughness: 0.55 });
  for (let i = 0; i < 9; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), leaf);
    l.scale.set(1, 0.35, 0.6);
    const a = i * 2.4, y = 0.45 + (i / 8) * 0.6;
    l.position.set(Math.cos(a) * 0.14, y, Math.sin(a) * 0.14);
    l.rotation.set(0.5, -a, 0.3);
    g.add(l);
  }
  return g;
}

/** A wide drawing table with sheets of paper and a light strip. */
function drawingTable(color: string) {
  const g = new THREE.Group();
  const top = rbox(2.2, 0.07, 1.0, 0.03, toy(K.bone, { roughness: 0.5 }));
  top.position.y = 0.8;
  g.add(top);
  for (const x of [-0.95, 0.95]) for (const z of [-0.4, 0.4]) {
    const leg = rbox(0.07, 0.78, 0.07, 0.02, toy(K.steel));
    leg.position.set(x, 0.39, z);
    g.add(leg);
  }
  [[-0.6, 0.05, 0.1, '#FFFFFF'], [0.15, -0.1, -0.15, K.mist], [0.7, 0.1, 0.25, '#FFFFFF']].forEach(([x, z, turn, c], i) => {
    const sheet = rbox(0.5, 0.012, 0.36, 0.005, toy(c as string, { roughness: 0.8 }));
    sheet.position.set(x as number, 0.845 + i * 0.004, z as number);
    sheet.rotation.y = turn as number;
    g.add(sheet);
  });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.03, 0.05), lit(color));
  strip.position.set(0, 1.25, -0.42);
  for (const x of [-0.9, 0.9]) {
    const arm = rbox(0.03, 0.42, 0.03, 0.01, toy(K.steel));
    arm.position.set(x, 1.04, -0.42);
    g.add(arm);
  }
  g.add(strip);
  return g;
}

/** A long workbench with two monitors. */
function workbench(color: string) {
  const g = new THREE.Group();
  const top = rbox(2.4, 0.08, 0.7, 0.03, toy(K.wood, { roughness: 0.55 }));
  top.position.y = 0.74;
  g.add(top);
  for (const x of [-1.1, 1.1]) {
    const leg = rbox(0.08, 0.72, 0.6, 0.02, toy(K.steel));
    leg.position.set(x, 0.36, 0);
    g.add(leg);
  }
  for (const x of [-0.5, 0.5]) {
    const mon = rbox(0.62, 0.38, 0.04, 0.02, toy(K.ink));
    mon.position.set(x, 1.1, -0.15);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.32), lit(x < 0 ? color : K.bone, x < 0 ? 1.2 : 0.5));
    scr.position.set(x, 1.1, -0.128);
    const stand = rbox(0.06, 0.2, 0.06, 0.02, toy(K.ink));
    stand.position.set(x, 0.88, -0.15);
    g.add(mon, scr, stand);
  }
  return g;
}

/** A rack of machines with rows of small lights. */
function rack(color: string) {
  const g = new THREE.Group();
  const body = rbox(0.7, 1.8, 0.6, 0.03, toy(K.ink, { roughness: 0.35, metalness: 0.3 }));
  body.position.y = 0.9;
  g.add(body);
  for (let r = 0; r < 6; r++) {
    const unit = rbox(0.6, 0.2, 0.02, 0.01, toy(K.steel, { roughness: 0.4 }));
    unit.position.set(0, 0.28 + r * 0.27, 0.3);
    g.add(unit);
    for (let i = 0; i < 4; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.02), lit((r + i) % 3 ? color : K.bone, 2));
      led.position.set(-0.2 + i * 0.07, 0.28 + r * 0.27, 0.315);
      g.add(led);
    }
  }
  return g;
}

/** A small stack of crates. */
function crates(color: string) {
  const g = new THREE.Group();
  const spots: [number, number, number, number, string][] = [[0, 0.25, 0, 0.5, K.wood], [0.56, 0.2, 0.05, 0.4, K.steel], [0.1, 0.68, 0, 0.36, color]];
  for (const [x, y, z, size, c] of spots) {
    const box = rbox(size, size, size, 0.03, toy(c, { roughness: 0.6 }));
    box.position.set(x, y, z);
    box.rotation.y = x * 0.5;
    g.add(box);
  }
  return g;
}

/** A toy rocket on a launch stand. */
function rocket(color: string) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.66, 0.1, 32), toy(K.steel, { roughness: 0.5 }));
  pad.position.y = 0.05;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.0, 28), toy(K.bone, { roughness: 0.3, clearcoat: 0.6 }));
  body.position.y = 0.85;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 28), toy(color, { roughness: 0.3, clearcoat: 0.6 }));
  nose.position.y = 1.56;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.1, 28), toy(color, { roughness: 0.3 }));
  band.position.y = 0.6;
  const porthole = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), lit(color, 1.4));
  porthole.position.set(0, 1.05, 0.242);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 20), lit(color, 2.2));
  flame.position.y = 0.22;
  flame.rotation.x = Math.PI;
  g.add(pad, body, nose, band, porthole, flame);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const fin = rbox(0.05, 0.34, 0.24, 0.015, toy(color, { roughness: 0.35 }));
    fin.position.set(Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3);
    fin.rotation.y = -a;
    g.add(fin);
  }
  return g;
}

/** A pinboard of notes joined by string, drawn on canvas. A wall piece: upright, origin at its middle. */
function pinboard(color: string) {
  const t = tex.canvasTexture((g, s) => {
    g.fillStyle = '#2C2A4A'; g.fillRect(0, 0, s, s);
    g.strokeStyle = color; g.lineWidth = s * 0.008;
    g.beginPath(); g.moveTo(s * 0.2, s * 0.25); g.lineTo(s * 0.52, s * 0.5); g.lineTo(s * 0.8, s * 0.24); g.moveTo(s * 0.52, s * 0.5); g.lineTo(s * 0.4, s * 0.8); g.stroke();
    const notes: [number, number, string][] = [[0.1, 0.12, K.bone], [0.42, 0.38, color], [0.7, 0.1, K.bone], [0.3, 0.68, K.mist], [0.66, 0.62, K.bone]];
    for (const [x, y, c] of notes) {
      g.fillStyle = c; g.fillRect(s * x, s * y, s * 0.2, s * 0.22);
      g.fillStyle = 'rgba(14,13,28,.55)';
      for (let l = 0; l < 3; l++) g.fillRect(s * (x + 0.03), s * (y + 0.05 + l * 0.05), s * (0.14 - l * 0.03), s * 0.014);
    }
  }, 512);
  return P.pictureFrame(1.5, 1.0, t, K.steel);
}

/** A grid of colour swatches. A wall piece. */
function swatches(color: string) {
  const t = tex.canvasTexture((g, s) => {
    g.fillStyle = K.bone; g.fillRect(0, 0, s, s);
    const colors = [color, '#3EE6FF', '#B8FF5C', '#FFB347', K.night, K.mist, K.wood, '#FFFFFF'];
    colors.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(s * (0.06 + (i % 4) * 0.23), s * (0.1 + Math.floor(i / 4) * 0.44), s * 0.19, s * 0.36);
    });
  }, 256);
  return P.pictureFrame(1.5, 0.9, t, K.steel);
}

/** A big screen with a rising chart. A wall piece. */
function screen(color: string) {
  const t = tex.canvasTexture((g, s) => {
    g.fillStyle = K.ink; g.fillRect(0, 0, s, s);
    const bars = [0.2, 0.28, 0.26, 0.4, 0.55, 0.72, 0.9];
    bars.forEach((b, i) => { g.fillStyle = i === bars.length - 1 ? '#FFFFFF' : color; g.fillRect(s * (0.08 + i * 0.125), s * (0.9 - b * 0.78), s * 0.085, s * b * 0.78); });
  }, 256);
  const frame = P.pictureFrame(1.7, 1.0, t, K.ink);
  // let the chart glow a little, like a screen that is on
  frame.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.map === t) { m.emissive = new THREE.Color('#FFFFFF'); m.emissiveMap = t; m.emissiveIntensity = 0.7; } });
  return frame;
}

// How to build each kind of piece that home.json names. Each takes the neon colour of the floor it is on.
const kinds: Record<string, PieceKind> = {
  desk: (_s, ctx) => desk(neon(ctx)),
  chair,
  stool: (_s, ctx) => stool(neon(ctx)),
  shelf: (_s, ctx) => shelf(neon(ctx)),
  plant,
  'drawing-table': (_s, ctx) => drawingTable(neon(ctx)),
  workbench: (_s, ctx) => workbench(neon(ctx)),
  rack: (_s, ctx) => rack(neon(ctx)),
  crates: (_s, ctx) => crates(neon(ctx)),
  rocket: (_s, ctx) => rocket(neon(ctx)),
  pinboard: (_s, ctx) => pinboard(neon(ctx)),
  swatches: (_s, ctx) => swatches(neon(ctx)),
  screen: (_s, ctx) => screen(neon(ctx)),
};

// The home and its story come from home.json (checked: a mistake in the file is reported in words). The file says
// what the home is: its floors and building, its story and what is on each floor. This file adds what data cannot
// hold: how each kind of piece is built.
export const { recipe: TOWER, beats: BEATS, transitions: LINKS } = homeFromFile(json, { kinds });
