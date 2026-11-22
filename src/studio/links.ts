// The studio's Links section: a home's links (its file's "transitions") with their target, words, piece, effect,
// cue and button, each change written into the home file through the `link` command and shown at once. Only for a
// home kept in a file: a site whose story is code keeps its links in code.
import { BUILT_IN_EFFECTS } from '../effects-pass';
import { linkKey, type Transition } from '../transitions';
import type { HomeRecipe } from '../types';
import { homeRequest } from './home-edits';

type Json = Record<string, unknown>;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface LinkEditorOptions {
  getHome: () => string;
  recipeOf: (id: string) => HomeRecipe | undefined;
  /** every home on the bench, for links that lead to another */
  homes: () => { id: string; name: string }[];
  /** the story's sections, in order */
  beats: () => { id: string; name: string }[];
  /** the beat the story is on: a new link starts there */
  beatHere: () => string;
  /** the pieces of the home on show, by key, and the one selected in the props inspector */
  pieces: () => string[];
  selectedPiece: () => string | undefined;
  /** the file's links changed (before and after): the scene's list is brought up to date */
  linksChanged: (before: Transition[], after: Transition[]) => void;
  /** build the home again from the file the save sent back (the studio then calls fileWillShow and fileShown) */
  showFile: (json: unknown) => Promise<void>;
}

export function createLinkEditor(o: LinkEditorOptions) {
  const section = $('links'), host = $('link-list'), note = $('link-note');
  const say = (text: string) => { note.textContent = text; note.hidden = !text; };
  let file: Json | null = null;
  /** the link whose fields are open, by its key, so a rebuild keeps it open */
  let open = '';
  const linksOf = (f: Json | null) => (Array.isArray(f?.transitions) ? f.transitions : []) as Transition[];

  async function send(args: Json, done: string) {
    say('Saving…');
    try {
      const body = { commands: [{ name: 'link', args }], quiet: true };
      const res = await homeRequest(o.getHome(), body);
      if (!res.ok) throw new Error(res.why ?? 'not saved');
      await o.showFile(res.home); // (fileWillShow and fileShown follow from it)
      say(`${done} in ${res.file}.`);
    } catch (err) { say(`Not saved: ${(err as Error).message.slice(0, 180)}`); build(); }
  }

  // ----- small form helpers -----
  const field = (label: string, ...kids: HTMLElement[]) => {
    const r = document.createElement('label');
    r.className = 'look-row';
    const s = document.createElement('span'); s.textContent = label;
    r.append(s, ...kids);
    return r;
  };
  const select = (options: [string, string][], value: string, onPick: (v: string) => void) => {
    const s = document.createElement('select');
    s.append(...options.map(([v, label]) => new Option(label, v)));
    if (!options.some(([v]) => v === value)) s.append(new Option(value, value)); // (a value the file has, kept)
    s.value = value;
    s.addEventListener('change', () => onPick(s.value));
    return s;
  };
  const text = (value: string, placeholder: string, onSet: (v: string) => void) => {
    const i = document.createElement('input');
    i.type = 'text'; i.value = value; i.placeholder = placeholder;
    i.addEventListener('change', () => onSet(i.value.trim()));
    return i;
  };
  const tick = (value: boolean, onSet: (v: boolean) => void) => {
    const i = document.createElement('input');
    i.type = 'checkbox'; i.checked = value;
    i.addEventListener('change', () => onSet(i.checked));
    return i;
  };
  const button = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  /** "contact", or "evening/lounge" for a section of another home: the value of the target picker */
  const targetValue = (to: Transition['to']) => (typeof to === 'string' ? to : `${to.home}/${to.section}`);
  const targetOf = (v: string): Transition['to'] => { const [a, b] = v.split('/'); return b === undefined ? a : { home: a, section: b }; };
  const beatName = (id: string) => o.beats().find((b) => b.id === id)?.name ?? id;
  const targetName = (to: Transition['to']) => (typeof to === 'string' ? beatName(to) : `${o.homes().find((h) => h.id === to.home)?.name ?? to.home}: ${beatName(to.section)}`);

  function linkRow(t: Transition) {
    const name = { from: t.from, to: t.to, ...(t.fromHome ? { fromHome: t.fromHome } : {}) };
    const change = (c: Json, done = 'Saved') => send({ ...name, change: c }, done);
    const box = document.createElement('details');
    box.className = 'link-edit';
    box.open = open === linkKey(t);
    box.addEventListener('toggle', () => { if (box.open) open = linkKey(t); else if (open === linkKey(t)) open = ''; });
    const summary = document.createElement('summary');
    summary.textContent = `${beatName(t.from)} → ${targetName(t.to)}${t.label ? ` · “${t.label}”` : ''}`;
    box.append(summary);

    const beats = o.beats().map((b): [string, string] => [b.id, b.name]);
    const here = o.getHome();
    const targets: [string, string][] = [
      ...beats,
      ...o.homes().filter((h) => h.id !== here).flatMap((h) => o.beats().map((b): [string, string] => [`${h.id}/${b.id}`, `${h.name}: ${b.name}`])),
    ];
    const pieces = o.pieces();
    const usePiece = button('Selected', () => {
      const key = o.selectedPiece();
      if (key) change({ piece: key }); else say('Select a piece in Props first (Pick in view, or the list).');
    });
    usePiece.title = 'Use the piece selected in Props';
    const effects = Object.keys(BUILT_IN_EFFECTS);
    const strength = document.createElement('input');
    strength.type = 'number'; strength.min = '0'; strength.max = '2'; strength.step = '0.1'; strength.value = String(t.strength ?? 1);
    strength.disabled = !t.effect;
    strength.addEventListener('change', () => { const v = Number(strength.value); if (Number.isFinite(v)) change({ strength: Math.min(2, Math.max(0, v)) }); });

    box.append(
      field('From', select(beats, t.from, (v) => change({ from: v }))),
      field('To', select(targets, targetValue(t.to), (v) => change({ to: targetOf(v) }))),
      field('Words', text(t.label ?? '', `(the name of “${beatName(typeof t.to === 'string' ? t.to : t.to.section)}”)`, (v) => change({ label: v || null }))),
      field('Piece', select([['', 'none'], ...pieces.map((k): [string, string] => [k, k])], t.piece ?? '', (v) => change({ piece: v || null })), usePiece),
      field('Effect', select([['', 'none'], ...effects.map((e): [string, string] => [e, e])], t.effect ?? '', (v) => change({ effect: v || null })), strength),
      field('Door shows', select([['full', 'marker, glow, pulse'], ['hover', 'glow on hover'], ['none', 'nothing (hidden)']], t.cue ?? 'full', (v) => change({ cue: v }))),
      field('Button in the section', tick(!!t.button, (v) => change({ button: v }))),
      field('Card on the page without 3D', tick(t.card !== false, (v) => change({ card: v }))),
    );
    const actions = document.createElement('div');
    actions.className = 'row';
    actions.append(button('Remove link', () => { if (confirm(`Remove the link from “${beatName(t.from)}” to “${targetName(t.to)}”?`)) { open = ''; send({ ...name, remove: true }, 'Removed'); } }));
    box.append(actions);
    return box;
  }

  function build() {
    host.replaceChildren();
    section.hidden = !file;
    if (!file) return;
    const here = o.getHome();
    // the links that start in this home (on a page with several homes, others are some other home's)
    const list = linksOf(file).filter((t) => !t.fromHome || t.fromHome === here);
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'hint'; p.textContent = 'No links yet.';
      host.append(p);
    }
    host.append(...list.map(linkRow));
  }

  $('link-add').addEventListener('click', () => {
    const beats = o.beats();
    const from = o.beatHere();
    const all = linksOf(file);
    // to the next section that this one has no link to yet (the one after it first)
    const at = beats.findIndex((b) => b.id === from);
    const to = [...beats.slice(at + 1), ...beats.slice(0, at)].find((b) => !all.some((t) => t.from === from && t.to === b.id));
    if (!to) { say(`“${beatName(from)}” already links to every section.`); return; }
    open = linkKey({ from, to: to.id });
    send({ from, to: to.id }, `Added a link from “${beatName(from)}” to “${to.name}”`);
  });

  return {
    /** call after the home on show changes */
    async homeChanged() {
      say('');
      file = null;
      open = '';
      if (o.recipeOf(o.getHome())?.remake) {
        try {
          const res = await homeRequest(o.getHome());
          if (res.ok) file = res.home ?? null;
        } catch { /* a built studio has no dev server to ask */ }
      }
      build();
    },
    /**
     * The home is about to be built again from this file (any edit, an undo or a redo): the scene's links follow
     * it first, so the new build has the right doors.
     */
    fileWillShow(json: unknown) {
      if (!json || typeof json !== 'object' || !file) return;
      const before = linksOf(file), after = linksOf(json as Json);
      file = json as Json;
      if (JSON.stringify(before) !== JSON.stringify(after)) o.linksChanged(before, after);
    },
    /** the home was built again: the piece lists follow */
    fileShown() { build(); },
  };
}
