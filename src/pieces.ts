// A home's listed pieces, as far as they can be read without building anything: their keys, their stories, and
// readHome(), which checks a home's JSON file.
// No 3D code here, so tools can use it on a plain list of pieces.
import type { BeatData } from './keyframes';
import type { Places } from './layout';
import type { FloorSpec, TowerSpec } from './tower';
import type { Transition } from './transitions';
import type { HomeRecipe, PieceSpec, PropStory } from './types';

/** The key of a listed piece: "<room>/<id>", or "<room>-wall/<id>" on a wall. `rooms` is the recipe's own room names. */
export const pieceKey = (p: Pick<PieceSpec, 'id' | 'room' | 'wall'>, rooms?: HomeRecipe['rooms']) => `${(rooms as Record<string, string> | undefined)?.[p.room] ?? p.room}${p.wall ? '-wall' : ''}/${p.id}`;

/** Every story of a home by piece key: the ones its listed pieces carry, then the recipe's own `stories`. */
export function storiesOf(recipe: Pick<HomeRecipe, 'pieces' | 'rooms' | 'stories'>): Record<string, PropStory> {
  const out: Record<string, PropStory> = {};
  for (const p of recipe.pieces ?? []) if (p.story) out[pieceKey(p, recipe.rooms)] = p.story;
  return { ...out, ...recipe.stories };
}

/** A tower's floor as data: its id, the neon sign on its back wall, its colour and (optionally) its height. */
export interface FloorData { id: string; label: string; color: string; height?: number }

/** A tower's building, beside its floors: its colours, the pipe beside the lift, the lift and its size. */
export interface TowerData {
  /** the walls' and the slabs' colours (default #1A1830 and #24223D) */
  wall?: string;
  slab?: string;
  /** the glowing pipe beside the lift, in this colour, with a branch into every floor; left out, there is none */
  spine?: string;
  /** a lift that rides to the open floor (default none) */
  elevator?: boolean;
  /** the floors' pipes are cables, drawn in and plugged in as each floor opens (see TowerSpec.cables) */
  cables?: { plug?: string; size?: number; tint?: string };
  /** a floor's width and depth (default 6 and 4), and a storey's height (default 2.4) */
  width?: number;
  depth?: number;
  floorHeight?: number;
}

/** A book as data: its pages (each a spread and a room), their size and the covers' and paper's colours. */
export interface BookData {
  pages: { id: string; label?: string; color?: string; art?: string; stitch?: boolean | number }[];
  width?: number;
  height?: number;
  cover?: string;
  paper?: string;
  closed?: boolean;
}

/** One surface of a compact: a plain colour, or a pattern drawn in two or more colours. */
export type SurfaceData = string | {
  pattern: 'checker' | 'stripes' | 'dots' | 'waves' | 'terrazzo';
  /** checker: the two squares. stripes: every stripe. dots and waves: the ground, then the dots or lines. terrazzo: the ground, then the chips */
  colors: string[];
  /** how many squares, stripes, dots or waves across (terrazzo: which scatter of chips) */
  count?: number;
  /** how many times the pattern repeats across the surface (default 1) */
  repeat?: number;
};

/** A compact's look as data: its case, its colours and what each floor and wall is covered with. */
export interface LookData {
  shell?: 'round' | 'crisp' | 'code' | { url: string };
  parts?: Partial<Record<'base' | 'lid' | 'drawers' | 'walls' | 'clasp' | 'heart', 'round' | 'crisp' | { url: string }>>;
  corner?: number;
  base: string; lid: string; heart: string; leftSlab: string; rightSlab: string;
  centerFloor: SurfaceData; lidPaper: SurfaceData; leftFloor: SurfaceData; leftWall: SurfaceData; rightFloor: SurfaceData; rightWall: SurfaceData;
  badges?: [string, string][];
  badgeRing?: string;
  trim?: string;
  drawerWall?: string;
}

/** A diorama as data: its room model and how the story opens it. Its art and cover are drawn in code. */
export interface DioramaData {
  /** the room GLB, relative to the site */
  url: string;
  /** its pieces in a file of their own (`popfold split-room`), shown when they land */
  pieces?: string;
  /** metres to scene units (default 0.5) */
  scale?: number;
  /** the model's zone that the story's centre (c), left (L) and right (R) fields open */
  zones: { center: string; left: string; right: string };
  /** the piece (or pieces) whose light the story's glow field controls */
  lamp?: string | string[];
  /** the model's own colours, changed: a colour for a material, by its name ({ "wall": "#E8DCC8" }) */
  paint?: Record<string, string>;
}

/** What is in a home, as it is kept in a JSON file (see schema/home.schema.json). */
export interface HomeData {
  id: string;
  name: string;
  blurb: string;
  /** a compact's look: its case, colours and surfaces */
  look?: LookData;
  /** the lid's wordmark, and whether it carries a heart */
  emblem?: { title?: string; subtitle?: string; heart?: boolean };
  /** the colours shown beside the home in the studio's picker */
  swatch?: string[];
  /** a tower's floors, top floor first; a compact has none */
  floors?: FloorData[];
  /** a tower's building: its colours, pipe, lift and size */
  tower?: TowerData;
  /** the time of day the home is shown in (default day) */
  mood?: 'day' | 'evening';
  /** a modelled room instead of the compact */
  diorama?: DioramaData;
  /** a pop-up storybook instead of the compact: its pages turn one by one */
  book?: BookData;
  /** stories of pieces the file does not list (a diorama's model parts), by key */
  stories?: Record<string, PropStory>;
  /** where the studio put pieces the file does not list, by key */
  places?: Places;
  /** links between sections and homes: a card on the page without 3D, a door in 3D (see transitions.ts) */
  transitions?: Transition[];
  /** the story: one beat per page section, in the page's order (a home shown on one page) */
  beats?: BeatData[];
  pieces: PieceSpec[];
}

const ID = /^[a-z0-9][a-z0-9-]*$/;
/** what a beat can set (the same names as BEAT_DEFAULTS in keyframes.ts; a test keeps the two in step) */
const PATTERNS = ['checker', 'stripes', 'dots', 'waves', 'terrazzo'];
const LOOK_COLOURS = ['base', 'lid', 'heart', 'leftSlab', 'rightSlab'];
const LOOK_SURFACES = ['centerFloor', 'lidPaper', 'leftFloor', 'leftWall', 'rightFloor', 'rightWall'];
const BEAT_FIELDS = ['c', 'L', 'R', 'glow', 'badges', 'hero', 'side', 'av', 'ax', 'az', 'wave'];
const PIECE_FIELDS: Record<string, 'string' | 'number' | 'boolean' | 'object'> = {
  id: 'string', room: 'string', kind: 'string', at: 'object', wall: 'boolean', turn: 'number', lift: 'number', out: 'number',
  size: 'number', scale: 'number', delay: 'number', fold: 'string', hidden: 'boolean', lamp: 'boolean', opts: 'object', story: 'object',
};

/**
 * Check a home's data (the contents of its JSON file) and hand it back typed. Every mistake found is listed in
 * the error, each with the piece it is in, so a typo in the file is reported in words and not as a blank home.
 */
export function readHome(json: unknown): HomeData {
  const wrong: string[] = [];
  const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!obj(json)) throw new Error('a home file must hold one object: { "id", "name", "pieces": [...] }');
  const home = json;
  if (typeof home.id !== 'string' || !ID.test(home.id)) wrong.push('"id" must be lower-case letters, digits and dashes');
  if (typeof home.name !== 'string' || !home.name) wrong.push('"name" is missing');
  if (home.blurb !== undefined && typeof home.blurb !== 'string') wrong.push('"blurb" must be text');
  if (home.mood !== undefined && home.mood !== 'day' && home.mood !== 'evening') wrong.push('"mood" must be "day" or "evening"');
  for (const k of Object.keys(home)) if (!['$schema', 'id', 'name', 'blurb', 'look', 'emblem', 'swatch', 'mood', 'floors', 'tower', 'book', 'diorama', 'beats', 'pieces', 'stories', 'places', 'transitions'].includes(k)) wrong.push(`"${k}" is not something a home file has`);
  const text = (v: unknown): v is string => typeof v === 'string' && v !== '';
  const three = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(num);
  /** a story, wherever it is kept */
  const checkStory = (s: Record<string, unknown>, where: string) => {
    if (typeof s.title !== 'string' || typeof s.text !== 'string') wrong.push(`${where}: its story needs a "title" and a "text"`);
    if (!Array.isArray(s.tags) || !s.tags.every((t) => typeof t === 'string')) wrong.push(`${where}: its story needs "tags", a list of words (it may be empty)`);
    if (s.dot !== undefined && !['top', 'front', 'below'].includes(s.dot as string)) wrong.push(`${where}: its story's "dot" must be top, front or below`);
    for (const k of Object.keys(s)) if (!['title', 'text', 'tags', 'dot', 'meta', 'kicker', 'links'].includes(k)) wrong.push(`${where}: "${k}" is not something a story has`);
  };
  const shells = ['look', 'floors', 'diorama', 'book'].filter((k) => home[k] !== undefined);
  if (shells.length > 1) wrong.push(`a home is one of a compact ("look"), a tower ("floors"), a diorama ("diorama") or a book ("book"); this file has ${shells.map((k) => `"${k}"`).join(' and ')}`);
  if (home.diorama !== undefined) {
    const d = home.diorama;
    if (!obj(d)) wrong.push('"diorama" must be an object: { "url", "zones" }');
    else {
      if (!text(d.url)) wrong.push('diorama: "url" (its room model) is missing');
      if (d.pieces !== undefined && !text(d.pieces)) wrong.push('diorama: "pieces" must be the path of its pieces\' model');
      if (d.scale !== undefined && !(num(d.scale) && d.scale > 0)) wrong.push('diorama: "scale" must be a number above 0');
      if (d.lamp !== undefined && !text(d.lamp) && !(Array.isArray(d.lamp) && d.lamp.length && d.lamp.every(text))) wrong.push('diorama: "lamp" must be the name of a piece, or a list of them');
      if (!obj(d.zones) || !['center', 'left', 'right'].every((z) => text((d.zones as Record<string, unknown>)[z]))) wrong.push('diorama: "zones" must name the zone for "center", "left" and "right"');
      else for (const k of Object.keys(d.zones)) if (!['center', 'left', 'right'].includes(k)) wrong.push(`diorama: zones: "${k}" is not one of center, left, right`);
      if (d.paint !== undefined) {
        if (!obj(d.paint)) wrong.push('diorama: "paint" must be an object: { "<material>": "<colour>" }');
        else for (const [name, c] of Object.entries(d.paint)) if (!text(c)) wrong.push(`diorama: paint: "${name}" must be a colour`);
      }
      for (const k of Object.keys(d)) if (!['url', 'pieces', 'scale', 'zones', 'lamp', 'paint'].includes(k)) wrong.push(`diorama: "${k}" is not something a diorama has (its art and cover are drawn in code)`);
    }
    if (Array.isArray(home.pieces) && home.pieces.length) wrong.push('a diorama\'s pieces come from its model: "pieces" must be empty (give their stories in "stories")');
  }
  const KEY = /^[a-z0-9][a-z0-9-]*\/[^/\s]+$/;
  if (home.stories !== undefined) {
    if (!obj(home.stories)) wrong.push('"stories" must be an object: { "<room>/<piece>": { "title", "text", "tags" } }');
    else for (const [key, s] of Object.entries(home.stories)) {
      if (!KEY.test(key)) wrong.push(`stories: "${key}" is not a piece key ("<room>/<piece>")`);
      if (!obj(s)) wrong.push(`stories: "${key}" must be a story: { "title", "text", "tags" }`);
      else checkStory(s, `stories: "${key}"`);
    }
  }
  if (home.places !== undefined) {
    if (!obj(home.places)) wrong.push('"places" must be an object: { "<room>/<piece>": { "p", "r", "s", "hide" } }');
    else for (const [key, e] of Object.entries(home.places)) {
      const where = `places: "${key}"`;
      if (!KEY.test(key)) wrong.push(`${where} is not a piece key ("<room>/<piece>")`);
      if (!obj(e)) { wrong.push(`${where} must be an object`); continue; }
      if (e.p !== undefined && !three(e.p)) wrong.push(`${where}: "p" must be three numbers, where it stands`);
      if (e.r !== undefined && !three(e.r)) wrong.push(`${where}: "r" must be three numbers, its turn in radians`);
      if (e.s !== undefined && !(num(e.s) && e.s > 0)) wrong.push(`${where}: "s" must be a number above 0, its size`);
      if (e.hide !== undefined && typeof e.hide !== 'boolean') wrong.push(`${where}: "hide" must be true or false`);
      for (const k of Object.keys(e)) if (!['p', 'r', 's', 'hide'].includes(k)) wrong.push(`${where}: "${k}" is not something a place has (it has p, r, s, hide)`);
    }
  }
  if (home.swatch !== undefined && !(Array.isArray(home.swatch) && home.swatch.every(text))) wrong.push('"swatch" must be a list of colours');
  if (home.emblem !== undefined) {
    if (!obj(home.emblem)) wrong.push('"emblem" must be an object');
    else for (const [k, v] of Object.entries(home.emblem)) {
      if (!['title', 'subtitle', 'heart'].includes(k)) wrong.push(`emblem: "${k}" is not something an emblem has (it has title, subtitle, heart)`);
      else if (typeof v !== (k === 'heart' ? 'boolean' : 'string')) wrong.push(`emblem: "${k}" must be ${k === 'heart' ? 'true or false' : 'text'}`);
    }
  }
  if (home.look !== undefined) {
    if (!obj(home.look)) wrong.push('"look" must be an object');
    else {
      const look = home.look;
      for (const k of LOOK_COLOURS) if (!text(look[k])) wrong.push(`look: "${k}" must be a colour`);
      for (const k of LOOK_SURFACES) {
        const s = look[k];
        if (text(s)) continue;
        if (!obj(s)) { wrong.push(`look: "${k}" must be a colour, or a pattern: { "pattern", "colors" }`); continue; }
        if (!PATTERNS.includes(s.pattern as string)) wrong.push(`look: "${k}" has no pattern "${String(s.pattern)}" (there are ${PATTERNS.join(', ')})`);
        if (!(Array.isArray(s.colors) && s.colors.length >= 2 && s.colors.every(text))) wrong.push(`look: "${k}" needs "colors", at least two`);
        for (const n of ['count', 'repeat']) if (s[n] !== undefined && !(num(s[n]) && (s[n] as number) > 0)) wrong.push(`look: "${k}": "${n}" must be a number above 0`);
        for (const n of Object.keys(s)) if (!['pattern', 'colors', 'count', 'repeat'].includes(n)) wrong.push(`look: "${k}": "${n}" is not something a surface has`);
      }
      if (look.shell !== undefined && !['round', 'crisp', 'code'].includes(look.shell as string) && !(obj(look.shell) && text(look.shell.url))) wrong.push('look: "shell" must be round, crisp, code or { "url" }');
      if (look.corner !== undefined && !num(look.corner)) wrong.push('look: "corner" must be a number from 0 to 1');
      if (look.parts !== undefined) {
        if (!obj(look.parts)) wrong.push('look: "parts" must be an object: { "lid": "crisp" }');
        else for (const [k, v] of Object.entries(look.parts)) {
          if (!['base', 'lid', 'drawers', 'walls', 'clasp', 'heart'].includes(k)) wrong.push(`look: parts: "${k}" is not a part of the case (base, lid, drawers, walls, clasp, heart)`);
          else if (!['round', 'crisp'].includes(v as string) && !(obj(v) && text(v.url))) wrong.push(`look: parts: "${k}" must be round, crisp or { "url" }`);
        }
        if (look.shell === 'code') wrong.push('look: "parts" come from modelled cases, so not with shell "code"');
      }
      for (const k of ['badgeRing', 'trim', 'drawerWall']) if (look[k] !== undefined && !text(look[k])) wrong.push(`look: "${k}" must be a colour`);
      if (look.badges !== undefined && !(Array.isArray(look.badges) && look.badges.length === 3 && look.badges.every((b) => Array.isArray(b) && b.length === 2 && b.every(text)))) wrong.push('look: "badges" must be three pairs of colours, [background, number]');
      for (const k of Object.keys(look)) if (![...LOOK_COLOURS, ...LOOK_SURFACES, 'shell', 'parts', 'corner', 'badges', 'badgeRing', 'trim', 'drawerWall'].includes(k)) wrong.push(`look: "${k}" is not something a look has`);
    }
  }

  let floors: string[] | null = null;
  if (home.floors !== undefined) {
    if (!Array.isArray(home.floors) || !home.floors.length) wrong.push('"floors" must be a list with at least one floor');
    else {
      floors = [];
      home.floors.forEach((f: unknown, n: number) => {
        const where = `floor ${n + 1}`;
        if (!obj(f)) { wrong.push(`${where} must be an object`); return; }
        if (typeof f.id !== 'string' || !ID.test(f.id)) wrong.push(`${where}: "id" must be lower-case letters, digits and dashes`);
        else if (floors!.includes(f.id)) wrong.push(`two floors have the id "${f.id}"`);
        else floors!.push(f.id);
        if (typeof f.label !== 'string') wrong.push(`${where}: "label" (its sign) is missing`);
        if (typeof f.color !== 'string') wrong.push(`${where}: "color" is missing`);
        if (f.height !== undefined && !(num(f.height) && f.height > 0)) wrong.push(`${where}: "height" must be a number above 0`);
        for (const k of Object.keys(f)) if (!['id', 'label', 'color', 'height'].includes(k)) wrong.push(`${where}: "${k}" is not something a floor has`);
      });
    }
  }
  if (home.tower !== undefined) {
    const t = home.tower;
    if (home.floors === undefined) wrong.push('"tower" goes with "floors": only a tower has a building');
    if (!obj(t)) wrong.push('"tower" must be an object: { "wall", "slab", "spine", "elevator" }');
    else {
      for (const k of ['wall', 'slab', 'spine']) if (t[k] !== undefined && !text(t[k])) wrong.push(`tower: "${k}" must be a colour`);
      if (t.elevator !== undefined && typeof t.elevator !== 'boolean') wrong.push('tower: "elevator" must be true or false');
      for (const k of ['width', 'depth', 'floorHeight']) if (t[k] !== undefined && !(num(t[k]) && (t[k] as number) > 0)) wrong.push(`tower: "${k}" must be a number above 0`);
      if (t.cables !== undefined) {
        const c = t.cables;
        if (!obj(c)) wrong.push('tower: "cables" must be an object: { "plug", "size", "tint" } (all optional)');
        else {
          for (const k of ['plug', 'tint']) if (c[k] !== undefined && !text(c[k])) wrong.push(`tower: cables: "${k}" must be a name`);
          if (c.size !== undefined && !(num(c.size) && (c.size as number) > 0)) wrong.push('tower: cables: "size" must be a number above 0');
          for (const k of Object.keys(c)) if (!['plug', 'size', 'tint'].includes(k)) wrong.push(`tower: cables: "${k}" is not something cables have`);
        }
      }
      for (const k of Object.keys(t)) if (!['wall', 'slab', 'spine', 'elevator', 'cables', 'width', 'depth', 'floorHeight'].includes(k)) wrong.push(`tower: "${k}" is not something a tower has`);
    }
  }

  let pages: string[] | null = null;
  let bookClosed = false; // a closed book also has the zone "cover"
  if (home.book !== undefined) {
    const b = home.book;
    if (!obj(b)) wrong.push('"book" must be an object: { "pages": [...] }');
    else {
      if (!Array.isArray(b.pages) || !b.pages.length) wrong.push('book: "pages" must be a list with at least one page');
      else {
        pages = [];
        b.pages.forEach((pg: unknown, n: number) => {
          const where = `book: page ${n + 1}`;
          if (!obj(pg)) { wrong.push(`${where} must be an object`); return; }
          if (typeof pg.id !== 'string' || !ID.test(pg.id)) wrong.push(`${where}: "id" must be lower-case letters, digits and dashes`);
          else if (pages!.includes(pg.id)) wrong.push(`two pages have the id "${pg.id}"`);
          else pages!.push(pg.id);
          for (const k of ['label', 'color', 'art']) if (pg[k] !== undefined && !text(pg[k])) wrong.push(`${where}: "${k}" must be text`);
          if (pg.stitch !== undefined && typeof pg.stitch !== 'boolean' && !(num(pg.stitch) && Number.isInteger(pg.stitch) && (pg.stitch as number) >= 8 && (pg.stitch as number) <= 600)) wrong.push(`${where}: "stitch" must be true, false or a whole number of stitches across the spread (8 to 600)`);
          if (pg.stitch && pg.art === undefined) wrong.push(`${where}: "stitch" sews the page's picture, and it has no "art"`);
          for (const k of Object.keys(pg)) if (!['id', 'label', 'color', 'art', 'stitch'].includes(k)) wrong.push(`${where}: "${k}" is not something a page has`);
        });
      }
      for (const k of ['cover', 'paper']) if (b[k] !== undefined && !text(b[k])) wrong.push(`book: "${k}" must be a colour`);
      for (const k of ['width', 'height']) if (b[k] !== undefined && !(num(b[k]) && (b[k] as number) > 0)) wrong.push(`book: "${k}" must be a number above 0`);
      if (b.closed !== undefined && typeof b.closed !== 'boolean') wrong.push('book: "closed" must be true or false');
      else if (b.closed) {
        bookClosed = true;
        if (pages?.includes('cover')) wrong.push('book: a book that starts closed opens with the zone "cover", so no page may have the id "cover"');
      }
      for (const k of Object.keys(b)) if (!['pages', 'width', 'height', 'cover', 'paper', 'closed'].includes(k)) wrong.push(`book: "${k}" is not something a book has`);
    }
  }

  if (home.beats !== undefined) {
    const ids = new Set<string>();
    if (!Array.isArray(home.beats) || !home.beats.length) wrong.push('"beats" must be a list with at least one beat');
    else home.beats.forEach((b: unknown, n: number) => {
      if (!obj(b)) { wrong.push(`beat ${n + 1} must be an object`); return; }
      const where = `beat ${n + 1}${typeof b.id === 'string' ? ` ("${b.id}")` : ''}`;
      if (typeof b.id !== 'string' || !b.id) wrong.push(`${where}: "id" (its section's id) is missing`);
      else if (ids.has(b.id)) wrong.push(`two beats have the id "${b.id}"`);
      else ids.add(b.id);
      if (typeof b.name !== 'string' || !b.name) wrong.push(`${where}: "name" is missing`);
      if (!three(b.camera)) wrong.push(`${where}: "camera" must be three numbers, where the camera is`);
      if (!three(b.lookAt)) wrong.push(`${where}: "lookAt" must be three numbers, the point the camera looks at`);
      if (b.set !== undefined) {
        if (!obj(b.set)) wrong.push(`${where}: "set" must be an object`);
        else for (const [k, v] of Object.entries(b.set)) {
          if (!BEAT_FIELDS.includes(k)) wrong.push(`${where}: "${k}" is not something a beat can set (it can set ${BEAT_FIELDS.join(', ')})`);
          else if (!num(v)) wrong.push(`${where}: "${k}" must be a number`);
        }
      }
      if (b.zones !== undefined) {
        if (!obj(b.zones)) wrong.push(`${where}: "zones" must be an object`);
        else for (const [k, v] of Object.entries(b.zones)) {
          if (floors && !floors.includes(k)) wrong.push(`${where}: there is no floor "${k}" to open (there ${floors.length === 1 ? 'is' : 'are'} ${floors.join(', ')})`);
          if (pages && !(bookClosed && k === 'cover') && !pages.slice(0, -1).includes(k)) wrong.push(pages.includes(k) ? `${where}: "${k}" is the book's last page, which has no leaf to turn` : `${where}: there is no page "${k}" to turn (there ${pages.length === 1 ? 'is' : 'are'} ${pages.join(', ')})`);
          if (!num(v)) wrong.push(`${where}: zone "${k}" must be a number from 0 to 1`);
        }
      }
      if (b.home !== undefined && !(typeof b.home === 'string' && b.home)) wrong.push(`${where}: "home" must be a home's id`);
      for (const k of Object.keys(b)) if (!['id', 'name', 'home', 'camera', 'lookAt', 'set', 'zones'].includes(k)) wrong.push(`${where}: "${k}" is not something a beat has`);
    });
  }

  if (home.transitions !== undefined) wrong.push(...transitionMistakes(home.transitions, Array.isArray(home.beats) ? home.beats.map((b: { id?: unknown }) => String(b?.id)) : undefined));
  const rooms = floors ?? pages ?? ['center', 'left', 'right'];
  const roomWord = floors ? 'floor' : pages ? 'page' : 'room';
  const seen = new Set<string>();
  if (!Array.isArray(home.pieces)) wrong.push('"pieces" must be a list');
  else home.pieces.forEach((p: unknown, n: number) => {
    if (!obj(p)) { wrong.push(`piece ${n + 1} must be an object`); return; }
    const where = `piece ${n + 1}${typeof p.id === 'string' ? ` ("${p.id}"${typeof p.room === 'string' ? ` in ${p.room}` : ''})` : ''}`;
    for (const need of ['id', 'room', 'kind', 'at']) if (p[need] === undefined) wrong.push(`${where}: "${need}" is missing`);
    if (typeof p.kind === 'string' && isBuiltIn(p.kind) && !(BUILT_IN_KINDS as readonly string[]).includes(p.kind)) wrong.push(`${where}: Popfold has no built-in "${p.kind}" (it has ${BUILT_IN_KINDS.join(', ')})`);
    for (const [k, v] of Object.entries(p)) {
      const type = PIECE_FIELDS[k];
      if (!type) wrong.push(`${where}: "${k}" is not something a piece has (it has ${Object.keys(PIECE_FIELDS).join(', ')})`);
      else if (typeof v !== type || (type === 'number' && !num(v))) wrong.push(`${where}: "${k}" must be ${type === 'object' ? (k === 'at' ? 'two numbers' : 'an object') : type === 'string' ? 'text' : type === 'number' ? 'a number' : 'true or false'}`);
    }
    if (typeof p.id === 'string' && !ID.test(p.id)) wrong.push(`${where}: "id" must be lower-case letters, digits and dashes`);
    if (p.at !== undefined && !(Array.isArray(p.at) && p.at.length === 2 && p.at.every(num))) wrong.push(`${where}: "at" must be two numbers, [x, z] on the floor or [x, height] on a wall`);
    if (typeof p.room === 'string' && !rooms.includes(p.room)) wrong.push(`${where}: there is no ${roomWord} "${p.room}" (there ${rooms.length === 1 ? 'is' : 'are'} ${rooms.join(', ')})`);
    if (p.fold !== undefined && !['back', 'front', 'left', 'right'].includes(p.fold as string)) wrong.push(`${where}: "fold" must be back, front, left or right (the side it lies down towards)`);
    if (pages && p.wall) wrong.push(`${where}: a book's pages have no walls ("wall" is for a compact or a tower)`);
    if (typeof p.id === 'string' && typeof p.room === 'string') {
      const key = pieceKey(p as unknown as PieceSpec);
      if (seen.has(key)) wrong.push(`${where}: another piece is already "${key}"; ids must differ within a room`);
      seen.add(key);
    }
    if (obj(p.opts)) {
      const plain = (v: unknown) => num(v) || typeof v === 'string' || typeof v === 'boolean';
      for (const [k, v] of Object.entries(p.opts)) if (!(plain(v) || (Array.isArray(v) && v.every(plain)))) wrong.push(`${where}: opts "${k}" must be a number, text, true or false, or a list of those`);
    }
    if (obj(p.story)) checkStory(p.story, where);
  });

  if (wrong.length) throw new Error(`the home file${typeof home.id === 'string' ? ` for "${home.id}"` : ''} has ${wrong.length === 1 ? 'a mistake' : `${wrong.length} mistakes`}:\n  ${wrong.join('\n  ')}`);
  return { id: home.id as string, name: home.name as string, blurb: (home.blurb as string | undefined) ?? '', ...(home.look ? { look: home.look as LookData } : {}), ...(home.emblem ? { emblem: home.emblem as HomeData['emblem'] } : {}), ...(home.swatch ? { swatch: home.swatch as string[] } : {}), ...(home.mood ? { mood: home.mood as 'day' | 'evening' } : {}), ...(floors ? { floors: home.floors as FloorData[] } : {}), ...(home.tower ? { tower: home.tower as TowerData } : {}), ...(home.book ? { book: home.book as BookData } : {}), ...(home.diorama ? { diorama: home.diorama as DioramaData } : {}), ...(home.stories ? { stories: home.stories as Record<string, PropStory> } : {}), ...(home.places ? { places: home.places as Places } : {}), ...(home.transitions ? { transitions: home.transitions as Transition[] } : {}), ...(home.beats ? { beats: home.beats as BeatData[] } : {}), pieces: home.pieces as PieceSpec[] };
}

/**
 * The models a home can show its first rooms without: those that only listed pieces in other rooms use.
 * `firstRooms` are the rooms open at the start of the story (a compact's 'center', a tower's top floor).
 * A home that also places pieces in code keeps every model up front, since that code may ask for any of them.
 */
export function lateModels(recipe: Pick<HomeRecipe, 'pieces' | 'props' | 'kinds' | 'furnish' | 'tower'>, firstRooms: string[]): string[] {
  if (recipe.furnish || recipe.tower?.floors.some((f) => f.build)) return [];
  const pieces = recipe.pieces ?? [];
  const isModel = (kind: string) => !recipe.kinds?.[kind] && recipe.props.includes(kind);
  const early = new Set(pieces.filter((p) => firstRooms.includes(p.room)).map((p) => p.kind));
  const used = new Set(pieces.map((p) => p.kind));
  return recipe.props.filter((name) => isModel(name) && used.has(name) && !early.has(name));
}

/**
 * A tower from its file's floors and building, and the site's code for it: `build`, each floor's code by floor id
 * (pipes, a moved port). A build for a floor the file does not have is a mistake, named.
 */
export function towerFromFile(home: string, floors: FloorData[], data: TowerData = {}, build?: Record<string, NonNullable<FloorSpec['build']>>): TowerSpec {
  const { spine, ...rest } = data;
  const stray = Object.keys(build ?? {}).filter((id) => !floors.some((f) => f.id === id));
  if (stray.length) throw new Error(`home "${home}": tower.build names ${stray.map((s) => `"${s}"`).join(', ')}, which the file has no floor for`);
  return { ...rest, ...(spine ? { spine: { color: spine } } : {}), floors: floors.map((f) => (build?.[f.id] ? { ...f, build: build[f.id] } : f)) };
}

/** Mistakes in a list of transitions (transitions.ts), in words, given the story's section ids when they are known. */
export function transitionMistakes(list: unknown, sections?: string[]): string[] {
  const wrong: string[] = [];
  const text = (v: unknown): v is string => typeof v === 'string' && v !== '';
  const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!Array.isArray(list)) return ['"transitions" must be a list'];
  list.forEach((t: unknown, n: number) => {
    const where = `transition ${n + 1}`;
    if (!obj(t)) { wrong.push(`${where} must be an object: { "from", "to" }`); return; }
    if (!text(t.from)) wrong.push(`${where}: "from" (the section it starts from) is missing`);
    else if (sections && !sections.includes(t.from)) wrong.push(`${where}: there is no section "${t.from}" to start from (there are ${sections.join(', ')})`);
    if (text(t.to)) { if (sections && !sections.includes(t.to)) wrong.push(`${where}: there is no section "${t.to}" to lead to`); }
    else if (!(obj(t.to) && text(t.to.home) && text(t.to.section) && Object.keys(t.to).every((k) => k === 'home' || k === 'section'))) wrong.push(`${where}: "to" must be a section id, or { "home", "section" }`);
    if (t.label !== undefined && !text(t.label)) wrong.push(`${where}: "label" must be text`);
    if (t.fromHome !== undefined && !text(t.fromHome)) wrong.push(`${where}: "fromHome" must be a home's id`);
    if (t.piece !== undefined && !(text(t.piece) && /^[a-z0-9][a-z0-9-]*\/[^/\s]+$/.test(t.piece))) wrong.push(`${where}: "piece" must be a piece key ("<room>/<piece>")`);
    if (t.effect !== undefined && !text(t.effect)) wrong.push(`${where}: "effect" must be a name`);
    if (t.strength !== undefined && !(typeof t.strength === 'number' && t.strength >= 0 && t.strength <= 2)) wrong.push(`${where}: "strength" must be a number from 0 to 2`);
    if (t.card !== undefined && typeof t.card !== 'boolean') wrong.push(`${where}: "card" must be true or false`);
    if (t.via !== undefined) {
      const three = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
      if (!(Array.isArray(t.via) && t.via.length >= 1 && t.via.length <= 12 && t.via.every(three))) wrong.push(`${where}: "via" must be a list of 1 to 12 points, each three numbers`);
      // a route is the way between two beats the scroll passes from one to the other: only neighbours have one
      if (sections && text(t.from) && text(t.to) && Math.abs(sections.indexOf(t.from) - sections.indexOf(t.to)) !== 1) wrong.push(`${where}: "via" needs "from" and "to" to be neighbouring beats (the scroll goes straight from one to the other)`);
      if (obj(t.to)) wrong.push(`${where}: "via" is for a way between two beats of this home, not to another home`);
    }
    if (t.look !== undefined && !(t.look === 'path' || t.look === 'beats')) wrong.push(`${where}: "look" must be "path" or "beats"`);
    if (t.cue !== undefined && !['full', 'hover', 'none'].includes(t.cue as string)) wrong.push(`${where}: "cue" must be "full", "hover" or "none"`);
    if (t.button !== undefined && typeof t.button !== 'boolean') wrong.push(`${where}: "button" must be true or false`);
    if (t.button === true && !text(t.label)) wrong.push(`${where}: a "button" needs a "label" (its words)`);
    if (t.look !== undefined && t.via === undefined) wrong.push(`${where}: "look" goes with "via"`);
    for (const k of Object.keys(t)) if (!['from', 'fromHome', 'to', 'label', 'piece', 'effect', 'strength', 'card', 'via', 'look', 'cue', 'button'].includes(k)) wrong.push(`${where}: "${k}" is not something a transition has`);
  });
  return wrong;
}

// ---------- every kind of piece a home can use: the studio's object view and `popfold describe` list it ----------

/**
 * Popfold's built-in pieces, as kinds a home file can name without code ("kind": "builtin/sofa"). Each is built
 * with plain defaults; the few `opts` it reads are in builtins.ts, whose type keeps this list and the builders in step.
 */
export const BUILT_IN_KINDS = [
  'builtin/bed', 'builtin/clothes-rack', 'builtin/coffee-table', 'builtin/disco-ball', 'builtin/floor-lamp', 'builtin/mirror',
  'builtin/nightstand', 'builtin/plant', 'builtin/rug', 'builtin/sculpture', 'builtin/shopping-bag', 'builtin/sofa', 'builtin/spark',
] as const;

/** a kind's name says it is one of Popfold's built-in pieces */
export const isBuiltIn = (kind: string) => kind.startsWith('builtin/');

/** a model file found in the site's public folder: its path there (models/props/lamp.glb), size and date */
export interface ModelFile { path: string; bytes: number; modified: number }

/** One kind of piece in the object view. */
export interface LibraryEntry {
  /** the name a piece's `kind` gives */
  kind: string;
  /** where it comes from: the site's code, Popfold, or a model file */
  from: 'site' | 'built-in' | 'model';
  /** a model's file, in the public folder (models/props/lamp.glb) */
  file?: string;
  bytes?: number;
  modified?: number;
  /**
   * the home on show can build it now. A model file the home's `props` do not list cannot be (the home loads
   * only the files it lists); the reason is in `why`
   */
  usable: boolean;
  why?: string;
  /** where pieces of this kind are listed: each home and room, and how many */
  used: { home: string; room: string; count: number }[];
}

/** a book's paper pop-ups (book.ts's POPUP_KINDS, kept here so this file needs no 3D code; a test keeps them equal) */
export const BOOK_KINDS = ['card', 'stand', 'vfold', 'box', 'fan'] as const;

type Home = Pick<HomeRecipe, 'id' | 'pieces' | 'kinds' | 'props' | 'propDir' | 'sharedDir' | 'diorama' | 'book'>;

/** the file a model kind loads, as engine.ts finds it: a name with a folder comes from the shared folder */
export const modelPath = (home: Pick<HomeRecipe, 'propDir' | 'sharedDir'>, name: string) => `${name.includes('/') ? (home.sharedDir ?? 'models/props') : home.propDir}/${name}.glb`;

/**
 * Every kind the home `shown` can use, and the model files in its folders it does not load, each with where
 * pieces of it are listed in all of `homes`. Site kinds first, then built-ins, then models, each by name.
 */
export function libraryOf(homes: Home[], shown: string, files: ModelFile[] = []): LibraryEntry[] {
  const home = homes.find((h) => h.id === shown);
  if (!home) return [];
  const usage = new Map<string, Map<string, number>>(); // kind -> "home|room" -> count
  for (const h of homes) for (const p of h.pieces ?? []) {
    const at = usage.get(p.kind) ?? new Map<string, number>();
    const where = `${h.id}|${p.room}`;
    at.set(where, (at.get(where) ?? 0) + 1);
    usage.set(p.kind, at);
  }
  const used = (kind: string) => [...(usage.get(kind) ?? [])].map(([where, count]) => { const [h, room] = where.split('|'); return { home: h, room, count }; });
  const byPath = new Map(files.map((f) => [f.path, f]));
  const out: LibraryEntry[] = [];
  const named = new Set<string>();
  const add = (e: Omit<LibraryEntry, 'used'>) => { if (named.has(e.kind)) return; named.add(e.kind); out.push({ ...e, used: used(e.kind) }); };
  const sorted = (l: Iterable<string>) => [...l].sort((a, b) => a.localeCompare(b));
  for (const k of sorted(Object.keys(home.kinds ?? {}))) add({ kind: k, from: 'site', usable: true });
  // a book's own pieces: the paper pop-ups every book builds
  if (home.book) for (const k of BOOK_KINDS) add({ kind: k, from: 'built-in', usable: true });
  for (const k of BUILT_IN_KINDS) add({ kind: k, from: 'built-in', usable: true });
  for (const k of sorted(home.props.filter((p) => !home.kinds?.[p]))) {
    const file = modelPath(home, k), f = byPath.get(file);
    add({ kind: k, from: 'model', file, ...(f ? { bytes: f.bytes, modified: f.modified } : {}), usable: true });
  }
  // model files in the home's folders that it does not load: its own folder by name, the shared one by folder/name
  const shared = home.sharedDir ?? 'models/props';
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!f.path.endsWith('.glb')) continue;
    const rest = (dir: string) => f.path.startsWith(`${dir}/`) ? f.path.slice(dir.length + 1, -4) : null;
    const own = rest(home.propDir), inShared = rest(shared);
    const kind = own && !own.includes('/') ? own : inShared?.includes('/') ? inShared : null;
    if (!kind) continue;
    add({ kind, from: 'model', file: f.path, bytes: f.bytes, modified: f.modified, usable: false,
      why: `This home does not load ${f.path}. Add "${kind}" to its props in code to use it.` });
  }
  // a kind this home's list names that none of these is (a typo, or a kind only another home's code builds)
  for (const k of sorted(new Set((home.pieces ?? []).map((p) => p.kind)))) add({ kind: k, from: 'site', usable: false, why: 'This home has no way to build it.' });
  // a diorama's pieces are its model's parts: nothing is added to one from here
  if (home.diorama) for (const e of out) if (e.usable) { e.usable = false; e.why = "A diorama's pieces are its model's parts."; }
  // a book's pieces are paper pop-ups and the site's own kinds: furniture and model files do not go in one
  const popup = (k: string) => (BOOK_KINDS as readonly string[]).includes(k);
  if (home.book) for (const e of out) if (e.usable && e.from !== 'site' && !popup(e.kind)) { e.usable = false; e.why = "A book's pieces are pop-ups (card, stand, vfold, box, fan) and the site's own kinds."; }
  // what the home can use first, then what it cannot (each in the order above)
  return [...out.filter((e) => e.usable), ...out.filter((e) => !e.usable)];
}
