// The starter's home: a modelled room (public/models/room.glb and room-pieces.glb) shown as a Popfold diorama,
// kept in home.json. This file draws what the model leaves to the site: the board on the gallery wall, the desk's
// screen, the poster, and the wordmark on the floor while the room lies folded flat. Edit the words in ART_TEXT.
import * as THREE from 'three';
import { homeFromFile } from 'popfold';
import json from './home.json';

export const ART_TEXT = {
  brand: 'your studio',
  board: ['[Your work]', '[in three words]'],
  screen: '[Making things]',
  poster: ['[MAKE]', '[IT]', '[YOURS]'],
  cover: '[a line about you]',
};

const C = { ink: '#1E2A44', paper: '#FBF8F3', coral: '#E0664A', butter: '#F2B544', blue: '#3F6E8C', sage: '#4F8A5B' };
const DISPLAY = '"Bricolage Grotesque Variable", "Arial Black", sans-serif';
const BODY = '"DM Sans Variable", system-ui, sans-serif';

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  return new THREE.CanvasTexture(c);
}

/** The gallery wall's board: three framed works and a title. */
const board = () => canvas(1280, 820, (g) => {
  g.fillStyle = C.paper; g.fillRect(0, 0, 1280, 820);
  [C.coral, C.butter, C.blue].forEach((c, i) => {
    g.fillStyle = C.ink; g.fillRect(90 + i * 380, 300, 340, 400);
    g.fillStyle = c; g.fillRect(110 + i * 380, 320, 300, 360);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(260 + i * 380, 480, 70 + i * 12, 0, Math.PI * 2); g.fill();
  });
  g.fillStyle = C.ink; g.textAlign = 'center';
  g.font = `800 92px ${DISPLAY}`; g.fillText(ART_TEXT.board[0], 640, 150);
  g.font = `500 52px ${BODY}`; g.fillText(ART_TEXT.board[1], 640, 230);
});

/** The desk's screen: a few lines of work in progress. */
const screen = () => canvas(1024, 580, (g) => {
  g.fillStyle = '#141B2D'; g.fillRect(0, 0, 1024, 580);
  g.fillStyle = C.butter; g.font = `800 64px ${DISPLAY}`; g.textAlign = 'left'; g.fillText(ART_TEXT.screen, 60, 120);
  [0.8, 0.55, 0.7, 0.4].forEach((w, i) => { g.fillStyle = i % 2 ? C.blue : C.sage; g.fillRect(60, 190 + i * 80, 900 * w, 38); });
});

/** The poster on the right wall: three words. */
const poster = () => canvas(640, 920, (g) => {
  g.fillStyle = C.coral; g.fillRect(0, 0, 640, 920);
  g.fillStyle = C.paper; g.textAlign = 'center'; g.font = `800 150px ${DISPLAY}`;
  ART_TEXT.poster.forEach((t, i) => g.fillText(t, 320, 290 + i * 220));
});

/** Laid on the floor while the room lies flat: the wordmark. */
const cover = () => canvas(1600, 1200, (g) => {
  g.clearRect(0, 0, 1600, 1200);
  g.fillStyle = C.ink; g.textAlign = 'center';
  g.font = `800 220px ${DISPLAY}`; g.fillText(ART_TEXT.brand, 800, 620);
  g.font = `500 70px ${BODY}`; g.fillText(ART_TEXT.cover, 800, 760);
});

const made = homeFromFile(json, { diorama: { art: { art_board: board, art_screen: screen, art_poster: poster }, cover } });
export const ROOM = made.recipe;
export const BEATS = made.beats;
export const LINKS = made.transitions;
