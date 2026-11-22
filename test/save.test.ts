// Saving from the studio into a home file: what a moved piece's entry must change to, and how the file is written.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { collectEditables, placementChange, type Listed } from '../src/layout.ts';
import { addBeat, addPieces, commandList, formatHome, moveBeat, readPage, placeCameras, placePieces, removePieces, runCommands, setBeats, setLink, setLook, setPlaces, setStories, stillsFolder } from '../src/vite-plugin.ts';
import type { PieceSpec } from '../src/types.ts';

/** A listed floor piece standing on a floor at height 0.5, as a shell would leave it. */
function floorPiece(spec: PieceSpec) {
  const obj = new THREE.Object3D();
  obj.position.set(spec.at[0], 0.5 + (spec.lift ?? 0), spec.at[1]);
  obj.rotation.y = spec.turn ?? 0;
  obj.userData.pieceId = spec.id;
  obj.userData.listed = { spec, defaults: {}, read: () => ({ at: [obj.position.x, obj.position.z], lift: obj.position.y - 0.5, turn: obj.rotation.y }) } satisfies Listed;
  return collectEditables([{ room: spec.room, parent: new THREE.Object3D(), items: [{ obj }] }])[0];
}

test('a listed piece where its entry says needs no change; one placed in code never does', () => {
  assert.equal(placementChange(floorPiece({ id: 'desk', room: 'center', kind: 'desk', at: [1, -0.9], turn: 0.5 })), null);
  const [loose] = collectEditables([{ room: 'center', parent: new THREE.Object3D(), items: [{ obj: new THREE.Object3D() }] }]);
  loose.obj.position.set(3, 3, 3);
  assert.equal(placementChange(loose), null);
});

test('only the fields that changed are named, rounded to a millimetre', () => {
  const e = floorPiece({ id: 'desk', room: 'center', kind: 'desk', at: [1, -0.9], turn: 0.5 });
  e.obj.position.x = 1.23456;
  assert.deepEqual(placementChange(e), { at: [1.235, -0.9] });
  e.obj.rotation.y = 0;
  e.obj.position.y = 0.8;
  assert.deepEqual(placementChange(e, 1.5), { at: [1.235, -0.9], turn: 0, lift: 0.3, scale: 1.5 });
});

test('a field the entry leaves out is compared with the shell\'s own default', () => {
  const spec: PieceSpec = { id: 'board', room: 'left', wall: true, kind: 'board', at: [0, 1.5], scale: 2 };
  const obj = new THREE.Object3D();
  obj.position.set(0, 1.5, 0.14);
  obj.userData.listed = { spec, defaults: { out: 0.14 }, read: () => ({ at: [obj.position.x, obj.position.y], out: obj.position.z }) } satisfies Listed;
  const [e] = collectEditables([{ room: 'left-wall', parent: new THREE.Object3D(), items: [{ obj }] }]);
  assert.equal(placementChange(e), null, 'standing out by the default, at the entry\'s own scale');
  obj.position.z = 0.3;
  assert.deepEqual(placementChange(e, 0.5), { out: 0.3, scale: 1 });
});

test('placePieces() finds a piece by room, wall and id, sets what it is given and drops plain values', () => {
  const home = { id: 'h', name: 'H', pieces: [
    { id: 'board', room: 'left', kind: 'board', at: [0, 0], turn: 1 },
    { id: 'board', room: 'left', wall: true, kind: 'board', at: [0, 1], scale: 2 },
  ] };
  assert.equal(placePieces(home, [{ id: 'board', room: 'left', wall: true, change: { at: [0.5, 1.2], scale: 1, out: 0.2 } }, { id: 'board', room: 'left', change: { turn: 0, lift: 0.1 } }]), 2);
  assert.deepEqual(home.pieces, [
    { id: 'board', room: 'left', kind: 'board', at: [0, 0], lift: 0.1 },
    { id: 'board', room: 'left', wall: true, kind: 'board', at: [0.5, 1.2], out: 0.2 },
  ]);
  assert.throws(() => placePieces(home, [{ id: 'lamp', room: 'left', change: { at: [0, 0] } }]), /no piece "lamp" in left/);
  assert.throws(() => placePieces(home, [{ id: 'board', room: 'left', change: { opts: {} } }]), /not something the studio can set/);
  // a piece's kind can be replaced (the studio's Kind picker), and keeps its place
  placePieces(home, [{ id: 'board', room: 'left', change: { kind: 'sofa' } }]);
  assert.equal((home.pieces as { id: string; kind: string }[]).find((p) => p.id === 'board')?.kind, 'sofa');
});

test('formatHome() writes each template\'s home file exactly as it is kept, so a save changes only what moved', () => {
  for (const name of readdirSync(new URL('../templates/', import.meta.url))) {
    const text = readFileSync(new URL(`../templates/${name}/src/home.json`, import.meta.url), 'utf8');
    assert.equal(formatHome(JSON.parse(text)), text, name);
  }
});

test('formatHome() keeps a piece\'s fields in one order and any text as it is', () => {
  const text = formatHome({ id: 'h', name: 'A "quoted", name: here', pieces: [{ scale: 2, at: [1, 2], kind: 'k', room: 'r', id: 'p', extra: true, story: { title: 'T', text: 'One, "two": three', tags: ['a', 'b'] } }] });
  assert.deepEqual(JSON.parse(text).pieces[0].story, { title: 'T', text: 'One, "two": three', tags: ['a', 'b'] });
  assert.match(text, /"id": "p", "room": "r", "kind": "k", "at": \[1, 2\], "scale": 2, "extra": true,\n {6}"story": \{/);
  assert.match(text, /"name": "A \\"quoted\\", name: here"/);
});

test('placeCameras() sets the camera of a beat, found by its id, and touches nothing else', () => {
  const home = { id: 'h', name: 'H', beats: [{ id: 'top', name: 'Top', camera: [0, 1, 2], lookAt: [0, 0, 0], set: { hero: 1 } }, { id: 'open', name: 'Open', camera: [3, 3, 3], lookAt: [1, 1, 1] }], pieces: [] };
  assert.equal(placeCameras(home, [{ id: 'open', camera: [4, 5, 6], lookAt: [0, 1, 0] }]), 1);
  assert.deepEqual(home.beats, [{ id: 'top', name: 'Top', camera: [0, 1, 2], lookAt: [0, 0, 0], set: { hero: 1 } }, { id: 'open', name: 'Open', camera: [4, 5, 6], lookAt: [0, 1, 0] }]);
  assert.throws(() => placeCameras(home, [{ id: 'end', camera: [0, 0, 0], lookAt: [0, 0, 0] }]), /no beat "end"/);
  assert.throws(() => placeCameras(home, [{ id: 'top', camera: [0, 0], lookAt: [0, 0, 0] }]), /two lists of three numbers/);
  assert.throws(() => placeCameras({ id: 'h', pieces: [] }, [{ id: 'top', camera: [0, 0, 0], lookAt: [0, 0, 0] }]), /keeps its story in code/);
});

test('formatHome() writes one beat per line, its fields in one order', () => {
  const text = formatHome({ id: 'h', beats: [{ zones: { lab: 1 }, lookAt: [0, 0, 0], camera: [1, 2, 3], name: 'Top', id: 'top', set: { hero: 1 } }], pieces: [] });
  assert.ok(text.includes('\n    { "id": "top", "name": "Top", "camera": [1, 2, 3], "lookAt": [0, 0, 0], "set": { "hero": 1 }, "zones": { "lab": 1 } }\n'), text);
});

test('hiding a listed piece is a change to its entry, and showing it again takes the word back out', () => {
  const e = floorPiece({ id: 'desk', room: 'center', kind: 'desk', at: [1, -0.9] });
  e.obj.userData.hidden = true;
  assert.deepEqual(placementChange(e), { hidden: true });
  const parked = floorPiece({ id: 'desk', room: 'center', kind: 'desk', at: [1, -0.9], hidden: true });
  assert.equal(parked.home.hide, true, 'a piece hidden by its entry starts hidden');
  parked.obj.userData.hidden = true;
  assert.equal(placementChange(parked), null);
  parked.obj.userData.hidden = false;
  assert.deepEqual(placementChange(parked), { hidden: false });
  const home = { id: 'h', pieces: [{ id: 'desk', room: 'center', kind: 'desk', at: [1, -0.9], hidden: true }] };
  placePieces(home, [{ id: 'desk', room: 'center', change: { hidden: false } }]);
  assert.deepEqual(home.pieces, [{ id: 'desk', room: 'center', kind: 'desk', at: [1, -0.9] }]);
});

test('removePieces() takes a piece off the list by room, wall and id', () => {
  const home = { id: 'h', pieces: [{ id: 'board', room: 'left', kind: 'a', at: [0, 0] }, { id: 'board', room: 'left', wall: true, kind: 'a', at: [0, 1] }, { id: 'lamp', room: 'right', kind: 'b', at: [0, 0] }] };
  assert.equal(removePieces(home, [{ id: 'board', room: 'left', wall: true }]), 1);
  assert.deepEqual(home.pieces.map((p) => `${p.room}${p.wall ? '-wall' : ''}/${p.id}`), ['left/board', 'right/lamp']);
  assert.throws(() => removePieces(home, [{ id: 'board', room: 'left', wall: true }]), /no piece "board" in left \(on the wall\)/);
});

test('addPieces() puts a new piece after the last one of its room, in the middle of the floor or the wall', () => {
  const home = { id: 'h', pieces: [{ id: 'desk', room: 'center', kind: 'desk', at: [1, 1] }, { id: 'rug', room: 'left', kind: 'rug', at: [0, 0] }, { id: 'lamp', room: 'right', kind: 'lamp', at: [0, 0] }] };
  assert.equal(addPieces(home, [{ id: 'plant', room: 'left', kind: 'plant' }, { id: 'chart', room: 'left', kind: 'chart', wall: true }, { id: 'sign', room: 'attic', kind: 'sign' }]), 3);
  assert.deepEqual(home.pieces.map((p) => p.id), ['desk', 'rug', 'plant', 'chart', 'lamp', 'sign']);
  assert.deepEqual(home.pieces[2], { id: 'plant', room: 'left', kind: 'plant', at: [0, 0] });
  assert.deepEqual(home.pieces[3], { id: 'chart', room: 'left', wall: true, kind: 'chart', at: [0, 1.2] });
  assert.throws(() => addPieces(home, [{ id: 'plant', room: 'left', kind: 'plant' }]), /"left" already has a piece called "plant"/);
  assert.doesNotThrow(() => addPieces(home, [{ id: 'plant', room: 'left', kind: 'plant', wall: true }]), 'a wall piece may share a floor piece\'s id');
  assert.throws(() => addPieces(home, [{ id: 'Big Plant', room: 'left', kind: 'plant' }]), /lower-case letters, digits and dashes/);
  assert.throws(() => addPieces(home, [{ id: 'fern', room: 'left', kind: '' }]), /needs a kind/);
});

test('setStories() writes, changes and takes away a story, keeping what the studio does not edit', () => {
  const home = { id: 'h', pieces: [
    { id: 'desk', room: 'center', kind: 'desk', at: [0, 0], story: { title: 'Old', text: 'Old text.', tags: ['a'], dot: 'front', meta: '2024', links: [{ label: 'More', href: '#more' }] } },
    { id: 'sofa', room: 'left', kind: 'sofa', at: [0, 0] },
    { id: 'board', room: 'left', wall: true, kind: 'board', at: [0, 1], story: { title: 'Board', text: 'On the wall.', tags: [] } },
  ] as Record<string, unknown>[] };
  assert.equal(setStories(home, [
    { id: 'desk', room: 'center', story: { title: ' New ', text: 'New text. ', tags: [' x ', '', 'y'], dot: 'top' } },
    { id: 'sofa', room: 'left', story: { title: 'Sofa', text: 'Sit.', tags: [], dot: 'below' } },
    { id: 'board', room: 'left', wall: true, story: null },
  ]), 3);
  // trimmed, in the order a story is written, the usual dot left out, meta and links kept
  assert.deepEqual(Object.entries(home.pieces[0].story as object), [['title', 'New'], ['text', 'New text.'], ['tags', ['x', 'y']], ['meta', '2024'], ['links', [{ label: 'More', href: '#more' }]]]);
  assert.deepEqual(home.pieces[1].story, { title: 'Sofa', text: 'Sit.', tags: [], dot: 'below' });
  assert.equal('story' in home.pieces[2], false);
  for (const [story, why] of [[{ title: '', text: 'x', tags: [] }, /needs a title/], [{ title: 'T', text: ' ', tags: [] }, /needs some text/], [{ title: 'T', text: 'x', tags: 'a, b' }, /list of words/], [{ title: 'T', text: 'x', tags: [], dot: 'side' }, /top, front or below/]] as const) {
    assert.throws(() => setStories(home, [{ id: 'sofa', room: 'left', story }]), why);
  }
  assert.throws(() => setStories(home, [{ id: 'lamp', room: 'left', story: null }]), /no piece "lamp" in left/);
});

test('setBeats() changes only the fields it is given, and leaves plain values out of the file', () => {
  const home = { id: 'h', beats: [
    { id: 'top', name: 'Top', camera: [0, 1, 2], lookAt: [0, 0, 0], set: { hero: 1, side: 1 } },
    { id: 'open', name: 'Open', camera: [0, 1, 2], lookAt: [0, 0, 0], set: { side: -1, c: 1, glow: 0.8 }, zones: { lab: 1, shop: 1 } },
    { id: 'end', name: 'End', camera: [0, 1, 2], lookAt: [0, 0, 0], set: { glow: 0.5 }, zones: { lab: 1 } },
  ] as Record<string, unknown>[], pieces: [] };
  assert.equal(setBeats(home, [
    { id: 'open', set: { L: 1, glow: 0.2, c: 0 }, zones: { shop: 0, attic: 0.3 } },
    { id: 'end', set: { glow: 0 }, zones: { lab: 0 } },
  ]), 2);
  assert.deepEqual(home.beats[0], { id: 'top', name: 'Top', camera: [0, 1, 2], lookAt: [0, 0, 0], set: { hero: 1, side: 1 } }, 'a beat that was not named is untouched');
  // side was not given, so it stays; c went to 0, so it goes; the fields come out in the engine's order
  assert.deepEqual(Object.entries(home.beats[1].set as object), [['L', 1], ['glow', 0.2], ['side', -1]]);
  assert.deepEqual(home.beats[1].zones, { lab: 1, attic: 0.3 });
  assert.equal('set' in home.beats[2] || 'zones' in home.beats[2], false, 'nothing left to say: the words go');
  setBeats(home, [{ id: 'top', set: { az: 0.8, ax: 1 } }]);
  assert.deepEqual(home.beats[0].set, { hero: 1, side: 1, ax: 1 }, 'az is 0.8 when nothing is said');
  assert.throws(() => setBeats(home, [{ id: 'nope', set: { c: 1 } }]), /no beat "nope"/);
  assert.throws(() => setBeats(home, [{ id: 'top', set: { open: 1 } }]), /not something a beat can set/);
  assert.throws(() => setBeats(home, [{ id: 'top', set: { c: 'wide' } }]), /must be a number/);
});

test('a model part\'s story is kept under its key, and taking the last one away drops "stories"', () => {
  const home: Record<string, unknown> = { id: 'room', name: 'Room', pieces: [] };
  setStories(home, [{ key: 'lounge/sofa', story: { title: ' Sit ', text: 'Down.', tags: ['a', ' '], dot: 'top' } }]);
  assert.deepEqual(home.stories, { 'lounge/sofa': { title: 'Sit', text: 'Down.', tags: ['a'] } });
  assert.throws(() => setStories(home, [{ key: 'no key', story: { title: 'x', text: 'y', tags: [] } }]), /not a piece key/);
  setStories(home, [{ key: 'lounge/sofa', story: null }]);
  assert.equal('stories' in home, false);
});

test('setPlaces() replaces the places, sorted by key, and an empty set leaves the field out', () => {
  const home: Record<string, unknown> = { id: 'room', name: 'Room', pieces: [] };
  assert.equal(setPlaces(home, { 'desk/pc': { hide: true }, 'b/a': { s: 2 } }), 2);
  assert.deepEqual(Object.keys(home.places as object), ['b/a', 'desk/pc']);
  assert.match(formatHome(home), /"pieces": \[\],\n {2}"places": \{\n {4}"b\/a": \{ "s": 2 \},\n {4}"desk\/pc": \{ "hide": true \}\n {2}\}/);
  setPlaces(home, {});
  assert.equal('places' in home, false);
});

test('setLook() merges a look field by field, replaces the emblem and changes a floor by id', () => {
  const home: Record<string, unknown> = { id: 'h', name: 'H', look: { base: '#111111', centerFloor: '#222222' }, floors: [{ id: 'a', label: 'A', color: '#333333' }], pieces: [] };
  assert.equal(setLook(home, { look: { base: '#ff0000' }, emblem: { title: 'T', subtitle: '' }, floors: [{ id: 'a', color: '#00ff00', label: ' B ' }] }), 3);
  assert.deepEqual(home.look, { base: '#ff0000', centerFloor: '#222222' });
  assert.deepEqual(home.emblem, { title: 'T' });
  assert.deepEqual(home.floors, [{ id: 'a', label: 'B', color: '#00ff00' }]);
  assert.throws(() => setLook(home, { look: { nope: 1 } }), /not part of a look/);
  assert.throws(() => setLook(home, { floors: [{ id: 'z', color: '#000000' }] }), /no floor "z"/);
});

test('runCommands() runs the command list in order, and names a mistake by its command', () => {
  const home: Record<string, unknown> = { id: 'h', name: 'H', beats: [{ id: 'top', name: 'Top', camera: [0, 0, 1], lookAt: [0, 0, 0] }], pieces: [{ id: 'desk', room: 'center', kind: 'desk', at: [0, 0] }] };
  runCommands(home, [
    { name: 'place', args: { id: 'desk', room: 'center', change: { at: [1, 2] } } },
    { name: 'add', args: { id: 'lamp', room: 'center', kind: 'lamp' } },
    { name: 'story', args: { id: 'lamp', room: 'center', story: { title: 'Light', text: 'On.', tags: [] } } },
    { name: 'beat', args: { id: 'top', set: { glow: 1 } } },
  ]);
  const pieces = home.pieces as { id: string; at: number[]; story?: { title: string } }[];
  assert.deepEqual(pieces[0].at, [1, 2]);
  assert.equal(pieces[1].story?.title, 'Light');
  assert.deepEqual((home.beats as { set?: object }[])[0].set, { glow: 1 });
  assert.throws(() => runCommands(home, [{ name: 'fly' }]), /command 1: there is no command "fly"/);
  assert.throws(() => runCommands(home, [{ name: 'add', args: { id: 'x' } }]), /command 1 \(add\): "room" is missing/);
  assert.throws(() => runCommands(home, [{ name: 'remove', args: { id: 'nope', room: 'center' } }]), /command 1 \(remove\)/);
  assert.throws(() => runCommands(home, []), /Expected \{ commands/);
});

test('every command in the list says what it does and what it takes', () => {
  for (const c of commandList()) {
    assert.ok(c.summary.length > 20, c.name);
    assert.equal(c.args.type, 'object');
    for (const k of c.args.required) assert.ok(k in c.args.properties, `${c.name}: ${k}`);
  }
});

test('setLink() adds, changes, moves and takes away a link, named by where it starts and leads', () => {
  const home: Record<string, unknown> = { id: 'h', name: 'H', beats: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], pieces: [] };
  setLink(home, { from: 'a', to: 'b' });
  assert.deepEqual(home.transitions, [{ from: 'a', to: 'b' }]);
  setLink(home, { from: 'a', to: 'b', change: { label: ' Next ', piece: 'center/desk', effect: 'zoom', cue: 'hover', button: true } });
  assert.deepEqual(home.transitions, [{ from: 'a', to: 'b', label: 'Next', piece: 'center/desk', effect: 'zoom', cue: 'hover', button: true }]);
  // plain values and null leave a field out; a new `to` moves the link
  setLink(home, { from: 'a', to: 'b', change: { cue: 'full', button: false, effect: null, to: 'c', card: true } });
  assert.deepEqual(home.transitions, [{ from: 'a', to: 'c', label: 'Next', piece: 'center/desk' }]);
  setLink(home, { from: 'b', to: { home: 'other', section: 'top' }, change: { label: 'Elsewhere' } });
  assert.match(formatHome(home), /"transitions": \[\n {4}\{ "from": "a", "to": "c", "label": "Next", "piece": "center\/desk" \},\n {4}\{ "from": "b", "to": \{ "home": "other", "section": "top" \}, "label": "Elsewhere" \}\n {2}\]/);
  assert.throws(() => setLink(home, { from: 'a', to: 'c', change: { label: null, button: true } }), /needs a label/);
  assert.throws(() => setLink(home, { from: 'a', to: 'c', change: { cue: 'loud' } }), /"cue" of the link from "a" to "c" cannot be "loud"/);
  assert.throws(() => setLink(home, { from: 'a', to: 'c', change: { piece: 'desk' } }), /"piece"/);
  assert.throws(() => setLink(home, { from: 'a', to: 'c', change: { colour: 'red' } }), /not something a link has/);
  assert.throws(() => setLink(home, { from: 'a', to: 'z' }), /no section "z" to lead to/);
  setLink(home, { from: 'a', to: 'b' });
  assert.throws(() => setLink(home, { from: 'a', to: 'b', change: { to: 'c' } }), /already a link from "a" to the same place/);
  setLink(home, { from: 'a', to: 'b', remove: true });
  setLink(home, { from: 'a', to: 'c', remove: true });
  setLink(home, { from: 'b', to: { home: 'other', section: 'top' }, remove: true });
  assert.equal('transitions' in home, false);
  assert.throws(() => setLink(home, { from: 'a', to: 'b', remove: true }), /has no link from "a" to "b"/);
});

test('setLook() sets a tower\'s building field by field, and null takes a field away', () => {
  const home: Record<string, unknown> = { id: 't', name: 'T', floors: [{ id: 'a', label: 'A', color: '#333333' }], pieces: [] };
  assert.equal(setLook(home, { tower: { spine: '#3EE6FF', wall: '#010101' } }), 2);
  assert.deepEqual(home.tower, { wall: '#010101', spine: '#3EE6FF' });
  setLook(home, { tower: { spine: null, elevator: true } });
  assert.deepEqual(home.tower, { wall: '#010101', elevator: true });
  assert.match(formatHome(home), /\n {2}"tower": \{ "wall": "#010101", "elevator": true \},\n/);
  assert.throws(() => setLook(home, { tower: { roof: '#000000' } }), /not a tower's colour/);
  assert.throws(() => setLook({ id: 'c', name: 'C', look: {}, pieces: [] }, { tower: { wall: '#000000' } }), /only a tower/);
  setLook(home, { tower: { wall: null, elevator: null } });
  assert.equal('tower' in home, false);
});

test('stillsFolder() keeps a studio-only home\'s stills out of public/', () => {
  const fallback = { name: 'popfold-fallback', api: { captures: [{ home: 'office' }, { home: 'refined' }] } };
  assert.equal(stillsFolder([fallback], 'office'), 'public/stills');
  assert.equal(stillsFolder([fallback], 'refined'), 'public/stills');
  assert.equal(stillsFolder([fallback], 'office-sage'), 'stills');
  assert.equal(stillsFolder([{ name: 'other' }], 'office-sage'), 'public/stills'); // no page without 3D: as before
});

test('the beat commands change the home file\'s beats and the page\'s stage sections together', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../templates/compact/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const json = JSON.parse(readFileSync(new URL('../templates/compact/src/home.json', import.meta.url), 'utf8'));
  const stages = (t: string) => readPage(t).sections.filter((s) => s.stage).map((s) => s.id);
  const ids = (h: Record<string, unknown>) => (h.beats as { id: string }[]).map((b) => b.id);
  const page = { file: 'index.html', text: html };
  // add: after "approach", a copy of it, with a section shaped like its neighbour
  runCommands(json, [{ name: 'add-beat', args: { id: 'team', name: 'The <team>', at: 2 } }], page);
  assert.deepEqual(ids(json), ['top', 'approach', 'team', 'services', 'build', 'process', 'contact']);
  assert.deepEqual(stages(page.text), ids(json));
  const team = (json.beats as Record<string, unknown>[])[2];
  assert.deepEqual([team.name, team.camera, team.set], ['The <team>', (json.beats as Record<string, unknown>[])[1].camera, (json.beats as Record<string, unknown>[])[1].set]);
  assert.match(page.text, /<\/section>\n\n {4}<section class="stage" id="team" data-text="right">\n {6}<div class="card">\n {8}<h2>The &lt;team&gt;<\/h2>\n {8}<p>\[What this section says\.\]<\/p>\n {6}<\/div>\n {4}<\/section>\n\n {4}<section class="stage" id="services"/);
  // move it first, then last
  runCommands(json, [{ name: 'move-beat', args: { id: 'team', to: 0 } }], page);
  assert.deepEqual(stages(page.text), ['team', 'top', 'approach', 'services', 'build', 'process', 'contact']);
  assert.deepEqual(ids(json), stages(page.text));
  runCommands(json, [{ name: 'move-beat', args: { id: 'team', to: 6 } }], page);
  assert.deepEqual(ids(json), ['top', 'approach', 'services', 'build', 'process', 'contact', 'team']);
  assert.deepEqual(stages(page.text), ids(json));
  // remove: the page is as it was, and the links that touched the beat go with it
  runCommands(json, [{ name: 'remove-beat', args: { id: 'team' } }], page);
  assert.equal(page.text, html);
  runCommands(json, [{ name: 'remove-beat', args: { id: 'top' } }], page);
  assert.equal((json.transitions as { from: string }[]).some((t) => t.from === 'top'), false);
  assert.deepEqual(stages(page.text), ids(json));
  // mistakes
  assert.throws(() => runCommands(json, [{ name: 'add-beat', args: { id: 'approach', name: 'Again' } }], page), /already a beat "approach"/);
  assert.throws(() => runCommands(json, [{ name: 'add-beat', args: { id: 'main', name: 'Main' } }], page), /already has an element with the id "main"/);
  assert.throws(() => runCommands(json, [{ name: 'move-beat', args: { id: 'approach', to: 9 } }], page), /"to" must be a position/);
  assert.throws(() => runCommands(json, [{ name: 'add-beat', args: { id: 'x', name: 'X' } }], { file: 'index.html', text: html }), /are not the home's beats/);
  // a route between neighbours keeps them together
  const routed = { beats: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], transitions: [{ from: 'a', to: 'b', via: [[0, 0, 0]] }] };
  assert.throws(() => moveBeat(routed, { id: 'a', to: 2 }), /has a route \(via\)/);
  // without a page (a home no page shows), only the beats change
  const alone = { beats: [{ id: 'a', name: 'A' }] };
  addBeat(alone, { id: 'b', name: 'B' });
  assert.deepEqual(alone.beats.map((b) => b.id), ['a', 'b']);
});

test('a beat\'s name can be changed', () => {
  const home: Record<string, unknown> = { beats: [{ id: 'a', name: 'A' }] };
  setBeats(home, [{ id: 'a', name: ' First ' }]);
  assert.equal((home.beats as { name: string }[])[0].name, 'First');
  assert.throws(() => setBeats(home, [{ id: 'a', name: '' }]), /needs a name/);
});

test('setLook() paints a diorama\'s materials by name, and null gives one its own colour back', () => {
  const home: Record<string, unknown> = { id: 'd', name: 'D', diorama: { url: 'room.glb', zones: { center: 'a', left: 'b', right: 'c' } }, pieces: [] };
  setLook(home, { paint: { wall: '#6f8fb0', floor: '#aa8866' } });
  assert.deepEqual((home.diorama as { paint?: object }).paint, { floor: '#aa8866', wall: '#6f8fb0' });
  setLook(home, { paint: { floor: null, wall: null } });
  assert.equal('paint' in (home.diorama as object), false);
  assert.throws(() => setLook({ id: 'c', name: 'C', look: {}, pieces: [] }, { paint: { wall: '#000000' } }), /only a diorama/);
  assert.throws(() => setLook(home, { paint: { wall: 3 } }), /cannot be 3/);
});
