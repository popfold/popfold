// Popfold Studio's props inspector: pick a piece (in the list or by clicking it), move or turn it with
// handles or exact numbers, hide it, and save the changes: a listed piece's new place into the home's own file
// (src/home.json), the rest as that file's places. A home made in code has no file, and the studio cannot save it.
// Unsaved changes are kept as a draft in this browser (localStorage) and offered back after a reload.
import * as THREE from 'three';
import type { TransformControls } from 'three/addons/controls/TransformControls.js';
import { applyEntry, applyPlaces, entryFor, placementChange, type Editable, type Places } from '../layout';
import type { HomeRecipe, PropStory } from '../types';
import type { HomeCommand } from '../vite-plugin';
import { shellOf } from '../shell';
import { BUILT_IN_KINDS } from '../pieces';
import { POPUP_KINDS } from '../book';
import { formatHome } from '../home-commands';
import { dropLastEdit, editsInBrowser, forgetEdits, homeRequest, KEEP_MS, KEPT_EVENT, keptEdits, saveSite, saveToRepo, signedIn, signInToSave } from './home-edits';

type Engine = Awaited<ReturnType<typeof import('../engine').startScene>>;

/** "dream-wall" -> "Dream wall" */
const roomLabel = (room: string) => { const t = room.replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** told about every home file the studio shows: before the home is built again from it, and after */
export interface FileWatch { fileWillShow(json: unknown): void; fileShown(): void }

export function createInspector(engine: Engine, getHome: () => string, recipeOf: (id: string) => HomeRecipe | undefined = () => undefined, watchers: FileWatch[] = []) {
  const list = $<HTMLSelectElement>('prop-list');
  const editor = $('prop-editor');
  const inspect = $<HTMLInputElement>('inspect');
  const fields = { px: $<HTMLInputElement>('px'), py: $<HTMLInputElement>('py'), pz: $<HTMLInputElement>('pz'), ry: $<HTMLInputElement>('ry'), ps: $<HTMLInputElement>('ps') };
  const hide = $<HTMLInputElement>('phide');
  const saveBtn = $<HTMLButtonElement>('layout-save');
  const status = $('layout-status');
  const stageEl = document.querySelector('.studio-stage') as HTMLElement;

  /** working layout per home: what is on screen, saved or not */
  const edits: Record<string, Places> = {};
  const saved: Record<string, string> = {};
  let selected: Editable | null = null;
  let gizmo: TransformControls | null = null;
  let gizmoMode: 'translate' | 'rotate' | 'off' = 'translate';
  const box = new THREE.BoxHelper(new THREE.Object3D(), 0xff3d7f);
  box.visible = false;
  (box.material as THREE.LineBasicMaterial).depthTest = false;
  box.renderOrder = 20;
  engine.scene.add(box);

  const editables = (): Editable[] => engine.house.editables;
  const layout = () => (edits[getHome()] ??= structuredClone(engine.layoutOf(getHome())));
  const keyOf = (e: Editable) => e.key;
  const entryScale = (e: Editable) => layout()[keyOf(e)]?.s ?? 1;

  // ----- list of pieces, grouped by room -----
  function refreshList() {
    const cur = selected?.key ?? '';
    list.replaceChildren(new Option('Choose a prop…', ''));
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const e of editables()) {
      let g = groups.get(e.room);
      if (!g) { g = document.createElement('optgroup'); g.label = roomLabel(e.room); groups.set(e.room, g); list.append(g); }
      const label = e.key.slice(e.room.length + 1) + (layout()[e.key] ? ' •' : '');
      g.append(new Option(label, e.key, false, e.key === cur));
    }
  }

  // ----- selection -----
  function select(e: Editable | null) {
    selected = e;
    editor.hidden = !e;
    $('premove').hidden = !e?.listed; // only a piece from the home's list can be taken off it
    showKind();
    showStory();
    list.value = e?.key ?? '';
    box.visible = !!e;
    if (e) box.setFromObject(e.obj);
    attachGizmo();
    showFields();
  }
  function showFields() {
    if (!selected) return;
    const o = selected.obj;
    fields.px.value = o.position.x.toFixed(3);
    fields.py.value = o.position.y.toFixed(3);
    fields.pz.value = o.position.z.toFixed(3);
    fields.ry.value = THREE.MathUtils.radToDeg(o.rotation.y).toFixed(1);
    fields.ps.value = entryScale(selected).toFixed(2);
    hide.checked = !!o.userData.hidden;
  }

  async function attachGizmo() {
    if (!selected || gizmoMode === 'off') { gizmo?.detach(); return; }
    if (!gizmo) {
      const { TransformControls } = await import('three/addons/controls/TransformControls.js');
      gizmo = new TransformControls(engine.camera, engine.canvas);
      gizmo.setSize(0.8);
      engine.scene.add(gizmo.getHelper());
      gizmo.addEventListener('dragging-changed', (ev) => {
        const dragging = (ev as unknown as { value: boolean }).value;
        if (engine.orbit) engine.orbit.enabled = !dragging && engine.flags.orbit;
        if (!dragging) record();
      });
      gizmo.addEventListener('objectChange', () => { if (selected) box.setFromObject(selected.obj); showFields(); });
    }
    if (!selected) return;
    gizmo.setMode(gizmoMode);
    gizmo.showX = gizmo.showZ = gizmoMode === 'translate';
    gizmo.showY = true; // rotate: turn about the vertical only
    gizmo.attach(selected.obj);
  }

  // ----- record a change into the working layout -----
  function record(scale = selected ? entryScale(selected) : 1, hidden = !!selected?.obj.userData.hidden) {
    if (!selected) return;
    const entry = entryFor(selected, scale, hidden);
    if (entry) layout()[selected.key] = entry; else delete layout()[selected.key];
    applyEntry(selected, layout()[selected.key]);
    box.setFromObject(selected.obj);
    showFields();
    refreshList();
    changed();
  }

  // ----- undo and redo: every unsaved change to where pieces stand, per home -----
  // The working layout is small, so each step keeps the whole of it as it was. Saving starts a fresh history:
  // what is saved is in the files, and going back from there is git's job.
  const history: Record<string, { past: string[]; future: string[]; now: string }> = {};
  const historyOf = (id = getHome()) => (history[id] ??= { past: [], future: [], now: JSON.stringify(layout()) });
  const undoBtn = $<HTMLButtonElement>('layout-undo'), redoBtn = $<HTMLButtonElement>('layout-redo');
  function showHistory() {
    // a home kept in a file can also step back through its saves (the dev server keeps them)
    const h = historyOf(), saves = !!recipeOf(getHome())?.remake;
    undoBtn.disabled = !h.past.length && !saves; redoBtn.disabled = !h.future.length && !saves;
  }
  /** note the layout as it is now, if it differs from the last note: one step back becomes possible */
  function remember() {
    const h = historyOf(), cur = JSON.stringify(layout());
    if (cur === h.now) return;
    h.past.push(h.now); if (h.past.length > 200) h.past.shift();
    h.future = []; h.now = cur;
  }
  function travel(back: boolean) {
    const h = historyOf();
    const to = (back ? h.past : h.future).pop();
    if (to === undefined) {
      // nothing unsaved to step through: step through the saves of a home kept in a file instead
      if (recipeOf(getHome())?.remake) {
        status.textContent = back ? 'Undoing the last save…' : 'Redoing…';
        homeFile(back ? { undo: true } : { redo: true }).then((file) => { status.textContent = `${back ? 'Undone' : 'Redone'} in ${file}.`; })
          .catch((err) => { status.textContent = (err as Error).message.slice(0, 140); });
      }
      return;
    }
    (back ? h.future : h.past).push(h.now);
    h.now = to;
    edits[getHome()] = JSON.parse(to) as Places;
    applyPlaces(editables(), layout());
    if (selected) box.setFromObject(selected.obj);
    showFields(); refreshList(); updateBar(); writeDraft(getHome()); showHistory();
    status.textContent = back ? 'Undone.' : 'Redone.';
  }
  undoBtn.addEventListener('click', () => travel(true));
  redoBtn.addEventListener('click', () => travel(false));

  /** after any edit: the bar, the history, and the draft that survives a reload */
  function changed() {
    offer?.remove(); offer = null;
    remember();
    showHistory();
    updateBar();
    writeDraft(getHome());
  }

  function updateBar() {
    const n = Object.keys(layout()).length;
    const dirty = JSON.stringify(layout()) !== (saved[getHome()] ?? JSON.stringify(engine.layoutOf(getHome())));
    $('layout-count').textContent = `${n ? `${n} change${n > 1 ? 's' : ''}` : 'No changes'}${dirty ? ' · unsaved' : ''}`;
    saveBtn.disabled = !dirty;
  }

  // ----- inputs -----
  list.addEventListener('change', () => select(editables().find((e) => e.key === list.value) ?? null));
  for (const [k, input] of Object.entries(fields)) {
    input.addEventListener('change', () => {
      if (!selected) return;
      const v = Number(input.value);
      if (!Number.isFinite(v)) return showFields();
      const o = selected.obj;
      if (k === 'px') o.position.x = v;
      else if (k === 'py') o.position.y = v;
      else if (k === 'pz') o.position.z = v;
      else if (k === 'ry') o.rotation.y = THREE.MathUtils.degToRad(v);
      if (k === 'ps') record(Math.max(0.05, v)); else record();
    });
  }
  hide.addEventListener('change', () => record(undefined, hide.checked));
  $('preset').addEventListener('click', () => {
    if (!selected) return;
    delete layout()[selected.key];
    applyEntry(selected, undefined);
    record(1, false);
  });

  const modeButtons: HTMLButtonElement[] = [];
  for (const [id, label] of [['translate', 'Move'], ['rotate', 'Turn'], ['off', 'Off']] as const) {
    const b = Object.assign(document.createElement('button'), { className: 'seg-btn', type: 'button', textContent: label });
    b.setAttribute('role', 'radio');
    b.dataset.id = id;
    b.addEventListener('click', () => setMode(id));
    $('gizmo-mode').append(b);
    modeButtons.push(b);
  }
  function setMode(m: typeof gizmoMode) {
    gizmoMode = m;
    modeButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === m)));
    attachGizmo();
  }
  setMode('translate');

  // ----- pick in the view -----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  inspect.addEventListener('change', () => {
    engine.flags.pick = !inspect.checked;
    stageEl.classList.toggle('is-inspecting', inspect.checked);
    if (inspect.checked) { engine.flags.idle = false; syncIdleToggle(); }
  });
  engine.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  engine.canvas.addEventListener('pointerup', (e) => {
    if (!inspect.checked || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || gizmo?.dragging) return;
    const r = engine.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, engine.camera);
    const objs = editables().filter((x) => x.obj.visible).map((x) => x.obj);
    for (const hit of ray.intersectObjects(objs, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.editKey) o = o.parent;
      const target: THREE.Object3D | null = o;
      const found = target ? editables().find((x) => x.obj === target) : undefined;
      if (found) { select(found); return; }
    }
  });
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) { e.preventDefault(); travel(!(e.shiftKey || e.key === 'y')); return; }
    if (e.key === 'Escape') select(null);
    else if (e.key === 'w' || e.key === 'W') setMode('translate');
    else if (e.key === 'e' || e.key === 'E') setMode('rotate');
  });
  // the idle-float checkbox in the Scene section mirrors flags.idle
  function syncIdleToggle() {
    const idle = document.querySelector<HTMLInputElement>('#toggles input[data-flag="idle"]');
    if (idle) idle.checked = engine.flags.idle;
  }

  // keep the highlight box on a piece that moves with its drawer
  (function follow() {
    const cur = selected as Editable | null; // set from event handlers
    if (cur && box.visible) box.setFromObject(cur.obj);
    requestAnimationFrame(follow);
  })();

  // ----- take a listed piece off the home's list, or put a new one on it (the home file is rewritten, then the
  // page reloads to build the home again; unsaved changes come back as a draft) -----
  /** run commands on the home's file (the same list `popfold mcp` offers an agent), then show the result */
  const homeFile = async (commands: HomeCommand[] | { undo: true } | { redo: true }) => {
    const body = { ...(Array.isArray(commands) ? { commands } : commands), quiet: true }; // this page shows it: no reload
    const res = await homeRequest(getHome(), body);
    if (!res.ok) throw new Error(res.why ?? 'the home file was not written');
    await showFile(res.home);
    return res.file ?? 'the home file';
  };
  /**
   * Show the home as its file now says: built again from it in place, keeping the view, the story stop and the
   * selection. A home made in code (or a server that sends no file back) reloads the page instead.
   */
  async function showFile(json: unknown) {
    const id = getHome(), recipe = recipeOf(id);
    if (!json || !recipe?.remake) { await reloadWhenReady(); return; }
    for (const w of watchers) w.fileWillShow(json);
    try {
      await showRecipe(recipe.remake(json));
    } catch (err) {
      // a built studio keeps an edit before the home is built from it: one that does not build is taken back, so the
      // studio does not open on a home it cannot show
      if (editsInBrowser() && keptEdits(id)) {
        const back = dropLastEdit(id);
        if (back) await showRecipe(recipe.remake(back)).catch(() => {});
        showKeptNote(id);
      }
      throw err;
    }
    for (const w of watchers) w.fileShown();
  }
  /**
   * Build the home on show again from a changed recipe, in place: the view, the story stop, the selection and the
   * working layout stay. (A home made in code previews a look this way; it is not saved.)
   */
  async function showRecipe(recipe: HomeRecipe) {
    const key = selected?.key;
    await engine.rebuildHome(recipe);
    // the working layout stays as it was (unsaved moves included) and is put on the new build
    applyPlaces(editables(), layout());
    refreshList(); refreshAdder(); updateBar();
    select(editables().find((e) => e.key === key) ?? null);
  }
  /**
   * Load the page again, once the dev server answers. A site's Vite config reads the home file, so writing it
   * makes the server restart; a reload a moment too soon would land on a server that is not there.
   */
  async function reloadWhenReady() {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await wait(400);
    for (let n = 0; n < 60; n++) {
      if (await fetch(location.pathname, { cache: 'no-store' }).then((r) => r.ok, () => false)) break;
      await wait(500);
    }
    location.reload();
  }
  const removeBtn = $<HTMLButtonElement>('premove');
  removeBtn.addEventListener('click', async () => {
    const e = selected;
    if (!e?.listed) return;
    if (!confirm(`Remove "${e.key}" from the home?\n\nIt is taken out of the home file. To park it instead, tick Hidden.`)) return;
    const { id, room, wall } = e.listed.spec;
    try {
      delete layout()[e.key]; writeDraft(getHome());
      const file = await homeFile([{ name: 'remove', args: { id, room, wall: !!wall } }]);
      status.textContent = `Removed from ${file}.`;
    } catch (err) { status.textContent = `Not removed: ${(err as Error).message.slice(0, 140)}`; }
  });

  // ----- the story behind a piece: written here, kept in the home file (a listed piece's on its entry, a model
  // part's under its key in the file's "stories") -----
  const story = {
    box: $<HTMLDetailsElement>('story-edit'), title: $<HTMLInputElement>('story-title'), text: $<HTMLTextAreaElement>('story-text'),
    tags: $<HTMLInputElement>('story-tags'), dot: $<HTMLSelectElement>('story-dot'),
  };
  /** where the selected piece's story is kept, if it can be written here */
  function storyPlace(): { s?: PropStory; wall: boolean; body: (story: object | null) => HomeCommand[] } | null {
    const e = selected;
    if (!e) return null;
    const spec = e.listed?.spec;
    if (spec) return { s: spec.story, wall: !!spec.wall, body: (v) => [{ name: 'story', args: { id: spec.id, room: spec.room, wall: !!spec.wall, story: v } }] };
    const recipe = recipeOf(getHome());
    if (!recipe?.places) return null; // a home made in code: its stories are code too
    return { s: recipe.stories?.[e.key], wall: e.room.endsWith('-wall'), body: (v) => [{ name: 'story', args: { key: e.key, story: v } }] };
  }
  function showStory() {
    const at = storyPlace();
    story.box.hidden = !at;
    if (!at) return;
    const s = at.s;
    $('story-summary').textContent = s ? `Story: ${s.title}` : 'Story (none yet)';
    story.title.value = s?.title ?? '';
    story.text.value = s?.text ?? '';
    story.tags.value = (s?.tags ?? []).join(', ');
    story.dot.value = s?.dot ?? (at.wall ? 'front' : 'top');
    $('story-remove').hidden = !s;
  }
  async function saveStory(value: object | null) {
    const at = storyPlace();
    if (!at) return;
    try {
      const file = await homeFile(at.body(value));
      status.textContent = `${value ? 'Story saved' : 'Story removed'} in ${file}.`;
    } catch (err) { status.textContent = `Not saved: ${(err as Error).message.slice(0, 140)}`; }
  }
  $('story-save').addEventListener('click', () => saveStory({
    title: story.title.value, text: story.text.value, tags: story.tags.value.split(',').map((t) => t.trim()).filter(Boolean), dot: story.dot.value,
  }));
  $('story-remove').addEventListener('click', () => { if (confirm('Take the story off this piece?')) saveStory(null); });

  // ----- what a listed piece is: another kind in its place, keeping where it stands and its story -----
  const kindSel = $<HTMLSelectElement>('pkind');
  /** the kinds a home can build: a book's are its pop-ups and the site's own kinds, the rest also take models and built-ins */
  const kindsOf = (recipe: HomeRecipe | undefined) => !recipe?.pieces ? []
    : recipe.book ? [...new Set([...Object.keys(recipe.kinds ?? {}), ...POPUP_KINDS])]
    : [...new Set([...Object.keys(recipe.kinds ?? {}), ...recipe.props, ...BUILT_IN_KINDS])];
  function showKind() {
    const spec = selected?.listed?.spec;
    const kinds = kindsOf(recipeOf(getHome()));
    $('pkind-row').hidden = !spec || !kinds.length;
    if (!spec) return;
    kindSel.replaceChildren(...[...new Set([spec.kind, ...kinds])].map((k) => new Option(k, k)));
    kindSel.value = spec.kind;
  }
  kindSel.addEventListener('change', async () => {
    const spec = selected?.listed?.spec;
    if (!spec || kindSel.value === spec.kind) return;
    try {
      const file = await homeFile([{ name: 'place', args: { id: spec.id, room: spec.room, wall: !!spec.wall, change: { kind: kindSel.value } } }]);
      status.textContent = `Now a ${kindSel.value}, in ${file}.`;
    } catch (err) { status.textContent = `Not changed: ${(err as Error).message.slice(0, 140)}`; showKind(); }
  });

  const adder = $<HTMLDetailsElement>('add-piece');
  /** offer to add pieces when the home has a list and kinds to add from */
  function refreshAdder() {
    const recipe = recipeOf(getHome());
    const kinds = kindsOf(recipe);
    const rooms = recipe ? shellOf(recipe).rooms(recipe) : [];
    adder.hidden = !recipe?.pieces || !kinds.length || !rooms.length;
    $('add-kind').replaceChildren(...kinds.map((k) => new Option(k, k)));
    $('add-room').replaceChildren(...rooms.map((r) => new Option(roomLabel(r), r)));
  }
  /** add a piece to the home file and select it, so it can be placed at once. Says how it went, in words */
  async function addPiece(id: string, room: string, kind: string, wall: boolean): Promise<string> {
    const kinds = kindsOf(recipeOf(getHome()));
    if (!kinds.includes(kind)) return (status.textContent = `Not added: this home cannot build a ${kind.replace(/^builtin\//, '')}. It takes ${kinds.join(', ') || 'no pieces from here'}.`);
    try {
      const file = await homeFile([{ name: 'add', args: { id, room, kind, wall } }]);
      status.textContent = `Added ${id} to ${file}.`;
      const made = editables().find((x) => x.listed?.spec.id === id && x.listed.spec.room === room && !!x.listed.spec.wall === wall);
      if (made) select(made);
    } catch (err) { status.textContent = `Not added: ${(err as Error).message.slice(0, 140)}`; }
    return status.textContent;
  }
  /** an id for a new piece of `kind` in `room` that no piece there has: "sofa", then "sofa-2" */
  function freeId(kind: string, room: string, wall: boolean) {
    const base = (kind.split('/').pop() ?? kind).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'piece';
    const taken = new Set((recipeOf(getHome())?.pieces ?? []).filter((p) => p.room === room && !!p.wall === wall).map((p) => p.id));
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    return id;
  }
  $('add-do').addEventListener('click', () => addPiece($<HTMLInputElement>('add-id').value.trim(), $<HTMLSelectElement>('add-room').value, $<HTMLSelectElement>('add-kind').value, $<HTMLInputElement>('add-wall').checked));

  // ----- save / export -----
  const json = () => `${JSON.stringify(layout(), null, 2)}\n`;
  function download() {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([json()], { type: 'application/json' })),
      download: `${getHome()}-places.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  saveBtn.addEventListener('click', async () => {
    const id = getHome();
    status.textContent = 'Saving…';
    try {
      // listed pieces that moved, turned or changed size: their new place belongs in the home's own file
      const moved = editables().flatMap((e) => { const change = placementChange(e, entryScale(e)); return change && e.listed ? [{ e, spec: e.listed.spec, change }] : []; });
      let wrote = '';
      // only a home made from its file can be saved: the rest of its changes are kept there too, as its places
      if (!recipeOf(id)?.places) {
        download();
        status.textContent = `This home is made in code, so the studio cannot save it. Downloaded its changes as ${id}-places.json: give them to the recipe as \`places\`, or keep the home in a file (src/home.json).`;
        updateBar();
        return;
      }
      // a listed piece's place goes on its own line in the file; whatever else changed is the file's places
      const rest = structuredClone(layout());
      for (const { e } of moved) delete rest[e.key];
      const commands: HomeCommand[] = moved.map(({ spec, change }) => ({ name: 'place', args: { id: spec.id, room: spec.room, wall: !!spec.wall, change } }));
      commands.push({ name: 'places', args: { places: rest } });
      const res = await homeRequest(id, { commands, quiet: true });
      if (!res.ok) throw new Error(res.why ?? 'the home file was not written');
      // where each piece stands now is where it belongs: its entry says so, and so does this page
      for (const { e, spec, change } of moved) {
        Object.assign(spec, change);
        e.home.p.copy(e.obj.position); e.home.r.copy(e.obj.rotation); e.home.s.copy(e.pop?.scale ?? e.obj.scale);
        e.home.hide = !!e.obj.userData.hidden;
      }
      edits[id] = rest;
      const recipe = recipeOf(id);
      if (recipe) recipe.places = structuredClone(rest);
      wrote = `to ${res.file}`;
      saved[id] = JSON.stringify(layout());
      writeDraft(id); // now matches the files, so this clears it
      history[id] = { past: [], future: [], now: JSON.stringify(layout()) }; showHistory();
      refreshList();
      status.textContent = editsInBrowser()
        ? `Saved ${wrote}. Download the home file to put it in the site.`
        : `Saved ${wrote}. The site uses it on the next reload.`;
    } catch (err) {
      download();
      status.textContent = `Couldn't save here (${(err as Error).message.slice(0, 80)}). Downloaded ${id}-places.json instead: its entries are the home file's places (a moved listed piece is in it too, by key).`;
    }
    updateBar();
  });
  $('layout-download').addEventListener('click', download);

  // ----- drafts: unsaved changes kept in this browser, offered back after a reload -----
  interface Draft { layout: Places; base: string; at: number }
  const draftKey = (id: string) => `popfold:draft:${location.pathname}:${id}`;
  const baseOf = (id: string) => saved[id] ?? JSON.stringify(engine.layoutOf(id));
  let offer: HTMLElement | null = null;

  function readDraft(id: string): Draft | null {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey(id)) ?? 'null') as Draft | null;
      if (d && typeof d.at === 'number' && Date.now() - d.at > KEEP_MS) { localStorage.removeItem(draftKey(id)); return null; }
      return d && typeof d.layout === 'object' && !Array.isArray(d.layout) && typeof d.at === 'number' ? d : null;
    } catch { return null; }
  }
  function writeDraft(id: string) {
    try {
      const cur = JSON.stringify(edits[id] ?? engine.layoutOf(id));
      if (cur === baseOf(id)) localStorage.removeItem(draftKey(id));
      else localStorage.setItem(draftKey(id), JSON.stringify({ layout: edits[id], base: baseOf(id), at: Date.now() } satisfies Draft));
    } catch { /* storage full or blocked: drafts are a convenience */ }
  }
  function ago(t: number) {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
  }
  function offerDraft(id: string) {
    const d = readDraft(id);
    if (!d || JSON.stringify(d.layout) === JSON.stringify(layout())) return;
    const n = Object.keys(d.layout).length;
    const stale = d.base !== baseOf(id) ? ' The saved layout has changed since then.' : '';
    offer = document.createElement('div');
    offer.className = 'draft-offer';
    const text = Object.assign(document.createElement('p'), {
      textContent: `Unsaved changes from ${ago(d.at)} (${n} piece${n === 1 ? '' : 's'}), kept in this browser.${stale}`,
    });
    const btn = (label: string, fn: () => void) => {
      const b = Object.assign(document.createElement('button'), { className: 'chip', type: 'button', textContent: label });
      b.addEventListener('click', fn);
      return b;
    };
    const actions = document.createElement('div');
    actions.className = 'layout-actions';
    actions.append(
      btn('Restore', () => {
        if (getHome() !== id) return;
        edits[id] = structuredClone(d.layout);
        applyPlaces(editables(), layout());
        select(null);
        refreshList();
        changed();
        status.textContent = 'Restored. Save to write it to the home file.';
      }),
      btn('Discard', () => {
        try { localStorage.removeItem(draftKey(id)); } catch { /* nothing to remove */ }
        offer?.remove(); offer = null;
      }),
    );
    offer.append(text, actions);
    status.before(offer);
  }

  // ----- a built site: edits are kept in this browser for a day (home-edits.ts). Shown again when the studio opens,
  // with the way to take the edited file away, or to go back to the one the site was built with -----
  let keptBox: HTMLElement | null = null;
  function showKeptNote(id: string) {
    const k = keptEdits(id);
    keptBox?.remove(); keptBox = null;
    if (!k || getHome() !== id) return;
    const until = new Date(k.at + KEEP_MS).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    keptBox = document.createElement('div');
    keptBox.className = 'draft-offer';
    const text = Object.assign(document.createElement('p'), {
      textContent: `Your edits to this home are kept in this browser until ${until} (a day after the last one). This site was built without them: download the home file to put them in it.`,
    });
    const btn = (label: string, fn: () => void) => {
      const b = Object.assign(document.createElement('button'), { className: 'chip', type: 'button', textContent: label });
      b.addEventListener('click', fn);
      return b;
    };
    const actions = document.createElement('div');
    actions.className = 'layout-actions';
    actions.append(
      btn('Download the home file', () => {
        const now = keptEdits(id);
        if (!now) return;
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(new Blob([formatHome(now.home)], { type: 'application/json' })),
          download: `${id}.home.json`,
        });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }),
      btn('Start over', () => {
        if (!confirm('Forget your edits to this home? The studio goes back to the home this site was built with.')) return;
        forgetEdits(id);
        location.reload();
      }),
    );
    keptBox.append(text, actions);
    status.before(keptBox);
    // a site with a save service: the edits can go into its repository instead of a download
    const box = keptBox;
    void saveSite().then((site) => {
      if (!site || keptBox !== box) return;
      const now = keptEdits(id);
      const pending = (now?.log ?? []).length;
      if (now?.saved && !pending) {
        text.textContent = `Saved to ${now.saved.repo} on ${now.saved.branch}${now.saved.pullRequest ? ', in a pull request' : ''}. The site shows it once it is built again.`;
        if (now.saved.pullRequest) text.append(' ', Object.assign(document.createElement('a'), { href: now.saved.pullRequest, target: '_blank', rel: 'noopener', textContent: 'Open the pull request' }));
      } else {
        text.textContent = `${pending} edit${pending === 1 ? '' : 's'} to this home ${pending === 1 ? 'is' : 'are'} kept in this browser until ${until}. Save them to ${site.repo}, or download the home file.`;
      }
      if (!pending) return;
      const who = signedIn(site);
      actions.prepend(btn(who ? `Save to GitHub as ${who.login}` : 'Sign in with GitHub to save', async () => {
        if (!signedIn(site)) {
          const login = await signInToSave(site).catch((err: Error) => { status.textContent = err.message; return null; });
          if (!login) return;
        }
        status.textContent = `Saving to ${site.repo}…`;
        const res = await saveToRepo(site, id);
        if (!res.ok) { status.textContent = `Not saved: ${res.why}`; if (res.signIn) showKeptNote(id); return; }
        status.textContent = `Saved to ${site.repo} on ${res.branch}.`;
        if (res.home) await showFile(res.home).catch(() => {}); // the newest file, with anyone else's edits in it
        showKeptNote(id);
      }));
    });
  }
  /** a built studio opening a home it has edits for: show the home as they left it */
  async function showKept(id: string) {
    const k = keptEdits(id);
    if (!k || !recipeOf(id)?.remake) return;
    await showFile(k.home);
    showKeptNote(id);
  }
  if (editsInBrowser()) addEventListener(KEPT_EVENT, (e) => showKeptNote((e as CustomEvent<string>).detail));

  return {
    /** the key of the piece selected, if one is */
    get selectedKey() { return selected?.key; },
    /** add a piece of a kind to a room, with an id made from the kind; it is selected once it is built */
    add: (kind: string, room: string, wall = false) => addPiece(freeId(kind, room, wall), room, kind, wall),
    /** show the home as its file now says (built again in place, or the page reloaded for a home made in code) */
    showFile,
    showRecipe,
    /** call after the home changes */
    homeChanged() {
      offer?.remove(); offer = null;
      // the house on screen shows this home's working layout (it may be a fresh build or a cached one)
      applyPlaces(editables(), layout());
      select(null); refreshList(); refreshAdder(); updateBar(); showHistory(); status.textContent = '';
      offerDraft(getHome());
      keptBox?.remove(); keptBox = null;
      if (editsInBrowser()) void showKept(getHome());
    },
  };
}
