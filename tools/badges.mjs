#!/usr/bin/env node
// The "Made with Popfold" badges in assets/badges/: three designs (Popfold's P, a folded corner, the P alone), each light and dark, drawn
// in Popfold's own colours. Run after changing a badge: node tools/badges.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/badges');
const INK = '#1B1A2E', PAPER = '#FAF7F0', BLUE = '#2F4BFF', CLOUD = '#E6E3F0';
const FONT = `font-family="'Bricolage Grotesque','DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif"`;
const theme = { light: { bg: PAPER, line: INK, text: INK, fold: BLUE }, dark: { bg: INK, line: CLOUD, text: PAPER, fold: CLOUD } };
// Popfold's P: a blue letter folded back along its bowl, with a coral corner (popfold.ca's own mark); its stem is ink
// on light and paper on dark
const P = (x, y, s, stem) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M29 10 H72 a10 10 0 0 1 10 10 V54 a10 10 0 0 1 -10 10 H44 V87 a3 3 0 0 1 -3 3 H29 a3 3 0 0 1 -3 -3 V13 a3 3 0 0 1 3 -3 Z" fill="#2F4BFF"/><path d="M64 10 H72 a10 10 0 0 1 10 10 V54 a10 10 0 0 1 -10 10 H64 Z" fill="#1F36C7"/><path d="M64 10 H72 a10 10 0 0 1 10 10 V28 Z" fill="#6E82FF"/><path d="M82 46 V54 a10 10 0 0 1 -10 10 H64 Z" fill="#FF5C4D"/><path d="M29 10 H44 V90 H29 a3 3 0 0 1 -3 -3 V13 a3 3 0 0 1 3 -3 Z" fill="${stem}"/></g>`;
const svg = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
// centred in the room after the icon, so it balances in whichever font the reader has
const label = (t, x) => `<text x="${(x + 196 - 14) / 2}" y="23" text-anchor="middle" ${FONT} font-size="14" font-weight="700" fill="${t.text}">Made with Popfold</text>`;

const badges = {
  // A: a pill with Popfold's P
  p: (t) => svg(196, 36, 'Made with Popfold', `<rect x="1" y="1" width="194" height="34" rx="17" fill="${t.bg}" stroke="${t.line}" stroke-width="1.5"/>${P(7, 3.9, 0.29, t.text)}${label(t, 40)}`),
  // B: a pill with a page whose corner is folded
  fold: (t) => svg(196, 36, 'Made with Popfold', `<rect x="1" y="1" width="194" height="34" rx="17" fill="${t.bg}" stroke="${t.line}" stroke-width="1.5"/><path d="M14 10 H25 L31 16 V27 H14 Z" fill="none" stroke="${t.fold}" stroke-width="2.2" stroke-linejoin="round"/><path d="M25 10 V16 H31" fill="none" stroke="${t.fold}" stroke-width="2.2" stroke-linejoin="round"/>${label(t, 40)}`),
  // E: the mark alone: Popfold's P in a circle
  mark: (t) => svg(44, 44, 'Made with Popfold', `<circle cx="22" cy="22" r="20.5" fill="${t.bg}" stroke="${t.line}" stroke-width="1.5"/>${P(4.5, 5.6, 0.33, t.text)}`),
};

mkdirSync(out, { recursive: true });
for (const [name, draw] of Object.entries(badges)) {
  for (const mode of ['light', 'dark']) writeFileSync(`${out}/made-with-popfold-${name}-${mode}.svg`, draw(theme[mode]));
}
console.log(`badges: wrote ${Object.keys(badges).length * 2} files to assets/badges/`);
