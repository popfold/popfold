// The studio's Look section: a home's colours and surfaces, its emblem, a tower's floor colours and signs and its
// building's colours, and a diorama's model colours by material (its art and cover are drawn in code). For a home kept in a file, each change is written into the file and shown at once (the
// home is built again from the file, without a reload). A home made in code keeps its look in code: its colours
// are shown and can be tried here, built again in place, and the changes copied as code for its recipe.
import type { HomeRecipe } from '../types';

type Json = Record<string, unknown>;
const PATTERNS = ['checker', 'stripes', 'dots', 'waves', 'terrazzo'];
const COLOURS: [string, string][] = [['base', 'Case'], ['lid', 'Lid'], ['heart', 'Heart'], ['leftSlab', 'Left drawer'], ['rightSlab', 'Right drawer']];
const SURFACES: [string, string][] = [['centerFloor', 'Centre floor'], ['lidPaper', 'Lid lining'], ['leftFloor', 'Left floor'], ['leftWall', 'Left wall'], ['rightFloor', 'Right floor'], ['rightWall', 'Right wall']];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** a colour input only takes #rrggbb */
const hex = (c: unknown) => {
  const s = String(c ?? '');
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${[...s.slice(1)].map((x) => x + x).join('')}`;
  return '#888888';
};
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * What the Look section can show of a home made in code, in the shape of a home file: its plain colours (a
 * surface drawn by a function has none to show), its emblem, a tower's floors and building.
 */
export function lookOfRecipe(r: HomeRecipe): Json {
  const out: Json = {};
  if (r.look) {
    out.look = Object.fromEntries(COLOURS.filter(([k]) => typeof (r.look as unknown as Json)[k] === 'string').map(([k]) => [k, (r.look as unknown as Json)[k]]));
    out.emblem = { ...r.emblem };
  }
  if (r.tower) {
    out.floors = r.tower.floors.map((f) => ({ id: f.id, label: f.label, color: f.color }));
    out.tower = Object.fromEntries(Object.entries({ wall: r.tower.wall, slab: r.tower.slab, spine: r.tower.spine?.color }).filter(([, v]) => v !== undefined));
  }
  if (r.diorama) out.diorama = { paint: { ...r.diorama.paint } };
  return out;
}

/** A recipe with a Look change (the `look` command's arguments) made to it: what a home made in code shows. */
export function withLook(r: HomeRecipe, change: Json): HomeRecipe {
  const next: HomeRecipe = { ...r };
  if (isObj(change.look) && r.look) next.look = { ...r.look, ...change.look };
  if (isObj(change.emblem)) next.emblem = { ...r.emblem, ...change.emblem };
  if (r.tower && (Array.isArray(change.floors) || isObj(change.tower))) {
    const floors = (Array.isArray(change.floors) ? change.floors : []) as { id: string; color?: string; label?: string }[];
    const t = (isObj(change.tower) ? change.tower : {}) as { wall?: string | null; slab?: string | null; spine?: string | null };
    const tower = { ...r.tower, floors: r.tower.floors.map((f) => { const c = floors.find((x) => x.id === f.id); return c ? { ...f, ...(c.color ? { color: c.color } : {}), ...(c.label ? { label: c.label } : {}) } : f; }) };
    if (t.wall) tower.wall = t.wall;
    if (t.slab) tower.slab = t.slab;
    if (t.spine === null) delete tower.spine; else if (t.spine) tower.spine = { ...r.tower.spine, color: t.spine };
    next.tower = tower;
  }
  if (isObj(change.paint) && r.diorama) {
    const paint = { ...r.diorama.paint };
    for (const [k, v] of Object.entries(change.paint)) { if (v === null) delete paint[k]; else paint[k] = v as string; }
    next.diorama = { ...r.diorama, paint };
  }
  return next;
}

/** fold one change into the ones made so far: field by field, a floor by its id */
function mergeChange(into: Json, change: Json) {
  for (const [k, v] of Object.entries(change)) {
    if (k === 'floors' && Array.isArray(v)) {
      const floors = (into.floors ?? []) as Json[];
      for (const f of v as Json[]) { const at = floors.find((x) => x.id === f.id); if (at) Object.assign(at, f); else floors.push({ ...f }); }
      into.floors = floors;
    } else if (isObj(v)) into[k] = { ...(isObj(into[k]) ? into[k] : {}), ...v };
    else into[k] = v;
  }
}

/** the changes made to a home made in code, as code to put in its recipe */
export function lookAsCode(id: string, changes: Json): string {
  const lines = [`// The look of "${id}", changed in Popfold Studio: put these into its recipe`];
  if (isObj(changes.look)) lines.push(`look: { ...look, ${Object.entries(changes.look).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')} },`);
  if (isObj(changes.emblem)) lines.push(`emblem: { ${Object.entries(changes.emblem).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')} },`);
  if (Array.isArray(changes.floors)) for (const f of changes.floors as Json[]) lines.push(`// tower.floors, the floor "${String(f.id)}": ${Object.entries(f).filter(([k]) => k !== 'id').map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')}`);
  if (isObj(changes.paint)) lines.push(`// diorama.paint: ${Object.entries(changes.paint).map(([k, v]) => `${k}: ${v === null ? "the model's own" : JSON.stringify(v)}`).join(', ')}`);
  if (isObj(changes.tower)) lines.push(`// tower: ${Object.entries(changes.tower).map(([k, v]) => (k === 'spine' ? (v === null ? 'no spine' : `spine: { color: ${JSON.stringify(v)} }`) : `${k}: ${JSON.stringify(v)}`)).join(', ')}`);
  return lines.join('\n');
}

/** a material of a diorama's model, and the colour it shows now */
export interface ModelMaterial { name: string; color: string }

export function createLookEditor(getHome: () => string, recipeOf: (id: string) => HomeRecipe | undefined, show: { file: (json: unknown) => Promise<void>; recipe: (r: HomeRecipe) => Promise<void> }, materials: () => ModelMaterial[] = () => []) {
  const section = $('look'), host = $('look-fields'), note = $('look-note');
  const say = (text: string) => { note.textContent = text; note.hidden = !text; };
  /** the home's file (or, for a home made in code, what can be shown of it in the same shape) */
  let file: Json | null = null;
  /** for a home made in code: the recipe as the code made it, and the changes tried since */
  let code: { original: HomeRecipe; changes: Json } | null = null;
  /** the same, for every home made in code that was tried: kept while the studio is open */
  const tried = new Map<string, { original: HomeRecipe; changes: Json }>();

  async function send(change: Json) {
    if (code) return tryOut(change);
    say('Saving…');
    try {
      const body = { commands: [{ name: 'look', args: change }], quiet: true };
      const r = await fetch(`/__popfold/home/${getHome()}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const res = await r.json() as { ok: boolean; why?: string; file?: string; home?: Json };
      if (!res.ok) throw new Error(res.why ?? 'not saved');
      await show.file(res.home); // (fileWillShow follows from it)
      say(`Saved in ${res.file}.`);
    } catch (err) { say(`Not saved: ${(err as Error).message.slice(0, 160)}`); }
  }

  /** a home made in code: build it again with the change, and keep the change to copy as code */
  async function tryOut(change: Json) {
    const r = recipeOf(getHome());
    if (!r || !code) return;
    const next = withLook(r, change);
    mergeChange(code.changes, change);
    await show.recipe(next);
    file = lookOfRecipe(next);
    build();
  }

  const row = (label: string, ...kids: HTMLElement[]) => {
    const r = document.createElement('label');
    r.className = 'look-row';
    const s = document.createElement('span'); s.textContent = label;
    r.append(s, ...kids);
    return r;
  };
  const colour = (value: unknown, onPick: (v: string) => void) => {
    const i = document.createElement('input');
    i.type = 'color'; i.value = hex(value);
    i.addEventListener('change', () => onPick(i.value)); // once the picker closes, not on every drag
    return i;
  };
  const text = (value: unknown, onSet: (v: string) => void) => {
    const i = document.createElement('input');
    i.type = 'text'; i.value = String(value ?? '');
    i.addEventListener('change', () => onSet(i.value));
    return i;
  };
  const button = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  function build() {
    host.replaceChildren();
    const look = file?.look as Json | undefined, floors = file?.floors as Json[] | undefined, diorama = file?.diorama as Json | undefined;
    section.hidden = !file || (!look && !floors && !diorama);
    if (section.hidden) return;
    if (look) {
      for (const [k, label] of COLOURS) if (k in look) host.append(row(label, colour(look[k], (v) => send({ look: { [k]: v } }))));
      for (const [k, label] of SURFACES) {
        const s = look[k];
        if (typeof s === 'string') {
          // a plain colour; a pattern can be chosen instead
          const pick = document.createElement('select');
          pick.append(new Option('plain', ''), ...PATTERNS.map((p) => new Option(p, p)));
          pick.addEventListener('change', () => send({ look: { [k]: pick.value ? { pattern: pick.value, colors: [s, '#ffffff'] } : s } }));
          host.append(row(label, pick, colour(s, (v) => send({ look: { [k]: v } }))));
        } else if (s && typeof s === 'object') {
          const p = s as { pattern: string; colors: string[] };
          const pick = document.createElement('select');
          pick.append(new Option('plain', ''), ...PATTERNS.map((x) => new Option(x, x)));
          pick.value = p.pattern;
          pick.addEventListener('change', () => send({ look: { [k]: pick.value ? { ...p, pattern: pick.value } : p.colors[0] } }));
          host.append(row(label, pick, ...p.colors.map((c, n) => colour(c, (v) => send({ look: { [k]: { ...p, colors: p.colors.map((x, m) => (m === n ? v : x)) } } })))));
        }
      }
      const emblem = (file?.emblem ?? {}) as Json;
      const setEmblem = (k: string, v: string) => send({ emblem: { ...emblem, [k]: v.trim() } });
      host.append(row('Lid title', text(emblem.title, (v) => setEmblem('title', v))));
      host.append(row('Lid subtitle', text(emblem.subtitle, (v) => setEmblem('subtitle', v))));
    }
    for (const f of floors ?? []) {
      host.append(row(`Floor ${String(f.id)}`, text(f.label, (v) => send({ floors: [{ id: f.id, label: v }] })), colour(f.color, (v) => send({ floors: [{ id: f.id, color: v }] }))));
    }
    if (floors) {
      // the building: its walls, slabs and the glowing pipe beside the lift (the engine's own colours until set)
      const t = (file?.tower ?? {}) as Json;
      host.append(row('Walls', colour(t.wall ?? '#1A1830', (v) => send({ tower: { wall: v } }))));
      host.append(row('Slabs', colour(t.slab ?? '#24223D', (v) => send({ tower: { slab: v } }))));
      const pipe = document.createElement('input');
      pipe.type = 'checkbox'; pipe.checked = !!t.spine; pipe.title = 'A glowing pipe beside the lift, with a branch into every floor';
      pipe.addEventListener('change', () => send({ tower: { spine: pipe.checked ? String(t.spine ?? floors[0]?.color ?? '#3EE6FF') : null } }));
      const pipeColour = colour(t.spine ?? floors[0]?.color, (v) => send({ tower: { spine: v } }));
      pipeColour.disabled = !t.spine;
      host.append(row('Pipe', pipe, pipeColour));
    }
    if (diorama) {
      // the model's own colours, by material; a painted one can be given its own colour back
      const paint = (isObj(diorama.paint) ? diorama.paint : {}) as Record<string, string>;
      const list = materials();
      if (!list.length) {
        const wait = document.createElement('p');
        wait.className = 'hint'; wait.textContent = 'The model\'s materials show here once it has loaded.';
        host.append(wait);
      }
      for (const m of list) {
        const kids: HTMLElement[] = [colour(paint[m.name] ?? m.color, (v) => send({ paint: { [m.name]: v } }))];
        if (paint[m.name]) { const back = button('×', () => send({ paint: { [m.name]: null } })); back.title = 'The model\'s own colour'; back.setAttribute('aria-label', `Give ${m.name} the model's own colour`); kids.unshift(back); }
        host.append(row(m.name.replace(/_/g, ' '), ...kids));
      }
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'The model\'s colours, by material. Its art and the cover are drawn in code.';
      host.append(hint);
    }
    if (code) {
      // a home made in code: what was tried here is not saved; it is copied as code for the recipe
      const tried = Object.keys(code.changes).length > 0;
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = tried
        ? 'This home is made in code, so these changes are not saved: copy them into its recipe.'
        : 'This home is made in code: try its colours here, then copy the changes into its recipe. Its surfaces are drawn in code.';
      host.append(hint);
      if (tried) {
        const snippet = document.createElement('pre');
        snippet.className = 'look-code';
        snippet.textContent = lookAsCode(getHome(), code.changes);
        const actions = document.createElement('div');
        actions.className = 'row';
        actions.append(
          button('Copy as code', () => navigator.clipboard.writeText(snippet.textContent ?? '').then(() => say('Copied.'), () => say('Select the code and copy it.'))),
          button('Put back', async () => { if (!code) return; const { original } = code; code.changes = {}; await show.recipe(original); file = lookOfRecipe(original); say(''); build(); }),
        );
        host.append(snippet, actions);
      }
    }
  }

  return {
    /** the home is about to be built again from this file (any edit, an undo or a redo): the fields follow it */
    fileWillShow(json: unknown) {
      if (!json || typeof json !== 'object' || !file || code) return;
      file = json as Json;
      build();
    },
    /** the home was built again: a diorama's materials are read from the new build */
    fileShown() { if (file?.diorama) build(); },
    /** call after the home on show changes */
    async homeChanged() {
      say('');
      file = null;
      code = null;
      const recipe = recipeOf(getHome());
      if (recipe?.remake) {
        // a home kept in a file: its look is edited in the file
        try {
          const res = await fetch(`/__popfold/home/${getHome()}`).then((r) => r.json()) as { ok: boolean; home?: Json };
          if (res.ok) file = res.home ?? null;
        } catch { /* a built studio has no dev server to ask */ }
      } else if (recipe) {
        // a home made in code: what can be shown of it, to try out (a change made here before stays tried)
        code = tried.get(recipe.id) ?? { original: recipe, changes: {} };
        tried.set(recipe.id, code);
        file = lookOfRecipe(recipe);
      }
      build();
    },
  };
}
