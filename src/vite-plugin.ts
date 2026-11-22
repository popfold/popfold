// Vite plugins for Popfold sites.
//
//   homeSaver()        dev server only: Popfold Studio's "Save" and "Capture stills" write into the home file and public/
//   popfoldFallback(o)   the page without 3D: story cards and scene stills built into the HTML, structured data,
//                        llms.txt, robots.txt and sitemap.xml (see packages/popfold/README.md, "Without 3D")
//
// In a site's vite.config.ts:  import { homeSaver, popfoldFallback } from 'popfold/vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import type { Plugin, ResolvedConfig } from 'vite';
import type { Transition } from './transitions';
import type { PropStory } from './types';

// ---------------------------------------------------------------------------------------------------------------
// Dev endpoints. Accepted only from this machine's own browser: requests that came through the Cloudflare tunnel
// (they carry cf-* headers) or from another origin are refused, and nothing is served in a build.
function localOnly(req: IncomingMessage, res: ServerResponse, read = false) {
  const fail = (code: number, msg: string) => { res.statusCode = code; res.end(msg); return false; };
  if (req.method !== 'POST' && !(read && req.method === 'GET')) return fail(405, read ? 'GET or POST only' : 'POST only');
  if (Object.keys(req.headers).some((h) => h.startsWith('cf-'))) return fail(403, 'Saving only works on the local dev server');
  const addr = req.socket.remoteAddress ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr)) return fail(403, 'Local requests only');
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return fail(403, 'Wrong origin');
  return true;
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((ok, no) => {
    const parts: Buffer[] = []; let n = 0;
    req.on('data', (c: Buffer) => { n += c.length; if (n > limit) { no(new Error('Too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts)));
    req.on('error', no);
  });
}

const BEAT_ORDER = ['id', 'name', 'home', 'camera', 'lookAt', 'set', 'zones'];
const PIECE_ORDER = ['id', 'room', 'wall', 'kind', 'at', 'turn', 'lift', 'out', 'size', 'scale', 'delay', 'fold', 'hidden', 'lamp', 'opts'];
const inline = (v: unknown): string => Array.isArray(v) ? `[${v.map(inline).join(', ')}]`
  : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }`
  : JSON.stringify(v);

/**
 * A home file's text, the way Popfold writes it: one piece per line, a piece with a story spread over a few, and
 * a piece's fields always in the same order. Saving from the studio then changes only the lines of the pieces
 * that moved.
 */
export function formatHome(home: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(home)) {
    if (key === 'beats' && Array.isArray(value)) lines.push(`  "beats": [\n${value.map((b: Record<string, unknown>) => `    ${inline(Object.fromEntries(BEAT_ORDER.filter((k) => k in b).concat(Object.keys(b).filter((k) => !BEAT_ORDER.includes(k))).map((k) => [k, b[k]])))}`).join(',\n')}\n  ]`);
    else if (key === 'book' && value && typeof value === 'object') lines.push(`  "book": {\n${Object.entries(value).map(([k, v]) => (k === 'pages' && Array.isArray(v)
      ? `    "pages": [\n${v.map((p) => `      ${inline(p)}`).join(',\n')}\n    ]` : `    ${JSON.stringify(k)}: ${inline(v)}`)).join(',\n')}\n  }`);
    else if (key === 'look' && value && typeof value === 'object') lines.push(`  "look": {\n${Object.entries(value).map(([k, v]) => `    ${JSON.stringify(k)}: ${inline(v)}`).join(',\n')}\n  }`);
    else if ((key === 'floors' || key === 'transitions') && Array.isArray(value)) lines.push(`  ${JSON.stringify(key)}: [\n${value.map((f) => `    ${inline(f)}`).join(',\n')}\n  ]`);
    else if ((key === 'stories' || key === 'places') && value && typeof value === 'object' && Object.keys(value).length) lines.push(`  ${JSON.stringify(key)}: {\n${Object.entries(value).map(([k, v]) => `    ${JSON.stringify(k)}: ${inline(v)}`).join(',\n')}\n  }`);
    else if (key === 'pieces' && Array.isArray(value) && value.length) {
      lines.push(`  "pieces": [\n${value.map((p: Record<string, unknown>) => {
        const keys = Object.keys(p).filter((k) => k !== 'story').sort((a, b) => (PIECE_ORDER.indexOf(a) + 1 || 99) - (PIECE_ORDER.indexOf(b) + 1 || 99));
        const fields = keys.map((k) => `${JSON.stringify(k)}: ${inline(p[k])}`).join(', ');
        if (!p.story || typeof p.story !== 'object') return `    { ${fields} }`;
        const story = Object.entries(p.story).map(([k, v]) => `        ${JSON.stringify(k)}: ${inline(v)}`).join(',\n');
        return `    {\n      ${fields},\n      "story": {\n${story}\n      }\n    }`;
      }).join(',\n')}\n  ]`);
    } else lines.push(`  ${JSON.stringify(key)}: ${inline(value)}`);
  }
  return `{\n${lines.join(',\n')}\n}\n`;
}

/** Put the studio's changes into a home's data: each names a piece by room, wall and id, and gives its new fields. */
export function placePieces(home: Record<string, unknown>, changes: { id: string; room: string; wall?: boolean; change: Record<string, unknown> }[]): number {
  const pieces = Array.isArray(home.pieces) ? home.pieces as Record<string, unknown>[] : [];
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  let done = 0;
  for (const c of changes) {
    const piece = pieces.find((p) => p.id === c.id && p.room === c.room && !!p.wall === !!c.wall);
    if (!piece) throw new Error(`the home file has no piece "${c.id}" in ${c.room}${c.wall ? ' (on the wall)' : ''}`);
    for (const [k, v] of Object.entries(c.change ?? {})) {
      if (k === 'at' && Array.isArray(v) && v.length === 2 && v.every(num)) piece.at = v;
      else if (['turn', 'lift', 'out', 'scale'].includes(k) && num(v)) piece[k] = v;
      else if (k === 'hidden' && typeof v === 'boolean') piece.hidden = v;
      else if (k === 'kind' && typeof v === 'string' && v.trim()) piece.kind = v.trim();
      else throw new Error(`"${k}" of "${c.id}" is not something the studio can set`);
    }
    // a field at its plain value is left out of the file
    if (piece.turn === 0) delete piece.turn;
    if (piece.lift === 0) delete piece.lift;
    if (piece.scale === 1) delete piece.scale;
    if (piece.hidden === false) delete piece.hidden;
    done++;
  }
  return done;
}

/** Put the studio's cameras into a home's beats: each names a beat by id and gives where the camera is and what it looks at. */
export function placeCameras(home: Record<string, unknown>, cameras: { id: string; camera: unknown; lookAt: unknown }[]): number {
  const beats = Array.isArray(home.beats) ? home.beats as Record<string, unknown>[] : [];
  const three = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
  for (const c of cameras) {
    const beat = beats.find((b) => b.id === c.id);
    if (!beat) throw new Error(beats.length ? `the home file has no beat "${c.id}"` : 'this home file has no beats: the site keeps its story in code');
    if (!three(c.camera) || !three(c.lookAt)) throw new Error(`the camera for "${c.id}" must be two lists of three numbers`);
    beat.camera = c.camera;
    beat.lookAt = c.lookAt;
  }
  return cameras.length;
}

/** Take pieces off a home's list, each named by room, wall and id. */
export function removePieces(home: Record<string, unknown>, gone: { id: string; room: string; wall?: boolean }[]): number {
  const pieces = Array.isArray(home.pieces) ? home.pieces as Record<string, unknown>[] : [];
  for (const g of gone) {
    const n = pieces.findIndex((p) => p.id === g.id && p.room === g.room && !!p.wall === !!g.wall);
    if (n < 0) throw new Error(`the home file has no piece "${g.id}" in ${g.room}${g.wall ? ' (on the wall)' : ''}`);
    pieces.splice(n, 1);
  }
  return gone.length;
}

/**
 * Every model file (.glb) under a site's public folder, by its path there ("models/props/lamp.glb"), with its size
 * and when it last changed. Folders that hold no models a page loads (stills, art) are skipped.
 */
export function modelFiles(publicDir: string): { path: string; bytes: number; modified: number }[] {
  const out: { path: string; bytes: number; modified: number }[] = [];
  const walk = (dir: string, rel: string) => {
    let names: string[];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      if (name.startsWith('.') || (!rel && (name === 'stills' || name === 'art'))) continue;
      const full = resolve(dir, name), path = rel ? `${rel}/${name}` : name;
      const st = statSync(full);
      if (st.isDirectory()) walk(full, path);
      else if (name.endsWith('.glb')) out.push({ path, bytes: st.size, modified: Math.round(st.mtimeMs) });
    }
  };
  walk(publicDir, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Put new pieces on a home's list, each after the last piece of its room. */
export function addPieces(home: Record<string, unknown>, added: { id: unknown; room: unknown; kind: unknown; wall?: unknown; at?: unknown }[]): number {
  if (!Array.isArray(home.pieces)) throw new Error('this home file has no list of pieces');
  const pieces = home.pieces as Record<string, unknown>[];
  for (const a of added) {
    if (typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(a.id)) throw new Error('a piece\'s id must be lower-case letters, digits and dashes');
    if (typeof a.room !== 'string' || !a.room) throw new Error(`the piece "${a.id}" needs a room`);
    if (typeof a.kind !== 'string' || !a.kind) throw new Error(`the piece "${a.id}" needs a kind`);
    const wall = a.wall === true;
    if (pieces.some((p) => p.id === a.id && p.room === a.room && !!p.wall === wall)) throw new Error(`"${a.room}" already has a piece called "${a.id}"${wall ? ' on its wall' : ''}; give this one another id`);
    const at = Array.isArray(a.at) && a.at.length === 2 && a.at.every((n) => typeof n === 'number' && Number.isFinite(n)) ? a.at : wall ? [0, 1.2] : [0, 0];
    const piece = { id: a.id, room: a.room, ...(wall ? { wall: true } : {}), kind: a.kind, at };
    const last = pieces.map((p) => p.room).lastIndexOf(a.room);
    pieces.splice(last < 0 ? pieces.length : last + 1, 0, piece);
  }
  return added.length;
}

/**
 * Write, change or take away stories. Each names a listed piece by room, wall and id, or a piece the file does not
 * list (a diorama's model part) by its key, and gives its story, or null for none. What the studio does not edit
 * (a story's meta line, kicker and links) is kept.
 */
export function setStories(home: Record<string, unknown>, stories: { id?: string; room?: string; wall?: boolean; key?: string; story: unknown }[]): number {
  const pieces = Array.isArray(home.pieces) ? home.pieces as Record<string, unknown>[] : [];
  for (const s of stories) {
    let piece: Record<string, unknown> | undefined;
    if (s.key !== undefined) {
      if (!/^[a-z0-9][a-z0-9-]*\/[^/\s]+$/.test(s.key)) throw new Error(`"${s.key}" is not a piece key`);
      // a story kept under its key: the file's "stories", in the same shape as a piece's own
      const all = (home.stories && typeof home.stories === 'object' ? home.stories : {}) as Record<string, unknown>;
      piece = { story: all[s.key] };
      if (s.story !== null) setStory(piece, s.story);
      if (s.story === null || !piece.story) delete all[s.key]; else all[s.key] = piece.story;
      if (Object.keys(all).length) home.stories = all; else delete home.stories;
      continue;
    }
    piece = pieces.find((p) => p.id === s.id && p.room === s.room && !!p.wall === !!s.wall);
    if (!piece) throw new Error(`the home file has no piece "${s.id}" in ${s.room}${s.wall ? ' (on the wall)' : ''}`);
    if (s.story === null) { delete piece.story; continue; }
    setStory(piece, s.story);
  }
  return stories.length;
}

/** Put a checked story on `piece.story`, keeping what the studio does not edit (meta, kicker, links). */
function setStory(piece: Record<string, unknown>, story: unknown) {
  const st = story as Record<string, unknown>;
  if (!st || typeof st !== 'object' || typeof st.title !== 'string' || !st.title.trim()) throw new Error('a story needs a title');
  if (typeof st.text !== 'string' || !st.text.trim()) throw new Error('a story needs some text');
  if (!Array.isArray(st.tags) || !st.tags.every((t) => typeof t === 'string')) throw new Error('a story\'s tags must be a list of words');
  if (st.dot !== undefined && !['top', 'front', 'below'].includes(st.dot as string)) throw new Error('a story\'s dot must be top, front or below');
  const { dot: _was, ...kept } = (piece.story && typeof piece.story === 'object' ? piece.story : {}) as Record<string, unknown>;
  // title, text and tags first, as a story is written; the dot only when it is not the usual one
  piece.story = { ...kept, title: st.title.trim(), text: st.text.trim(), tags: st.tags.map((t) => (t as string).trim()).filter(Boolean), ...(st.dot && st.dot !== 'top' ? { dot: st.dot } : {}) };
  const o = piece.story as Record<string, unknown>;
  piece.story = Object.fromEntries(['title', 'text', 'tags', 'dot', 'meta', 'kicker', 'links'].filter((k) => k in o).map((k) => [k, o[k]]));
}

/**
 * The look of a home: `look` (a compact's colours and surfaces, merged field by field), `emblem` (replaced; an
 * empty one is left out), `floors` (a tower's: each names a floor by id and gives a new colour or sign) and `tower`
 * (a tower's building: wall, slab and spine colours and the lift, field by field; null takes one away) and `paint`
 * (a diorama's model colours, by material name, field by field; null gives a material back its own).
 * Whether the result is a good home is for readHome() to say when the home is built from it.
 */
export function setLook(home: Record<string, unknown>, body: { look?: unknown; emblem?: unknown; floors?: unknown; tower?: unknown; paint?: unknown }): number {
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  let n = 0;
  if (body.look !== undefined) {
    if (!isObj(body.look) || !isObj(home.look)) throw new Error('only a home with a look can have its look changed');
    for (const [k, v] of Object.entries(body.look)) {
      if (!(k in home.look) && !['shell', 'parts', 'corner', 'badges', 'badgeRing', 'trim', 'drawerWall'].includes(k)) throw new Error(`"${k}" is not part of a look`);
      (home.look as Record<string, unknown>)[k] = v; n++;
    }
  }
  if (body.emblem !== undefined) {
    if (!isObj(body.emblem)) throw new Error('an emblem must be an object');
    const e = Object.fromEntries(Object.entries(body.emblem).filter(([, v]) => v !== '' && v !== undefined && v !== null));
    if (Object.keys(e).length) home.emblem = e; else delete home.emblem;
    n++;
  }
  if (body.floors !== undefined) {
    const floors = Array.isArray(home.floors) ? home.floors as Record<string, unknown>[] : [];
    if (!Array.isArray(body.floors)) throw new Error('Expected { floors: [...] }');
    for (const c of body.floors as Record<string, unknown>[]) {
      const f = floors.find((x) => x.id === c.id);
      if (!f) throw new Error(`the home file has no floor "${String(c.id)}"`);
      if (typeof c.color === 'string' && c.color) f.color = c.color;
      if (typeof c.label === 'string' && c.label.trim()) f.label = c.label.trim();
      n++;
    }
  }
  if (body.tower !== undefined) {
    if (!isObj(body.tower)) throw new Error('Expected { tower: { wall, slab, spine, elevator } }');
    if (!Array.isArray(home.floors)) throw new Error('only a tower has a building to colour');
    const t = { ...(isObj(home.tower) ? home.tower : {}) };
    for (const [k, v] of Object.entries(body.tower)) {
      if (!['wall', 'slab', 'spine', 'elevator'].includes(k)) throw new Error(`"${k}" is not a tower's colour (there are wall, slab, spine and elevator)`);
      if (v === null) delete t[k];
      else if (k === 'elevator' ? typeof v === 'boolean' : typeof v === 'string' && v.trim() !== '') t[k] = v;
      else throw new Error(`the tower's "${k}" cannot be ${JSON.stringify(v)}`);
      n++;
    }
    // in the schema's order, beside the floors (a building only a tower has)
    const ordered = Object.fromEntries(['wall', 'slab', 'spine', 'elevator', 'width', 'depth', 'floorHeight'].filter((k) => k in t).map((k) => [k, t[k]]));
    if (!Object.keys(ordered).length) delete home.tower;
    else if ('tower' in home) home.tower = ordered;
    else {
      // a new one goes just after the floors, where a person would write it
      const rest = Object.entries(home);
      for (const [k] of rest) delete home[k];
      for (const [k, v] of rest) { home[k] = v; if (k === 'floors') home.tower = ordered; }
    }
  }
  if (body.paint !== undefined) {
    if (!isObj(body.paint)) throw new Error('Expected { paint: { "<material>": "<colour>" } }');
    if (!isObj(home.diorama)) throw new Error('only a diorama has a model to paint');
    const d = home.diorama as Record<string, unknown>;
    const paint = { ...(isObj(d.paint) ? d.paint : {}) };
    for (const [name, v] of Object.entries(body.paint)) {
      if (v === null) delete paint[name];
      else if (typeof v === 'string' && v.trim()) paint[name] = v.trim();
      else throw new Error(`the colour of "${name}" cannot be ${JSON.stringify(v)}`);
      n++;
    }
    if (Object.keys(paint).length) d.paint = Object.fromEntries(Object.entries(paint).sort(([a], [b]) => a.localeCompare(b))); else delete d.paint;
  }
  return n;
}

/**
 * Where the studio put pieces the file does not list, by key ({ p, r, s, hide }, as layout.ts reads them). The
 * whole set is replaced; an empty one leaves the field out.
 */
export function setPlaces(home: Record<string, unknown>, places: unknown): number {
  if (!places || typeof places !== 'object' || Array.isArray(places)) throw new Error('places must be an object');
  const n = Object.keys(places).length;
  if (n) home.places = Object.fromEntries(Object.entries(places as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
  else delete home.places;
  return n;
}

/**
 * Set what the home does at beats: each names a beat by id and gives values for `set` (c, L, R, glow, …) and for
 * `zones` (a tower's floors). Only the fields given change; a value of 0 (0.8 for az) is the plain one and is
 * left out of the file.
 */
export function setBeats(home: Record<string, unknown>, changes: { id: string; name?: unknown; set?: Record<string, unknown>; zones?: Record<string, unknown> }[]): number {
  const beats = Array.isArray(home.beats) ? home.beats as Record<string, unknown>[] : [];
  const fields = ['c', 'L', 'R', 'glow', 'badges', 'hero', 'side', 'av', 'ax', 'az', 'wave'];
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  for (const c of changes) {
    const beat = beats.find((b) => b.id === c.id);
    if (!beat) throw new Error(beats.length ? `the home file has no beat "${c.id}"` : 'this home file has no beats: the site keeps its story in code');
    if (c.name !== undefined) {
      if (typeof c.name !== 'string' || !c.name.trim()) throw new Error(`the beat "${c.id}" needs a name`);
      beat.name = c.name.trim();
    }
    for (const [part, plain] of [['set', (k: string) => (k === 'az' ? 0.8 : 0)], ['zones', () => 0]] as const) {
      const given = c[part];
      if (!given) continue;
      const values = { ...(beat[part] as Record<string, number> | undefined) };
      for (const [k, v] of Object.entries(given)) {
        if (part === 'set' && !fields.includes(k)) throw new Error(`"${k}" is not something a beat can set`);
        if (!num(v)) throw new Error(`"${k}" of the beat "${c.id}" must be a number`);
        if (v === plain(k)) delete values[k]; else values[k] = v;
      }
      // in the engine's own order for `set`, so a saved beat reads like a written one
      const ordered = part === 'set' ? Object.fromEntries(fields.filter((k) => k in values).map((k) => [k, values[k]])) : values;
      if (Object.keys(ordered).length) beat[part] = ordered; else delete beat[part];
    }
  }
  return changes.length;
}

/** A story page's text, which the beat commands edit along with the home file (null: the home has no page). */
export interface PageText { file: string; text: string }

/** a stage section as a block of the page's lines: from the start of its first line to just after its last */
function sectionBlock(html: string, s: PageSection) {
  const from = html.lastIndexOf('\n', s.start - 1) + 1;
  const nl = html.indexOf('\n', s.end);
  return { from, to: nl < 0 ? html.length : nl + 1 };
}
const stagesOf = (html: string) => readPage(html).sections.filter((s) => s.stage);

/**
 * Put a new stage section into a page at position `at` among its stage sections: shaped like its neighbour (the
 * same start-tag attributes and card element), with the beat's name as its heading and a placeholder for its
 * words, in brackets as the templates write them. The words are the site's to write.
 */
export function addSection(html: string, id: string, name: string, at: number): string {
  const stages = stagesOf(html);
  if (new RegExp(`\\bid=["']${id}["']`).test(html)) throw new Error(`the page already has an element with the id "${id}"`);
  const near = stages[Math.max(0, Math.min(stages.length - 1, at - 1))];
  if (!near) throw new Error('the page has no <section class="stage"> to put a new one beside');
  const block = sectionBlock(html, near);
  const indent = html.slice(block.from, near.start);
  const own = html.slice(near.start, near.open);
  const side = /\bdata-text=["']([^"']*)["']/.exec(own)?.[1];
  const card = /<(article|div)\b([^>]*)>/.exec(html.slice(near.open, near.end));
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const wrap = card ? [`<${card[1]}${card[2]}>`, `</${card[1]}>`] : null;
  const inner = [`<h2>${esc(name)}</h2>`, '<p>[What this section says.]</p>'];
  const lines = [`<section class="stage" id="${id}"${side ? ` data-text="${side}"` : ''}>`,
    ...(wrap ? [`  ${wrap[0]}`, ...inner.map((l) => `    ${l}`), `  ${wrap[1]}`] : inner.map((l) => `  ${l}`)), '</section>'];
  const text = `${lines.map((l) => indent + l).join('\n')}\n`;
  if (at <= 0) { const first = sectionBlock(html, stages[0]); return `${html.slice(0, first.from)}${text}\n${html.slice(first.from)}`; }
  const after = sectionBlock(html, stages[Math.min(at, stages.length) - 1]);
  return `${html.slice(0, after.to)}\n${text}${html.slice(after.to)}`;
}

/** Take a stage section out of a page, with the blank line that parted it from the next. */
export function removeSection(html: string, id: string): string {
  const s = stagesOf(html).find((x) => x.id === id);
  if (!s) throw new Error(`the page has no <section class="stage" id="${id}">`);
  const { from, to } = sectionBlock(html, s);
  const blank = /^[ \t]*\n/.exec(html.slice(to));
  if (blank) return html.slice(0, from) + html.slice(to + blank[0].length);
  const before = /\n[ \t]*\n$/.exec(html.slice(0, from)); // (the last section: the blank line before it goes)
  return before ? html.slice(0, from - before[0].length + 1) + html.slice(to) : html.slice(0, from) + html.slice(to);
}

/** Move a stage section, with its lines, to position `to` among the page's stage sections. */
export function moveSection(html: string, id: string, to: number): string {
  const s = stagesOf(html).find((x) => x.id === id);
  if (!s) throw new Error(`the page has no <section class="stage" id="${id}">`);
  const { from, to: end } = sectionBlock(html, s);
  const text = html.slice(from, end);
  const rest = removeSection(html, id);
  const stages = stagesOf(rest);
  if (to <= 0) { const first = sectionBlock(rest, stages[0]); return `${rest.slice(0, first.from)}${text}\n${rest.slice(first.from)}`; }
  const after = sectionBlock(rest, stages[Math.min(to, stages.length) - 1]);
  return `${rest.slice(0, after.to)}\n${text}${rest.slice(after.to)}`;
}

/** the page's stage sections must be the beats, in order, before and after a beat edit */
function sameStory(beats: Record<string, unknown>[], page: PageText) {
  const ids = stagesOf(page.text).map((s) => s.id);
  const want = beats.map((b) => b.id);
  if (ids.join(' ') !== want.join(' ')) throw new Error(`${page.file}'s stage sections (${ids.join(', ')}) are not the home's beats (${want.join(', ')}); line them up first (popfold check says how)`);
}
const beatsIn = (home: Record<string, unknown>) => {
  if (!Array.isArray(home.beats) || !home.beats.length) throw new Error('this home file has no beats: the site keeps its story in code');
  return home.beats as Record<string, unknown>[];
};

/**
 * Add a beat, at position `at` (default: the end), and its section in the page. It starts as a copy of the beat
 * before it (the first, for a new first beat), so the story holds still there until its camera and values are set.
 */
export function addBeat(home: Record<string, unknown>, a: { id: unknown; name: unknown; at?: unknown }, page?: PageText | null): number {
  const beats = beatsIn(home);
  if (typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(a.id)) throw new Error('a beat\'s id (its section\'s id) must be lower-case letters, digits and dashes');
  if (typeof a.name !== 'string' || !a.name.trim()) throw new Error(`the beat "${a.id}" needs a name`);
  if (beats.some((b) => b.id === a.id)) throw new Error(`there is already a beat "${a.id}"`);
  const at = a.at === undefined ? beats.length : a.at;
  if (typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at > beats.length) throw new Error(`"at" must be a position from 0 to ${beats.length}`);
  if (page) { sameStory(beats, page); page.text = addSection(page.text, a.id, a.name.trim(), at); }
  const { id: _id, name: _name, ...like } = structuredClone(beats[Math.max(0, at - 1)]);
  beats.splice(at, 0, { id: a.id, name: a.name.trim(), ...like });
  return 1;
}

/** Take a beat out, with its section in the page and the links that start from it or lead to it. */
export function removeBeat(home: Record<string, unknown>, a: { id: unknown }, page?: PageText | null): number {
  const beats = beatsIn(home);
  const n = beats.findIndex((b) => b.id === a.id);
  if (n < 0) throw new Error(`the home file has no beat "${String(a.id)}"`);
  if (beats.length === 1) throw new Error('a story needs at least one beat');
  if (page) { sameStory(beats, page); page.text = removeSection(page.text, a.id as string); }
  beats.splice(n, 1);
  if (Array.isArray(home.transitions)) {
    const kept = (home.transitions as Record<string, unknown>[]).filter((t) => t.from !== a.id && t.to !== a.id);
    if (kept.length) home.transitions = kept; else delete home.transitions;
  }
  return 1;
}

/** Move a beat, and its section in the page, to position `to`. */
export function moveBeat(home: Record<string, unknown>, a: { id: unknown; to: unknown }, page?: PageText | null): number {
  const beats = beatsIn(home);
  const n = beats.findIndex((b) => b.id === a.id);
  if (n < 0) throw new Error(`the home file has no beat "${String(a.id)}"`);
  if (typeof a.to !== 'number' || !Number.isInteger(a.to) || a.to < 0 || a.to >= beats.length) throw new Error(`"to" must be a position from 0 to ${beats.length - 1}`);
  if (page) sameStory(beats, page);
  const [beat] = beats.splice(n, 1);
  beats.splice(a.to, 0, beat);
  // a route (via) is the way between two neighbouring beats: a move must not part them
  const ids = beats.map((b) => b.id);
  for (const t of (Array.isArray(home.transitions) ? home.transitions : []) as Record<string, unknown>[]) {
    if (t.via && typeof t.to === 'string' && Math.abs(ids.indexOf(t.from) - ids.indexOf(t.to)) !== 1) throw new Error(`the link from "${String(t.from)}" to "${t.to}" has a route (via), which only neighbouring beats can have; this move would part them, so take its route away first`);
  }
  if (page) page.text = moveSection(page.text, a.id as string, a.to);
  return 1;
}

const LINK_ORDER = ['from', 'fromHome', 'to', 'label', 'piece', 'effect', 'strength', 'via', 'look', 'cue', 'button', 'card'];
const sameTarget = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Add, change or take away a link (a transition). It is named by where it starts (`from`, and `fromHome` on a page
 * with several homes) and where it leads (`to`). `change` gives fields to set, null taking one away, and may
 * move the link (a new `from` or `to`); a link that is not there yet is added. `remove` takes it out. The checks
 * here are the ones a single link needs; readHome() checks the whole list when the home is built from the file.
 */
export function setLink(home: Record<string, unknown>, a: { from: unknown; to: unknown; fromHome?: unknown; change?: unknown; remove?: unknown }): number {
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
  const target = (v: unknown) => text(v) || (isObj(v) && text(v.home) && text(v.section) && Object.keys(v).length === 2);
  if (!text(a.from)) throw new Error('"from" (the section the link starts from) is missing');
  if (!target(a.to)) throw new Error('"to" must be a section id, or { "home", "section" }');
  if (a.fromHome !== undefined && !text(a.fromHome)) throw new Error('"fromHome" must be a home\'s id');
  const list = (Array.isArray(home.transitions) ? home.transitions : []) as Record<string, unknown>[];
  const at = list.findIndex((t) => t.from === a.from && sameTarget(t.to, a.to) && (t.fromHome ?? undefined) === (a.fromHome ?? undefined));
  const name = `the link from "${a.from}" to ${typeof a.to === 'string' ? `"${a.to}"` : `"${(a.to as { section: string }).section}" of "${(a.to as { home: string }).home}"`}`;
  if (a.remove === true) {
    if (at < 0) throw new Error(`the home file has no ${name.slice(4)}`);
    list.splice(at, 1);
  } else {
    if (a.change !== undefined && !isObj(a.change)) throw new Error('"change" must be an object of the fields to set');
    const link: Record<string, unknown> = at >= 0 ? { ...list[at] } : { from: a.from, ...(a.fromHome ? { fromHome: a.fromHome } : {}), to: a.to };
    for (const [k, v] of Object.entries((a.change ?? {}) as Record<string, unknown>)) {
      if (!LINK_ORDER.includes(k)) throw new Error(`"${k}" is not something a link has (it has ${LINK_ORDER.join(', ')})`);
      if (v === null) { if (k === 'from' || k === 'to') throw new Error(`a link always has "${k}"`); delete link[k]; continue; }
      const ok = k === 'from' ? text(v) : k === 'to' ? target(v)
        : ['fromHome', 'label', 'effect'].includes(k) ? text(v)
        : k === 'piece' ? text(v) && /^[a-z0-9][a-z0-9-]*\/[^/\s]+$/.test(v)
        : k === 'strength' ? typeof v === 'number' && v >= 0 && v <= 2
        : k === 'cue' ? ['full', 'hover', 'none'].includes(v as string)
        : k === 'look' ? v === 'path' || v === 'beats'
        : k === 'via' ? Array.isArray(v) && v.length >= 1 && v.length <= 12 && v.every((p) => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === 'number' && Number.isFinite(n)))
        : typeof v === 'boolean'; // button, card
      if (!ok) throw new Error(`"${k}" of ${name} cannot be ${JSON.stringify(v)}`);
      link[k] = typeof v === 'string' ? v.trim() : v;
    }
    // a field at its plain value is left out of the file
    if (link.card === true) delete link.card;
    if (link.button === false) delete link.button;
    if (link.cue === 'full') delete link.cue;
    if (link.strength === 1) delete link.strength;
    if (link.button === true && !text(link.label)) throw new Error(`${name} is a button, so it needs a label (its words)`);
    // a link that moved must not land on another one
    const clash = list.findIndex((t, n) => n !== at && t.from === link.from && sameTarget(t.to, link.to) && (t.fromHome ?? undefined) === (link.fromHome ?? undefined));
    if (clash >= 0) throw new Error(`there is already a link from "${String(link.from)}" to the same place`);
    // the sections it joins, when the file keeps the story
    const beats = Array.isArray(home.beats) ? (home.beats as { id?: unknown }[]).map((b) => b.id) : [];
    if (beats.length && !beats.includes(link.from)) throw new Error(`there is no section "${String(link.from)}" to start from (there are ${beats.join(', ')})`);
    if (beats.length && typeof link.to === 'string' && !beats.includes(link.to)) throw new Error(`there is no section "${link.to}" to lead to (there are ${beats.join(', ')})`);
    const ordered = Object.fromEntries(LINK_ORDER.filter((k) => k in link).map((k) => [k, link[k]]));
    if (at >= 0) list[at] = ordered; else list.push(ordered);
  }
  if (list.length) home.transitions = list; else delete home.transitions;
  return 1;
}

/**
 * Where a home's stills are kept: public/stills/ when a page shows the home (its own home, a home its links lead
 * to, a home its story moves to), so the page without 3D can show them; stills/ for a home only the studio has, so
 * no build carries them. A site with no page without 3D (no popfoldFallback) keeps them all in public/stills/.
 */
export function stillsFolder(plugins: readonly { name: string }[], home: string): 'public/stills' | 'stills' {
  const api = (plugins.find((p) => p.name === 'popfold-fallback') as { api?: { captures: { home: string }[] } } | undefined)?.api;
  return !api || api.captures.some((c) => c.home === home) ? 'public/stills' : 'stills';
}

/**
 * The story page whose sections are this home's beats (popfoldFallback's pages: the page that shows the home, as
 * its own HTML file), or null when no page shows it. A page whose HTML other pages are made from, for other homes,
 * cannot have its sections changed for one of them: that is a mistake, named.
 */
export function storyPageOf(plugins: readonly { name: string }[], home: string): string | null {
  const api = (plugins.find((p) => p.name === 'popfold-fallback') as { api?: { pages: { html: string; source: string; home: string | null }[] } } | undefined)?.api;
  const mine = (api?.pages ?? []).filter((p) => p.home === home);
  if (!mine.length) return null;
  const sources = [...new Set(mine.map((p) => p.source))];
  if (sources.length > 1) throw new Error(`the home "${home}" is shown by pages made from different HTML (${sources.join(', ')}); change their sections by hand`);
  const others = (api?.pages ?? []).filter((p) => p.source === sources[0] && p.home !== home).map((p) => p.home);
  if (others.length) throw new Error(`${sources[0]} is the HTML of pages for other homes too (${others.join(', ')}), whose beats would no longer match its sections; change them together by hand`);
  return sources[0];
}

export interface SaverOptions {
  /**
   * The site's home files (src/home.json), relative to the site's root. The studio's Save writes every change
   * to a home into its file; a home with no file (made in code) cannot be saved from the studio.
   */
  home?: string | string[];
}

// ---------------------------------------------------------------------------------------------------------------
// The command list: every edit a home file can take, by name. The studio, `popfold mcp` (an agent) and a script all
// send these, to POST /__popfold/home/<id> as { commands: [{ name, args }] }; GET /__popfold/commands lists them.

type Json = Record<string, unknown>;
/** One edit to a home file. */
export interface HomeCommand { name: string; args?: Json }
interface CommandSpec {
  /** what it does, for a person or an agent choosing it */
  summary: string;
  /** its arguments, as JSON Schema properties */
  args: Json;
  required: string[];
  run: (home: Json, args: Json, page?: PageText | null) => number;
  /** it changes the story's sections, so the page is edited with the home file */
  page?: true;
}
const str = { type: 'string' }, bool = { type: 'boolean' }, obj = { type: 'object' };
const three = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const pieceAt = { id: { ...str, description: "the piece's id" }, room: { ...str, description: 'its room, zone or floor' }, wall: { ...bool, description: 'true for a piece on the wall' } };
const storySchema = { type: 'object', properties: { title: str, text: str, tags: { type: 'array', items: str }, dot: { enum: ['top', 'front', 'below'] } }, required: ['title', 'text', 'tags'] };

export const HOME_COMMANDS: Record<string, CommandSpec> = {
  place: {
    summary: 'Move, turn, resize, hide or swap a piece that the home file lists. Only the fields given change.',
    args: { ...pieceAt, change: { type: 'object', description: 'any of: at [x, z] (on a wall: [x, height]), turn (radians), lift, out, scale, hidden, kind', properties: { at: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, turn: { type: 'number' }, lift: { type: 'number' }, out: { type: 'number' }, scale: { type: 'number' }, hidden: bool, kind: str } } },
    required: ['id', 'room', 'change'],
    run: (h, a) => placePieces(h, [a as Parameters<typeof placePieces>[1][number]]),
  },
  places: {
    summary: "Set where the pieces the file does not list stand (a diorama's model parts), by key. Replaces them all.",
    args: { places: { type: 'object', description: '{ "<room>/<piece>": { p: [x, y, z], r: [x, y, z] radians, s: size, hide: true } }', additionalProperties: { type: 'object', properties: { p: three, r: three, s: { type: 'number' }, hide: bool } } } },
    required: ['places'],
    run: (h, a) => setPlaces(h, a.places),
  },
  add: {
    summary: 'Put a new piece in the home, in the middle of its room unless `at` is given. `kind` is one of the home\'s kinds or model names.',
    args: { ...pieceAt, kind: str, at: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 } },
    required: ['id', 'room', 'kind'],
    run: (h, a) => addPieces(h, [a as Parameters<typeof addPieces>[1][number]]),
  },
  remove: {
    summary: 'Take a listed piece out of the home.',
    args: pieceAt, required: ['id', 'room'],
    run: (h, a) => removePieces(h, [a as Parameters<typeof removePieces>[1][number]]),
  },
  story: {
    summary: 'Write the story behind a piece (a dot on it and a card), or take it away with story: null. Name a listed piece by id and room, or any piece by its key ("<room>/<piece>").',
    args: { ...pieceAt, key: str, story: { anyOf: [storySchema, { type: 'null' }] } },
    required: ['story'],
    run: (h, a) => setStories(h, [a as Parameters<typeof setStories>[1][number]]),
  },
  camera: {
    summary: 'Set where the camera is and what it looks at, at a beat of the story (named by its section id).',
    args: { id: { ...str, description: "the beat's id" }, camera: three, lookAt: three },
    required: ['id', 'camera', 'lookAt'],
    run: (h, a) => placeCameras(h, [a as Parameters<typeof placeCameras>[1][number]]),
  },
  beat: {
    summary: 'Set what the home does at a beat: set { c, L, R, glow, badges, hero, side, av, ax, az, wave } and, for a tower, zones { <floor>: 0..1 }, and its name (the studio\'s label). Only the fields given change.',
    args: { id: str, name: str, set: { type: 'object', additionalProperties: { type: 'number' } }, zones: { type: 'object', additionalProperties: { type: 'number' } } },
    required: ['id'],
    run: (h, a) => setBeats(h, [a as Parameters<typeof setBeats>[1][number]]),
  },
  'add-beat': {
    summary: 'Add a beat to the story, and its <section class="stage"> to the page (a heading with its name and a placeholder for the words, shaped like its neighbour). It starts as a copy of the beat before it; then set its camera and values.',
    args: { id: { ...str, description: "the beat's id, and its section's" }, name: { ...str, description: 'a short name: the heading of its section, and the studio\'s label' }, at: { type: 'integer', minimum: 0, description: 'its position in the story, 0 first (default: the end)' } },
    required: ['id', 'name'],
    run: (h, a, page) => addBeat(h, a as Parameters<typeof addBeat>[1], page),
    page: true,
  },
  'remove-beat': {
    summary: 'Take a beat out of the story, with its section in the page (its words go too) and the links that start from it or lead to it.',
    args: { id: str },
    required: ['id'],
    run: (h, a, page) => removeBeat(h, a as Parameters<typeof removeBeat>[1], page),
    page: true,
  },
  'move-beat': {
    summary: 'Move a beat to another place in the story, and its section in the page with it.',
    args: { id: str, to: { type: 'integer', minimum: 0, description: 'its new position, 0 first' } },
    required: ['id', 'to'],
    run: (h, a, page) => moveBeat(h, a as Parameters<typeof moveBeat>[1], page),
    page: true,
  },
  look: {
    summary: "Change the home's look: look (a compact's colours and surfaces, field by field), emblem { title, subtitle, heart } (replaced), floors [{ id, color, label }] (a tower's), tower { wall, slab, spine, elevator } (a tower's building; spine is the pipe's colour, null takes it away), paint { <material>: colour | null } (a diorama's model colours, by material name).",
    args: { look: obj, emblem: obj, floors: { type: 'array', items: { type: 'object', properties: { id: str, color: str, label: str }, required: ['id'] } }, tower: { type: 'object', properties: { wall: str, slab: str, spine: { anyOf: [str, { type: 'null' }] }, elevator: bool } }, paint: { type: 'object', additionalProperties: { anyOf: [str, { type: 'null' }] } } },
    required: [],
    run: (h, a) => setLook(h, a),
  },
  link: {
    summary: 'Add, change or take away a link from one section to another, or to a section of another home: its card on the page without 3D, the piece (door) that takes it in 3D, its effect on the way, how the door shows it, and a button in the section. Named by from, to (and fromHome); a link that is not there is added.',
    args: {
      from: { ...str, description: 'the section (beat id) it starts from' },
      to: { anyOf: [str, { type: 'object', properties: { home: str, section: str }, required: ['home', 'section'] }], description: 'the section it leads to, or { home, section } in another home' },
      fromHome: { ...str, description: 'the home it starts from, on a page with more than one' },
      change: {
        type: 'object', description: 'fields to set; null takes one away. A new from or to moves the link.',
        properties: {
          from: str, to: { anyOf: [str, obj] }, fromHome: str,
          label: { ...str, description: "the card's and the button's words" },
          piece: { ...str, description: 'the piece key ("<room>/<id>") that takes the link in 3D' },
          effect: { ...str, description: 'fade, zoom, vortex, tunnel, cut, or one the site adds' },
          strength: { type: 'number', minimum: 0, maximum: 2 },
          cue: { enum: ['full', 'hover', 'none'], description: "how the door shows it is one (default full)" },
          button: { ...bool, description: "also a button in its section's text card (needs a label)" },
          card: { ...bool, description: 'false keeps it off the page without 3D' },
          via: { type: 'array', items: three }, look: { enum: ['path', 'beats'] },
        },
      },
      remove: { ...bool, description: 'true takes the link away' },
    },
    required: ['from', 'to'],
    run: (h, a) => setLink(h, a as Parameters<typeof setLink>[1]),
  },
};

/** The command list without its code: what GET /__popfold/commands answers, and what `popfold mcp` offers. */
export const commandList = () => Object.entries(HOME_COMMANDS).map(([name, c]) => ({ name, summary: c.summary, args: { type: 'object', properties: c.args, required: c.required } }));

/**
 * Run commands on a home file's contents (and on its page's text, for the commands that change the story's
 * sections), in order. A mistake stops them all, and names the command.
 */
export function runCommands(home: Json, commands: unknown, page?: PageText | null): number {
  if (!Array.isArray(commands) || !commands.length) throw new Error('Expected { commands: [{ name, args }] }');
  let n = 0;
  commands.forEach((c: HomeCommand, i) => {
    const spec = c && typeof c === 'object' ? HOME_COMMANDS[c.name] : undefined;
    if (!spec) throw new Error(`command ${i + 1}: there is no command "${String(c?.name)}" (there are ${Object.keys(HOME_COMMANDS).join(', ')})`);
    const args = (c.args ?? {}) as Json;
    for (const k of spec.required) if (args[k] === undefined) throw new Error(`command ${i + 1} (${c.name}): "${k}" is missing`);
    try { n += spec.run(home, args, page); } catch (err) { throw new Error(`command ${i + 1} (${c.name}): ${(err as Error).message}`); }
  });
  return n;
}

export function homeSaver(o: SaverOptions = {}): Plugin {
  const homeFiles = ([] as string[]).concat(o.home ?? []);
  /** the home file this plugin wrote last, and when: the studio that asked shows the change itself */
  let ownWrite: { files: string[]; at: number } | null = null;
  const quietly = (file: string) => !!ownWrite && ownWrite.files.includes(resolve(file)) && Date.now() - ownWrite.at < 3000;
  /** each home file's earlier and undone contents, while the dev server runs: undo and redo of saves */
  type Save = { text: string; names: string[]; page?: { path: string; text: string } };
  const saves = new Map<string, { past: Save[]; future: Save[] }>();
  return {
    name: 'popfold-home-saver',
    apply: 'serve',
    // A save from the studio rewrites the home file, which the studio page imports: left alone, Vite would reload
    // the page, losing the view and the selection. The studio builds the home again from the file it gets back
    // instead. (Another tab with the site shows the change on its next reload.) An edit made by hand still reloads.
    handleHotUpdate(ctx) {
      if (quietly(ctx.file)) return [];
      return undefined;
    },
    configureServer(server) {
      // A page's HTML is not a module: when the beat commands rewrite it, Vite reloads every open page whatever the
      // hooks above say. The studio that asked shows the new story itself, so that reload is held back for it.
      const hot = server.environments?.client?.hot ?? server.ws;
      const send = hot.send.bind(hot) as (...a: unknown[]) => void;
      (hot as { send: (...a: unknown[]) => void }).send = (...a: unknown[]) => {
        const p = a[0] as { type?: string; path?: string } | undefined;
        if (p?.type === 'full-reload' && p.path?.endsWith('.html') && quietly(resolve(server.config.root, p.path.replace(/^\//, '')))) return;
        send(...a);
      };
      // Save → the home's own file (src/home.json): every change the studio makes is a command on it
      server.middlewares.use('/__popfold/home/', async (req, res) => {
        if (!localOnly(req, res, true)) return; // (a GET reads the home file)
        const reading = req.method === 'GET'; // the file as it is: the studio's look editor starts from it
        if (!reading && !req.headers['content-type']?.startsWith('application/json')) { res.statusCode = 415; res.end('JSON only'); return; }
        const id = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (!/^[a-z0-9-]{1,40}$/.test(id)) { res.statusCode = 400; res.end('Bad home id'); return; }
        res.setHeader('content-type', 'application/json');
        try {
          // which of the site's home files is this home's?
          let file = '', home: Record<string, unknown> | null = null;
          for (const f of homeFiles) {
            const data = JSON.parse(await readFile(resolve(server.config.root, f), 'utf8'));
            if (data?.id === id) { file = f; home = data; break; }
          }
          if (!home) { res.end(JSON.stringify({ ok: false, why: 'this site keeps no home file for this home' })); return; }
          if (reading) { res.end(JSON.stringify({ ok: true, file, home })); return; }
          const body = JSON.parse((await readBody(req, 512_000)).toString('utf8'));
          if (!body || typeof body !== 'object') throw new Error('Expected { commands: [...] }, { undo: true } or { redo: true }');
          const path = resolve(server.config.root, file);
          const before = await readFile(path, 'utf8');
          const h = saves.get(path) ?? { past: [], future: [] };
          saves.set(path, h);
          let text: string, names: string[];
          /** the page, when the step changed its sections too: its text before and after */
          let page: { path: string; before: string; text: string } | null = null;
          if (body.undo || body.redo) {
            // a step back (or forward again) through this server's saves of the file (and of its page, if it changed)
            const step = (body.undo ? h.past : h.future).pop();
            if (!step) { res.end(JSON.stringify({ ok: false, why: `nothing to ${body.undo ? 'undo' : 'redo'}` })); return; }
            if (step.page) page = { path: step.page.path, before: await readFile(step.page.path, 'utf8'), text: step.page.text };
            (body.undo ? h.future : h.past).push({ text: before, names: step.names, ...(page ? { page: { path: page.path, text: page.before } } : {}) });
            text = step.text; names = step.names;
          } else {
            const commands = body.commands as HomeCommand[];
            // a command that changes the story's sections edits the page that shows this home, too
            let pageText: PageText | null = null;
            if (Array.isArray(commands) && commands.some((c) => HOME_COMMANDS[c?.name]?.page)) {
              const html = storyPageOf(server.config.plugins, id);
              if (html) {
                const pagePath = resolve(server.config.root, html);
                const raw = await readFile(pagePath, 'utf8');
                pageText = { file: html, text: raw.replace(/\r\n/g, '\n') };
                page = { path: pagePath, before: raw, text: '' };
              }
            }
            runCommands(home, commands, pageText);
            text = formatHome(home);
            if (page && pageText) page.text = /\r\n/.test(page.before) ? pageText.text.replace(/\n/g, '\r\n') : pageText.text;
            if (page && page.text === page.before) page = null;
            names = [...new Set(commands.map((c) => c.name))];
            if (text !== before || page) {
              h.past.push({ text: before, names, ...(page ? { page: { path: page.path, text: page.before } } : {}) });
              if (h.past.length > 100) h.past.shift();
              h.future = [];
            }
          }
          // the studio that asked shows the change itself (quiet); an agent's edit lets open pages reload
          ownWrite = body.quiet ? { files: [path, ...(page ? [page.path] : [])], at: Date.now() } : null;
          if (text !== before) await writeFile(path, text, 'utf8');
          if (page) await writeFile(page.path, page.text, 'utf8');
          // the file as it is now: the studio builds the home again from it, without reloading the page. `names`
          // says which commands the step was made of (after an undo: the ones taken back); `page` the page that
          // changed with it
          res.end(JSON.stringify({ ok: true, file, names, undo: h.past.length, redo: h.future.length, home: JSON.parse(text), ...(page ? { page: relative(server.config.root, page.path).replace(/\\/g, '/') } : {}) }));
        } catch (err) { res.statusCode = 400; res.end(JSON.stringify({ ok: false, why: `Could not save: ${(err as Error).message}` })); }
      });
      // the model files in the public folder, for the studio's object view (the page cannot read folders)
      server.middlewares.use('/__popfold/library', (req, res) => {
        if (!localOnly(req, res, true)) return;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ files: modelFiles(resolve(server.config.root, server.config.publicDir || 'public')) }));
      });
      server.middlewares.use('/__popfold/commands', (req, res) => {
        if (!localOnly(req, res, true)) return;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ commands: commandList(), homes: homeFiles }));
      });
      // Capture stills → public/stills/<home id>-<stop>.webp for a home a page shows (the page without 3D uses them,
      // so every build carries them), and stills/<home id>-<stop>.webp for a home only the studio has: kept with the
      // site and compared by `popfold stills --check`, but never copied into a build
      server.middlewares.use('/__popfold/still/', async (req, res) => {
        if (!localOnly(req, res)) return;
        if (req.headers['content-type'] !== 'image/webp') { res.statusCode = 415; res.end('WebP only'); return; }
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (!/^[a-z0-9-]{1,40}-\d{1,2}\.webp$/.test(name)) { res.statusCode = 400; res.end('Bad still name'); return; }
        try {
          const img = await readBody(req, 8_000_000);
          if (img.subarray(0, 4).toString() !== 'RIFF' || img.subarray(8, 12).toString() !== 'WEBP') throw new Error('Not a WebP file');
          const home = name.replace(/-\d+\.webp$/, '');
          const folder = stillsFolder(server.config.plugins, home);
          const dir = resolve(server.config.root, folder);
          await mkdir(dir, { recursive: true });
          await writeFile(resolve(dir, name), img);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, file: `${folder}/${name}`, bytes: img.length }));
        } catch (err) { res.statusCode = 400; res.end(`Could not save: ${(err as Error).message}`); }
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The page without 3D

/** One story page of a site: its stories, where they go, and which home's stills it shows. */
export interface FallbackPage {
  /** the page's HTML file, relative to the site's root: 'index.html', 'tour/index.html' */
  html: string;
  /**
   * Build this page from another page's HTML instead of a file of its own: the same copy, showing another home
   * (its `homeFile`). For a site in several homes, one address each: `{ html: 'evening/index.html', from:
   * 'index.html', homeFile: 'src/homes/evening.json' }`. The page's relative paths are moved to its folder, it gets
   * its own stills, stories, link cards, share image, canonical address, sitemap entry and part of llms.txt, and
   * the 3D page starts in its home. Its file is made by the dev server and the build; there is none on disk.
   */
  from?: string;
  /**
   * The page's language (an IETF tag: 'bg', 'pt-BR'). With `text` it makes the page a translation of the page it is
   * built `from`: `{ html: 'bg/index.html', from: 'index.html', lang: 'bg', text: 'src/i18n/bg.json' }`. The pages
   * of one copy in different languages link to each other (hreflang) and each is in the sitemap.
   */
  lang?: string;
  /**
   * The page's translation file, relative to the site's root: a JSON object from the words as they are written in
   * the page it is built from (spaces folded) to their translation. It translates the page's text, the words of its
   * images and share tags, the stories and link cards written into it, and, in the browser, the story cards,
   * Popfold's own words ("Simple view", "Why it's here", "Close") and whatever the site passes through `t()`.
   * Read from disk each time, like the home file. Words it does not have stay as they are; the dev server and the
   * build list them.
   */
  text?: string;
  /**
   * the page's home file, relative to the site's root ('src/home.json'). Its pieces' stories are written into
   * the page and its id names the page's stills, so nothing else need be passed. It is read from disk each time
   * it is needed, not imported by vite.config.ts: the dev server then keeps running when the studio saves it.
   */
  homeFile?: string;
  /**
   * the home's listed pieces (the recipe's `pieces`, or "pieces" in its JSON file): the stories they carry are
   * written into the page. Typed loosely, because that is how TypeScript reads a JSON file.
   */
  pieces?: readonly { id: string; room: string; wall?: boolean; story?: Omit<PropStory, 'dot'> & { dot?: string } }[];
  /** the recipe's own room names, if it has them (`rooms`), so the listed pieces' keys match */
  rooms?: { center: string; left: string; right: string };
  /** more stories to write into the page; their keys are "<zone>/<piece>" as in the recipe */
  stories?: Record<string, PropStory>;
  /**
   * Links between sections and homes (transitions.ts), when the page's story is code; a home file's own
   * "transitions" are read from it. Each one with a label becomes a card in its starting section.
   */
  transitions?: Transition[];
  /**
   * The home each section shows, by section id, when the story moves between homes and its beats are code (a home
   * file's beats say it with their `home`). Each section's still is then that home's.
   */
  sectionHomes?: Record<string, string>;
  /** which section a story goes under, by zone (the part of the key before "/", without "-wall"); default: a section with the zone's id */
  sections?: Record<string, string>;
  /** heading over each section's story list (default "Highlights") */
  storiesHeading?: string;
  /** stills from the studio's "Capture stills": public/stills/<home>-<stop>.webp, one per stage section in order */
  stillsHome?: string;
  /** the studio page that captures this page's stills (default: studio.html next to the page) */
  studio?: string;
  /** extra lines for this page's part of llms.txt (e.g. contact, links) */
  llmsExtra?: string;
}

export interface FallbackOptions extends Omit<FallbackPage, 'html' | 'studio'> {
  /** the site's name (llms.txt title, image alt text) */
  siteName: string;
  /** the public address of the site's root, e.g. https://example.com/ (enables og:image, sitemap.xml and canonical links); optional */
  siteUrl?: string;
  /** JSON-LD objects for search engines and agents (schema.org), written into the first page */
  jsonLd?: object | object[];
  /**
   * How heavy the site's models may be, in kilobytes: `each` for one file, `total` for all of public/models.
   * A build over either stops with the list of files; `popfold check` reports the same. Without it, `popfold
   * check` only warns (above 1,500 KB a file, 10,000 KB in all).
   */
  modelBudget?: { each?: number; total?: number };
  /**
   * The modelled cases (`look.shell`) a build carries. By default, those the site's home files (JSON under src/)
   * use: a tower or a diorama needs none, and a site with no home file gets both. Name them for a compact made in
   * code. The dev server always has both, for the studio.
   */
  cases?: ('round' | 'crisp')[];
  /**
   * A site with more than one story page lists them here, the main page first. Each has its own stories, sections
   * and stills. Without `pages`, the fields above describe the one page, index.html.
   */
  pages?: FallbackPage[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// ---------------------------------------------------------------------------------------------------------------
// Reading a story page. The page is parsed (parse5) only to learn where things are; the plugin then adds its stills,
// stories and head tags at those places in the page's own text, which is otherwise left exactly as it was written.

type Node5 = { nodeName: string; tagName?: string; value?: string; attrs?: { name: string; value: string }[]; childNodes?: Node5[]; content?: Node5;
  sourceCodeLocation?: { startOffset: number; endOffset: number; startTag?: { startOffset: number; endOffset: number }; endTag?: { startOffset: number; endOffset: number } } };

/** A <section> of a story page, as the page without 3D needs it. */
export interface PageSection {
  id: string | null;
  /** it has the class "stage": one beat of the story */
  stage: boolean;
  /** where its start tag begins, and just after its end tag */
  start: number;
  end: number;
  /** just after its start tag: where its still goes */
  open: number;
  /** where a card's content ends: before the end tag of its last <article> or <div>, or of the section itself */
  cardEnd: number;
  /** its first <h1> or <h2>, as plain text ('' when it has none) */
  heading: string;
  /** its words besides that heading, as plain text, leaving out figures, scripts and nested sections */
  text: string;
}

/** What a story page holds, and where. */
export interface PageInfo {
  sections: PageSection[];
  /** before </head>: where the head tags go */
  headEnd: number;
  title: string;
  description: string;
  hasOgImage: boolean;
  hasCanonical: boolean;
}

const attr = (n: Node5, name: string) => n.attrs?.find((a) => a.name === name)?.value;
const kids = (n: Node5) => (n.nodeName === 'template' ? n.content?.childNodes : n.childNodes) ?? [];
const words = (s: string) => s.replace(/\s+/g, ' ').trim();
/** the text under a node, leaving out the elements `skip` names */
function textOf(n: Node5, skip: (e: Node5) => boolean = () => false): string {
  if (n.nodeName === '#text') return n.value ?? '';
  if (n.tagName && skip(n)) return ' ';
  // every element parts words (chips side by side are separate words; so is a line of links)
  const inner = kids(n).map((k) => textOf(k, skip)).join('');
  return n.tagName ? ` ${inner} ` : inner;
}

/** Read a story page (see PageInfo). Pure: the page's text is not changed. */
export function readPage(html: string): PageInfo {
  const doc = parse(html, { sourceCodeLocationInfo: true }) as unknown as Node5;
  const sections: PageSection[] = [];
  let head: Node5 | undefined, title = '', description = '', hasOgImage = false, hasCanonical = false;
  const endOf = (n: Node5) => n.sourceCodeLocation?.endTag?.startOffset ?? n.sourceCodeLocation?.endOffset ?? 0;
  const visit = (n: Node5) => {
    if (n.tagName === 'head') head = n;
    else if (n.tagName === 'title' && !title) title = words(textOf(n));
    else if (n.tagName === 'meta' && attr(n, 'name') === 'description') description = attr(n, 'content') ?? '';
    else if (n.tagName === 'meta' && attr(n, 'property') === 'og:image') hasOgImage = true;
    else if (n.tagName === 'link' && (attr(n, 'rel') ?? '').split(/\s+/).includes('canonical')) hasCanonical = true;
    else if (n.tagName === 'section' && n.sourceCodeLocation) {
      // its first heading, and the last card inside it (not inside a nested section)
      let heading: Node5 | undefined, card: Node5 | undefined;
      const inside = (e: Node5) => {
        for (const k of kids(e)) {
          if (k.tagName === 'section') continue;
          if (!heading && (k.tagName === 'h1' || k.tagName === 'h2')) heading = k;
          if ((k.tagName === 'div' || k.tagName === 'article') && (!card || endOf(k) > endOf(card))) card = k;
          inside(k);
        }
      };
      inside(n);
      const skip = (e: Node5) => e === heading || e.tagName === 'section' || e.tagName === 'figure' || e.tagName === 'script' || e.tagName === 'style'
        || (attr(e, 'class') ?? '').split(/\s+/).includes('pf-stories');
      sections.push({
        id: attr(n, 'id') ?? null,
        stage: (attr(n, 'class') ?? '').split(/\s+/).includes('stage'),
        start: n.sourceCodeLocation.startOffset,
        end: n.sourceCodeLocation.endOffset,
        open: n.sourceCodeLocation.startTag?.endOffset ?? n.sourceCodeLocation.startOffset,
        cardEnd: card ? endOf(card) : endOf(n),
        heading: heading ? words(textOf(heading)) : '',
        text: words(textOf(n, (e) => e !== n && skip(e))),
      });
    }
    for (const k of kids(n)) visit(k);
  };
  visit(doc);
  // a page parsed without a written <head> still has one: its tags then go before the body
  const headEnd = head?.sourceCodeLocation ? endOf(head) : Math.max(0, html.search(/<body\b/i));
  return { sections, headEnd, title, description, hasOgImage, hasCanonical };
}

/** Put text into a page at offsets of the page as it was read: the later places first, so earlier ones hold. */
function insertAll(html: string, edits: [number, string][]) {
  for (const [at, text] of [...edits].sort((a, b) => b[0] - a[0])) html = html.slice(0, at) + text + html.slice(at);
  return html;
}

// ---------------------------------------------------------------------------------------------------------------
// A page in another language: the same page with its words swapped by a dictionary (its translation file), the
// words as they are written in the page (a run of spaces and line breaks counts as one space) to the translation.

/**
 * Popfold's own words in the browser (the story card, the view toggle), which a translated page's file translates
 * too. Keep in step with the t() calls in story-card.ts and fallback.ts.
 */
export const POPFOLD_WORDS = ["Why it's here", 'Close', 'Skills', 'Simple view', '3D view', 'Switch to the simple view without 3D', 'Switch to the 3D view'];
/** the attributes whose words are read out or shown: they are translated with the text */
const WORDY_ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
/** the meta tags whose content is words */
const WORDY_META = ['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description'];
// (an address is not words to translate: "hello@example.com", "https://...")
const hasWords = (s: string) => /\p{L}/u.test(s) && !/^\s*(\S+@\S+\.\S+|[a-z][\w+.-]*:\/\/\S+)\s*$/i.test(s);

/**
 * Translate a page: every text, and the inner HTML of every element, that the dictionary has (as written, spaces
 * folded) is swapped for its translation, as are the words of `alt`, `title`, `aria-label`, `placeholder` and the
 * description and share tags. An element whose whole inner HTML is a key is swapped as one (for a sentence with a
 * link or <b> in it). `lang` goes on <html>. Returns the page, and the words in its body that the dictionary does
 * not have (scripts and styles left out), so a site can see what is still to translate. Pure.
 */
export function translateHtml(html: string, dict: Record<string, string>, lang?: string): { html: string; missing: string[] } {
  const d = new Map(Object.entries(dict).map(([k, v]) => [words(k), v]));
  const doc = parse(html, { sourceCodeLocationInfo: true }) as unknown as Node5;
  const edits: [number, number, string][] = [];
  const missing: string[] = [];
  const swap = (from: number, to: number, raw: string) => {
    const t = d.get(words(raw));
    if (t === undefined) return false;
    // the spaces around the words stay, so the page keeps its layout
    const lead = /^\s*/.exec(raw)![0], trail = /\s*$/.exec(raw)![0];
    edits.push([from, to, lead + t + trail]);
    return true;
  };
  let inBody = false;
  const visit = (n: Node5) => {
    const loc = n.sourceCodeLocation;
    if (n.tagName === 'html' && lang && loc?.startTag) {
      const tag = html.slice(loc.startTag.startOffset, loc.startTag.endOffset);
      const withLang = /\slang\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i.test(tag) ? tag.replace(/(\slang\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i, `$1"${lang}"`) : tag.replace(/^<html/i, `<html lang="${lang}"`);
      edits.push([loc.startTag.startOffset, loc.startTag.endOffset, withLang]);
    }
    if (n.tagName === 'script' || n.tagName === 'style') return;
    // words marked as being in a language of their own ("<a lang=\"bg\">БГ</a>" in a language switcher) stay
    if (n.tagName && n.tagName !== 'html' && attr(n, 'lang')) return;
    if (n.tagName === 'body') inBody = true;
    if (n.nodeName === '#text') {
      if (!loc || !hasWords(n.value ?? '')) return;
      const raw = html.slice(loc.startOffset, loc.endOffset);
      if (!swap(loc.startOffset, loc.endOffset, raw) && inBody) missing.push(words(raw));
      return;
    }
    if (n.tagName && loc?.startTag) {
      // its words in attributes: each attribute's value, found in the tag as written
      const metaName = n.tagName === 'meta' ? attr(n, 'name') ?? attr(n, 'property') : undefined;
      const names = metaName && WORDY_META.includes(metaName) ? ['content'] : WORDY_ATTRS;
      const tag = html.slice(loc.startTag.startOffset, loc.startTag.endOffset);
      for (const name of names) {
        const m = new RegExp(`(\\s${name}\\s*=\\s*)("([^"]*)"|'([^']*)')`, 'i').exec(tag);
        if (!m) continue;
        const value = m[3] ?? m[4] ?? '';
        if (!hasWords(value)) continue;
        const from = loc.startTag.startOffset + m.index + m[1].length + 1;
        if (!swap(from, from + value.length, value) && inBody) missing.push(words(value));
      }
      // the whole inner HTML, when the dictionary has it: one entry for a sentence with markup in it
      if (loc.endTag && kids(n).some((k) => k.tagName)) {
        const raw = html.slice(loc.startTag.endOffset, loc.endTag.startOffset);
        if (swap(loc.startTag.endOffset, loc.endTag.startOffset, raw)) return;
      }
    }
    for (const k of kids(n)) visit(k);
  };
  visit(doc);
  for (const [from, to, text] of edits.sort((a, b) => b[0] - a[0])) html = html.slice(0, from) + text + html.slice(to);
  return { html, missing: [...new Set(missing)] };
}

/** a story in another language: its words through the dictionary, each left as it is where there is no entry */
export function translateStory(s: PropStory, dict: Record<string, string>): PropStory {
  const d = new Map(Object.entries(dict).map(([k, v]) => [words(k), v]));
  const t = (x: string) => d.get(words(x)) ?? x;
  return {
    ...s, title: t(s.title), text: t(s.text), tags: s.tags.map(t),
    ...(s.meta ? { meta: t(s.meta) } : {}), ...(s.kicker ? { kicker: t(s.kicker) } : {}),
    ...(s.links ? { links: s.links.map((l) => ({ ...l, label: t(l.label) })) } : {}),
  };
}

/**
 * A deploy removes the previous build's files, so a page that was open (or cached) while the site was deployed asks
 * for files that are gone, and its 3D never starts. This reloads such a page once to get the new build. Only the
 * site's own files count (a blocked analytics script does not), and a page reloads at most once in 30 seconds:
 * if the files are still missing, the page without 3D stays, as it would without JavaScript.
 */
export const STALE_RELOAD = `(function(){var k='pf-stale-reload';function stale(){try{var t=+sessionStorage.getItem(k)||0;if(Date.now()-t<30000)return;sessionStorage.setItem(k,String(Date.now()))}catch(e){return}location.reload()}`
  + `addEventListener('error',function(e){var t=e.target,u=t&&(t.src||t.href);if(u&&(t.tagName==='SCRIPT'||t.tagName==='LINK')&&u.indexOf(location.origin+'/')===0)stale()},true);`
  + `addEventListener('vite:preloadError',stale)})()`;

/** Shown until the 3D scene says it is running (html.has-3d), so no JS, no WebGL and crawlers all get it. */
const FALLBACK_CSS = `
.pf-still { display: none; }
/* In 3D the stories open from the dots, so the written-out copies are moved out of sight. They are not removed:
   a screen reader still reads them under their section, and each one can be reached with the Tab key, which
   brings its section's list back into view. */
.pf-stories { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.pf-stories:focus-within { position: static; width: auto; height: auto; margin: 18px 0 0; overflow: visible; clip-path: none; white-space: normal; display: grid; gap: 12px; }
.pf-story:focus-visible { outline: 3px solid #3EE6FF; outline-offset: 2px; }
html:not(.has-3d) #scene { opacity: 0; }
#scene { transition: opacity .6s ease; }
html:not(.has-3d) .stage { align-items: flex-start; gap: 4vw; }
html:not(.has-3d) .stage:not([data-text="center"]) { justify-content: space-between; }
html:not(.has-3d) .pf-still { display: block; position: sticky; top: 12vh; flex: 1 1 0; min-width: 0; max-width: 760px; margin: 0; pointer-events: none; }
html:not(.has-3d) .stage[data-text="left"] .pf-still { order: 2; }
html:not(.has-3d) .stage[data-text="center"] .pf-still { display: none; }
.pf-still img { width: 100%; height: auto; max-height: 82vh; object-fit: contain; display: block; }
.pf-links { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.pf-links:focus-within, html:not(.has-3d) .pf-links { position: static; width: auto; height: auto; margin: 18px 0 0; overflow: visible; clip-path: none; white-space: normal; display: flex; flex-wrap: wrap; gap: 12px; }
.pf-link { display: grid; gap: 6px; width: min(100%, 260px); padding: 8px; border-radius: 14px; border: 1px solid rgba(127, 127, 127, .35); background: rgba(127, 127, 127, .1); color: inherit; font-weight: 700; text-decoration: none; }
.pf-link img { width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 9px; display: block; }
.pf-link span::after { content: ' →'; }
.pf-link:hover { background: rgba(127, 127, 127, .18); }
.pf-link:focus-visible { outline: 3px solid #3EE6FF; outline-offset: 2px; }
/* in 3D, a link that is a button shows in its section's text card, as a chip (the rest stay out of sight) */
html.has-3d .pf-links:has(.pf-link-button) { position: static; width: auto; height: auto; margin: 16px 0 0; overflow: visible; clip-path: none; white-space: normal; display: flex; flex-wrap: wrap; gap: 8px; }
html.has-3d .pf-links:has(.pf-link-button) .pf-link:not(.pf-link-button), html.has-3d .pf-link-button[hidden] { display: none; }
html.has-3d .pf-link-button { width: auto; display: inline-flex; gap: 0; padding: 9px 16px; border-radius: 999px; border: none; background: var(--pf-link-bg, #1B1630); color: var(--pf-link-ink, #FFFFFF); font-weight: 700; }
html.has-3d .pf-link-button img { display: none; }
/* a button for another home's link is for the 3D page only: no card without 3D (nor its list, if that is all it has) */
html:not(.has-3d) .pf-link-3d-only, html:not(.has-3d) .pf-links:not(:has(.pf-link:not(.pf-link-3d-only))) { display: none; }
html.has-3d .pf-link-button:hover { filter: brightness(1.15); background: var(--pf-link-bg, #1B1630); }
html:not(.has-3d) .pf-stories { position: static; width: auto; height: auto; margin: 18px 0 0; overflow: visible; clip-path: none; white-space: normal; display: grid; gap: 12px; }
.pf-stories h3 { margin: 0; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; opacity: .75; }
.pf-story { padding: 12px 14px; border-radius: 14px; background: rgba(127, 127, 127, .1); border: 1px solid rgba(127, 127, 127, .25); }
.pf-story h4 { margin: 0 0 4px; font-size: 17px; line-height: 1.25; }
.pf-story .pf-meta { margin: 0 0 6px; font-size: 13px; font-weight: 700; opacity: .7; }
.pf-story p { margin: 0; font-size: 15px; line-height: 1.5; }
.pf-story ul { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
.pf-story li { padding: 2px 9px; border-radius: 999px; border: 1px solid rgba(127, 127, 127, .4); font-size: 12.5px; font-weight: 700; }
.pf-story a { font-weight: 700; }
@media (max-width: 820px) {
  html:not(.has-3d) .pf-still { position: static; order: 0 !important; width: 100%; flex: none; }
  html:not(.has-3d) .stage { flex-direction: column; align-items: center; justify-content: center !important; }
}
.pf-view-toggle { position: fixed; left: 16px; bottom: 16px; z-index: 30; padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(127,127,127,.5);
  background: rgba(20, 18, 34, .78); color: #fff; font: 600 13px system-ui, sans-serif; cursor: pointer; backdrop-filter: blur(8px); }
.pf-view-toggle:focus-visible, .pf-debug-toggle:focus-visible { outline: 3px solid #3EE6FF; outline-offset: 2px; }
.pf-debug-toggle { position: fixed; left: 16px; bottom: 16px; z-index: 30; padding: 8px 10px; border-radius: 999px; border: 1px solid rgba(127,127,127,.5);
  background: rgba(20, 18, 34, .55); color: #fff; font: 600 11px system-ui, sans-serif; letter-spacing: .04em; cursor: pointer; backdrop-filter: blur(8px); opacity: .7; }
.pf-debug-toggle:hover, .pf-debug-toggle[aria-pressed="true"] { opacity: 1; background: rgba(20, 18, 34, .85); }
`;

// The same rule as src/links.ts. It is repeated here because Node loads this file as it is when it reads a site's
// vite.config.ts, so this file imports nothing of Popfold's at run time (only types).
function linkKind(href: string): 'outside' | 'inside' | null {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return 'outside';
  if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('//') || h.includes('\\')) return null;
  return 'inside';
}

const CASES_ID = 'virtual:popfold-cases';
/** the two modelled cases that ship with Popfold, by the name a look gives them */
const CASE_FILES = {
  round: fileURLToPath(new URL('../assets/compact.glb', import.meta.url)).replace(/\\/g, '/'),
  crisp: fileURLToPath(new URL('../assets/compact-crisp.glb', import.meta.url)).replace(/\\/g, '/'),
};
/**
 * Which cases the site's home files use: every JSON file under src/ that is a home (it has beats) and a compact
 * (neither floors nor a diorama) names one in `look.shell`, 'round' when it does not say. No home file: both.
 */
export function casesUsed(root: string): (keyof typeof CASE_FILES)[] {
  const used = new Set<keyof typeof CASE_FILES>();
  let homes = 0;
  const walk = (dir: string) => {
    for (const name of existsSync(dir) ? readdirSync(dir) : []) {
      const path = resolve(dir, name);
      if (statSync(path).isDirectory()) { if (name !== 'node_modules') walk(path); continue; }
      if (!name.endsWith('.json')) continue;
      let home: { beats?: unknown; floors?: unknown; diorama?: unknown; look?: { shell?: unknown; parts?: Record<string, unknown> } };
      try { home = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
      if (!home || typeof home !== 'object' || !Array.isArray(home.beats)) continue;
      homes++;
      if (home.floors || home.diorama) continue;
      // the case, and any case a part is taken from
      for (const c of [home.look?.shell ?? 'round', ...Object.values(home.look?.parts ?? {})]) if (c === 'round' || c === 'crisp') used.add(c);
    }
  };
  walk(resolve(root, 'src'));
  return homes ? [...used] : ['round', 'crisp'];
}

/** A link's name in the page: the same as linkKey() in transitions.ts (a test keeps the two in step). */
export const linkName = (t: Pick<Transition, 'from' | 'to' | 'fromHome'>) => `${t.fromHome ?? ''}:${t.from}>${typeof t.to === 'string' ? t.to : `${t.to.home}/${t.to.section}`}`;

/** Where a link goes: the same rule as transitionHref() in transitions.ts (a test keeps the two in step). */
export const linkHref = (t: Pick<Transition, 'to'>) => (typeof t.to === 'string' ? `#${t.to}` : `?home=${encodeURIComponent(t.to.home)}#${t.to.section}`);

function storyHtml([key, s]: [string, PropStory], skills = 'Skills') {
  const meta = s.meta ? `<p class="pf-meta">${esc(s.meta)}</p>` : '';
  const tags = s.tags?.length ? `<ul aria-label="${esc(skills)}">${s.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  const links = (s.links ?? []).filter((l) => linkKind(l.href))
    .map((l) => ` <a href="${esc(l.href)}"${linkKind(l.href) === 'outside' ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(l.label)}</a>`).join('');
  return `<article class="pf-story" tabindex="0" data-pf-story="${esc(key)}"><h4>${esc(s.title)}</h4>${meta}<p>${esc(s.text)}${links}</p>${tags}</article>`;
}

/**
 * What this build is, for the debug panel: the site's commit and whether it had uncommitted changes, when it was
 * committed and built, and the versions of the site, of Popfold and of three.js. Anything that cannot be found
 * out is 'unknown' (a site that is not a git repository, say).
 */
export function buildFacts(root: string) {
  const git = (cwd: string, ...args: string[]) => { try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  const version = (file: string) => { try { return String(JSON.parse(readFileSync(file, 'utf8')).version ?? 'unknown'); } catch { return 'unknown'; } };
  const popfold = fileURLToPath(new URL('..', import.meta.url));
  return {
    commit: git(root, 'rev-parse', '--short', 'HEAD') || 'unknown',
    committed: git(root, 'log', '-1', '--format=%cI'),
    dirty: git(root, 'status', '--porcelain', '--untracked-files=no') !== '',
    built: new Date().toISOString(),
    site: version(resolve(root, 'package.json')),
    // the release tag Popfold is on, where it is its own checkout (a site's submodule) and its tags are there;
    // a checkout without tags (CI often fetches none) gives only a commit, so then the package's version leads
    popfold: ((at) => (/^v?\d+\.\d+\.\d+/.test(at) ? at : `${version(resolve(popfold, 'package.json'))}${at ? ` (${at})` : ''}`))(existsSync(resolve(popfold, '.git')) ? git(popfold, 'describe', '--tags', '--always') : ''),
    three: [resolve(root, 'node_modules/three/package.json'), resolve(popfold, 'node_modules/three/package.json')].map(version).find((v) => v !== 'unknown') ?? 'unknown',
  };
}

/** Every .glb under a site's public/models with its size in bytes, and what a budget (in KB) says about them. */
export function modelSizes(root: string, budget: { each?: number; total?: number } = {}) {
  const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`])) : []);
  const top = resolve(root, 'public/models');
  const files = walk(top).filter((f) => f.endsWith('.glb')).map((f) => ({ file: relative(root, f).replace(/\\/g, '/'), bytes: statSync(f).size }));
  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  const kb = (n: number) => `${Math.round(n / 1000).toLocaleString('en-US')} KB`;
  const over: string[] = [];
  if (budget.each !== undefined) for (const f of files) if (f.bytes > budget.each * 1000) over.push(`${f.file} is ${kb(f.bytes)}; the budget for one model is ${kb(budget.each * 1000)}`);
  if (budget.total !== undefined && total > budget.total * 1000) over.push(`public/models holds ${kb(total)} in ${files.length} models; the budget is ${kb(budget.total * 1000)}`);
  return { files, total, over };
}

/** the three.js files Popfold imports (src/), for the dev server to pre-bundle */
export const THREE_FILES = ['three', 'three/addons/controls/OrbitControls.js', 'three/addons/controls/TransformControls.js', 'three/addons/environments/RoomEnvironment.js',
  'three/addons/geometries/RoundedBoxGeometry.js', 'three/addons/libs/meshopt_decoder.module.js', 'three/addons/loaders/GLTFLoader.js'];

export function popfoldFallback(o: FallbackOptions): Plugin {
  let config: ResolvedConfig;
  const base = o.siteUrl?.replace(/\/?$/, '/');
  const slash = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');
  let root = process.cwd();
  const given: FallbackPage[] = (o.pages ?? [{ html: 'index.html', homeFile: o.homeFile, pieces: o.pieces, rooms: o.rooms, stories: o.stories, transitions: o.transitions, sectionHomes: o.sectionHomes, sections: o.sections, storiesHeading: o.storiesHeading, stillsHome: o.stillsHome, llmsExtra: o.llmsExtra }])
    .map((p) => ({ ...p, html: slash(p.html), ...(p.from ? { from: slash(p.from) } : {}) }));
  /** a page's translation file, as it is on disk now */
  const dictOf = (p: FallbackPage): Record<string, string> | undefined => {
    if (!p.text) return undefined;
    try { return JSON.parse(readFileSync(resolve(root, p.text), 'utf8')); } catch (err) { throw new Error(`popfoldFallback: could not read the translation file ${p.text}: ${(err as Error).message}`); }
  };
  /** a page's language: given, or the lang on its HTML (or on the HTML it is built from) */
  const langOf = (p: FallbackPage) => {
    if (p.lang) return p.lang;
    try { return /<html[^>]*\slang\s*=\s*["']?([\w-]+)/i.exec(readFileSync(resolve(root, p.from ?? p.html), 'utf8'))?.[1]; } catch { return undefined; }
  };
  /**
   * The pages as they stand now. A page with a home file takes its pieces, and the name of its stills, from the
   * file as it is on disk at this moment, so a save from the studio shows without restarting anything.
   */
  const pagesNow = (): (FallbackPage & { dict?: Record<string, string>; sourceStories?: Record<string, PropStory> })[] => given.map((p) => {
    let file: { id?: string; pieces?: FallbackPage['pieces']; stories?: Record<string, PropStory>; transitions?: Transition[]; beats?: { id: string; home?: string }[] } = {};
    if (p.homeFile) { try { file = JSON.parse(readFileSync(resolve(root, p.homeFile), 'utf8')); } catch (err) { throw new Error(`popfoldFallback: could not read the home file ${p.homeFile}: ${(err as Error).message}`); } }
    const pieces = p.pieces ?? file.pieces ?? [];
    const dict = dictOf(p);
    const tr = (x: string) => (dict ? translateStory({ title: x, text: '', tags: [] }, dict).title : x);
    const stories: Record<string, PropStory> = {
      ...Object.fromEntries(pieces.filter((x) => x.story).map((x) => [`${(p.rooms as Record<string, string> | undefined)?.[x.room] ?? x.room}${x.wall ? '-wall' : ''}/${x.id}`, x.story as PropStory])),
      ...file.stories, // a diorama's model parts: kept by key
      ...p.stories,
    };
    return {
      ...p, pieces, stillsHome: p.stillsHome ?? file.id,
      transitions: (p.transitions ?? file.transitions ?? []).map((t) => (dict && t.label ? { ...t, label: tr(t.label) } : t)),
      storiesHeading: tr(p.storiesHeading ?? 'Highlights'),
      dict,
      // the home each section shows: given, or from the file's beats (a beat without one shows the one before's)
      sectionHomes: p.sectionHomes ?? (() => {
        let last: string | undefined;
        return Object.fromEntries((file.beats ?? []).flatMap((b) => ((last = b.home ?? last) ? [[b.id, last]] : [])));
      })(),
      // a listed piece's story has the piece's key, "<room>/<id>" (the same rule as pieceKey() in pieces.ts, which
      // this file cannot import: it must load in Node as it is); a translated page's, in its language
      stories: dict ? Object.fromEntries(Object.entries(stories).map(([k, v]) => [k, translateStory(v, dict)])) : stories,
      sourceStories: stories,
    };
  });
  /** the page's folder within the site, '' or 'tour/' */
  const dirOf = (p: FallbackPage) => p.html.slice(0, p.html.lastIndexOf('/') + 1);
  /** from the page's folder back to the site's root: '' or '../' */
  const up = (p: FallbackPage) => '../'.repeat(dirOf(p).split('/').length - 1);
  /** the studio page that captures a page's stills: given, or studio.html beside the page its copy comes from */
  const studioOf = (p: FallbackPage) => slash(p.studio ?? `${dirOf({ html: p.from ?? p.html })}studio.html`);
  /** a page built from another's HTML: that page's text, its relative paths moved to this page's folder */
  const variantHtml = (p: FallbackPage) => {
    let text = readFileSync(resolve(root, p.from!), 'utf8');
    const dict = dictOf(p);
    if (dict || p.lang) {
      const done = translateHtml(text, dict ?? {}, p.lang);
      text = done.html;
      if (dict && done.missing.length) {
        const more = done.missing.length > 8 ? ` and ${done.missing.length - 8} more` : '';
        const show = done.missing.slice(0, 8).map((m) => JSON.stringify(m.length > 60 ? `${m.slice(0, 57)}...` : m)).join(', ');
        config?.logger.warn(`popfold-fallback: ${p.html}: ${done.missing.length} of its texts are not in ${p.text}: ${show}${more}`);
      }
    }
    const depth = dirOf(p).split('/').length - dirOf({ html: p.from! }).split('/').length;
    if (depth <= 0) return text;
    return text.replace(/\b(src|href|content)="(\.\/|(?![a-z][\w+.-]*:|\/|#|\?|data:))([^"]*)"/gi, (all, attr: string, dot: string, rest: string) =>
      attr.toLowerCase() === 'content' ? all : `${attr}="${'../'.repeat(depth)}${dot === './' ? '' : dot}${rest}"`);
  };
  /** where a link goes from this page: to another page that shows the target's home, when the site has one */
  const hrefFrom = (page: FallbackPage, t: Pick<Transition, 'to'>, pages: FallbackPage[]) => {
    const to = t.to;
    if (typeof to === 'string') return `#${to}`;
    if (to.home === page.stillsHome) return `#${to.section}`;
    // the page in this page's language, when there is one
    const others = pages.filter((q) => q !== page && q.stillsHome === to.home);
    const there = (others.length > 1 ? others.find((q) => langOf(q) === langOf(page)) : undefined) ?? others[0];
    if (!there) return linkHref(t);
    return `${`${up(page)}${dirOf(there)}` || './'}#${to.section}`;
  };
  /**
   * What a translated page shows in its original words, because its translation file does not have them: the page's
   * text, its stories and their heading, its link cards, and Popfold's own words (`popfold check` lists them).
   */
  const untranslatedOf = (p: ReturnType<typeof pagesNow>[number]) => {
    const dict = p.dict ?? {};
    const has = new Set(Object.keys(dict).map(words));
    const out = translateHtml(readFileSync(resolve(root, p.from ?? p.html), 'utf8'), dict).missing;
    const want = (s: string | undefined) => { if (s && hasWords(s) && !has.has(words(s))) out.push(words(s)); };
    for (const s of Object.values(p.sourceStories ?? {})) { want(s.title); want(s.text); want(s.meta); want(s.kicker); s.tags.forEach(want); s.links?.forEach((l) => want(l.label)); }
    if (Object.keys(p.sourceStories ?? {}).length) want(given.find((g) => g.html === p.html)?.storiesHeading ?? 'Highlights');
    for (const t of p.transitions ?? []) if (t.label && !has.has(words(t.label)) && !Object.values(dict).includes(t.label)) want(t.label);
    for (const w of POPFOLD_WORDS) want(w);
    return [...new Set(out)];
  };
  /** the pages with the same copy as this one (built from the same HTML, or its source) that say their language */
  const languagesOf = (page: FallbackPage) => {
    const source = page.from ?? page.html;
    // (a site in one language has none: nothing to read)
    if (!given.some((q) => q.lang && (q.from ?? q.html) === source)) return [];
    return given.filter((q) => (q.from ?? q.html) === source && (q.from === undefined || q.lang)).flatMap((q) => {
      const lang = langOf(q);
      return lang ? [{ page: q, lang }] : [];
    });
  };
  /** each page's part of llms.txt, filled as the pages are built */
  const llms = new Map<string, string>();
  const llmsText = () => given.map((p) => llms.get(p.html)).filter(Boolean).join('\n---\n\n');

  return {
    name: 'popfold-fallback',
    /** read by the `popfold` command line (bin/popfold.mjs): which homes' stills to capture, and from which studio pages */
    api: {
      get captures() {
        // each page's own home, and every other home its links lead to (their cards show that home's stills)
        const out: { home: string; studio: string }[] = [];
        for (const p of pagesNow()) {
          const studio = studioOf(p);
          for (const home of [p.stillsHome, ...(p.transitions ?? []).map((t) => (typeof t.to === 'string' ? undefined : t.to.home)), ...Object.values(p.sectionHomes ?? {})]) {
            if (home && !out.some((c) => c.home === home && c.studio === studio)) out.push({ home, studio });
          }
        }
        return out;
      },
      /** the site's limits on model sizes, if it set any (popfold check reports against them) */
      budget: o.modelBudget,
      /** each story page, for `popfold check` and `popfold describe` */
      get pages() {
        return pagesNow().map((p) => ({
          html: p.html, source: p.from ?? p.html, home: p.stillsHome ?? null, studio: studioOf(p), stories: Object.keys(p.stories ?? {}), sections: p.sections ?? {}, transitions: p.transitions ?? [],
          ...(p.dict ? { lang: p.lang, text: p.text, untranslated: untranslatedOf(p) } : {}),
        }));
      },
    },
    // the debug panel reads these (see debug.ts)
    config(c, env) {
      root = resolve(c.root ?? process.cwd());
      // a page made from another's HTML is an entry of the build too (its file exists only as the build makes it)
      const made = given.filter((p) => p.from);
      if (env?.command === 'build' && made.length) {
        c.build ??= {};
        c.build.rollupOptions ??= {};
        const input = c.build.rollupOptions.input ?? resolve(root, 'index.html');
        const named: Record<string, string> = typeof input === 'string' ? { main: input } : Array.isArray(input) ? Object.fromEntries(input.map((f, i) => [`page${i}`, f])) : { ...input };
        for (const p of made) named[`pf-${dirOf(p).replace(/\/$/, '').replace(/[^\w-]/g, '-') || 'page'}`] = resolve(root, p.html);
        c.build.rollupOptions.input = named;
      }
      return {
        define: { __POPFOLD_BUILD__: JSON.stringify(buildFacts(root)) },
        // Popfold is TypeScript that this server compiles, with a module only this plugin makes (its cases), so it is
        // not pre-bundled; the three.js files it uses are, so the first visit does not stop to find them
        optimizeDeps: { exclude: ['popfold'], include: THREE_FILES },
        // one three.js, also while the site is linked to a Popfold checkout that has its own (engine work)
        resolve: { dedupe: ['three'] },
      };
    },
    configResolved(c) { config = c; root = c.root ?? root; },
    // the case models, as a module: only those this site uses go into a build (each is about 220 KB)
    resolveId(id) {
      if (id === CASES_ID) return `\0${CASES_ID}`;
      // a made page's HTML, which is not on disk
      const made = given.find((p) => p.from && slash(relative(root, resolve(root, id.split('?')[0]))) === p.html && !existsSync(resolve(root, p.html)));
      return made ? resolve(root, made.html) : undefined;
    },
    load(id) {
      const made = given.find((p) => p.from && resolve(root, p.html) === id.split('?')[0] && !existsSync(id.split('?')[0]));
      if (made) return variantHtml(made);
      if (id !== `\0${CASES_ID}`) return undefined;
      const want = config?.command === 'build' ? o.cases ?? casesUsed(root) : (Object.keys(CASE_FILES) as (keyof typeof CASE_FILES)[]);
      return `${want.map((n) => `import ${n} from ${JSON.stringify(`${CASE_FILES[n]}?url`)};`).join('\n')}\nexport default { ${want.join(', ')} };\n`;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // only the story pages (not studio.html, not any other page of the site)
        const file = slash(relative(config.root, ctx.filename));
        const pages = pagesNow();
        const page = pages.find((p) => p.html === file);
        if (!page) return html;
        const pageUrl = base ? base + dirOf(page) : undefined;

        // where the page's sections, head, title and description are (the page itself is only added to)
        const info = readPage(html);
        const edits: [number, string][] = [];

        // what goes inside a section's card, by place: its stories, then its link cards
        const inside = new Map<number, string>();
        const into = (at: number, html: string) => inside.set(at, (inside.get(at) ?? '') + html);

        // 1. stories under their sections, inside the section's card
        const bySection = new Map<string, [string, PropStory][]>();
        for (const [key, story] of Object.entries(page.stories ?? {})) {
          const zone = key.split('/')[0].replace(/-wall$/, '');
          const id = page.sections?.[zone] ?? zone;
          if (!bySection.has(id)) bySection.set(id, []);
          bySection.get(id)!.push([key, story]);
        }
        for (const [id, list] of bySection) {
          const section = info.sections.find((x) => x.id === id);
          if (!section) {
            // a story nobody can read is a mistake: a build stops on it, the dev server only says so
            const what = `popfold-fallback: ${page.html} has no <section id="${id}"> for its stories (${list.map(([k]) => k).join(', ')}). Add the section, or map the room to one with "sections".`;
            if (config.command === 'build') throw new Error(what);
            config.logger.warn(what);
            continue;
          }
          into(section.cardEnd, `\n        <div class="pf-stories"><h3>${esc(page.storiesHeading ?? 'Highlights')}</h3>${list.map((x) => storyHtml(x, page.dict?.Skills)).join('')}</div>\n      `);
        }

        // 2. a still beside every stage section, in order (if it has been captured). Stills live at the site's root.
        const still = (n: number, home = page.stillsHome) => `stills/${home}-${n}.webp`;
        const captured = (n: number, home = page.stillsHome) => !!home && existsSync(resolve(config.root, config.publicDir || 'public', still(n, home)));

        // links to other sections and homes: a card in the section each starts from, with the target's still
        const stages = info.sections.filter((x) => x.stage).map((x) => x.id);
        const linksFrom = new Map<string, Transition[]>();
        for (const t of page.transitions ?? []) {
          if (!t.label || t.card === false) continue; // a link with no label is a door in 3D only
          // a link from a home this page does not show has no card here; its button is written all the same, for the
          // 3D page, which shows it while that home is on show
          if (t.fromHome && t.fromHome !== page.stillsHome && !(t.button && t.cue !== 'none')) continue;
          if (!info.sections.some((x) => x.id === t.from)) {
            const what = `popfold-fallback: ${page.html} has no <section id="${t.from}"> for the link "${t.label}".`;
            if (config.command === 'build') throw new Error(what);
            config.logger.warn(what);
            continue;
          }
          linksFrom.set(t.from, [...(linksFrom.get(t.from) ?? []), t]);
        }
        for (const [from, list] of linksFrom) {
          const cards = list.map((t) => {
            const section = typeof t.to === 'string' ? t.to : t.to.section, home = typeof t.to === 'string' ? page.stillsHome : t.to.home;
            const n = stages.indexOf(section);
            const img = n >= 0 && captured(n, home) ? `<img src="./${up(page)}${still(n, home)}" alt="" width="1200" height="900" loading="lazy" decoding="async" />` : '';
            // a link that is also a button in 3D carries its name, so the 3D page can play its effect on a click
            const away = !!t.fromHome && t.fromHome !== page.stillsHome; // a button only: no card without 3D
            const button = t.button && t.cue !== 'none' ? ` pf-link-button${away ? ' pf-link-3d-only' : ''}" data-pf-link="${esc(linkName(t))}${t.fromHome ? `" data-pf-from-home="${esc(t.fromHome)}` : ''}` : '';
            return `<a class="pf-link${button}" href="${esc(hrefFrom(page, t, pages))}">${img}<span>${esc(t.label!)}</span></a>`;
          }).join('');
          into(info.sections.find((x) => x.id === from)!.cardEnd, `\n        <nav class="pf-links" aria-label="Go to">${cards}</nav>\n      `);
        }
        for (const [at, html] of inside) edits.push([at, html]);
        if (page.stillsHome) {
          info.sections.filter((x) => x.stage).forEach((x, n) => {
            const home = (x.id && page.sectionHomes?.[x.id]) || page.stillsHome; // the home this section shows
            if (!captured(n, home)) return;
            const alt = `${o.siteName}: ${x.heading || `scene ${n + 1}`}`;
            edits.push([x.open, `\n      <figure class="pf-still"><img src="./${up(page)}${still(n, home)}" alt="${esc(alt)}" width="1200" height="900" ${n === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" /></figure>`]);
          });
        }

        // 3. head: fallback CSS, structured data, share image
        const head: string[] = [`<style id="popfold-fallback">${FALLBACK_CSS}</style>`, `<script id="popfold-stale">${STALE_RELOAD}</script>`];
        // the home this page shows: the 3D page starts in it (startScene reads this, after ?home=)
        if (page.stillsHome) head.push(`<meta name="popfold-home" content="${esc(page.stillsHome)}" />`);
        // a page in a folder of a site built with relative paths: the way back to the site's root, where the models
        // and art are (startScene reads this when the site passes no base)
        if (up(page) && !String(config.base ?? './').startsWith('/')) head.push(`<meta name="popfold-base" content="${up(page)}" />`);
        // where this page's studio is, from the page (the debug panel links to it): not always beside the page
        if (studioOf(page) !== `${dirOf(page)}studio.html`) head.push(`<meta name="popfold-studio" content="${esc(up(page) + studioOf(page))}" />`);
        if (page.html === given[0].html) for (const j of [o.jsonLd ?? []].flat()) head.push(`<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`);
        if (base && captured(0) && !info.hasOgImage) head.push(`<meta property="og:image" content="${esc(base + still(0))}" />`);
        if (pageUrl && !info.hasCanonical) head.push(`<link rel="canonical" href="${esc(pageUrl)}" />`);
        // a translated page's dictionary, for the words the browser writes (story cards, Popfold's own, the site's t())
        if (page.dict) head.push(`<script type="application/json" id="popfold-text">${JSON.stringify(page.dict).replace(/</g, '\\u003c')}</script>`);
        // the same copy in other languages: each page names all of them, itself too (hreflang needs full addresses)
        const versions = languagesOf(page);
        if (base && versions.length > 1) for (const v of versions) head.push(`<link rel="alternate" hreflang="${esc(v.lang)}" href="${esc(base + dirOf(v.page))}" />`);
        edits.push([info.headEnd, `  ${head.join('\n  ')}\n`]);
        html = insertAll(html, edits);

        // a language switcher: a link that names a language (data-pf-lang) goes to this copy in that language, and
        // the one in this page's own is marked as the current page
        const here = langOf(page);
        html = html.replace(/<a\b[^>]*\sdata-pf-lang\s*=\s*"([\w-]+)"[^>]*>/gi, (tag, lang: string) => {
          const v = languagesOf(page).find((x) => x.lang === lang);
          if (!v) return tag;
          const href = v.page.html === page.html ? './' : `${up(page)}${dirOf(v.page)}` || './';
          let out = tag.replace(/\shref\s*=\s*("[^"]*"|'[^']*')/i, '').replace(/\saria-current\s*=\s*("[^"]*"|'[^']*')/i, '');
          out = out.replace(/^<a\b/i, `<a href="${esc(href)}" hreflang="${esc(lang)}"${lang === here ? ' aria-current="page"' : ''}`);
          return out;
        });

        // 4. llms.txt: the page's own words, section by section, plus the stories
        const title = info.title || o.siteName;
        const out = [`# ${title}`, '', ...(given.length > 1 && pageUrl ? [`Page: ${pageUrl}`, ''] : []), `> ${words(info.description)}`, ''];
        for (const x of info.sections) {
          if (!x.id) continue;
          out.push(`## ${x.heading || x.id}`, '', x.text, '');
          for (const [, st] of bySection.get(x.id) ?? []) {
            out.push(`- **${st.title}**${st.meta ? ` (${st.meta})` : ''}: ${st.text}${st.tags?.length ? ` [${st.tags.join(', ')}]` : ''}`);
          }
          if (bySection.get(x.id)?.length) out.push('');
          const go = linksFrom.get(x.id) ?? [];
          for (const t of go) out.push(`- Link: [${t.label}](${hrefFrom(page, t, pages)})`);
          if (go.length) out.push('');
        }
        if (page.llmsExtra) out.push(page.llmsExtra.trim(), '');
        llms.set(page.html, out.join('\n'));
        return html;
      },
    },
    configureServer(server) {
      // a page made from another's HTML: built from it on each request, as Vite would serve a file
      server.middlewares.use(async (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split(/[?#]/)[0]).replace(server.config.base.replace(/^\.?\/?/, '/'), '/');
        const made = given.find((p) => p.from && !existsSync(resolve(root, p.html)) && (`/${p.html}` === path || `/${dirOf(p)}` === path && p.html.endsWith('index.html')));
        if (!made || req.method !== 'GET') return next();
        try {
          const html = await server.transformIndexHtml(`/${made.html}`, variantHtml(made), req.originalUrl);
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (err) { next(err); }
      });
      server.middlewares.use('/llms.txt', (_req, res) => { res.setHeader('content-type', 'text/plain; charset=utf-8'); res.end(llmsText() || '# (open the page once to build this)\n'); });
    },
    buildStart() {
      // a site that set a budget for its models does not ship over it
      if (config?.command !== 'build' || !o.modelBudget) return;
      const { over } = modelSizes(root, o.modelBudget);
      if (over.length) throw new Error(`popfoldFallback: the models are over the site's budget:\n  ${over.join('\n  ')}\n  \`popfold optimize\` makes models smaller without changing how they look.`);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llmsText() });
      const robots = ['User-agent: *', 'Allow: /', ...(base ? [`Sitemap: ${base}sitemap.xml`] : [])].join('\n') + '\n';
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      if (base) {
        // a page with versions in other languages names them all, as its head does
        const urls = given.map((p) => {
          const versions = languagesOf(p);
          const alts = versions.length > 1 ? `${versions.map((v) => `\n    <xhtml:link rel="alternate" hreflang="${esc(v.lang)}" href="${esc(base + dirOf(v.page))}" />`).join('')}\n  ` : '';
          return `  <url><loc>${esc(base + dirOf(p))}</loc>${alts}</url>`;
        }).join('\n');
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n` });
      }
    },
  };
}
