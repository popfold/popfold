import * as THREE from 'three';

// All textures are drawn on 2D canvases at runtime: no image files to host or load.

type Draw = (g: CanvasRenderingContext2D, s: number) => void;

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function canvasTexture(draw: Draw, size = 512, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

export const checker = (a: string, b: string, n = 8, repeat = 1) =>
  canvasTexture((g, s) => {
    const k = s / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? a : b;
        g.fillRect(i * k, j * k, k, k);
      }
  }, 512, repeat);

export const stripes = (colors: string[], n = 8, repeat = 1) =>
  canvasTexture((g, s) => {
    const k = s / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i % colors.length];
      g.fillRect(i * k, 0, k, s);
    }
  }, 512, repeat);

export const dots = (bg: string, dot: string, n = 6, repeat = 1) =>
  canvasTexture((g, s) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, s, s);
    g.fillStyle = dot;
    const k = s / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const off = j % 2 ? k / 2 : 0;
        g.beginPath();
        g.arc(i * k + k / 2 + off, j * k + k / 2, k * 0.18, 0, Math.PI * 2);
        g.fill();
        if (off) { g.beginPath(); g.arc(off - k / 2, j * k + k / 2, k * 0.18, 0, Math.PI * 2); g.fill(); }
      }
  }, 512, repeat);

export const waves = (bg: string, line: string, n = 7, repeat = 1) =>
  canvasTexture((g, s) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = line;
    g.lineWidth = s / n / 3.2;
    g.lineCap = 'round';
    const k = s / n;
    for (let j = 0; j < n; j++) {
      g.beginPath();
      for (let x = 0; x <= s; x += 4) {
        const y = j * k + k / 2 + Math.sin((x / s) * Math.PI * 4) * k * 0.22;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  }, 512, repeat);

export const terrazzo = (bg: string, chips: string[], seed = 7, repeat = 1) =>
  canvasTexture((g, s) => {
    const r = seeded(seed);
    g.fillStyle = bg;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = chips[i % chips.length];
      const x = r() * s, y = r() * s, rad = 4 + r() * 14;
      g.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2 + r();
        const rr = rad * (0.6 + r() * 0.6);
        a === 0 ? g.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr) : g.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      g.closePath();
      g.fill();
    }
  }, 512, repeat);

export const rings = (colors: string[]) =>
  canvasTexture((g, s) => {
    const n = colors.length * 2;
    for (let i = n; i > 0; i--) {
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      g.arc(s / 2, s / 2, (i / n) * (s / 2), 0, Math.PI * 2);
      g.fill();
    }
  });

/** Abstract "painting" for picture frames. */
export const blobArt = (bg: string, colors: string[], seed = 3) =>
  canvasTexture((g, s) => {
    const r = seeded(seed);
    g.fillStyle = bg;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      g.ellipse(r() * s, r() * s, s * (0.15 + r() * 0.25), s * (0.1 + r() * 0.2), r() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }, 256);

/** Lid emblem: heart + wordmark, transparent background. */
export const emblem = ({ heart: withHeart = false, title = 'popfold', subtitle = '' }: { heart?: boolean; title?: string; subtitle?: string } = {}) =>
  canvasTexture((g, s) => {
    g.clearRect(0, 0, s, s);
    const cx = s / 2, cy = s * 0.4, k = s * 0.0042;
    if (withHeart) {
    g.fillStyle = '#FFE066';
    g.strokeStyle = '#3B0A1E';
    g.lineWidth = s * 0.018;
    g.beginPath();
    g.moveTo(cx, cy + 40 * k);
    g.bezierCurveTo(cx - 70 * k, cy - 5 * k, cx - 55 * k, cy - 55 * k, cx - 25 * k, cy - 55 * k);
    g.bezierCurveTo(cx - 10 * k, cy - 55 * k, cx, cy - 42 * k, cx, cy - 32 * k);
    g.bezierCurveTo(cx, cy - 42 * k, cx + 10 * k, cy - 55 * k, cx + 25 * k, cy - 55 * k);
    g.bezierCurveTo(cx + 55 * k, cy - 55 * k, cx + 70 * k, cy - 5 * k, cx, cy + 40 * k);
    g.closePath();
    g.fill();
    g.stroke();
    }
    g.fillStyle = '#FFFFFF';
    g.textAlign = 'center';
    g.font = `800 ${s * 0.11}px "Bricolage Grotesque Variable", "Arial Black", sans-serif`;
    g.fillText(title, cx, s * 0.76);
    g.font = `700 ${s * 0.07}px "DM Sans Variable", sans-serif`;
    g.fillText(subtitle.toUpperCase().split('').join(' '), cx, s * 0.87);
  }, 1024);

/** Round number badge for the "how it works" steps. */
export const badge = (label: string, bg: string, fg: string, ring = '#1B1630') =>
  canvasTexture((g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = ring;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2); g.fill();
    g.fillStyle = bg;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); g.fill();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${s * 0.5}px "Bricolage Grotesque Variable", "Arial Black", sans-serif`;
    g.fillText(label, s / 2, s * 0.53);
  }, 256);

/** Soft radial glow for lamps and sparkles (use with additive blending). */
export const glow = () =>
  canvasTexture((g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,240,200,0.6)');
    grd.addColorStop(1, 'rgba(255,220,180,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }, 128);

export const sparkle = () =>
  canvasTexture((g, s) => {
    const c = s / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(c, 0); g.quadraticCurveTo(c, c, s, c); g.quadraticCurveTo(c, c, c, s); g.quadraticCurveTo(c, c, 0, c); g.quadraticCurveTo(c, c, c, 0);
    g.fill();
  }, 128);
