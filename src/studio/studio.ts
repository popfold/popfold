// Popfold Studio: a workbench for a site's homes. Same engine as the sites, but the scroll position, folds, camera
// and scene switches are driven from the panel instead of the page. A site mounts it from its own studio.html:
//
//   mountStudio({ homes, beats, avatar, siteUrl: './' })
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/dm-sans';
import './studio.css';
import { startScene, type Lighting } from '../engine';
import { beatsOf, type Beat, type State } from '../keyframes';
import { createStoryCard } from '../story-card';
import { linkKey, transitionTarget, type Transition } from '../transitions';
import type { HomeRecipe } from '../types';
import { shellOf } from '../shell';
import { createInspector } from './inspector';
import { createBeatEditor } from './beats';
import { createLinkEditor } from './links';
import { createLookEditor } from './look';
import { createLibrary } from './library';
import { studioMarkup } from './markup';

export interface StudioOptions {
  /** every home on the bench */
  homes: HomeRecipe[];
  /** the story the scroll slider plays (the site's beats); their names label the stop buttons */
  beats: Beat[];
  /**
   * The site's links, as for startScene: their doors show and can be clicked (the story goes to the section they
   * lead to), and the Links group edits those kept in a home file.
   */
  transitions?: Transition[];
  /** the guide figure, as for startScene (default: none) */
  avatar?: { url?: string } | false;
  /** the stage a click on the centre / left / right room jumps to */
  pickStages?: { center: number; left: number; right: number };
  /** where the panel's "Site" link goes */
  siteUrl?: string;
  /** the site's lighting, as for startScene, so the studio and its stills look like the site (each home's time of day is its own `mood`) */
  lighting?: Lighting;
  /** the colour of the story dots, as for startScene */
  storyDot?: string;
  /** where the site's files are as seen from this page, as for startScene (a studio page in a sub-folder passes '../') */
  base?: string;
  /** restyle the studio's panel: any of its colours (CSS colours) */
  theme?: Partial<Record<'ink' | 'inkSoft' | 'paper' | 'line' | 'accent' | 'accentSoft' | 'butter' | 'onButter', string>>;
}

export function mountStudio(o: StudioOptions) {
document.body.className = 'studio';
for (const [k, v] of Object.entries(o.theme ?? {})) document.documentElement.style.setProperty(`--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, v);
document.body.innerHTML = studioMarkup(o.siteUrl ?? './');
const HOMES = o.homes;
/** the story, as the studio shows it: the site's beats, then the home file's after the studio changes them */
let beats = [...o.beats];
const homeById = (id: string) => HOMES.find((h) => h.id === id) ?? HOMES[0];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene');
const stageEl = document.querySelector('.studio-stage') as HTMLElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** the last story stop */
const last = () => beats.length - 1;

// ---------- state (mirrored into the URL so a view can be shared) ----------
const q = new URLSearchParams(location.search);
/** a home's own time of day, and the backdrop it is best seen on (a night home on a night backdrop) */
const moodOf = (id: string) => homeById(id).mood ?? 'day';
const backdropOf = (id: string) => (moodOf(id) === 'evening' ? 'night' : 'paper');
const firstHome = homeById(q.get('home') ?? '').id;
const ui = {
  home: firstHome,
  stage: Math.min(last(), Math.max(0, Number(q.get('stage') ?? 1) || 0)),
  cam: q.get('cam') ?? 'story',
  light: (q.get('light') === 'evening' || q.get('light') === 'day' ? q.get('light') : moodOf(firstHome)) as 'day' | 'evening',
  backdrop: q.get('bg') ?? backdropOf(firstHome),
  fold: q.get('fold') as 'compact' | 'book' | null,
  playing: false,
};

// ---------- camera presets (house coordinates; same fields as the keyframes) ----------
type Cam = Pick<State, 'cx' | 'cy' | 'cz' | 'tx' | 'ty' | 'tz'>;
const cam = (c: [number, number, number], t: [number, number, number]): Cam => ({ cx: c[0], cy: c[1], cz: c[2], tx: t[0], ty: t[1], tz: t[2] });
type CamPreset = { id: string; label: string; cam?: Cam };
type FoldControl = { key: string; label: string; min?: number; max?: number; step?: number };

// What the panel offers depends on the home's shell: the compact's lid and drawers, a diorama's walls and zones,
// or one slider per tower floor. Each shell gets the camera presets that suit its size.
function controlsFor(h: HomeRecipe): { folds: FoldControl[]; cams: CamPreset[]; foldStyles: boolean } {
  // what the panel offers comes from the home's shell: its rooms' sliders, its other fields, its camera presets
  const shell = shellOf(h);
  const folds: FoldControl[] = [
    ...shell.zones(h).map((z) => ({ key: z.field, label: z.label })),
    ...(shell.extras?.(h) ?? []).map((x) => ({ key: x.field, label: x.label })),
    // what every shell does: where it sits on a wide screen, and the closed home's idle float
    { key: 'side', label: 'Side on wide screens (left −1, right 1)', min: -1, max: 1, step: 0.5 },
    { key: 'hero', label: 'Float while closed' },
  ];
  const cams: CamPreset[] = [
    { id: 'story', label: 'Story' },
    ...(shell.cams?.(h) ?? []).map((c) => ({ id: c.id, label: c.label, cam: cam(c.camera, c.lookAt) })),
    { id: 'orbit', label: 'Free orbit' },
  ];
  return { folds, cams, foldStyles: !!shell.folds };
}

// ---------- small DOM helpers ----------
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
function radioGroup(host: HTMLElement, items: { id: string; label: string }[], current: string, onPick: (id: string) => void, cls = 'chip') {
  const buttons = items.map((it) => {
    const b = el('button', { className: cls, textContent: it.label, type: 'button' });
    b.setAttribute('role', 'radio');
    b.dataset.id = it.id;
    b.addEventListener('click', () => { set(it.id); onPick(it.id); });
    host.append(b);
    return b;
  });
  const set = (id: string) => buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === id)));
  set(current);
  return set;
}

function syncUrl() {
  const p = new URLSearchParams();
  p.set('home', ui.home);
  p.set('stage', ui.stage.toFixed(2));
  if (ui.cam !== 'story') p.set('cam', ui.cam);
  if (ui.light !== moodOf(ui.home)) p.set('light', ui.light);
  if (ui.backdrop !== backdropOf(ui.home)) p.set('bg', ui.backdrop);
  if (ui.fold) p.set('fold', ui.fold);
  history.replaceState(null, '', `?${p}`);
}

async function boot() {
  await Promise.all([
    document.fonts.load('800 40px "Bricolage Grotesque Variable"'),
    document.fonts.load('700 40px "DM Sans Variable"'),
  ]).catch(() => undefined);

  const storyCard = createStoryCard();
  const scene = await startScene({
    canvas, reducedMotion, homes: HOMES, home: ui.home, beats: [...beats], avatar: o.avatar ?? false, lighting: o.lighting, storyDot: o.storyDot, base: o.base, layout: 'studio',
    getStage: () => ui.stage,
    transitions: o.transitions,
    // a door clicked here goes to its section (and home) on the bench, without effects
    onLink: (link) => {
      const { home, section } = transitionTarget(link);
      if (home && HOMES.some((h) => h.id === home) && home !== ui.home) pickHome(home);
      const n = beats.findIndex((b) => b.id === section);
      if (n >= 0) { setPlaying(false); setStage(n); }
    },
    onStory: (story, _key, x, y) => storyCard.open(story, x, y),
    onPick: (part) => setStage((o.pickStages ?? { center: 2, left: 3, right: 4 })[part]),
  });
  $('loading').hidden = true;

  // ----- home picker -----
  const homesHost = $('homes');
  const homeButtons = HOMES.map((h) => {
    const b = el('button', { className: 'home', type: 'button' },
      el('span', { className: 'swatches' }, ...h.swatch.map((c) => { const s = el('i'); s.style.background = c; return s; })),
      el('strong', { textContent: h.name }),
      el('small', { textContent: h.blurb }));
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => pickHome(h.id));
    homesHost.append(b);
    return [h.id, b] as const;
  });
  let inspector: ReturnType<typeof createInspector> | null = null;
  let library: ReturnType<typeof createLibrary> | null = null;
  let look: ReturnType<typeof createLookEditor> | null = null;
  let links: ReturnType<typeof createLinkEditor> | null = null;
  let beatEditor: ReturnType<typeof createBeatEditor> | null = null;
  let buildShellControls: ((h: HomeRecipe) => void) | null = null;
  /** the Scene group's light and backdrop buttons follow the home's time of day (set once they exist) */
  let showLight: ((light: 'day' | 'evening', backdrop: string) => void) | null = null;
  function pickHome(id: string) {
    // another home opens in its own time of day (the scene switches it), on its backdrop unless one was picked
    if (id !== ui.home) {
      if (ui.backdrop === backdropOf(ui.home)) ui.backdrop = backdropOf(id);
      ui.light = moodOf(id);
      showLight?.(ui.light, ui.backdrop);
    }
    ui.home = id;
    homeButtons.forEach(([hid, b]) => b.setAttribute('aria-checked', String(hid === id)));
    $('hud-home').textContent = homeById(id).name;
    buildShellControls?.(homeById(id));
    scene.setHome(id).then(() => { if (scene.homeId === id) { inspector?.homeChanged(); look?.homeChanged(); links?.homeChanged(); beatEditor?.homeChanged(); library?.homeChanged(); } }).catch((err) => console.error(err));
    syncUrl();
  }
  // ----- props inspector -----
  const recipeOf = (id: string) => HOMES.find((h) => h.id === id);
  const showFile = (json: unknown) => inspector!.showFile(json);
  // a diorama's materials, as the home on show has them: every named one its art does not paint, with its colour now
  const modelMaterials = () => {
    const art = recipeOf(scene.homeId)?.diorama?.art ?? {};
    const found = new Map<string, string>();
    scene.house.root.traverse((o) => {
      const mesh = o as { isMesh?: boolean; material?: unknown };
      if (!mesh.isMesh) return;
      for (const m of ([] as unknown[]).concat(mesh.material) as { name?: string; color?: { getHexString(): string } }[]) {
        if (m?.name && m.color && !art[m.name] && !m.name.startsWith('art_') && !found.has(m.name)) found.set(m.name, `#${m.color.getHexString()}`);
      }
    });
    return [...found].map(([name, color]) => ({ name, color })).sort((a, b) => a.name.localeCompare(b.name));
  };
  look = createLookEditor(() => scene.homeId, recipeOf, { file: showFile, recipe: (r) => inspector!.showRecipe(r) }, modelMaterials);
  // the scene's links: the site's, with a home file's own brought up to date as the Links group edits them
  let sceneLinks = [...(o.transitions ?? [])];
  links = createLinkEditor({
    getHome: () => scene.homeId, recipeOf, showFile,
    homes: () => HOMES.map((h) => ({ id: h.id, name: h.name })),
    beats: () => beats.map((b) => ({ id: b.id, name: b.name })),
    beatHere: () => beatHere().id,
    pieces: () => scene.house.editables.map((e) => e.key).sort(),
    selectedPiece: () => inspector?.selectedKey,
    linksChanged: (before, after) => {
      const gone = new Set(before.map(linkKey));
      sceneLinks = [...sceneLinks.filter((t) => !gone.has(linkKey(t))), ...after];
      scene.setTransitions(sceneLinks);
    },
  });
  // the story's beats themselves: a change (or an undo of one) gives the studio another story, shown in place
  beatEditor = createBeatEditor({
    getHome: () => scene.homeId, recipeOf, showFile,
    here: () => Math.min(last(), Math.max(0, Math.round(ui.stage))),
    storyChanged: (data, stage) => setStory(beatsOf({ beats: data }), stage),
  });
  // the object view: every kind the home can use, added to a room through the inspector (so it is selected)
  library = createLibrary({
    engine: scene, getHome: () => scene.homeId, homes: () => HOMES,
    add: (kind, room, wall) => inspector!.add(kind, room, wall),
    base: o.base ?? document.querySelector<HTMLMetaElement>('meta[name="popfold-base"]')?.content ?? import.meta.env.BASE_URL,
  });
  inspector = createInspector(scene, () => scene.homeId, recipeOf, [look, links, beatEditor, { fileWillShow() {}, fileShown: () => library?.homeChanged() }]);
  inspector.homeChanged();
  look.homeChanged();
  links.homeChanged();
  beatEditor.homeChanged();

  // ----- story: scroll position + stops + play -----
  const stageInput = $<HTMLInputElement>('stage');
  const stopsHost = $('stops');
  let stopButtons: HTMLButtonElement[] = [];
  /** one button per story stop */
  function buildStops() {
    stageInput.max = String(last());
    stopButtons = beats.map((b, i) => {
      const btn = el('button', { className: 'chip', type: 'button', textContent: `${i} · ${b.name}` });
      btn.addEventListener('click', () => { setPlaying(false); setStage(i); });
      return btn;
    });
    stopsHost.replaceChildren(...stopButtons);
  }
  /** another story (its beats were added, removed, moved or renamed): the scene, the stops and the panel follow */
  function setStory(next: Beat[], stage = ui.stage) {
    beats = next;
    scene.setBeats([...next]);
    buildStops();
    setStage(stage);
  }
  buildStops();
  function setStage(v: number) {
    ui.stage = Math.min(last(), Math.max(0, v));
    stageInput.value = String(ui.stage);
    $('stage-out').textContent = ui.stage.toFixed(2);
    const near = Math.round(ui.stage);
    stopButtons.forEach((b, i) => b.classList.toggle('is-on', i === near && Math.abs(ui.stage - near) < 0.2));
    $('hud-stop').textContent = `${near} · ${beats[near]?.name ?? ''}`;
    beatEditor?.show();
    syncUrl();
  }
  stageInput.addEventListener('input', () => { setPlaying(false); setStage(Number(stageInput.value)); });
  setStage(ui.stage);

  const playBtn = $<HTMLButtonElement>('play');
  function setPlaying(on: boolean) {
    ui.playing = on;
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.textContent = on ? '❚❚ Pause' : '▶ Play';
  }
  playBtn.addEventListener('click', () => { if (!ui.playing && ui.stage >= last()) setStage(0); setPlaying(!ui.playing); });
  let lastTick = performance.now();
  (function tick(now: number) {
    const dt = Math.min(0.1, (now - lastTick) / 1000); lastTick = now;
    if (ui.playing) {
      // linger on each stop, glide between them: about 3.5 s per stop
      const next = ui.stage + dt / 3.5 * scene.flags.speed;
      if (next >= last()) { setStage(last()); setPlaying(false); } else setStage(next);
    }
    requestAnimationFrame(tick);
  })(lastTick);

  // ----- fold style (compact shell only): the home's own, or one picked here -----
  if (ui.fold) scene.flags.fold = ui.fold;
  radioGroup($('fold-style'), [{ id: 'compact', label: 'Compact' }, { id: 'book', label: 'Pop-up book' }], scene.flags.fold, (id) => {
    ui.fold = id as 'compact' | 'book';
    scene.flags.fold = ui.fold;
    syncUrl();
  }, 'seg-btn');
  const foldStyleRow = document.querySelector('.fold-style') as HTMLElement;

  // ----- manual fold sliders: whatever the current home's shell has -----
  const manual = $<HTMLInputElement>('manual');
  const foldsHost = $('folds');
  let foldInputs: { f: FoldControl; input: HTMLInputElement; out: HTMLOutputElement; note: HTMLElement }[] = [];
  /** in the evening the engine keeps the lamp at full glow, so the story's glow does nothing: say so, and leave it out */
  const lampAlwaysOn = () => ui.light === 'evening';
  function markGlow() {
    for (const { f, input, note } of foldInputs) {
      if (f.key !== 'glow') continue;
      input.disabled = lampAlwaysOn();
      note.textContent = lampAlwaysOn() ? ' · always full in the evening' : '';
    }
  }
  const storyValue = (key: string) => (scene.state as Record<string, number>)[key] ?? 0;
  const override = scene.override as Record<string, number>;
  function buildFolds(folds: FoldControl[]) {
    for (const { f } of foldInputs) if (!(f.key === 'glow' && ui.light === 'evening')) delete override[f.key];
    foldsHost.replaceChildren();
    foldInputs = folds.map((f) => {
      const out = el('output', { textContent: '0.00' });
      const input = el('input', { type: 'range', min: String(f.min ?? 0), max: String(f.max ?? 1), step: String(f.step ?? 0.01), value: '0' });
      input.addEventListener('input', () => {
        const v = Number(input.value); // read first: switching manual on resets every slider to the story
        if (!manual.checked) { manual.checked = true; applyManual(); }
        input.value = String(v);
        override[f.key] = v;
        out.textContent = v.toFixed(2);
      });
      const note = el('span', { className: 'hint' });
      foldsHost.append(el('label', { className: 'slider' }, el('span', {}, f.label, ' ', out, note), input));
      return { f, input, out, note };
    });
    markGlow();
    if (manual.checked) applyManual();
  }
  function applyManual() {
    foldsHost.classList.toggle('is-live', manual.checked);
    for (const { f, input, out } of foldInputs) {
      if (manual.checked && f.key === 'glow' && lampAlwaysOn()) continue; // (the evening holds it at 1)
      if (manual.checked) {
        // start the sliders where the story currently is, so switching on doesn't jump
        const v = Math.round(storyValue(f.key) * 100) / 100;
        input.value = String(v); out.textContent = v.toFixed(2);
        override[f.key] = v;
      } else if (!(f.key === 'glow' && ui.light === 'evening')) delete override[f.key];
    }
  }
  manual.addEventListener('change', applyManual);

  // In Manual, the sliders can become what the home does at the beat the story is on: written into the home file.
  const foldSet = $<HTMLButtonElement>('fold-set');
  setInterval(() => {
    $('fold-save').hidden = !manual.checked;
    const label = `Use for “${beatHere().name}”`;
    if (manual.checked && !foldSet.disabled && foldSet.textContent !== label) foldSet.textContent = label;
  }, 200);
  foldSet.addEventListener('click', async () => {
    const beat = beatHere();
    const say = (text: string) => { $('fold-note').textContent = text; $('fold-note').hidden = false; };
    const set: Record<string, number> = {}, zones: Record<string, number> = {};
    for (const { f, input } of foldInputs) {
      if (f.key === 'glow' && lampAlwaysOn()) continue; // not what the story does: the evening's own
      if (f.key.startsWith('z:')) zones[f.key.slice(2)] = Number(input.value); else set[f.key] = Number(input.value);
    }
    foldSet.disabled = true;
    foldSet.textContent = 'Saving…';
    try {
      const r = await fetch(`/__popfold/home/${ui.home}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commands: [{ name: 'beat', args: { id: beat.id, set, zones } }], quiet: true }) });
      const res = await r.json() as { ok: boolean; why?: string; file?: string };
      if (!res.ok) throw new Error(res.why ?? 'not saved');
      for (const { f, input } of foldInputs) if (!(f.key === 'glow' && lampAlwaysOn())) beat.key[f.key] = Number(input.value);
      manual.checked = false; applyManual(); // back to the story, which now plays these values here
      say(`Saved as what the home does at “${beat.name}” in ${res.file}.`);
    } catch (err) {
      say(`Not saved: ${(err as Error).message.slice(0, 140)}`);
    }
    foldSet.disabled = false;
  });
  // keep the sliders following the story while manual is off
  setInterval(() => {
    if (manual.checked) return;
    for (const { f, input, out } of foldInputs) { const v = storyValue(f.key); input.value = String(v); out.textContent = v.toFixed(2); }
  }, 120);

  // ----- camera: presets for the current home's shell -----
  let cams: CamPreset[] = [];
  // In Free orbit, show where the camera is and what it looks at, written as a beat takes them.
  const camNow = (): { camera: number[]; lookAt: number[] } | null => {
    if (!scene.orbit) return null;
    const two = (v: number[]) => v.map((n) => Math.round(n * 100) / 100);
    // on a narrow canvas the engine pulls a beat's camera back from its target; undo that, so the numbers are
    // the ones a beat needs whatever shape this window is
    const aspect = scene.canvas.clientWidth / Math.max(1, scene.canvas.clientHeight);
    const pull = aspect < 1.25 ? Math.pow(1.25 / aspect, 0.85) : 1;
    const target = scene.orbit.target.toArray(), eye = scene.camera.position.toArray();
    return { camera: two(eye.map((n, i) => target[i] + (n - target[i]) / pull)), lookAt: two(target) };
  };
  const camValues = () => { const c = camNow(); return c ? `[${c.camera.join(', ')}], [${c.lookAt.join(', ')}]` : ''; };
  /** the beat the story slider is on, or nearest to */
  const beatHere = () => beats[Math.min(last(), Math.max(0, Math.round(ui.stage)))];
  setInterval(() => {
    if (ui.cam !== 'orbit') return;
    if ($('cam-values').textContent !== camValues()) $('cam-values').textContent = camValues();
    const label = `Use for “${beatHere().name}”`;
    if (!camSaving && $('cam-set').textContent !== label) $('cam-set').textContent = label;
  }, 200);
  let camSaving = false;
  $('cam-copy').addEventListener('click', () => {
    const done = (text: string) => { $('cam-copy').textContent = text; setTimeout(() => { $('cam-copy').textContent = 'Copy for a beat'; }, 1500); };
    navigator.clipboard.writeText(camValues()).then(() => done('Copied'), () => done('Select the numbers and copy'));
  });

  // Make this view the camera of the beat the story is on: written into the home file, and used at once.
  $('cam-set').addEventListener('click', async () => {
    const view = camNow(), beat = beatHere();
    if (!view) return;
    const say = (text: string) => { $('cam-note').textContent = text; $('cam-note').hidden = false; };
    camSaving = true;
    $('cam-set').textContent = 'Saving…';
    try {
      const r = await fetch(`/__popfold/home/${ui.home}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commands: [{ name: 'camera', args: { id: beat.id, ...view } }], quiet: true }) });
      const res = await r.json() as { ok: boolean; why?: string; file?: string };
      if (!res.ok) throw new Error(res.why ?? 'not saved');
      Object.assign(beat.key, { cx: view.camera[0], cy: view.camera[1], cz: view.camera[2], tx: view.lookAt[0], ty: view.lookAt[1], tz: view.lookAt[2] });
      // show the story as it now plays (a click on the Story button, so the buttons agree with the view)
      $('cams').querySelector<HTMLElement>('[data-id="story"]')?.click();
      say(`Saved as the camera of “${beat.name}” in ${res.file}.`);
    } catch (err) {
      say(`Not saved: ${(err as Error).message.slice(0, 120)}. Copy the numbers into the beat by hand.`);
    }
    camSaving = false;
  });

  function pickCam(id: string) {
    if (!cams.some((c) => c.id === id)) id = 'story';
    ui.cam = id;
    const preset = cams.find((c) => c.id === id)?.cam;
    for (const k of ['cx', 'cy', 'cz', 'tx', 'ty', 'tz'] as const) {
      if (preset) scene.override[k] = preset[k]; else delete scene.override[k];
    }
    scene.setOrbit(id === 'orbit').catch((err) => console.error(err));
    $('orbit-hint').hidden = id !== 'orbit';
    $('cam-out').hidden = id !== 'orbit';
    syncUrl();
  }

  // rebuilt whenever the bench switches home
  buildShellControls = (h: HomeRecipe) => {
    const c = controlsFor(h);
    foldStyleRow.hidden = !c.foldStyles;
    buildFolds(c.folds);
    cams = c.cams;
    $('cams').replaceChildren();
    radioGroup($('cams'), cams, cams.some((p) => p.id === ui.cam) ? ui.cam : 'story', pickCam);
    pickCam(ui.cam);
  };
  pickHome(ui.home);

  // ----- scene switches -----
  const TOGGLES = [
    { key: 'avatar', label: 'Guide figure' },
    { key: 'sparkles', label: 'Sparkles' },
    { key: 'idle', label: 'Idle float' },
    { key: 'hotspots', label: 'Story dots' },
  ] as const;
  for (const t of TOGGLES) {
    const input = el('input', { type: 'checkbox', checked: scene.flags[t.key] });
    input.dataset.flag = t.key; // the inspector finds a switch by its flag, not its place in the list
    input.addEventListener('change', () => { scene.flags[t.key] = input.checked; });
    $('toggles').append(el('label', { className: 'switch' }, input, el('span', { textContent: t.label })));
  }
  const setLightButtons = radioGroup($('lighting'), [{ id: 'day', label: 'Day' }, { id: 'evening', label: 'Evening' }], ui.light, (id) => {
    ui.light = id as 'day' | 'evening';
    scene.setLighting(ui.light);
    markGlow();
    if (manual.checked) applyManual();
    syncUrl();
  }, 'seg-btn');
  scene.setLighting(ui.light);
  radioGroup($('speed'), [{ id: '0', label: 'Pause' }, { id: '0.25', label: '¼×' }, { id: '0.5', label: '½×' }, { id: '1', label: '1×' }, { id: '2', label: '2×' }], '1',
    (id) => { scene.flags.speed = Number(id); }, 'seg-btn');
  const beige = $<HTMLInputElement>('beige');
  beige.addEventListener('input', () => {
    const b = (100 - Number(beige.value)) / 100;
    stageEl.style.filter = b > 0.002 ? `grayscale(${b}) sepia(${b * 0.55}) contrast(${1 - b * 0.18}) brightness(${1 + b * 0.06})` : '';
  });
  const setBackdropButtons = radioGroup($('backdrop'), [{ id: 'paper', label: 'Paper' }, { id: 'blush', label: 'Blush' }, { id: 'night', label: 'Night' }, { id: 'clear', label: 'Clear' }], ui.backdrop, (id) => {
    ui.backdrop = id; stageEl.dataset.backdrop = id; syncUrl();
  }, 'seg-btn');
  stageEl.dataset.backdrop = ui.backdrop;
  showLight = (light, backdrop) => {
    setLightButtons(light); setBackdropButtons(backdrop); stageEl.dataset.backdrop = backdrop;
    markGlow();
    if (manual.checked) applyManual();
  };

  // ----- actions -----
  $('replay').addEventListener('click', () => scene.replayPop());
  $('snap').addEventListener('click', () => {
    const a = el('a', { href: scene.snapshot(), download: `popfold-${ui.home}-${ui.stage.toFixed(1)}.png` });
    a.click();
  });
  $('link').addEventListener('click', async () => {
    const btn = $('link');
    try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Copied!'; } catch { btn.textContent = 'Copy from the address bar'; }
    setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
  });

  // ----- capture stills: one picture per story stop, for the page without 3D (dev server only) -----
  // Saves <home>-<stop>.webp through the dev endpoint (homeSaver): in public/stills/ for a home a page shows (the
  // site's popfoldFallback() puts still n beside its n-th stage section), in stills/ for a home only the studio
  // has. Uses the story camera, no idle wobble, dots or sparkles.
  if (import.meta.env.DEV) {
    const cap = el('button', { className: 'btn', id: 'capture', type: 'button', textContent: 'Capture stills' });
    $('link').after(cap);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    cap.addEventListener('click', async () => {
      const saved = { ...scene.flags };
      const stageStyle = stageEl.getAttribute('style') ?? '';
      // the stills show the home in its own time of day, as the site does
      if (scene.flags.lighting !== moodOf(ui.home)) scene.setLighting(moodOf(ui.home));
      cap.disabled = true;
      setPlaying(false);
      pickCam('story');
      Object.assign(scene.flags, { idle: false, hotspots: false, sparkles: false, speed: 1 });
      // a fixed 4:3 frame, so every still has the same shape
      stageEl.setAttribute('style', 'position:fixed;left:0;top:0;width:1200px;height:900px;z-index:50');
      await wait(400);
      // nothing still on its way: the web fonts the art is drawn with, and the warm-up's materials
      await document.fonts.ready;
      await scene.warmed;
      // start from the first beat at rest, whatever the page was showing: anything that keeps time by how open
      // the home is (a tower's pipes run faster as floors light up) would otherwise carry that into the first still
      setStage(0);
      scene.hold(true);
      scene.step(240);
      let ok = 0, folder = '';
      try {
        for (let i = 0; i < beats.length; i++) {
          cap.textContent = `Capturing ${i + 1}/${beats.length}…`;
          setStage(i);
          // every still is taken at the same instant: clock back to zero, then 8 s of fixed frames for the folds
          // and pop-ins to settle. Two captures of an unchanged scene then give the same picture.
          // settle at this beat first, then start the clock again: what keeps time by how open the home is (a
          // tower's pipes flow faster as floors light up) then never carries the easing from the beat before
          const shoot = () => { scene.hold(true); scene.step(240); scene.hold(true); scene.step(240); return scene.snapshot(); };
          await wait(60);
          // a still is kept only when two shots of the same held moment agree: anything still arriving or settling
          // (a texture, a font, a busy GPU) shows as a difference, and the shot is taken again a moment later
          let png = shoot();
          for (let tries = 0; ; tries++) {
            await wait(tries ? 400 : 60);
            const again = shoot();
            if (again === png) break;
            png = again;
            if (tries === 6) { console.warn(`popfold: still ${i} did not settle after ${tries + 2} shots; keeping the last`); break; }
          }
          const img = new Image();
          await new Promise((r) => { img.onload = r; img.src = png; });
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          c.getContext('2d')!.drawImage(img, 0, 0);
          const webp = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.86));
          if (!webp) throw new Error('This browser cannot encode WebP');
          const r = await fetch(`/__popfold/still/${ui.home}-${i}.webp`, { method: 'POST', headers: { 'content-type': 'image/webp' }, body: webp });
          if (!r.ok) throw new Error(await r.text());
          folder = ((await r.json()) as { file: string }).file.replace(/\/[^/]+$/, '/');
          ok++;
        }
        cap.textContent = `Saved ${ok} stills`;
        cap.title = `in ${folder}`;
      } catch (err) {
        cap.textContent = `Stopped: ${(err as Error).message.slice(0, 60)}`;
      } finally {
        scene.hold(false);
        stageEl.setAttribute('style', stageStyle);
        if (saved.lighting !== scene.flags.lighting) scene.setLighting(saved.lighting);
        Object.assign(scene.flags, saved);
        cap.disabled = false;
        setTimeout(() => { cap.textContent = 'Capture stills'; }, 4000);
      }
    });
  }
}

return boot().catch((err) => {
  console.error(err);
  // dev-only, for the popfold command: the studio did not start, and why
  if (import.meta.env.DEV) (window as unknown as { __popfold: unknown }).__popfold = { failed: String(err?.message ?? err) };
  $('loading').textContent = 'This browser could not start the 3D preview.';
});
}
