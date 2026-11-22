// Made from src/home-commands.ts by tools/build-pkg.mjs: edit that file, then run `pnpm build:pkg`.
// Every edit a home file can take: the command list, and the functions that make each change. Plain data in, plain
// data out, with nothing of Node's: the dev server runs them on a site's home file (vite-plugin.ts), and the studio
// on a built site runs them in the browser, on a copy kept there.
                                                           

const BEAT_ORDER = ['id', 'name', 'home', 'camera', 'lookAt', 'set', 'zones'];
const PIECE_ORDER = ['id', 'room', 'wall', 'kind', 'at', 'turn', 'lift', 'out', 'size', 'scale', 'delay', 'fold', 'hidden', 'lamp', 'opts'];
const inline = (v         )         => Array.isArray(v) ? `[${v.map(inline).join(', ')}]`
  : v && typeof v === 'object' ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }`
  : JSON.stringify(v);

/**
 * A home file's text, the way Popfold writes it: one piece per line, a piece with a story spread over a few, and
 * a piece's fields always in the same order. Saving from the studio then changes only the lines of the pieces
 * that moved.
 */
export function formatHome(home                         )         {
  const lines           = [];
  for (const [key, value] of Object.entries(home)) {
    if (key === 'beats' && Array.isArray(value)) lines.push(`  "beats": [\n${value.map((b                         ) => `    ${inline(Object.fromEntries(BEAT_ORDER.filter((k) => k in b).concat(Object.keys(b).filter((k) => !BEAT_ORDER.includes(k))).map((k) => [k, b[k]])))}`).join(',\n')}\n  ]`);
    else if (key === 'book' && value && typeof value === 'object') lines.push(`  "book": {\n${Object.entries(value).map(([k, v]) => (k === 'pages' && Array.isArray(v)
      ? `    "pages": [\n${v.map((p) => `      ${inline(p)}`).join(',\n')}\n    ]` : `    ${JSON.stringify(k)}: ${inline(v)}`)).join(',\n')}\n  }`);
    else if (key === 'look' && value && typeof value === 'object') lines.push(`  "look": {\n${Object.entries(value).map(([k, v]) => `    ${JSON.stringify(k)}: ${inline(v)}`).join(',\n')}\n  }`);
    else if ((key === 'floors' || key === 'transitions') && Array.isArray(value)) lines.push(`  ${JSON.stringify(key)}: [\n${value.map((f) => `    ${inline(f)}`).join(',\n')}\n  ]`);
    else if ((key === 'stories' || key === 'places') && value && typeof value === 'object' && Object.keys(value).length) lines.push(`  ${JSON.stringify(key)}: {\n${Object.entries(value).map(([k, v]) => `    ${JSON.stringify(k)}: ${inline(v)}`).join(',\n')}\n  }`);
    else if (key === 'pieces' && Array.isArray(value) && value.length) {
      lines.push(`  "pieces": [\n${value.map((p                         ) => {
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
export function placePieces(home                         , changes                                                                                 )         {
  const pieces = Array.isArray(home.pieces) ? home.pieces                              : [];
  const num = (v         )              => typeof v === 'number' && Number.isFinite(v);
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
export function placeCameras(home                         , cameras                                                    )         {
  const beats = Array.isArray(home.beats) ? home.beats                              : [];
  const three = (v         )                => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
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
export function removePieces(home                         , gone                                                )         {
  const pieces = Array.isArray(home.pieces) ? home.pieces                              : [];
  for (const g of gone) {
    const n = pieces.findIndex((p) => p.id === g.id && p.room === g.room && !!p.wall === !!g.wall);
    if (n < 0) throw new Error(`the home file has no piece "${g.id}" in ${g.room}${g.wall ? ' (on the wall)' : ''}`);
    pieces.splice(n, 1);
  }
  return gone.length;
}

/** Put new pieces on a home's list, each after the last piece of its room. */
export function addPieces(home                         , added                                                                               )         {
  if (!Array.isArray(home.pieces)) throw new Error('this home file has no list of pieces');
  const pieces = home.pieces                             ;
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
export function setStories(home                         , stories                                                                                )         {
  const pieces = Array.isArray(home.pieces) ? home.pieces                              : [];
  for (const s of stories) {
    let piece                                     ;
    if (s.key !== undefined) {
      if (!/^[a-z0-9][a-z0-9-]*\/[^/\s]+$/.test(s.key)) throw new Error(`"${s.key}" is not a piece key`);
      // a story kept under its key: the file's "stories", in the same shape as a piece's own
      const all = (home.stories && typeof home.stories === 'object' ? home.stories : {})                           ;
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
function setStory(piece                         , story         ) {
  const st = story                           ;
  if (!st || typeof st !== 'object' || typeof st.title !== 'string' || !st.title.trim()) throw new Error('a story needs a title');
  if (typeof st.text !== 'string' || !st.text.trim()) throw new Error('a story needs some text');
  if (!Array.isArray(st.tags) || !st.tags.every((t) => typeof t === 'string')) throw new Error('a story\'s tags must be a list of words');
  if (st.dot !== undefined && !['top', 'front', 'below'].includes(st.dot          )) throw new Error('a story\'s dot must be top, front or below');
  const { dot: _was, ...kept } = (piece.story && typeof piece.story === 'object' ? piece.story : {})                           ;
  // title, text and tags first, as a story is written; the dot only when it is not the usual one
  piece.story = { ...kept, title: st.title.trim(), text: st.text.trim(), tags: st.tags.map((t) => (t          ).trim()).filter(Boolean), ...(st.dot && st.dot !== 'top' ? { dot: st.dot } : {}) };
  const o = piece.story                           ;
  piece.story = Object.fromEntries(['title', 'text', 'tags', 'dot', 'meta', 'kicker', 'links'].filter((k) => k in o).map((k) => [k, o[k]]));
}

/**
 * The look of a home: `look` (a compact's colours and surfaces, merged field by field), `emblem` (replaced; an
 * empty one is left out), `floors` (a tower's: each names a floor by id and gives a new colour or sign) and `tower`
 * (a tower's building: wall, slab and spine colours and the lift, field by field; null takes one away) and `paint`
 * (a diorama's model colours, by material name, field by field; null gives a material back its own).
 * Whether the result is a good home is for readHome() to say when the home is built from it.
 */
export function setLook(home                         , body                                                                                          )         {
  const isObj = (v         )                               => !!v && typeof v === 'object' && !Array.isArray(v);
  let n = 0;
  if (body.look !== undefined) {
    if (!isObj(body.look) || !isObj(home.look)) throw new Error('only a home with a look can have its look changed');
    for (const [k, v] of Object.entries(body.look)) {
      if (!(k in home.look) && !['shell', 'parts', 'corner', 'badges', 'badgeRing', 'trim', 'drawerWall'].includes(k)) throw new Error(`"${k}" is not part of a look`);
      (home.look                           )[k] = v; n++;
    }
  }
  if (body.emblem !== undefined) {
    if (!isObj(body.emblem)) throw new Error('an emblem must be an object');
    const e = Object.fromEntries(Object.entries(body.emblem).filter(([, v]) => v !== '' && v !== undefined && v !== null));
    if (Object.keys(e).length) home.emblem = e; else delete home.emblem;
    n++;
  }
  if (body.floors !== undefined) {
    const floors = Array.isArray(home.floors) ? home.floors                              : [];
    if (!Array.isArray(body.floors)) throw new Error('Expected { floors: [...] }');
    for (const c of body.floors                             ) {
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
    const d = home.diorama                           ;
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
export function setPlaces(home                         , places         )         {
  if (!places || typeof places !== 'object' || Array.isArray(places)) throw new Error('places must be an object');
  const n = Object.keys(places).length;
  if (n) home.places = Object.fromEntries(Object.entries(places                           ).sort(([a], [b]) => a.localeCompare(b)));
  else delete home.places;
  return n;
}

/**
 * Set what the home does at beats: each names a beat by id and gives values for `set` (c, L, R, glow, …) and for
 * `zones` (a tower's floors). Only the fields given change; a value of 0 (0.8 for az) is the plain one and is
 * left out of the file.
 */
export function setBeats(home                         , changes                                                                                                  )         {
  const beats = Array.isArray(home.beats) ? home.beats                              : [];
  const fields = ['c', 'L', 'R', 'glow', 'badges', 'hero', 'side', 'av', 'ax', 'az', 'wave'];
  const num = (v         )              => typeof v === 'number' && Number.isFinite(v);
  for (const c of changes) {
    const beat = beats.find((b) => b.id === c.id);
    if (!beat) throw new Error(beats.length ? `the home file has no beat "${c.id}"` : 'this home file has no beats: the site keeps its story in code');
    if (c.name !== undefined) {
      if (typeof c.name !== 'string' || !c.name.trim()) throw new Error(`the beat "${c.id}" needs a name`);
      beat.name = c.name.trim();
    }
    for (const [part, plain] of [['set', (k        ) => (k === 'az' ? 0.8 : 0)], ['zones', () => 0]]         ) {
      const given = c[part];
      if (!given) continue;
      const values = { ...(beat[part]                                      ) };
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
                                                        

/** a stage section as a block of the page's lines: from the start of its first line to just after its last */
function sectionBlock(html        , s             ) {
  const from = html.lastIndexOf('\n', s.start - 1) + 1;
  const nl = html.indexOf('\n', s.end);
  return { from, to: nl < 0 ? html.length : nl + 1 };
}
/** reads a page's sections: the dev server's (parse5), so the studio's bundle does without it */
let readPage                                      = null;
export function usePageReader(read                            ) { readPage = read; }
const stagesOf = (html        ) => {
  if (!readPage) throw new Error("a page's sections are changed by the dev server only");
  return readPage(html).sections.filter((s) => s.stage);
};

/**
 * Put a new stage section into a page at position `at` among its stage sections: shaped like its neighbour (the
 * same start-tag attributes and card element), with the beat's name as its heading and a placeholder for its
 * words, in brackets as the templates write them. The words are the site's to write.
 */
export function addSection(html        , id        , name        , at        )         {
  const stages = stagesOf(html);
  if (new RegExp(`\\bid=["']${id}["']`).test(html)) throw new Error(`the page already has an element with the id "${id}"`);
  const near = stages[Math.max(0, Math.min(stages.length - 1, at - 1))];
  if (!near) throw new Error('the page has no <section class="stage"> to put a new one beside');
  const block = sectionBlock(html, near);
  const indent = html.slice(block.from, near.start);
  const own = html.slice(near.start, near.open);
  const side = /\bdata-text=["']([^"']*)["']/.exec(own)?.[1];
  const card = /<(article|div)\b([^>]*)>/.exec(html.slice(near.open, near.end));
  const esc = (t        ) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
export function removeSection(html        , id        )         {
  const s = stagesOf(html).find((x) => x.id === id);
  if (!s) throw new Error(`the page has no <section class="stage" id="${id}">`);
  const { from, to } = sectionBlock(html, s);
  const blank = /^[ \t]*\n/.exec(html.slice(to));
  if (blank) return html.slice(0, from) + html.slice(to + blank[0].length);
  const before = /\n[ \t]*\n$/.exec(html.slice(0, from)); // (the last section: the blank line before it goes)
  return before ? html.slice(0, from - before[0].length + 1) + html.slice(to) : html.slice(0, from) + html.slice(to);
}

/** Move a stage section, with its lines, to position `to` among the page's stage sections. */
export function moveSection(html        , id        , to        )         {
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
function sameStory(beats                           , page          ) {
  const ids = stagesOf(page.text).map((s) => s.id);
  const want = beats.map((b) => b.id);
  if (ids.join(' ') !== want.join(' ')) throw new Error(`${page.file}'s stage sections (${ids.join(', ')}) are not the home's beats (${want.join(', ')}); line them up first (popfold check says how)`);
}
const beatsIn = (home                         ) => {
  if (!Array.isArray(home.beats) || !home.beats.length) throw new Error('this home file has no beats: the site keeps its story in code');
  return home.beats                             ;
};

/**
 * Add a beat, at position `at` (default: the end), and its section in the page. It starts as a copy of the beat
 * before it (the first, for a new first beat), so the story holds still there until its camera and values are set.
 */
export function addBeat(home                         , a                                              , page                  )         {
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
export function removeBeat(home                         , a                 , page                  )         {
  const beats = beatsIn(home);
  const n = beats.findIndex((b) => b.id === a.id);
  if (n < 0) throw new Error(`the home file has no beat "${String(a.id)}"`);
  if (beats.length === 1) throw new Error('a story needs at least one beat');
  if (page) { sameStory(beats, page); page.text = removeSection(page.text, a.id          ); }
  beats.splice(n, 1);
  if (Array.isArray(home.transitions)) {
    const kept = (home.transitions                             ).filter((t) => t.from !== a.id && t.to !== a.id);
    if (kept.length) home.transitions = kept; else delete home.transitions;
  }
  return 1;
}

/** Move a beat, and its section in the page, to position `to`. */
export function moveBeat(home                         , a                              , page                  )         {
  const beats = beatsIn(home);
  const n = beats.findIndex((b) => b.id === a.id);
  if (n < 0) throw new Error(`the home file has no beat "${String(a.id)}"`);
  if (typeof a.to !== 'number' || !Number.isInteger(a.to) || a.to < 0 || a.to >= beats.length) throw new Error(`"to" must be a position from 0 to ${beats.length - 1}`);
  if (page) sameStory(beats, page);
  const [beat] = beats.splice(n, 1);
  beats.splice(a.to, 0, beat);
  // a route (via) is the way between two neighbouring beats: a move must not part them
  const ids = beats.map((b) => b.id);
  for (const t of (Array.isArray(home.transitions) ? home.transitions : [])                             ) {
    if (t.via && typeof t.to === 'string' && Math.abs(ids.indexOf(t.from) - ids.indexOf(t.to)) !== 1) throw new Error(`the link from "${String(t.from)}" to "${t.to}" has a route (via), which only neighbouring beats can have; this move would part them, so take its route away first`);
  }
  if (page) page.text = moveSection(page.text, a.id          , a.to);
  return 1;
}

const LINK_ORDER = ['from', 'fromHome', 'to', 'label', 'piece', 'effect', 'strength', 'via', 'look', 'cue', 'button', 'card'];
const sameTarget = (a         , b         ) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Add, change or take away a link (a transition). It is named by where it starts (`from`, and `fromHome` on a page
 * with several homes) and where it leads (`to`). `change` gives fields to set, null taking one away, and may
 * move the link (a new `from` or `to`); a link that is not there yet is added. `remove` takes it out. The checks
 * here are the ones a single link needs; readHome() checks the whole list when the home is built from the file.
 */
export function setLink(home                         , a                                                                                        )         {
  const isObj = (v         )                               => !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v         )              => typeof v === 'string' && v.trim() !== '';
  const target = (v         ) => text(v) || (isObj(v) && text(v.home) && text(v.section) && Object.keys(v).length === 2);
  if (!text(a.from)) throw new Error('"from" (the section the link starts from) is missing');
  if (!target(a.to)) throw new Error('"to" must be a section id, or { "home", "section" }');
  if (a.fromHome !== undefined && !text(a.fromHome)) throw new Error('"fromHome" must be a home\'s id');
  const list = (Array.isArray(home.transitions) ? home.transitions : [])                             ;
  const at = list.findIndex((t) => t.from === a.from && sameTarget(t.to, a.to) && (t.fromHome ?? undefined) === (a.fromHome ?? undefined));
  const name = `the link from "${a.from}" to ${typeof a.to === 'string' ? `"${a.to}"` : `"${(a.to                       ).section}" of "${(a.to                    ).home}"`}`;
  if (a.remove === true) {
    if (at < 0) throw new Error(`the home file has no ${name.slice(4)}`);
    list.splice(at, 1);
  } else {
    if (a.change !== undefined && !isObj(a.change)) throw new Error('"change" must be an object of the fields to set');
    const link                          = at >= 0 ? { ...list[at] } : { from: a.from, ...(a.fromHome ? { fromHome: a.fromHome } : {}), to: a.to };
    for (const [k, v] of Object.entries((a.change ?? {})                           )) {
      if (!LINK_ORDER.includes(k)) throw new Error(`"${k}" is not something a link has (it has ${LINK_ORDER.join(', ')})`);
      if (v === null) { if (k === 'from' || k === 'to') throw new Error(`a link always has "${k}"`); delete link[k]; continue; }
      const ok = k === 'from' ? text(v) : k === 'to' ? target(v)
        : ['fromHome', 'label', 'effect'].includes(k) ? text(v)
        : k === 'piece' ? text(v) && /^[a-z0-9][a-z0-9-]*\/[^/\s]+$/.test(v)
        : k === 'strength' ? typeof v === 'number' && v >= 0 && v <= 2
        : k === 'cue' ? ['full', 'hover', 'none'].includes(v          )
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
    const beats = Array.isArray(home.beats) ? (home.beats                      ).map((b) => b.id) : [];
    if (beats.length && !beats.includes(link.from)) throw new Error(`there is no section "${String(link.from)}" to start from (there are ${beats.join(', ')})`);
    if (beats.length && typeof link.to === 'string' && !beats.includes(link.to)) throw new Error(`there is no section "${link.to}" to lead to (there are ${beats.join(', ')})`);
    const ordered = Object.fromEntries(LINK_ORDER.filter((k) => k in link).map((k) => [k, link[k]]));
    if (at >= 0) list[at] = ordered; else list.push(ordered);
  }
  if (list.length) home.transitions = list; else delete home.transitions;
  return 1;
}

// ---------------------------------------------------------------------------------------------------------------
// The command list: every edit a home file can take, by name. The studio, `popfold mcp` (an agent) and a script all
// send these, to POST /__popfold/home/<id> as { commands: [{ name, args }] }; GET /__popfold/commands lists them.

                                    
/** One edit to a home file. */
                                                          
                       
                                                           
                  
                                                 
             
                     
                                                                  
                                                                                  
              
 
const str = { type: 'string' }, bool = { type: 'boolean' }, obj = { type: 'object' };
const three = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const pieceAt = { id: { ...str, description: "the piece's id" }, room: { ...str, description: 'its room, zone or floor' }, wall: { ...bool, description: 'true for a piece on the wall' } };
const storySchema = { type: 'object', properties: { title: str, text: str, tags: { type: 'array', items: str }, dot: { enum: ['top', 'front', 'below'] } }, required: ['title', 'text', 'tags'] };

export const HOME_COMMANDS                              = {
  place: {
    summary: 'Move, turn, resize, hide or swap a piece that the home file lists. Only the fields given change.',
    args: { ...pieceAt, change: { type: 'object', description: 'any of: at [x, z] (on a wall: [x, height]), turn (radians), lift, out, scale, hidden, kind', properties: { at: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, turn: { type: 'number' }, lift: { type: 'number' }, out: { type: 'number' }, scale: { type: 'number' }, hidden: bool, kind: str } } },
    required: ['id', 'room', 'change'],
    run: (h, a) => placePieces(h, [a                                             ]),
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
    run: (h, a) => addPieces(h, [a                                           ]),
  },
  remove: {
    summary: 'Take a listed piece out of the home.',
    args: pieceAt, required: ['id', 'room'],
    run: (h, a) => removePieces(h, [a                                              ]),
  },
  story: {
    summary: 'Write the story behind a piece (a dot on it and a card), or take it away with story: null. Name a listed piece by id and room, or any piece by its key ("<room>/<piece>").',
    args: { ...pieceAt, key: str, story: { anyOf: [storySchema, { type: 'null' }] } },
    required: ['story'],
    run: (h, a) => setStories(h, [a                                            ]),
  },
  camera: {
    summary: 'Set where the camera is and what it looks at, at a beat of the story (named by its section id).',
    args: { id: { ...str, description: "the beat's id" }, camera: three, lookAt: three },
    required: ['id', 'camera', 'lookAt'],
    run: (h, a) => placeCameras(h, [a                                              ]),
  },
  beat: {
    summary: 'Set what the home does at a beat: set { c, L, R, glow, badges, hero, side, av, ax, az, wave } and, for a tower, zones { <floor>: 0..1 }, and its name (the studio\'s label). Only the fields given change.',
    args: { id: str, name: str, set: { type: 'object', additionalProperties: { type: 'number' } }, zones: { type: 'object', additionalProperties: { type: 'number' } } },
    required: ['id'],
    run: (h, a) => setBeats(h, [a                                          ]),
  },
  'add-beat': {
    summary: 'Add a beat to the story, and its <section class="stage"> to the page (a heading with its name and a placeholder for the words, shaped like its neighbour). It starts as a copy of the beat before it; then set its camera and values.',
    args: { id: { ...str, description: "the beat's id, and its section's" }, name: { ...str, description: 'a short name: the heading of its section, and the studio\'s label' }, at: { type: 'integer', minimum: 0, description: 'its position in the story, 0 first (default: the end)' } },
    required: ['id', 'name'],
    run: (h, a, page) => addBeat(h, a                                 , page),
    page: true,
  },
  'remove-beat': {
    summary: 'Take a beat out of the story, with its section in the page (its words go too) and the links that start from it or lead to it.',
    args: { id: str },
    required: ['id'],
    run: (h, a, page) => removeBeat(h, a                                    , page),
    page: true,
  },
  'move-beat': {
    summary: 'Move a beat to another place in the story, and its section in the page with it.',
    args: { id: str, to: { type: 'integer', minimum: 0, description: 'its new position, 0 first' } },
    required: ['id', 'to'],
    run: (h, a, page) => moveBeat(h, a                                  , page),
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
    run: (h, a) => setLink(h, a                                 ),
  },
};

/** The command list without its code: what GET /__popfold/commands answers, and what `popfold mcp` offers. */
export const commandList = () => Object.entries(HOME_COMMANDS).map(([name, c]) => ({ name, summary: c.summary, args: { type: 'object', properties: c.args, required: c.required } }));

/**
 * Run commands on a home file's contents (and on its page's text, for the commands that change the story's
 * sections), in order. A mistake stops them all, and names the command.
 */
export function runCommands(home      , commands         , page                  )         {
  if (!Array.isArray(commands) || !commands.length) throw new Error('Expected { commands: [{ name, args }] }');
  let n = 0;
  commands.forEach((c             , i) => {
    const spec = c && typeof c === 'object' ? HOME_COMMANDS[c.name] : undefined;
    if (!spec) throw new Error(`command ${i + 1}: there is no command "${String(c?.name)}" (there are ${Object.keys(HOME_COMMANDS).join(', ')})`);
    const args = (c.args ?? {})        ;
    for (const k of spec.required) if (args[k] === undefined) throw new Error(`command ${i + 1} (${c.name}): "${k}" is missing`);
    try { n += spec.run(home, args, page); } catch (err) { throw new Error(`command ${i + 1} (${c.name}): ${(err         ).message}`); }
  });
  return n;
}
