// The studio's beat controls, under the story's stops: rename the beat the story is on, move it earlier or later,
// take it out, or add one after it. A beat is one <section class="stage"> of the page too, so each is a command
// (add-beat, move-beat, remove-beat, beat) that edits the home file and the page together. The studio then shows
// the new story in place: the file it gets back (from an edit, an undo or a redo) gives the stops and the scene.
import type { BeatData } from '../keyframes';
import type { HomeRecipe } from '../types';
import { homeRequest } from './home-edits';

type Json = Record<string, unknown>;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function createBeatEditor(o: {
  getHome: () => string;
  recipeOf: (id: string) => HomeRecipe | undefined;
  /** build the home again from the file a save sent back (the studio then calls fileWillShow and fileShown) */
  showFile: (json: unknown) => Promise<void>;
  /** the beat the story is on, by its place in the story */
  here: () => number;
  /** the file's beats are another story: show it, on this story stop */
  storyChanged: (beats: BeatData[], stage?: number) => void;
}) {
  const box = $('beat-edit'), note = $('beat-note'), name = $<HTMLInputElement>('beat-name');
  const say = (text: string) => { note.textContent = text; note.hidden = !text; };
  /** the beats as the file has them (null: this home's file keeps no beats, or it has no file) */
  let beats: BeatData[] | null = null;
  /** where the story goes once the save comes back: the beat that was edited */
  let next: number | undefined;

  async function send(command: { name: string; args: Json }, stage: number, done: string) {
    say('Saving…');
    try {
      const res = await homeRequest(o.getHome(), { commands: [command], quiet: true });
      if (!res.ok) throw new Error(res.why ?? 'not saved');
      next = stage;
      await o.showFile(res.home);
      say(`${done} in ${res.file}${res.page ? ` and ${res.page}` : ''}.`);
    } catch (err) { say(`Not saved: ${(err as Error).message.slice(0, 200)}`); }
    next = undefined;
  }

  /** show the beat the story is on */
  function show() {
    const n = o.here(), b = beats?.[n];
    box.hidden = !b;
    if (!b || !beats) return;
    if (document.activeElement !== name) name.value = b.name;
    $<HTMLButtonElement>('beat-left').disabled = n === 0;
    $<HTMLButtonElement>('beat-right').disabled = n === beats.length - 1;
    $<HTMLButtonElement>('beat-remove').disabled = beats.length === 1;
    $('beat-add-summary').textContent = `Add a beat after “${b.name}”`;
  }

  const at = () => { const n = o.here(); return { n, b: beats?.[n] }; };
  name.addEventListener('change', () => {
    const { n, b } = at();
    if (b && name.value.trim() && name.value.trim() !== b.name) send({ name: 'beat', args: { id: b.id, name: name.value.trim() } }, n, 'Renamed');
  });
  $('beat-left').addEventListener('click', () => { const { n, b } = at(); if (b && n > 0) send({ name: 'move-beat', args: { id: b.id, to: n - 1 } }, n - 1, `Moved “${b.name}” earlier`); });
  $('beat-right').addEventListener('click', () => { const { n, b } = at(); if (b && beats && n < beats.length - 1) send({ name: 'move-beat', args: { id: b.id, to: n + 1 } }, n + 1, `Moved “${b.name}” later`); });
  $('beat-remove').addEventListener('click', () => {
    const { n, b } = at();
    if (!b || !confirm(`Remove the beat “${b.name}”?\n\nIts section (id "${b.id}") is taken out of the page with its words, and so are the links that start from it or lead to it.`)) return;
    send({ name: 'remove-beat', args: { id: b.id } }, Math.max(0, n - 1), `Removed “${b.name}”`);
  });
  $('beat-add-do').addEventListener('click', () => {
    const { n } = at();
    const id = $<HTMLInputElement>('beat-add-id'), label = $<HTMLInputElement>('beat-add-name');
    if (!id.value.trim() || !label.value.trim()) { say('A new beat needs an id (its section\'s) and a name.'); return; }
    send({ name: 'add-beat', args: { id: id.value.trim(), name: label.value.trim(), at: n + 1 } }, n + 1, `Added “${label.value.trim()}”`);
    id.value = ''; label.value = '';
  });

  return {
    /** call when the story stop changes */
    show,
    /** call after the home on show changes: only a home kept in a file, with its beats there, has these controls */
    async homeChanged() {
      beats = null;
      say('');
      if (o.recipeOf(o.getHome())?.remake) {
        try {
          const res = await homeRequest(o.getHome());
          if (res.ok && Array.isArray(res.home?.beats) && res.home.beats.length) beats = res.home.beats as BeatData[];
        } catch { /* a built studio has no dev server to ask */ }
      }
      show();
    },
    /** the home is about to be built again from this file: if its beats changed (an edit, an undo, a redo), so has the story */
    fileWillShow(json: unknown) {
      const now = (json as Json | null)?.beats;
      if (!beats || !Array.isArray(now) || !now.length) return;
      const changed = JSON.stringify(now) !== JSON.stringify(beats);
      beats = now as BeatData[];
      if (changed) o.storyChanged(beats, next);
    },
    fileShown() { show(); },
  };
}
