// Cross-stitch from a picture: the picture is read into a grid of stitches in a few thread colours, then sewn
// onto a canvas as far as a progress number says, the way an embroiderer works: one thread at a time, row by row,
// every / leg along the row and every \ leg back. The progress can go down as well as up (the stitches come out
// again), so it can follow the scroll. Plain numbers and canvas drawing: no three.js here.

export interface StitchGrid {
  /** stitches across and down */
  cols: number;
  rows: number;
  /** the thread colours, as CSS colours */
  threads: string[];
  /** each cell's thread (an index into threads), or -1 where the cloth shows */
  cells: Int16Array;
  /** the legs in sewing order: cell index * 2 + leg (0 is /, 1 is \); -1 is a leg sewn elsewhere (the other page of a spread) */
  legs: Int32Array;
}

type RGB = [number, number, number];

/** the k-means threads of a set of pixels: starts spread over the pixels' brightness, so the result is the same every time */
function threadsOf(px: RGB[], k: number, rounds = 12): { centres: RGB[]; label: Uint8Array } {
  const sorted = [...px].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centres: RGB[] = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]] as RGB);
  const label = new Uint8Array(px.length);
  for (let r = 0; r < rounds; r++) {
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      const p = px[i];
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const q = centres[c];
        const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      label[i] = best;
      const s = sum[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    centres = centres.map((c, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c));
  }
  return { centres, label };
}

const sat = (c: RGB) => Math.max(...c) - Math.min(...c);
const lum = (c: RGB) => (c[0] + c[1] + c[2]) / 3;
const hex = (c: RGB) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** a thread's colour from a picture's: dyed thread is richer than a photo of it, whose colours the grid averages */
function dyed(c: RGB, more = 1.45): RGB {
  const m = (c[0] + c[1] + c[2]) / 3;
  const lift = m < 60 ? (60 - m) * 0.6 : 0; // the darkest threads still read as a colour, not as black
  return c.map((v) => m + (v - m) * more + lift) as RGB;
}

/**
 * Reads pixels (RGBA, cols × rows, one per stitch) into a stitch grid. The cloth is the colour most of the edge
 * cells share, and any pale, greyish thread joined to the edge through such cells (a photo's shadow on the cloth)
 * is cloth too. Threads are sewn darkest-red first, then by brightness, as a pattern usually is.
 */
export function stitchGrid(rgba: Uint8ClampedArray, cols: number, rows: number, threadCount = 12): StitchGrid {
  const px: RGB[] = [];
  for (let i = 0; i < cols * rows; i++) px.push([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
  const { centres, label } = threadsOf(px, threadCount);
  // the cloth: the thread most edge cells have
  const edgeCount = new Array(threadCount).fill(0);
  for (let x = 0; x < cols; x++) { edgeCount[label[x]]++; edgeCount[label[(rows - 1) * cols + x]]++; }
  for (let y = 0; y < rows; y++) { edgeCount[label[y * cols]]++; edgeCount[label[y * cols + cols - 1]]++; }
  const cloth = centres[edgeCount.indexOf(Math.max(...edgeCount))];
  const near = (c: RGB, t: number) => Math.hypot(c[0] - cloth[0], c[1] - cloth[1], c[2] - cloth[2]) < t;
  const isCloth = centres.map((c) => near(c, 28));
  // pale greys and tans joined to the edge: shadow on the cloth, not thread
  const weak = centres.map((c) => !isCloth[c.indexOf(Math.max(...c))] && sat(c) < 48 && lum(c) > lum(cloth) * 0.55);
  const cells = new Int16Array(cols * rows);
  for (let i = 0; i < cells.length; i++) cells[i] = isCloth[label[i]] ? -1 : label[i];
  const seen = new Uint8Array(cells.length);
  const stack: number[] = [];
  for (let x = 0; x < cols; x++) stack.push(x, (rows - 1) * cols + x);
  for (let y = 0; y < rows; y++) stack.push(y * cols, y * cols + cols - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const t = cells[i];
    if (t >= 0 && !weak[t]) continue;
    cells[i] = -1;
    const x = i % cols, y = (i / cols) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < cols - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - cols);
    if (y < rows - 1) stack.push(i + cols);
  }
  // the sewing order: reds (warm, saturated) first, then the rest from light to dark
  const used = centres.map((_, k) => k).filter((k) => !isCloth[k]);
  const warm = (c: RGB) => c[0] > c[1] * 1.25 && c[0] > c[2] * 1.2 && sat(c) > 40;
  used.sort((a, b) => Number(warm(centres[b])) - Number(warm(centres[a])) || lum(centres[b]) - lum(centres[a]));
  const legs: number[] = [];
  for (const k of used) {
    for (let y = 0; y < rows; y++) {
      const row: number[] = [];
      for (let x = 0; x < cols; x++) if (cells[y * cols + x] === k) row.push(y * cols + x);
      for (const i of row) legs.push(i * 2);
      for (let j = row.length - 1; j >= 0; j--) legs.push(row[j] * 2 + 1);
    }
  }
  return { cols, rows, threads: centres.map((c) => hex(dyed(c))), cells, legs: Int32Array.from(legs) };
}

function shade(c: string, f: number) {
  const n = parseInt(c.slice(1), 16);
  return `rgb(${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))).join(',')})`;
}

/**
 * Sews a grid onto a 2D context inside the rectangle (x, y, w, h), up to `progress` (0 to 1) of its legs. Sewing on
 * adds only the new legs. Unpicking takes out only the cells it empties: each is cleared back to `cloth` (a canvas
 * the size of the context's, with what lies under the stitches) and the legs still in it and its neighbours are
 * stamped again inside it. Either way the work per call follows how far the progress moved, not the whole picture.
 */
export function stitcher(grid: StitchGrid, g: CanvasRenderingContext2D, cloth: CanvasImageSource, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / grid.cols, h / grid.rows);
  const ox = x + (w - s * grid.cols) / 2, oy = y + (h - s * grid.rows) / 2;
  // each thread's two legs, drawn once and stamped
  const pad = Math.ceil(s * 0.3);
  const sprites = grid.threads.map((c) => [0, 1].map((leg) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(s) + pad * 2;
    const t = cv.getContext('2d', { willReadFrequently: true })!;
    const a = leg ? [pad + s, pad, pad, pad + s] : [pad, pad, pad + s, pad + s];
    t.lineCap = 'round';
    t.strokeStyle = shade(c, -0.45); t.lineWidth = s * 0.42;
    t.beginPath(); t.moveTo(a[0], a[1] + s * 0.06); t.lineTo(a[2], a[3] + s * 0.06); t.stroke();
    t.strokeStyle = c; t.lineWidth = s * 0.34;
    t.beginPath(); t.moveTo(a[0], a[1]); t.lineTo(a[2], a[3]); t.stroke();
    t.strokeStyle = shade(c, 0.3); t.lineWidth = s * 0.09;
    t.beginPath(); t.moveTo(a[0] + s * 0.06, a[1] - s * 0.03); t.lineTo(a[2] + s * 0.06, a[3] - s * 0.03); t.stroke();
    return cv;
  }));
  // where each leg comes in the sewing order, so an unpicked cell knows which of its neighbours' legs stay
  const order = new Int32Array(grid.cols * grid.rows * 2).fill(-1);
  grid.legs.forEach((v, j) => { if (v >= 0) order[v] = j; });
  const stamp = (v: number) => {
    const i = v >> 1;
    g.drawImage(sprites[grid.cells[i]][v & 1], ox + (i % grid.cols) * s - pad, oy + ((i / grid.cols) | 0) * s - pad);
  };
  let sewn = 0;
  return {
    /** stitch size in pixels */
    size: s,
    /** sews (or unpicks) to this progress; returns whether anything changed */
    to(progress: number): boolean {
      const n = Math.round(Math.max(0, Math.min(1, progress)) * grid.legs.length);
      if (n === sewn) return false;
      if (n > sewn) {
        for (let j = sewn; j < n; j++) if (grid.legs[j] >= 0) stamp(grid.legs[j]);
      } else {
        const emptied = new Set<number>();
        for (let j = n; j < sewn; j++) if (grid.legs[j] >= 0) emptied.add(grid.legs[j] >> 1);
        for (const i of emptied) {
          const cx = i % grid.cols, cy = (i / grid.cols) | 0;
          const rx = Math.floor(ox + cx * s), ry = Math.floor(oy + cy * s), rw = Math.ceil(s) + 1, rh = Math.ceil(s) + 1;
          g.save();
          g.beginPath(); g.rect(rx, ry, rw, rh); g.clip();
          g.drawImage(cloth, rx, ry, rw, rh, rx, ry, rw, rh);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
            const c = ny * grid.cols + nx;
            for (const leg of [0, 1]) { const at = order[c * 2 + leg]; if (at >= 0 && at < n) stamp(c * 2 + leg); }
          }
          g.restore();
        }
      }
      sewn = n;
      return true;
    },
  };
}

/** Aida cloth: the plain weave embroidery is sewn on, with a hole at every stitch corner. */
export function aida(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cols: number, rows: number, color = '#E8E0D1') {
  const s = Math.min(w / cols, h / rows);
  const ox = x + (w - s * cols) / 2, oy = y + (h - s * rows) / 2;
  g.fillStyle = color; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(120,100,80,0.07)';
  for (let r = 0; r < rows; r++) for (let c = r % 2; c < cols; c += 2) g.fillRect(ox + c * s, oy + r * s, s, s);
  g.fillStyle = 'rgba(70,55,40,0.32)';
  const d = Math.max(1, s * 0.16);
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) g.fillRect(ox + c * s - d / 2, oy + r * s - d / 2, d, d);
}
