#!/usr/bin/env node
// The "Made with Popfold" badges in assets/badges/: three designs (heart, fold, mark), each light and dark, drawn
// in Popfold's own colours. Run after changing a badge: node tools/badges.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/badges');
const INK = '#1B1A2E', PAPER = '#FAF7F0', CORAL = '#FF5C4D', BLUE = '#2F4BFF', CLOUD = '#E6E3F0';
const FONT = `font-family="'Bricolage Grotesque','DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif"`;
const theme = { light: { bg: PAPER, line: INK, text: INK, fold: BLUE }, dark: { bg: INK, line: CLOUD, text: PAPER, fold: CLOUD } };
const heart = (x, y, s, stroke) => `<path d="M${x} ${y + 7 * s} C${x - 8 * s} ${y + 1 * s} ${x - 11 * s} ${y - 3 * s} ${x - 8 * s} ${y - 6 * s} C${x - 5.5 * s} ${y - 8.2 * s} ${x - 2.5 * s} ${y - 7.5 * s} ${x} ${y - 4.5 * s} C${x + 2.5 * s} ${y - 7.5 * s} ${x + 5.5 * s} ${y - 8.2 * s} ${x + 8 * s} ${y - 6 * s} C${x + 11 * s} ${y - 3 * s} ${x + 8 * s} ${y + 1 * s} ${x} ${y + 7 * s} Z" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round"/>`;
const svg = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
// centred in the room after the icon, so it balances in whichever font the reader has
const label = (t, x) => `<text x="${(x + 196 - 14) / 2}" y="23" text-anchor="middle" ${FONT} font-size="14" font-weight="700" fill="${t.text}">Made with Popfold</text>`;

const badges = {
  // A: a pill with a heart
  heart: (t) => svg(196, 36, 'Made with Popfold', `<rect x="1" y="1" width="194" height="34" rx="17" fill="${t.bg}" stroke="${t.line}" stroke-width="1.5"/>${heart(22, 18, 1, CORAL)}${label(t, 40)}`),
  // B: a pill with a page whose corner is folded
  fold: (t) => svg(196, 36, 'Made with Popfold', `<rect x="1" y="1" width="194" height="34" rx="17" fill="${t.bg}" stroke="${t.line}" stroke-width="1.5"/><path d="M14 10 H25 L31 16 V27 H14 Z" fill="none" stroke="${t.fold}" stroke-width="2.2" stroke-linejoin="round"/><path d="M25 10 V16 H31" fill="none" stroke="${t.fold}" stroke-width="2.2" stroke-linejoin="round"/>${label(t, 40)}`),
  // E: the mark alone, a heart folded down the middle
  mark: (t) => svg(44, 44, 'Made with Popfold', `<circle cx="22" cy="22" r="20.5" fill="${t.bg}" stroke="${t.line}" stroke-width="1.5"/>${heart(22, 23, 1.15, CORAL)}<path d="M22 18 V31" stroke="${CORAL}" stroke-width="1.6" stroke-dasharray="2 2"/>`),
};

mkdirSync(out, { recursive: true });
for (const [name, draw] of Object.entries(badges)) {
  for (const mode of ['light', 'dark']) writeFileSync(`${out}/made-with-popfold-${name}-${mode}.svg`, draw(theme[mode]));
}
console.log(`badges: wrote ${Object.keys(badges).length * 2} files to assets/badges/`);
