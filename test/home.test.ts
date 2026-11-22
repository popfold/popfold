// A home's JSON file: readHome() accepts what the templates ship, names every mistake, and agrees with the schema.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BEAT_DEFAULTS, beatsOf } from '../src/keyframes.ts';
import { readHome } from '../src/pieces.ts';

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const good = () => ({ id: 'home', name: 'Home', pieces: [{ id: 'desk', room: 'center', kind: 'desk', at: [0, 1] }] });
const mistakes = (home: unknown) => { try { readHome(home); return ''; } catch (err) { return (err as Error).message; } };

test('every template\'s home.json is a good home file', () => {
  for (const name of readdirSync(new URL('../templates/', import.meta.url))) {
    const home = readHome(json(`../templates/${name}/src/home.json`));
    // (a diorama's pieces come from its model: its file lists none, and keeps their stories by key)
    assert.ok(home.diorama ? Object.keys(home.stories ?? {}).length >= 3 : home.pieces.length > 10, name);
    assert.equal(typeof home.blurb, 'string');
  }
});

test('a good file comes back typed, with an empty blurb when it has none', () => {
  assert.deepEqual(readHome(good()), { id: 'home', name: 'Home', blurb: '', pieces: good().pieces });
  const tower = readHome({ ...good(), floors: [{ id: 'lab', label: 'LAB', color: '#fff' }], pieces: [{ id: 'desk', room: 'lab', kind: 'desk', at: [0, 1] }] });
  assert.deepEqual(tower.floors, [{ id: 'lab', label: 'LAB', color: '#fff' }]);
});

test('every mistake is named, with the piece it is in', () => {
  const text = mistakes({ ...good(), pieces: [
    { id: 'desk', room: 'center', kind: 'desk', at: [0, 1], trun: 1.5 },
    { id: 'desk', room: 'center', kind: 'desk', at: [0] },
    { id: 'Lamp', room: 'attic', kind: 'lamp', at: [0, 0], turn: 'left', story: { title: 'Lamp', tags: 'light', dot: 'side' } },
    { room: 'left', kind: 'rug' },
  ] });
  for (const part of [
    'has 11 mistakes', 'piece 1 ("desk" in center): "trun" is not something a piece has',
    'piece 2 ("desk" in center): "at" must be two numbers', 'another piece is already "center/desk"',
    'piece 3 ("Lamp" in attic): "id" must be lower-case', 'there is no room "attic" (there are center, left, right)',
    '"turn" must be a number', 'its story needs a "title" and a "text"', 'its story needs "tags"', '"dot" must be top, front or below',
    'piece 4: "id" is missing', 'piece 4: "at" is missing',
  ]) assert.ok(text.includes(part), `missing: ${part}\n${text}`);
});

test('a wall piece and a floor piece may share an id; a tower\'s pieces must be on its floors', () => {
  assert.equal(mistakes({ ...good(), pieces: [{ id: 'board', room: 'left', kind: 'a', at: [0, 0] }, { id: 'board', room: 'left', wall: true, kind: 'a', at: [0, 1] }] }), '');
  const text = mistakes({ ...good(), floors: [{ id: 'lab', label: 'LAB', color: '#fff' }, { id: 'lab', label: 'LAB 2' }] });
  for (const part of ['two floors have the id "lab"', 'floor 2: "color" is missing', 'there is no floor "center" (there is lab)']) assert.ok(text.includes(part), `missing: ${part}\n${text}`);
});

test('what is not a home is refused in words', () => {
  assert.match(mistakes([]), /must hold one object/);
  assert.match(mistakes({ id: 'x', name: 'X', pieces: {} }), /"pieces" must be a list/);
  assert.match(mistakes({ id: 'x', name: 'X', pieces: [], kinds: {} }), /"kinds" is not something a home file has/);
});

test('the schema and readHome() know the same fields', () => {
  const schema = json('../schema/home.schema.json');
  const piece = Object.keys(schema.definitions.piece.properties);
  // readHome() names the fields a piece has when it meets one it does not know
  const known = /it has ([^)]+)\)/.exec(mistakes({ ...good(), pieces: [{ ...good().pieces[0], nope: 1 }] }))![1].split(', ');
  assert.deepEqual(piece.sort(), known.sort());
  assert.deepEqual(Object.keys(schema.properties).sort(), ['$schema', 'beats', 'blurb', 'book', 'diorama', 'emblem', 'floors', 'id', 'look', 'mood', 'name', 'pieces', 'places', 'stories', 'swatch', 'tower', 'transitions']);
  // a look's fields and a surface's patterns: readHome() names them when it meets one it does not know
  const look = { base: '#1', lid: '#2', heart: '#3', leftSlab: '#4', rightSlab: '#5', centerFloor: '#6', lidPaper: '#6', leftFloor: '#6', leftWall: '#6', rightFloor: '#6', rightWall: '#6' };
  assert.deepEqual(Object.keys(schema.properties.look.properties).filter((k) => !['shell', 'parts', 'corner', 'badges', 'badgeRing', 'trim', 'drawerWall'].includes(k)).sort(), Object.keys(look).sort());
  const patterns = /there are ([^)]+)\)/.exec(mistakes({ ...good(), look: { ...look, leftWall: { pattern: 'zigzag', colors: ['#1', '#2'] } } }))![1].split(', ');
  assert.deepEqual(schema.definitions.surface.oneOf[1].properties.pattern.enum, patterns);
  // a beat's fields: the schema, readHome() and the engine's own defaults name the same ones
  const beat = schema.properties.beats.items.properties;
  assert.deepEqual(Object.keys(beat).sort(), ['camera', 'home', 'id', 'lookAt', 'name', 'set', 'zones']);
  const settable = /it can set ([^)]+)\)/.exec(mistakes({ ...good(), beats: [{ id: 'top', name: 'Top', camera: [0, 1, 2], lookAt: [0, 0, 0], set: { nope: 1 } }] }))![1].split(', ');
  assert.deepEqual(Object.keys(beat.set.properties).sort(), [...settable].sort());
  assert.deepEqual(Object.keys(BEAT_DEFAULTS).sort(), [...settable].sort());
  assert.deepEqual(Object.keys(schema.properties.floors.items.properties).sort(), ['color', 'height', 'id', 'label']);
  assert.deepEqual(Object.keys(schema.properties.tower.properties).sort(), ['cables', 'depth', 'elevator', 'floorHeight', 'slab', 'spine', 'wall', 'width']);
  assert.deepEqual(Object.keys(schema.properties.tower.properties.cables.properties).sort(), ['plug', 'size', 'tint']);
  assert.deepEqual(Object.keys(schema.properties.book.properties).sort(), ['closed', 'cover', 'height', 'pages', 'paper', 'width']);
  assert.deepEqual(Object.keys(schema.properties.book.properties.pages.items.properties).sort(), ['art', 'color', 'id', 'label', 'stitch']);
  // what readHome() names when it meets a field a book or a page does not have
  assert.match(mistakes({ ...good(), book: { pages: [{ id: 'a', nope: 1 }], roof: 1 } }), /"nope" is not something a page has[\s\S]*"roof" is not something a book has/);
  // a closed book opens with the zone "cover", which no page may then take; an open book has no such zone
  const book = (closed: boolean, pages = ['a', 'b']) => ({ id: 'home', name: 'Home', pieces: [], book: { pages: pages.map((id) => ({ id })), closed }, beats: [{ id: 'x', name: 'X', camera: [0, 1, 2], lookAt: [0, 0, 0], zones: { cover: 1, a: 1 } }] });
  assert.equal(mistakes(book(true)), '');
  assert.match(mistakes(book(false)), /there is no page "cover" to turn/);
  assert.match(mistakes(book(true, ['cover', 'b'])), /no page may have the id "cover"/);
  assert.match(mistakes({ ...good(), book: { pages: [{ id: 'a' }], closed: 'yes' } }), /"closed" must be true or false/);
  assert.deepEqual(Object.keys(schema.definitions.piece.properties.story.properties).sort(), ['dot', 'kicker', 'links', 'meta', 'tags', 'text', 'title']);
});

test('the beats of a home file become the story, with whatever a beat leaves out at its plain value', () => {
  const home = readHome({ ...good(), beats: [
    { id: 'top', name: 'Closed', camera: [0, 4, 11], lookAt: [0, 1, 0], set: { hero: 1, side: -1 } },
    { id: 'open', name: 'Open', camera: [1, 2, 3], lookAt: [4, 5, 6], zones: { lab: 1 } },
  ] });
  const [top, open] = beatsOf(home);
  assert.deepEqual([top.id, top.name], ['top', 'Closed']);
  assert.deepEqual(top.key, { c: 0, L: 0, R: 0, glow: 0, badges: 0, hero: 1, side: -1, av: 0, ax: 0, az: 0.8, wave: 0, cx: 0, cy: 4, cz: 11, tx: 0, ty: 1, tz: 0 });
  assert.deepEqual([open.key.cx, open.key.tz, open.key['z:lab'], open.key.hero], [1, 6, 1, 0]);
  assert.deepEqual(beatsOf(readHome(good())), [], 'a file with no beats tells no story');
  // one beat per section of the template's page
  for (const name of readdirSync(new URL('../templates/', import.meta.url))) {
    const sections = readFileSync(new URL(`../templates/${name}/index.html`, import.meta.url), 'utf8').match(/<section class="stage[ "]/g)?.length;
    assert.equal(beatsOf(readHome(json(`../templates/${name}/src/home.json`))).length, sections, name);
  }
});

test('a piece\'s opts hold plain values and lists of them', () => {
  const shelf = { id: 'shelf', room: 'left', wall: true, kind: 'shelf', at: [0, 1], opts: { width: 1.4, style: 'oak', items: [0.2, 'vase', true] } };
  assert.deepEqual(readHome({ ...good(), pieces: [shelf] }).pieces[0].opts, shelf.opts);
  const text = mistakes({ ...good(), pieces: [{ ...shelf, opts: { items: [{ w: 1 }], nested: { a: 1 }, ok: 3 } }] });
  for (const part of ['opts "items" must be a number, text, true or false, or a list of those', 'opts "nested" must be']) assert.ok(text.includes(part), `missing: ${part}\n${text}`);
  assert.ok(!text.includes('opts "ok"'));
});

test('mistakes in beats are named', () => {
  const text = mistakes({ ...good(), floors: [{ id: 'lab', label: 'LAB', color: '#fff' }], pieces: [], beats: [
    { id: 'top', name: 'Top', camera: [0, 1], lookAt: [0, 0, 0], set: { glow: 'bright' }, zones: { attic: 1 } },
    { id: 'top', camera: [0, 1, 2], lookAt: [0, 0, 0], cam: [1, 2, 3] },
  ] });
  for (const part of ['beat 1 ("top"): "camera" must be three numbers', '"glow" must be a number', 'there is no floor "attic" to open (there is lab)',
    'two beats have the id "top"', 'beat 2 ("top"): "name" is missing', '"cam" is not something a beat has']) assert.ok(text.includes(part), `missing: ${part}
${text}`);
});

test('a look in the home file is checked: colours, surfaces and their patterns', () => {
  const look = {
    base: '#1E2A44', lid: '#FF6B4A', heart: '#FFD66B', leftSlab: '#8DB59A', rightSlab: '#9CC3E6',
    centerFloor: { pattern: 'checker', colors: ['#fff', '#eee'], count: 8 }, lidPaper: '#F4EEE4',
    leftFloor: { pattern: 'terrazzo', colors: ['#fff', '#f00', '#0f0'] }, leftWall: '#eee', rightFloor: '#eee', rightWall: { pattern: 'waves', colors: ['#fff', '#ddd'], count: 6, repeat: 2 },
  };
  const home = readHome({ ...good(), look, emblem: { title: 'my', heart: false }, swatch: ['#1E2A44'] });
  assert.deepEqual([home.look, home.emblem, home.swatch], [look, { title: 'my', heart: false }, ['#1E2A44']]);
  assert.equal('look' in readHome(good()), false, 'a file with no look has none');

  const text = mistakes({ ...good(), swatch: 'navy', emblem: { title: 3, crest: true }, look: {
    ...look, lid: 7, heart: undefined, centerFloor: { pattern: 'zigzag', colors: ['#fff'] }, leftWall: 12, rightWall: { pattern: 'dots', colors: ['#fff', '#000'], count: 0, size: 2 },
    shell: 'square', badges: [['#fff', '#000']], sheen: 1,
  } });
  for (const part of ['"swatch" must be a list of colours', 'emblem: "title" must be text', 'emblem: "crest" is not something an emblem has',
    'look: "lid" must be a colour', 'look: "heart" must be a colour', 'look: "centerFloor" has no pattern "zigzag" (there are checker, stripes, dots, waves, terrazzo)',
    'look: "centerFloor" needs "colors", at least two', 'look: "leftWall" must be a colour, or a pattern', 'look: "rightWall": "count" must be a number above 0',
    'look: "rightWall": "size" is not something a surface has', 'look: "shell" must be round, crisp, code', 'look: "badges" must be three pairs', 'look: "sheen" is not something a look has',
  ]) assert.ok(text.includes(part), `missing: ${part}\n${text}`);
});

test('formatHome() writes a look one field to a line', async () => {
  const { formatHome } = await import('../src/vite-plugin.ts');
  const text = formatHome({ id: 'h', look: { base: '#111', centerFloor: { pattern: 'checker', colors: ['#fff', '#eee'], count: 8 } }, pieces: [] });
  assert.ok(text.includes('  "look": {\n    "base": "#111",\n    "centerFloor": { "pattern": "checker", "colors": ["#fff", "#eee"], "count": 8 }\n  },\n'), text);
});

test('a diorama: its room, its parts\' stories and places are read, and mistakes in them named', () => {
  const room = { id: 'room', name: 'Room', pieces: [], diorama: { url: 'models/room.glb', zones: { center: 'a', left: 'b', right: 'c' } }, stories: { 'a/tv': { title: 'T', text: 'x', tags: [] } }, places: { 'b/sofa': { p: [0, 0, 1], hide: true } } };
  const home = readHome(room);
  assert.equal(home.diorama?.url, 'models/room.glb');
  assert.equal(home.stories?.['a/tv'].title, 'T');
  assert.deepEqual(home.places?.['b/sofa'], { p: [0, 0, 1], hide: true });
  const m = mistakes({ ...room, pieces: [good().pieces[0]], look: {}, diorama: { url: '', zones: { center: 'a' }, art: 1 }, stories: { tv: { title: 'T' } }, places: { 'b/sofa': { p: [1], q: 1 } } });
  for (const want of [/one of a compact/, /"url" \(its room model\)/, /"zones" must name/, /"art" is not something a diorama has/, /"pieces" must be empty/, /"tv" is not a piece key/, /needs "tags"/, /"p" must be three numbers/, /"q" is not something a place has/]) assert.match(m, want);
});

test('a tower from its file takes its building from the file, each floor\'s code by floor id, and names a build for a floor it lacks', async () => {
  const { towerFromFile } = await import('../src/pieces.ts');
  const floors = [{ id: 'a', label: 'A', color: '#111111' }, { id: 'b', label: 'B', color: '#222222' }];
  const pipes = () => undefined;
  const tower = towerFromFile('t', floors, { wall: '#010101', slab: '#020202', spine: '#333333', elevator: true }, { b: pipes });
  assert.equal(tower.floors[0].build, undefined);
  assert.equal(tower.floors[1].build, pipes);
  assert.deepEqual([tower.wall, tower.slab, tower.spine?.color, tower.elevator], ['#010101', '#020202', '#333333', true]);
  assert.equal(towerFromFile('t', floors).spine, undefined); // no pipe unless the file gives its colour
  assert.throws(() => towerFromFile('t', floors, {}, { c: pipes }), /tower.build names "c", which the file has no floor for/);
  // what the file says about the building is checked
  const building = { ...good(), floors, pieces: [] };
  assert.deepEqual(readHome({ ...building, tower: { wall: '#010101', spine: '#333333' } }).tower, { wall: '#010101', spine: '#333333' });
  const m = mistakes({ ...building, tower: { wall: 3, elevator: 'yes', width: -1, roof: 1 } });
  for (const want of [/tower: "wall" must be a colour/, /"elevator" must be true or false/, /"width" must be a number above 0/, /"roof" is not something a tower has/]) assert.match(m, want);
  // cables: opt-in, an object; its plug and tint are names, its size a length
  assert.deepEqual(readHome({ ...building, tower: { cables: { plug: 'rj45-plug', size: 0.1, tint: 'boot' } } }).tower, { cables: { plug: 'rj45-plug', size: 0.1, tint: 'boot' } });
  assert.deepEqual(towerFromFile('t', floors, { cables: {} }).cables, {});
  const c = mistakes({ ...building, tower: { cables: { plug: 3, size: 0, wire: 1 } } });
  for (const want of [/cables: "plug" must be a name/, /cables: "size" must be a number above 0/, /cables: "wire" is not something cables have/]) assert.match(c, want);
  assert.match(mistakes({ ...building, tower: { cables: true } }), /"cables" must be an object/);
  assert.match(mistakes({ ...good(), tower: {} }), /"tower" goes with "floors"/);
});

test('transitions: read from a home file, checked against its beats, and given to the pieces that carry them', async () => {
  const { storiesWithLinks, doorsOf } = await import('../src/transitions.ts');
  const beats = [{ id: 'a', name: 'A', camera: [0, 0, 1], lookAt: [0, 0, 0] }, { id: 'b', name: 'Bee', camera: [0, 0, 1], lookAt: [0, 0, 0] }];
  const home = readHome({ ...good(), beats, transitions: [{ from: 'a', to: 'b', piece: 'center/desk' }, { from: 'b', to: { home: 'other', section: 'a' }, label: 'Elsewhere', piece: 'center/door' }] });
  assert.equal(home.transitions?.length, 2);
  const m = mistakes({ ...good(), beats, transitions: [{ from: 'x', to: 'b' }, { from: 'a', to: { home: 'h' } }, { from: 'a', to: 'b', piece: 'desk', strength: 5, go: 1 }] });
  for (const want of [/no section "x" to start from/, /"to" must be a section id, or \{ "home", "section" \}/, /"piece" must be a piece key/, /"strength" must be a number from 0 to 2/, /"go" is not something a transition has/]) assert.match(m, want);
  // a piece with a story gets the link on its card (worded by the label, or the target beat's name); one without is a door
  const stories = { 'center/desk': { title: 'Desk', text: 'x', tags: [] } };
  const name = (t: { to: unknown }) => beats.find((b) => b.id === t.to)?.name ?? '?';
  const withLinks = storiesWithLinks(stories, home.transitions!, name);
  assert.deepEqual(withLinks['center/desk'].links, [{ label: 'Bee', href: '#b' }]);
  assert.deepEqual([...doorsOf(stories, home.transitions!).keys()], ['center/door']);
  assert.equal(stories['center/desk'].links, undefined, 'the stories given are not changed');
});

test('a route (via) is only for neighbouring beats of the same home, and look goes with it', () => {
  const beats = ['a', 'b', 'c'].map((id) => ({ id, name: id, camera: [0, 0, 1], lookAt: [0, 0, 0] }));
  assert.equal(readHome({ ...good(), beats, transitions: [{ from: 'a', to: 'b', via: [[1, 2, 3]], look: 'path', effect: 'tunnel' }] }).transitions?.[0].look, 'path');
  const m = mistakes({ ...good(), beats, transitions: [
    { from: 'a', to: 'c', via: [[1, 2, 3]] },
    { from: 'b', to: { home: 'h', section: 'a' }, via: [[1, 2, 3]] },
    { from: 'a', to: 'b', via: [[1, 2]] },
    { from: 'b', to: 'c', look: 'path' },
    { from: 'b', to: 'c', via: [[0, 0, 0]], look: 'up' },
  ] });
  for (const want of [/transition 1: "via" needs "from" and "to" to be neighbouring beats/, /transition 2: "via" is for a way between two beats of this home/, /transition 3: "via" must be a list of 1 to 12 points/, /transition 4: "look" goes with "via"/, /transition 5: "look" must be "path" or "beats"/]) assert.match(m, want);
});

test('fromHome must name a home', () => {
  assert.match(mistakes({ ...good(), transitions: [{ from: 'a', to: 'b', fromHome: 3 }] }), /"fromHome" must be a home's id/);
  assert.equal(readHome({ ...good(), transitions: [{ from: 'a', to: 'b', fromHome: 'toy' }] }).transitions?.[0].fromHome, 'toy');
});

test('a door\'s cue and button are checked', () => {
  const m = mistakes({ ...good(), transitions: [{ from: 'a', to: 'b', cue: 'loud' }, { from: 'a', to: 'b', button: true }, { from: 'a', to: 'b', button: 'yes', label: 'x' }] });
  for (const want of [/"cue" must be "full", "hover" or "none"/, /a "button" needs a "label"/, /"button" must be true or false/]) assert.match(m, want);
});

test("a look's parts are read from the file, and mistakes in them named", () => {
  const look = { base: '#1', lid: '#2', heart: '#3', leftSlab: '#4', rightSlab: '#5', centerFloor: '#6', lidPaper: '#6', leftFloor: '#6', leftWall: '#6', rightFloor: '#6', rightWall: '#6',
    shell: 'round', parts: { lid: 'crisp', walls: { url: 'models/case.glb' } } };
  assert.deepEqual(readHome({ ...good(), look }).look?.parts, { lid: 'crisp', walls: { url: 'models/case.glb' } });
  assert.match(mistakes({ ...good(), look: { ...look, parts: { roof: 'crisp' } } }), /parts: "roof" is not a part of the case/);
  assert.match(mistakes({ ...good(), look: { ...look, parts: { lid: 'square' } } }), /parts: "lid" must be round, crisp or \{ "url" \}/);
  assert.match(mistakes({ ...good(), look: { ...look, shell: 'code' } }), /"parts" come from modelled cases, so not with shell "code"/);
});

test('a home file says its time of day once: "mood", day or evening', () => {
  assert.equal(readHome({ ...good(), mood: 'evening' }).mood, 'evening');
  assert.equal(readHome(good()).mood, undefined);
  assert.match(mistakes({ ...good(), mood: 'night' }), /"mood" must be "day" or "evening"/);
});

test('a diorama’s paint is read and checked', () => {
  const room = { id: 'd', name: 'D', pieces: [], diorama: { url: 'room.glb', zones: { center: 'a', left: 'b', right: 'c' }, paint: { wall: '#6f8fb0' } } };
  assert.deepEqual(readHome(room).diorama?.paint, { wall: '#6f8fb0' });
  assert.match(mistakes({ ...room, diorama: { ...room.diorama, paint: { wall: 3 } } }), /paint: "wall" must be a colour/);
  assert.match(mistakes({ ...room, diorama: { ...room.diorama, paint: 'red' } }), /"paint" must be an object/);
});
