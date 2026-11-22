import * as THREE from 'three';
import { t } from './text';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { avatarFromModel, buildAvatar } from './avatar';
import type { GenAssets, PopItem } from './compact';
import { backOut, clamp01, shellOf, type House } from './shell';
import { foldEase } from './fold';
import './shells'; // the compact, the diorama, the tower and the book
import { sparkles } from './effects';
import { applyEntry, applyPlaces, type Editable, type Places } from './layout';
import { addHotspots, updateHotspots, type Hotspot } from './hotspots';
import type { HomeRecipe, PropStory } from './types';
import { beatHomes, FIELDS, sample, smooth, type Beat, type State } from './keyframes';
import { BUILT_IN_EFFECTS, createEffectPass, type Effect } from './effects-pass';
import { lateModels, libraryOf, pieceKey, storiesOf as storiesFrom } from './pieces';
import { doorsOf, linkKey, storiesWithLinks, transitionTarget, type Transition } from './transitions';
import { addDoors, beckonAt, doorsBusy, updateDoors, type Door, type DoorCue } from './doors';
import { installDebug } from './debug-hook';

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
  /** Every home this page can show. */
  homes: HomeRecipe[];
  /** Id of the home to show first. */
  home: string;
  /** The story: one beat per page section, in the page's order (see beat() in keyframes.ts). */
  beats: Beat[];
  /** The guide figure: a rigged GLB (url relative to the site), the built-in figure if it fails, or false for none. */
  avatar?: { url?: string } | false;
  /** Fractional stage index derived from scroll (0 = first section). */
  getStage: () => number;
  /** Called when someone clicks a part of the house. */
  onPick?: (part: 'center' | 'left' | 'right', state: State) => void;
  /**
   * Links between sections and homes (transitions.ts): a piece that carries a link gets it on its story card, or,
   * with no story, a click on it follows the link. The page without 3D writes the same list as cards.
   */
  transitions?: Transition[];
  /**
   * Follow a link (a door clicked in 3D). By default the home is switched if the link names another, then the
   * page scrolls to the section.
   */
  onLink?: (link: Transition) => void;
  /**
   * How doors show that they are doors (doors.ts), for links that do not say (`cue`): 'full' (default) a marker,
   * a glow and the link's words on hover, and a pulse when the story first reaches the door's section; 'hover' only
   * the glow and words; 'none' nothing.
   */
  linkCue?: DoorCue;
  /**
   * Effects a link can name besides the built-in ones (cut, fade, zoom, vortex), by name (effects-pass.ts). A link
   * with an `effect` plays it: scrubbed by the scroll between two neighbouring beats, timed when a door is clicked.
   */
  effects?: Record<string, Effect>;
  /** Called when someone clicks a zone (a tower floor) that isn't a story piece. */
  onZone?: (id: string) => void;
  /** Called when someone clicks a piece that has a story (src/stories.ts), with the click position. */
  onStory?: (story: PropStory, key: string, clientX: number, clientY: number) => void;
  /** 'site': the house slides beside the page text. 'studio': it stays centred in its canvas. */
  layout?: 'site' | 'studio';
  /** The site's light: override any part of the day and evening presets, and the ground shadow's colour. */
  lighting?: Lighting;
  /**
   * Once the home is on show, have the browser build the materials of every other beat in the background, so
   * that it is not done in the middle of the visitor's first scroll (where it shows as a stall of a tenth of a
   * second or more as each room first opens). Nothing of it is ever seen, and it does not delay the home's first
   * appearance. On by default on a site; false skips it. The studio does not do it. `scene.warmed` settles when
   * it is over.
   * 'wait' does the same but startScene() does not resolve until it is done: for a site that shows a loader
   * anyway and would rather hold it a moment longer than risk a stall if the visitor scrolls at once.
   * A model that arrives late and a home that is switched to are warmed too.
   */
  warmUp?: boolean | 'wait';
  /**
   * Called once with the scene, when it exists and before it warms up or is handed back: the place to add what
   * the site puts in the scene itself, lights above all. The warm-up builds materials for the lights that are
   * there when it runs, and builds them all again if a light is added afterwards. May return a promise.
   */
  onScene?: (scene: Awaited<ReturnType<typeof startScene>>) => void | Promise<void>;
  /**
   * Called when a home goes on show, and why: 'start' (once, when the scene starts), 'switch' (setHome), 'link' (a
   * door the visitor clicked led to another home), 'story' (the scroll reached a beat that shows another home) or
   * 'rebuild' (rebuildHome). A site that drives motion of its own
   * uses it to know which home's pieces are in the scene; one with a home switch of its own follows 'link'.
   */
  onHome?: (id: string, why: 'start' | 'switch' | 'link' | 'rebuild' | 'story') => void;
  /**
   * The debug panel: what build this is and how the page is running, opened with ?debug in the address or
   * Alt+Shift+D. Its code is fetched only when it is opened. On by default; false takes it away.
   */
  debug?: boolean;
  /**
   * Show the home as soon as the models of its first rooms are in, and bring the rest in as they arrive. For a
   * site page; leave it off where a picture must be complete (the studio and the stills do). It applies to a
   * compact or a tower whose pieces are all listed (`pieces`), and to a diorama whose pieces are in a file of their
   * own (`diorama.pieces`); other homes wait for every model, as before.
   */
  lazyModels?: boolean;
  /** Rows of the site's own for the debug panel, under "Page": [label, value] pairs, read each time it redraws. */
  debugRows?: () => [string, string][];
  /**
   * The studio page the debug panel links to (it opens on the same home, story stop and light): a path relative
   * to the page, default 'studio.html' beside it; false leaves the link out. Shown only if the page exists.
   */
  debugStudio?: string | false;
  /**
   * Is this element page content (so a click on it is not a click on the house)? The canvas sits behind the page,
   * so clicks arrive on whatever is in front. Default: everything except the canvas, <body>, <main> and the empty
   * part of a .stage section.
   */
  isOverUi?: (target: Element) => boolean;
  /**
   * 'auto' (the default): while the story is at rest and only ambient motion is on screen, draw every other
   * frame; and if the device cannot keep up, step the picture down (fewer pixels, then a smaller shadow map).
   * 'high': always full rate and full quality. The studio uses 'high'.
   */
  quality?: 'auto' | 'high';
  /**
   * The motion that is only decoration: the home's float, sparkles, pulsing dots, markers and halos, bobbing
   * badges, animated models and a tower's flowing pipes, and the guide figure's sway. On by default; false holds
   * it all still, and then, with quality 'auto', a page whose story is at rest draws nothing at all until the
   * scroll, the pointer or a change wakes it (a laptop on battery, a page left open). Reduced motion holds it still
   * too, but keeps drawing.
   */
  ambient?: boolean;
  /** The colour of the dots on pieces that have a story (default a blue). */
  storyDot?: string;
  /**
   * Where the site's files are, as seen from this page: models and art are fetched from here.
   * Default: the site's base (Vite's BASE_URL), which is right for a page at the site's root. A page in a
   * sub-folder of a site built with base './' passes '../'.
   */
  base?: string;
}

/** One lighting mood. Colours are CSS colours. */
export interface LightPreset {
  sun: string;
  sunIntensity: number;
  /** the soft light from above, and the light bounced up from the ground */
  sky: string;
  ground: string;
  skyIntensity: number;
  /** strength of the reflections on glossy pieces */
  env: number;
}
export interface Lighting {
  day?: Partial<LightPreset>;
  evening?: Partial<LightPreset>;
  /** colour and strength of the soft shadow under the house */
  shadow?: string;
  shadowOpacity?: number;
}
const DAY: LightPreset = { sun: '#FFF6EA', sunIntensity: 2.2, sky: '#FFFFFF', ground: '#D9D6E0', skyIntensity: 0.9, env: 0.9 };
const EVENING: LightPreset = { sun: '#FFB27A', sunIntensity: 0.45, sky: '#C9A8FF', ground: '#4B4460', skyIntensity: 0.35, env: 0.35 };

/** Things the studio can switch; the site leaves them all at their defaults. */
export interface SceneFlags {
  avatar: boolean;
  sparkles: boolean;
  /** idle float, wobble and pointer tilt */
  idle: boolean;
  /** free orbit camera instead of the story camera */
  orbit: boolean;
  lighting: 'day' | 'evening';
  /** animation speed; 0 pauses */
  speed: number;
  /** clicking a room or the guide figure reacts (off while the studio inspector is picking props) */
  pick: boolean;
  /** how the home opens: 'compact' (lid + sliding drawers) or 'book' (side pages fold open like a tri-fold pop-up book) */
  fold: FoldStyle;
  /** glowing dots on pieces that have a story */
  hotspots: boolean;
}

export type FoldStyle = 'compact' | 'book';


/** Loads .glb files, as they are or compressed by `popfold optimize` (meshopt, with WebP textures). */
const gltfLoader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

export async function startScene(opts: SceneOptions) {
  const { canvas, reducedMotion } = opts;
  /** decoration held still: by the site's choice (ambient: false) or the visitor's (reduced motion) */
  const still = reducedMotion || opts.ambient === false;
  const recipeOf = (id: string) => opts.homes.find((h) => h.id === id) ?? opts.homes[0];
  const studio = opts.layout === 'studio';
  /** picture quality: 0 full, 1 fewer pixels, 2 fewer pixels and a smaller shadow map (only goes down, and only with quality 'auto') */
  let level = 0;
  const isSmall = () => !studio && innerWidth < 820;
  const flags: SceneFlags = { avatar: true, sparkles: true, idle: true, orbit: false, lighting: 'day', speed: 1, pick: true, fold: recipeOf(opts.home).fold ?? 'compact', hotspots: true };
  if (opts.avatar === false) flags.avatar = false;
  /** Fields set here win over the scroll keyframes (fold sliders, camera presets). */
  const override: Partial<State> = {};

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  // the story may move between homes (a beat's `home`): then the homes follow the scroll, and an effect hides the swap
  const storyHome = studio ? opts.beats.map(() => null) : beatHomes(opts.beats).map((id) => (id && opts.homes.some((h) => h.id === id) ? id : null));
  for (const b of opts.beats) if (b.home && !opts.homes.some((h) => h.id === b.home)) console.warn(`popfold: the beat "${b.id}" shows the home "${b.home}", which startScene() was not given`);
  const crossesHomes = storyHome.some((id, n) => n > 0 && id && storyHome[n - 1] && id !== storyHome[n - 1]);
  const pass = crossesHomes || (opts.transitions ?? []).some((t) => t.effect && t.effect !== 'cut') ? createEffectPass(renderer) : null;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  // ---------- lights ----------
  const light = { day: { ...DAY, ...opts.lighting?.day }, evening: { ...EVENING, ...opts.lighting?.evening } };
  const hemi = new THREE.HemisphereLight(light.day.sky, light.day.ground, light.day.skyIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(light.day.sun, light.day.sunIntensity);
  sun.position.set(5, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(isSmall() ? 1024 : 2048);
  sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ color: opts.lighting?.shadow ?? '#1B1630', opacity: opts.lighting?.shadowOpacity ?? 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- content ----------
  // A model that fails to load is not fatal: the shell and the guide both have code-built versions.
  const loadModel = (url: string | null | undefined) => !url ? Promise.resolve(null) : gltfLoader()
    .loadAsync(url)
    .then((g) => g.scene as THREE.Object3D)
    .catch((err) => { console.warn(`${url} not loaded, using the built-in version`, err); return null; });
  // (a page in a folder says how to get back to the site's root: popfoldFallback writes it)
  const base = opts.base ?? document.querySelector<HTMLMetaElement>('meta[name="popfold-base"]')?.content ?? import.meta.env.BASE_URL;
  const siteUrl = (file: string | null | undefined) => (file ? `${base}${file}` : null);
  // A shell's own models (a compact's case, a diorama's room) are fetched once each, the first time a home that
  // uses one is built; the shell clones what it keeps.
  const shellModels = new Map<string, Promise<THREE.Object3D | null>>();
  const loadShellModel = (url: string) => {
    let model = shellModels.get(url);
    if (!model) shellModels.set(url, model = loadModel(url));
    return model;
  };
  const avatarModel = await loadModel(siteUrl(opts.avatar ? opts.avatar.url : null));

  // The guide figure is shared by every home; it moves into whichever one is showing.
  const av = (avatarModel && avatarFromModel(avatarModel)) || buildAvatar();
  av.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // Each home is built the first time it is asked for and kept.
  // Generated furniture that fails to load falls back to the code-built pieces.
  // links between sections and homes: a piece's story card gets the link it carries (worded by the link's label,
  // or else by the name of the beat it leads to); a piece with a link and no story is a door a click follows
  const links = [...(opts.transitions ?? [])]; // (setTransitions replaces what is in it)
  const linkName = (t: Transition) => { const { section } = transitionTarget(t); return opts.beats.find((b) => b.id === section)?.name ?? section; };
  const linksOf = (r: HomeRecipe) => links.filter((t) => !t.fromHome || t.fromHome === r.id); // a link works in its own home
  const storiesOf = (r: HomeRecipe) => storiesWithLinks(storiesFrom(r), linksOf(r), linkName);
  const doorsByHome = new WeakMap<House, Map<string, Transition>>();
  /** the doors of each home: pieces that carry a link, with their cues */
  const doorMarks = new WeakMap<House, Door[]>();
  /** the door under the pointer, and the words shown beside it */
  let hoveredDoor: Door | null = null;
  let doorLabel: HTMLDivElement | null = null;
  function showDoorLabel(d: Door | null, x = 0, y = 0) {
    if (!d || d.cue === 'none') { if (doorLabel) doorLabel.hidden = true; return; }
    if (!doorLabel) {
      doorLabel = document.createElement('div');
      doorLabel.className = 'pf-door-label';
      doorLabel.setAttribute('aria-hidden', 'true'); // the door's link is in the page for keyboards and screen readers
      Object.assign(doorLabel.style, { position: 'fixed', zIndex: '40', pointerEvents: 'none', padding: '6px 12px', borderRadius: '999px',
        background: 'var(--pf-door-label-bg, rgba(20, 18, 34, .88))', color: 'var(--pf-door-label-ink, #fff)', font: '600 13px system-ui, sans-serif',
        whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,.18)' });
      document.body.append(doorLabel);
    }
    doorLabel.textContent = `${t(d.label)} →`;
    doorLabel.style.left = `${x + 16}px`;
    doorLabel.style.top = `${y + 14}px`;
    doorLabel.hidden = false;
  }
  // effects on the way: a pass only on a page whose links name one (cut is a plain jump)
  const effects: Record<string, Effect | null> = { ...BUILT_IN_EFFECTS, ...opts.effects };
  const withEffect = links.filter((t) => t.effect && effects[t.effect] !== null);
  // where the story crosses from one home to another and no link names an effect for that step: a fade
  for (let n = 1; n < opts.beats.length; n++) {
    const a = opts.beats[n - 1].id, b = opts.beats[n].id;
    if (!storyHome[n] || !storyHome[n - 1] || storyHome[n] === storyHome[n - 1]) continue;
    const named = withEffect.some((t) => !transitionTarget(t).home && ((t.from === a && transitionTarget(t).section === b) || (t.from === b && transitionTarget(t).section === a)));
    if (!named) withEffect.push({ from: a, to: b, effect: 'fade' });
  }
  for (const t of withEffect) if (!(t.effect! in effects)) console.warn(`popfold: the link from "${t.from}" names the effect "${t.effect}", which there is not (there are ${Object.keys(effects).join(', ')})`);
  const homes: Record<string, Promise<House>> = {};
  /** the homes built so far, by id (homes[] holds the promises) */
  const built: Record<string, House> = {};
  const layouts: Record<string, Places> = {};
  const spotsOf = new WeakMap<House, Hotspot[]>();
  /** stop resting and draw: set once the frame loop exists (a late model can arrive before or after that) */
  let wakeDrawing = () => {};
  const loadHome = (id: string) => homes[id] ??= (async () => {
    const recipe = recipeOf(id);
    const shell = shellOf(recipe);
    const names = recipe.props;
    const dir = recipe.propDir;
    // every model lands in `assets` under its name when it arrives (null if it failed to load)
    const assets: GenAssets = {};
    const fetchModel = (name: string) => gltfLoader()
      // a name with a folder ("sh3d/frame") is shared by every home and loads from sharedDir, not this home's propDir
      .loadAsync(`${base}${name.includes('/') ? (recipe.sharedDir ?? 'models/props') : dir}/${name}.glb`)
      .then((g) => ({ scene: g.scene as THREE.Object3D, animations: g.animations }))
      .catch((err) => { console.warn(`${name} not loaded, using the built-in version`, err); return null; })
      .then((got) => { assets[name] = got; });
    // the rooms the story opens first (at its first two beats); models only other rooms need can come after
    const early = opts.beats.slice(0, 2).map((b) => b.key);
    const zones = shell.zones(recipe);
    const firstRooms = zones.filter((z) => early.some((key) => ((key as Record<string, number>)[z.field] ?? 0) > 0)).map((z) => z.room);
    const later = opts.lazyModels && shell.lazy ? lateModels(recipe, firstRooms.length ? firstRooms : zones.slice(0, 1).map((z) => z.room)) : [];
    await Promise.all(names.filter((name) => !later.includes(name)).map(fetchModel));
    const h = await shell.build(recipe, { assets, base, loadModel: loadShellModel, siteUrl: (path) => `${base}${path}` });
    // pieces still on their way: a page that must be complete (the studio, the stills) waits for them here
    let arriving = h.arriving;
    if (arriving && !opts.lazyModels) { h.editables.push(...await arriving); arriving = undefined; }
    // changes made in Popfold Studio, kept in the home's file as its places (a home made in code may set them too)
    const layout: Places = structuredClone(recipe.places ?? {});
    applyPlaces(h.editables, layout);
    // (a story whose piece is still waiting for its model gets its dot when the piece arrives)
    const waitingKeys = new Set((h.late?.specs ?? []).map((p) => pieceKey(p, recipe.rooms)));
    const here = new Set(h.editables.map((e) => e.key));
    spotsOf.set(h, addHotspots(h.editables, Object.fromEntries(Object.entries(storiesOf(recipe)).filter(([key]) => !waitingKeys.has(key) && (!arriving || here.has(key)))), opts.storyDot));
    doorsByHome.set(h, doorsOf(storiesOf(recipe), linksOf(recipe))); // pieces that carry a link and no story of their own
    // every piece that carries a link: its cues (marker, glow, pulse), worded by the link's label or the beat it leads to
    const carried = new Map(linksOf(recipe).filter((t) => t.piece).map((t) => [t.piece!, { link: t, label: t.label ?? linkName(t) }]));
    const own = storiesFrom(recipe);
    doorMarks.set(h, addDoors(h.editables, carried, (key) => !!own[key], opts.linkCue ?? 'full', opts.storyDot));
    layouts[recipe.id] = layout;
    h.pickables.push(av.root);
    /** a piece that arrived after the home was shown: into the home, with its place, story and door */
    const adopt = (e: Editable) => {
      h.editables.push(e);
      if (e.pop) e.pop.since = performance.now(); // it springs in from now, even if its room is already open
      if (opts.warmUp ?? opts.layout !== 'studio') { // (as `warming`, which is not set up yet when a first model lands)
        // have its materials built now, in the background, whether or not its room is open yet
        const shown = e.obj.visible;
        e.obj.visible = true;
        compileShown(e.obj, scene);
        e.obj.visible = shown;
      }
      applyEntry(e, layout[e.key]);
      const story = storiesOf(recipe)[e.key]; // (with its link, if it carries one)
      if (story) spotsOf.get(h)?.push(...addHotspots([e], { [e.key]: story }, opts.storyDot));
      const door = carried.get(e.key);
      if (door) doorMarks.get(h)?.push(...addDoors([e], new Map([[e.key, door]]), (key) => !!own[key], opts.linkCue ?? 'full', opts.storyDot));
    };
    // the models that could wait: each brings its pieces into the home when it arrives
    for (const name of later) {
      fetchModel(name).then(() => {
        const late = h.late;
        if (!late) return;
        for (const s of late.specs.filter((p) => p.kind === name)) {
          late.specs.splice(late.specs.indexOf(s), 1);
          const e = late.add(s);
          if (e) adopt(e);
        }
        wakeDrawing(); // something new to draw
      }).catch((err) => console.error(err));
    }
    // a staged room's pieces, when they land
    arriving?.then((es) => { for (const e of es) adopt(e); wakeDrawing(); }).catch((err) => console.error(err));
    built[recipe.id] = h;
    return h;
  })();
  // a link from another page (or a reload after following one) may name the home to open on: ?home=<id>
  // (or the page says which home it shows: a page made for one home by popfoldFallback({ pages: [{ from }] }))
  const asked = studio ? null : new URLSearchParams(location.search).get('home') ?? document.querySelector('meta[name="popfold-home"]')?.getAttribute('content') ?? null;
  const startBeat = Math.max(0, Math.min(opts.beats.length - 1, Math.round(opts.getStage())));
  const firstHome = storyHome[startBeat] ?? (asked && opts.homes.some((h) => h.id === asked) ? asked : opts.home);
  let house = await loadHome(firstHome);
  let homeId = firstHome;
  house.root.add(av.root);
  scene.add(house.root);
  const sparks = sparkles();
  if (!still) scene.add(sparks);
  // the other homes the story shows: built now, in the background, so the scroll never waits for one
  for (const id of new Set(storyHome)) if (id && id !== firstHome) loadHome(id).catch((err) => console.error(err));

  // ---------- state ----------
  const keyframes = opts.beats.map((b) => b.key);
  const target = { ...keyframes[0] } as State;
  const cur = { ...keyframes[0] } as State;
  const pointer = new THREE.Vector2(0, 0);
  const tilt = new THREE.Vector2(0, 0);
  const camPos = new THREE.Vector3();
  const camTgt = new THREE.Vector3();
  let width = 0, height = 0;
  let avX = 0, avZ = 0.8, avYaw = 0, walkPhase = 0, hop = 0;

  function resize() {
    wakeDrawing();
    // the canvas's own box: the whole window on the site, the stage area in the studio
    width = canvas.clientWidth || innerWidth;
    height = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, [isSmall() ? 1.5 : 2, 1.25, 1][level]));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  // everything this scene listens to is dropped again by dispose()
  const listening = new AbortController();
  const { signal } = listening;
  addEventListener('resize', resize, { signal });
  const sizeWatch = new ResizeObserver(resize);
  sizeWatch.observe(canvas);

  function popItems(items: PopItem[], p: number) {
    for (const it of items) {
      const local = clamp01((p - it.delay) / 0.62);
      // a piece that arrived late springs in from its arrival, so it does not just appear in an open room
      const arrived = it.since === undefined ? 1 : clamp01((performance.now() - it.since) / 500);
      if (it.fold) {
        // a folding piece keeps its size and stands up about its hinge, from lying flat
        it.fold.set(reducedMotion ? local * arrived : foldEase(local) * foldEase(arrived));
        it.obj.visible = local > 0 && !it.obj.userData.hidden;
        it.obj.scale.copy(it.scale);
        continue;
      }
      const s = (reducedMotion ? local : backOut(local)) * (reducedMotion ? arrived : backOut(arrived));
      it.obj.visible = local > 0 && !it.obj.userData.hidden;
      it.obj.scale.copy(it.scale).multiplyScalar(Math.max(0.0001, s));
    }
  }


  // ---------- pointer: tilt + click a room ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  type Part = 'center' | 'left' | 'right' | 'guide';
  const overUi = (t: EventTarget | null) => {
    const el = t as Element | null;
    if (!el || el === canvas || !el.matches) return false;
    if (opts.isOverUi) return opts.isOverUi(el);
    return !el.matches('html, body, main, .stage');
  };
  let hoverPart: Part | null = null;

  function pickAt(clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / width) * 2 - 1, -((clientY - r.top) / height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(house.pickables.filter((o) => o.visible), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o.userData.pick as Part;
    }
    return null;
  }

  /** the story piece under the pointer, if any */
  /** the link a click at this point would follow: a piece that carries one, with no story of its own */
  /** the key of the first piece under this point (the first piece in the way decides) */
  function pieceKeyAt(clientX: number, clientY: number): string | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / width) * 2 - 1, -((clientY - r.top) / height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObject(house.root, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.editKey) o = o.parent;
      if (!o?.visible) continue;
      return o.userData.editKey as string;
    }
    return null;
  }
  function doorAt(clientX: number, clientY: number) {
    const doors = doorsByHome.get(house);
    if (!doors?.size) return null;
    const key = pieceKeyAt(clientX, clientY);
    return key ? doors.get(key) ?? null : null;
  }
  /** the door (any piece that carries a link) under this point */
  function doorMarkAt(clientX: number, clientY: number): Door | null {
    const doors = doorMarks.get(house);
    if (!doors?.length) return null;
    const key = pieceKeyAt(clientX, clientY);
    return key ? doors.find((d) => d.key === key) ?? null : null;
  }
  /** Follow a link: the site's own way, or switch to its home if it names another, then scroll to its section. */
  async function follow(link: Transition) {
    if (opts.onLink) { opts.onLink(link); return; }
    // a hidden page draws no frames: nothing to see, so it jumps at once
    if (pass && effectOf(link) && !document.hidden) {
      if (playing && performance.now() - playing.start < PLAY_MS) return; // one effect at a time: the click before still plays
      const p: NonNullable<typeof playing> = { link, start: performance.now(), jumped: false };
      playing = p;
      // the jump has its own clock, so it happens at the effect's strongest even when frames stop (the frame loop
      // shows the effect; it does not decide when the page goes)
      setTimeout(() => { if (!p.jumped) { p.jumped = true; jump(p.link, 'instant').catch((err) => console.error(err)); } }, PLAY_MS / 2);
      wakeDrawing();
      return;
    }
    await jump(link, reducedMotion ? 'auto' : 'smooth');
  }
  async function jump(link: Transition, behavior: ScrollBehavior) {
    const { section, home } = transitionTarget(link);
    if (home && home !== homeId && opts.homes.some((h) => h.id === home)) await setHome(home, 'link');
    document.getElementById(section)?.scrollIntoView({ behavior, block: 'center' });
  }

  // ---------- effects on the way (effects-pass.ts) ----------
  /** a door's effect, playing: it started at `start`, and the page jumps at its strongest */
  let playing: { link: Transition; start: number; jumped: boolean } | null = null;
  const PLAY_MS = 900;
  /** the stage, eased like every other field, so an effect between two beats moves with the rooms */
  let easedStage = opts.getStage();
  /** the effect a link plays here: its own, or with reduced motion or on a slow device what it plays instead */
  function effectOf(link: Transition): Effect | null {
    const fx = link.effect ? effects[link.effect] : null;
    if (!fx) return null;
    if (reducedMotion || level === 2) return fx.reduced === 'cut' ? null : link.effect === 'fade' ? fx : effects.fade ?? null;
    return fx;
  }
  /** what plays this frame, if anything: a door's effect, or one between the two beats the story is between */
  function effectNow(): { effect: Effect; progress: number; strength: number; link: Transition } | null {
    if (!pass || studio) return null;
    if (playing) {
      const t = Math.min(1, (performance.now() - playing.start) / PLAY_MS);
      if (t >= 0.5 && !playing.jumped) { playing.jumped = true; jump(playing.link, 'instant').catch((err) => console.error(err)); } // at its strongest, out of sight
      const fx = effectOf(playing.link), link = playing.link;
      if (t >= 1) playing = null;
      return fx ? { effect: fx, progress: t, strength: link.strength ?? 1, link } : null;
    }
    const ids = opts.beats.map((b) => b.id), n = ids.length - 1;
    const s = Math.min(n, Math.max(0, easedStage)), i = Math.max(0, Math.min(n - 1, Math.floor(s)));
    const blend = smooth(0.2, 0.8, s - i);
    if (blend <= 0.001 || blend >= 0.999) return null;
    for (const link of withEffect) {
      const to = transitionTarget(link);
      if (to.home) continue; // a link to another home is a door, not a scroll
      const forward = link.from === ids[i] && to.section === ids[i + 1], back = link.from === ids[i + 1] && to.section === ids[i];
      if (!forward && !back) continue;
      const fx = effectOf(link);
      return fx ? { effect: fx, progress: forward ? blend : 1 - blend, strength: link.strength ?? 1, link } : null;
    }
    return null;
  }
  let fxFrame: ReturnType<typeof effectNow> = null;

  // ---------- the story's homes: which one is on show follows the scroll ----------
  /** the home the story wants on show now: past the middle of a step, the next beat's */
  function storyHomeNow(): string | null {
    if (!crossesHomes && !storyHome.some(Boolean)) return null;
    const n = opts.beats.length - 1, s = Math.min(n, Math.max(0, easedStage)), i = Math.max(0, Math.min(n - 1, Math.floor(s)));
    return n === 0 ? storyHome[0] : smooth(0.2, 0.8, s - i) < 0.5 ? storyHome[i] : storyHome[i + 1];
  }
  /** put a built home on show at once, where the story stands (no warm-up: the story's homes are warmed ahead) */
  function swapTo(id: string) {
    const next = built[id];
    if (!next || next === house) return;
    next.root.position.copy(house.root.position);
    next.root.rotation.copy(house.root.rotation);
    scene.remove(house.root);
    house = next;
    homeId = id;
    house.root.add(av.root);
    scene.add(house.root);
    syncButtons();
    followMood(id);
    opts.onHome?.(id, 'story');
  }
  /** run `fn` with another home in the scene for a moment, and put the one on show back (the warm-up) */
  function withHouse<T>(h: House, fn: () => T): T {
    if (h === house) return fn();
    const shown = house;
    scene.remove(shown.root); scene.add(h.root); house = h;
    try { return fn(); } finally { scene.remove(h.root); scene.add(shown.root); house = shown; }
  }

  // ---------- routes: the camera's way between two neighbouring beats, through a link's `via` points ----------
  const beatIds = opts.beats.map((b) => b.id);
  const camOf = (id: string) => { const k = opts.beats.find((b) => b.id === id)!.key; return new THREE.Vector3(k.cx, k.cy, k.cz); };
  /** each link between neighbouring beats that has a route: a curve from the first beat's camera to the second's */
  const routes = new Map<Transition, THREE.Curve<THREE.Vector3>>();
  for (const link of links) {
    const to = transitionTarget(link);
    if (to.home || Math.abs(beatIds.indexOf(link.from) - beatIds.indexOf(to.section)) !== 1 || beatIds.indexOf(link.from) < 0) continue;
    const fx = link.effect ? effects[link.effect] : null;
    if (!link.via?.length && !fx?.objects) continue;
    const points = [camOf(link.from), ...(link.via ?? []).map(([x, y, z]) => new THREE.Vector3(x, y, z)), camOf(to.section)];
    routes.set(link, points.length > 2 ? new THREE.CatmullRomCurve3(points, false, 'centripetal') : new THREE.LineCurve3(points[0], points[1]));
  }
  /** where on its route the camera is now, if the story is between two beats that have one (not with reduced motion) */
  function routeNow(): { curve: THREE.Curve<THREE.Vector3>; t: number; look: 'path' | 'beats' } | null {
    if (!routes.size || reducedMotion || studio) return null;
    const n = beatIds.length - 1, s = Math.min(n, Math.max(0, easedStage)), i = Math.max(0, Math.min(n - 1, Math.floor(s)));
    const blend = smooth(0.2, 0.8, s - i);
    if (blend <= 0 || blend >= 1) return null;
    for (const [link, curve] of routes) {
      if (!link.via?.length) continue; // (a route kept only for an effect's objects does not move the camera)
      const to = transitionTarget(link).section;
      if (link.from === beatIds[i] && to === beatIds[i + 1]) return { curve, t: blend, look: link.look ?? 'beats' };
      if (link.from === beatIds[i + 1] && to === beatIds[i]) return { curve, t: 1 - blend, look: link.look ?? 'beats' };
    }
    return null;
  }
  /** the objects effects bring along routes (the tunnel's tube), made once, shown only while their link's effect plays */
  const props = [...routes].flatMap(([link, curve]) => {
    const fx = link.effect ? effects[link.effect] : null;
    if (!fx?.objects) return [];
    const made = fx.objects({ curve });
    made.object.visible = false;
    scene.add(made.object);
    return [{ link, fx, ...made }];
  });
  const showProps = () => {
    for (const p of props) {
      // only the effect itself, not what reduced motion plays instead
      const on = !!fxFrame && fxFrame.link === p.link && fxFrame.effect === p.fx;
      p.object.visible = on;
      if (on) p.update(fxFrame!.progress, time);
    }
  };
  /** the frame on screen: through the effect playing, or (as always) the plain render */
  function present() {
    if (fxFrame && pass) pass.render(scene, camera, fxFrame.effect, fxFrame.progress, fxFrame.strength, time);
    else renderer.render(scene, camera);
  }

  function storyAt(clientX: number, clientY: number) {
    const spots = (spotsOf.get(house) ?? []).filter((h) => h.dot.visible);
    if (!spots.length || !opts.onStory) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / width) * 2 - 1, -((clientY - r.top) / height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(spots.map((h) => h.obj), true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !spots.some((h) => h.obj === o)) o = o.parent;
    return o ? spots.find((h) => h.obj === o) ?? null : null;
  }

  addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / width) * 2 - 1, (e.clientY / height) * 2 - 1);
    lastInput = performance.now();
    if (e.pointerType === 'mouse') {
      // only hit-test when the pointer isn't over page content
      const ui = overUi(e.target);
      const story = ui || !flags.pick ? null : storyAt(e.clientX, e.clientY);
      hoverPart = ui ? null : pickAt(e.clientX, e.clientY);
      const door = ui || story || !flags.pick ? null : doorAt(e.clientX, e.clientY);
      // a linked piece under the pointer glows and says where it leads
      const mark = ui || !flags.pick || studio ? null : doorMarkAt(e.clientX, e.clientY);
      if (mark !== hoveredDoor) { hoveredDoor = mark; wakeDrawing(); }
      showDoorLabel(mark, e.clientX, e.clientY);
      canvas.classList.toggle('is-hover', !!(hoverPart || story || door));
      document.body.style.cursor = !ui && (hoverPart || story || door) ? 'pointer' : '';
    }
  }, { passive: true, signal });

  /** a link's button shows only while the home it starts from is on show */
  const syncButtons = () => { for (const a of document.querySelectorAll<HTMLElement>('a.pf-link-button[data-pf-from-home]')) a.hidden = a.dataset.pfFromHome !== homeId; };
  syncButtons();
  // a link's button in its section's text card (the page without 3D wrote it; in 3D it plays the link's effect)
  addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a.pf-link-button[data-pf-link]') : null;
    if (!a || studio || !document.documentElement.classList.contains('has-3d')) return;
    const link = links.find((t) => linkKey(t) === a.dataset.pfLink);
    if (!link) return;
    e.preventDefault();
    follow(link).catch((err) => console.error(err));
  }, { signal });

  // Enter or Space on a written-out story (the page without 3D writes them, and they stay in the page for
  // keyboards and screen readers) opens the same card a click on its piece does, beside the piece.
  addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !opts.onStory) return;
    const key = e.target instanceof HTMLElement && e.target.matches('.pf-story') ? e.target.dataset.pfStory : undefined;
    const spot = key ? (spotsOf.get(house) ?? []).find((h) => h.key === key) : undefined;
    if (!spot) return;
    e.preventDefault(); // Space would scroll the page
    const where = () => {
      const r = canvas.getBoundingClientRect();
      const at = spot.dot.getWorldPosition(new THREE.Vector3()).project(camera);
      let shown = spot.obj.visible && !spot.obj.userData.hidden; // (a closed room's pieces are hidden)
      spot.obj.traverseAncestors((o) => { shown &&= o.visible; });
      const seen = shown && at.z < 1 && Math.abs(at.x) < 1 && Math.abs(at.y) < 1;
      return { seen, x: seen ? r.left + ((at.x + 1) / 2) * r.width : r.left + r.width / 2, y: seen ? r.top + ((1 - at.y) / 2) * r.height : r.top + r.height / 2 };
    };
    const now = where();
    // a piece out of view (its room closed, or off screen): go to the story's own section first, the beat that shows
    // the piece, and open the card beside it once the camera has arrived (mid-screen if it still cannot be seen)
    const section = (e.target as HTMLElement).closest('section.stage');
    if (now.seen || !section) { opts.onStory(spot.story, spot.key, now.x, now.y); return; }
    section.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
    const until = performance.now() + 2500;
    const settle = () => {
      if (signal.aborted) return;
      const there = where();
      if ((resting && there.seen) || performance.now() > until) { opts.onStory?.(spot.story, spot.key, there.x, there.y); return; }
      setTimeout(settle, 100);
    };
    setTimeout(settle, 300);
  }, { signal });

  addEventListener('click', (e) => {
    if (overUi(e.target) || orbitMoved || !flags.pick) return;
    const story = storyAt(e.clientX, e.clientY);
    if (story) { opts.onStory?.(story.story, story.key, e.clientX, e.clientY); return; }
    const door = doorAt(e.clientX, e.clientY);
    if (door) { follow(door).catch((err) => console.error(err)); return; }
    if (opts.onZone && house.zones) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / width) * 2 - 1, -((e.clientY - r.top) / height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      let o: THREE.Object3D | null = ray.intersectObject(house.root, true)[0]?.object ?? null;
      while (o && !o.userData.zoneId) o = o.parent;
      if (o) { opts.onZone(o.userData.zoneId as string); return; }
    }
    const part = pickAt(e.clientX, e.clientY);
    if (part === 'guide') {
      // say hi: a little hop
      if (hop <= 0) hop = 1;
    } else if (part) opts.onPick?.(part, cur);
  }, { signal });

  // ---------- studio: free orbit camera (loaded only when first switched on) ----------
  let orbit: import('three/addons/controls/OrbitControls.js').OrbitControls | null = null;
  let orbitMoved = false;
  let orbitFresh = true; // take over from wherever the story camera is on the next frame
  async function setOrbit(on: boolean) {
    flags.orbit = on;
    if (on && !orbit) {
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      orbit = new OrbitControls(camera, canvas);
      orbit.enableDamping = true;
      orbit.addEventListener('start', () => { orbitMoved = false; });
      orbit.addEventListener('change', () => { orbitMoved = true; });
    }
    if (orbit) {
      orbit.enabled = flags.orbit;
      if (flags.orbit) orbitFresh = true;
    }
  }

  // ---------- loop ----------
  // seconds since the last frame drawn by the scene's own loop
  let lastFrame = performance.now();
  const sinceLastFrame = () => { const now = performance.now(); const d = (now - lastFrame) / 1000; lastFrame = now; return d; };
  let time = 0;
  let held = false;
  // drawing less when little is happening (quality: 'auto')
  const economy = (opts.quality ?? (studio ? 'high' : 'auto')) === 'auto';
  let resting = false, skip = false, lastInput = 0, lastCall = performance.now(), pace = 16, paced = 0;
  /** the picture at rest has been drawn (with the decoration still, it is the last one needed), at this stage */
  let drawnAtRest = false, restStage = -1;
  wakeDrawing = () => { lastInput = performance.now(); };
  let trialFrom = 0, settledQuality = false;
  function setLevel(n: number) {
    level = n;
    sun.shadow.mapSize.setScalar(level === 2 || isSmall() ? 1024 : 2048);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    resize();
  }

  /** while warming up: the beat to show, as it is, in place of the story's place and its easing */
  let jumpTo: State | null = null;
  function frame(_t?: number, _f?: unknown, fixedDt?: number, draw = true) {
    if (held && fixedDt === undefined) return; // on hold: only step() moves the scene
    if (economy && fixedDt === undefined) {
      const now = performance.now(), gap = now - lastCall;
      lastCall = now;
      // A device that cannot keep up gets an easier picture: fewer pixels first, then a smaller shadow map.
      // Slow frames can also mean a display that is simply capped (30 Hz, a power saver), so each step down is a
      // trial: if the frames do not come noticeably faster, it is undone and the scene stops adjusting.
      if (gap < 250) { pace = pace * 0.95 + gap * 0.05; paced++; }
      if (!settledQuality && paced > 90) {
        if (trialFrom) {
          if (pace > trialFrom * 0.85) { setLevel(level - 1); settledQuality = true; }
          trialFrom = 0; paced = 0;
        } else if (pace > 26 && level < 2) { trialFrom = pace; setLevel(level + 1); paced = 0; }
      }
      // at rest with the decoration held still, the picture cannot change: once it is drawn, draw nothing until the
      // story moves (the scroll), the pointer moves or something wakes the drawing
      if (resting && still && drawnAtRest && opts.getStage() === restStage && now - lastInput > 600) return;
      // at rest, with only ambient motion (float, sparkles, a lamp's pulse) on screen: every other frame is enough
      // (not on a display that is already slow: half of 30 frames a second would show)
      if (resting && pace < 25 && (skip = !skip)) return;
    }
    const dt = (fixedDt ?? Math.min(0.05, sinceLastFrame())) * flags.speed;
    time += dt;

    let moving = 0; // how far the story still has to travel
    if (jumpTo) {
      // (warming up: be at this beat outright, with nothing easing towards it)
      // (and every zone the beat does not mention is shut, whatever beat the story was at before)
      for (const s of [target, cur]) for (const key in s) if (key.startsWith('z:') && !(key in jumpTo)) s[key] = 0;
      Object.assign(target, jumpTo);
      Object.assign(cur, jumpTo);
      easedStage = Math.max(0, keyframes.indexOf(jumpTo));
    } else {
      const stage = opts.getStage();
      sample(keyframes, stage, target);
      Object.assign(target, override);
      const lambda = reducedMotion ? 30 : 5.5;
      const a = 1 - Math.exp(-lambda * dt);
      easedStage += (stage - easedStage) * a;
      for (const key of FIELDS) { const d = target[key] - cur[key]; cur[key] += d * a; moving = Math.max(moving, Math.abs(d)); }
      for (const key in target) if (key.startsWith('z:')) { const d = target[key] - (cur[key] ?? 0); cur[key] = (cur[key] ?? 0) + d * a; moving = Math.max(moving, Math.abs(d)); }
    }
    resting = moving < 0.002 && hop <= 0 && !flags.orbit && !playing && !doorsBusy(doorMarks.get(house) ?? [], performance.now()) && performance.now() - lastInput > 600;
    if (!resting) drawnAtRest = false;
    else if (draw && !drawnAtRest) { drawnAtRest = true; restStage = opts.getStage(); }
    // an effect on the way plays only on frames that are seen (not the warm-up's unseen ones)
    fxFrame = draw && !jumpTo ? effectNow() : null;
    if (!jumpTo && !flags.orbit) { const want = storyHomeNow(); if (want && want !== homeId) swapTo(want); }
    showProps();

    // the shell moves its own parts (a lid and drawers, a diorama's walls, a tower's floors) to where the story is
    const { open: lidOpen, lit: centerProps } = house.update(cur, { time, dt, fold: flags.fold, reducedMotion, still, pop: popItems });
    updateHotspots(spotsOf.get(house) ?? [], still ? 0 : time, flags.hotspots && !fxFrame, lidOpen);
    {
      const doors = doorMarks.get(house) ?? [], now = performance.now();
      if (!studio && !jumpTo) { const k = Math.round(easedStage); if (Math.abs(easedStage - k) < 0.08) beckonAt(doors, opts.beats[k]?.id ?? null, now); }
      updateDoors(doors, still ? 0 : time, flags.hotspots && !fxFrame, hoveredDoor, now);
    }

    // lamp glow
    const g = cur.glow * centerProps;
    for (const lamp of house.lamps ?? []) {
      if (lamp.anchor) house.root.worldToLocal(lamp.anchor.getWorldPosition(lamp.light.position));
      const lg = lamp.shown && !lamp.shown() ? 0 : g; // a lamp whose piece is not in sight yet stays dark
      lamp.light.intensity = lg * 9;
      if (lamp.bulb) (lamp.bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + lg * 2.6;
      if (lamp.halo) {
        (lamp.halo.material as THREE.SpriteMaterial).opacity = lg * 0.9;
        lamp.halo.scale.setScalar(1.1 + lg * 0.5 + (still ? 0 : Math.sin(time * 3) * 0.06 * lg));
      }
    }

    // badges
    house.badges.forEach((b, i) => {
      const p = clamp01((cur.badges - i * 0.18) / 0.5);
      b.visible = p > 0.01;
      const s = (reducedMotion ? p : backOut(p)) * 0.95;
      b.scale.setScalar(Math.max(0.0001, s));
      b.position.y = b.userData.basePos.y + (still ? 0 : Math.sin(time * 2 + i) * 0.08);
    });

    // the guide figure: walks to wherever the story is, waves, and looks toward the pointer
    {
      const appear = clamp01((cur.av - 0.5) / 0.5) * clamp01((cur.c - 0.5) / 0.5 + 0.001);
      av.root.visible = flags.avatar && appear > 0.01;
      const dx = cur.ax - avX, dz = cur.az - avZ;
      const speed = Math.hypot(dx, dz) / Math.max(dt, 0.001);
      avX = cur.ax; avZ = cur.az;
      const moving = reducedMotion ? 0 : clamp01(speed / 0.8);
      walkPhase += Math.min(speed, 6) * dt * 6.5;
      const step = Math.sin(walkPhase) * moving;

      // the shell says where its floor is (a compact's drawers sit a little lower than its centre floor)
      hop = Math.max(0, hop - dt * 1.8);
      const hopY = reducedMotion ? 0 : Math.sin((1 - hop) * Math.PI) * 0.4 * (hop > 0 ? 1 : 0);
      av.root.position.set(avX, (house.ground?.(avX, avZ) ?? 0) + hopY, avZ);
      av.root.scale.setScalar(Math.max(0.0001, (reducedMotion ? appear : backOut(appear)) * (house.guideSize ?? 0.95)));

      // face the way she walks, otherwise face the camera
      const want = moving > 0.15
        ? Math.atan2(dx, dz)
        : Math.atan2(camera.position.x - avX, camera.position.z - avZ) - house.root.rotation.y;
      let d = want - avYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      avYaw += d * (1 - Math.exp(-(reducedMotion ? 30 : 7) * dt));
      av.root.rotation.y = avYaw;

      av.legL.rotation.x = step * 0.75;
      av.legR.rotation.x = -step * 0.75;
      av.armL.rotation.x = -step * 0.6;
      av.body.position.y = Math.abs(Math.cos(walkPhase)) * 0.035 * moving;
      av.skirt.rotation.z = step * 0.07;
      const wave = cur.wave * (1 - moving) + (hop > 0 ? 1 : 0);
      const w = clamp01(wave);
      av.armR.rotation.x = step * 0.6 * (1 - w);
      av.armR.rotation.z = av.armRest + w * 2.3 + (reducedMotion ? 0 : Math.sin(time * 9) * 0.28 * w);
      if (!still) {
        av.body.rotation.z = Math.sin(time * 1.6) * 0.025;
        av.head.rotation.y = tilt.x * 0.45 * (1 - moving);
        av.head.rotation.x = tilt.y * 0.25 * (1 - moving);
        av.head.rotation.z = Math.sin(time * 1.1) * 0.05;
      }
    }

    // idle float + pointer tilt
    sparks.visible = flags.sparkles;
    if (!still && !flags.idle) {
      house.root.position.y = 0.35 * cur.hero;
      house.root.rotation.set(0, 0, 0);
      for (const m of house.mixers) m.update(dt);
    } else if (!still) {
      tilt.lerp(pointer, 1 - Math.exp(-3 * dt));
      house.root.position.y = 0.35 * cur.hero + Math.sin(time * 1.3) * 0.12 * cur.hero;
      house.root.rotation.y = Math.sin(time * 0.45) * 0.45 * cur.hero + tilt.x * 0.12;
      house.root.rotation.x = tilt.y * 0.05;
      for (const s of house.spinners) {
        s.obj.rotation.y += s.spin * dt;
        if (s.bob) s.obj.position.y = s.baseY + Math.sin(time * 2) * s.bob;
      }
      for (const m of house.mixers) m.update(dt);
      sparks.rotation.y += dt * 0.04;
      (sparks.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(time * 1.7) * 0.3;
    } else {
      house.root.position.y = 0.35 * cur.hero;
    }

    // camera: pull back on narrow screens, and slide the house beside the text on wide ones
    if (flags.orbit && orbit && !orbitFresh) {
      orbit.update();
      if (draw) renderer.render(scene, camera);
      return;
    }
    camPos.set(cur.cx, cur.cy, cur.cz);
    camTgt.set(cur.tx, cur.ty, cur.tz);
    // between two beats with a route (a link's `via`), the camera flies it instead of the straight line
    const route = jumpTo || flags.orbit ? null : routeNow();
    if (route) {
      route.curve.getPointAt(route.t, camPos);
      if (route.look === 'path') route.curve.getPointAt(Math.min(1, route.t + 0.04), camTgt);
    }
    const aspect = width / height;
    if (aspect < 1.25) camPos.sub(camTgt).multiplyScalar(Math.pow(1.25 / aspect, 0.85)).add(camTgt);
    camera.position.copy(camPos);
    camera.lookAt(camTgt);
    if (studio) {
      camera.clearViewOffset();
    } else if (isSmall()) {
      camera.setViewOffset(width, height, 0, height * (0.17 + 0.07 * cur.hero), width, height); // house sits above the bottom card
    } else {
      camera.setViewOffset(width, height, -cur.side * width * 0.2, 0, width, height);
    }

    if (flags.orbit && orbit && orbitFresh) { orbitFresh = false; orbit.target.copy(camTgt); orbit.update(); }
    if (draw) present();
  }

  /** Swap to another home; the scroll position and the guide figure carry over. */
  /**
   * Build a home again, from a changed recipe when one is given (it replaces the home of the same id), and show
   * it in place of the old build if it is the home on show. The studio uses it after it has rewritten the file.
   */
  async function rebuildHome(recipe?: HomeRecipe) {
    const id = recipe?.id ?? homeId;
    if (recipe) {
      const at = opts.homes.findIndex((h) => h.id === id);
      if (at >= 0) opts.homes[at] = recipe; else opts.homes.push(recipe);
    }
    delete homes[id];
    if (homeId === id) await setHome(id, 'rebuild');
  }
  /**
   * Replace the story's beats (the studio does, after a beat is added, removed, moved or renamed): the camera and
   * what each beat does follow at once. What was worked out from the beats at the start keeps the beats it started
   * with: routes between beats, effects on the way, and a story that moves between homes (the studio uses none).
   */
  function setBeats(beats: Beat[]) {
    opts.beats.splice(0, opts.beats.length, ...beats);
    keyframes.splice(0, keyframes.length, ...beats.map((b) => b.key));
    wakeDrawing();
  }
  /**
   * Replace the links. Each home's doors and story-card links are made when the home is built, so the homes not on
   * show are built again when next shown; call rebuildHome() for the one on show. (Effects keep the list they
   * started with: the studio, which uses this, plays none.)
   */
  function setTransitions(list: Transition[]) {
    links.splice(0, links.length, ...list);
    for (const id of Object.keys(homes)) if (id !== homeId) delete homes[id];
  }
  async function setHome(id: string, why: 'switch' | 'link' | 'rebuild' = 'switch') {
    homeId = id;
    wakeDrawing();
    const next = await loadHome(id);
    if (homeId !== id || next === house) return; // a later choice won, or nothing to do
    next.root.position.copy(house.root.position);
    next.root.rotation.copy(house.root.rotation);
    if (warming) {
      // build what the new home shows right now before it replaces the old one: laid out off screen as the
      // story stands, compiled against this scene's lights, and only then swapped in
      const old = house;
      house = next;
      frame(0, undefined, 0, false);
      const built = compileShown(next.root, scene);
      house = old;
      frame(0, undefined, 0, false);
      await built;
      if (homeId !== id || disposed) return;
    }
    scene.remove(house.root);
    house = next;
    house.root.add(av.root);
    scene.add(house.root);
    syncButtons();
    if (why !== 'rebuild') followMood(id); // (a rebuild keeps whatever light the page chose)
    opts.onHome?.(id, why);
    warmed = warmUp(); // and its other beats, in the background
  }

  /** Day: the site's bright light. Evening: dim sun, warm sky, lamps on. */
  function setLighting(mode: SceneFlags['lighting']) {
    flags.lighting = mode;
    wakeDrawing();
    const p = light[mode];
    sun.intensity = p.sunIntensity;
    sun.color.set(p.sun);
    hemi.intensity = p.skyIntensity;
    hemi.color.set(p.sky);
    hemi.groundColor.set(p.ground);
    scene.environmentIntensity = p.env;
    if (mode === 'evening') override.glow = 1; else delete override.glow;
  }
  /** take the time of day of the home going on show (a site's own setLighting() lasts until the home changes) */
  const followMood = (id: string) => { const mood = recipeOf(id).mood ?? 'day'; if (mood !== flags.lighting) setLighting(mood); };

  /**
   * For captures and tests. hold(true) stops the scene's own clock and puts every moving part (animated props,
   * spinning pieces, light pipes, anything timed) back to its starting pose; from then on only step(n) advances
   * it, in fixed 1/30 s frames. Holding, stepping the same number of frames and taking a snapshot gives the same
   * picture every time. hold(false) lets it run again.
   */
  function hold(on: boolean) {
    held = on;
    if (!on) { sinceLastFrame(); return; }
    time = 0;
    for (const m of house.mixers) m.setTime(0);
    for (const s of house.spinners) { s.obj.rotation.y = s.baseRot; s.obj.position.y = s.baseY; }
    house.reset?.();
  }
  const step = (n = 60) => { for (let i = 0; i < n; i++) frame(0, undefined, 1 / 30); };

  /** Fold everything back a little so the furniture springs in again. */
  function replayPop() {
    cur.c = Math.min(cur.c, 0.5);
    cur.L = Math.min(cur.L, 0.55);
    cur.R = Math.min(cur.R, 0.55);
  }

  /** PNG of the current view (transparent background). */
  function snapshot() {
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  }
  /**
   * PNG of the current view drawn through an effect at `progress` (0..1): to see an effect, or to check that the
   * pass itself changes nothing. A name, or an effect of one's own.
   */
  function snapshotEffect(effect: string | Effect, progress: number, strength = 1) {
    const fx = typeof effect === 'string' ? effects[effect] : effect;
    if (!fx) return snapshot();
    (passForSnapshots ??= pass ?? createEffectPass(renderer)).render(scene, camera, fx, progress, strength, time);
    return canvas.toDataURL('image/png');
  }
  let passForSnapshots: ReturnType<typeof createEffectPass> | null = null;

  /**
   * Stop the scene for good: its loop, everything it listens to, and the GPU memory it holds. For pages that
   * swap content without reloading (single-page apps, component frameworks) and for tests. The canvas is left
   * in place; start a new scene on it with startScene().
   */
  let removeDebug: (() => void) | null = null;
  function dispose() {
    disposed = true;
    pass?.dispose();
    for (const p of props) { scene.remove(p.object); p.object.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); }); }
    if (passForSnapshots !== pass) passForSnapshots?.dispose();
    removeDebug?.();
    renderer.setAnimationLoop(null);
    listening.abort();
    sizeWatch.disconnect();
    orbit?.dispose();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const mat of [m.material ?? []].flat() as THREE.Material[]) {
        for (const v of Object.values(mat)) if ((v as THREE.Texture | null)?.isTexture) (v as THREE.Texture).dispose();
        mat.dispose();
      }
    });
    scene.environment?.dispose();
    pmrem.dispose();
    renderer.dispose();
    const w = window as unknown as { __popfold?: { scene: unknown } };
    if (w.__popfold?.scene === api) delete w.__popfold;
  }

  /**
   * The home on show as plain data, for tools and agents that cannot look: every piece with its key, where it is
   * and how big, which stories found a piece, and every kind of piece it can use. Positions are in the piece's own room; `world` and `size` are in
   * scene units as it stands now.
   */
  function describe() {
    const recipe = recipeOf(homeId);
    const stories = storiesOf(recipe);
    const box = new THREE.Box3(), v = new THREE.Vector3();
    const r = (n: number) => Math.round(n * 1000) / 1000;
    house.root.updateMatrixWorld(true);
    const pieces = house.editables.map((e) => {
      const shown = e.obj.visible, scale = e.obj.scale.clone();
      // measure it as it will be once popped in, not as the tiny thing it is while its room is shut
      e.obj.visible = true; e.obj.scale.copy(e.pop?.scale ?? e.home.s); e.obj.updateMatrixWorld(true);
      // (without its story dot: the dot floats over the piece and pulses, so it would change the size with the time)
      const dots = e.obj.children.filter((o) => o.userData.storyKey);
      for (const d of dots) e.obj.remove(d);
      box.setFromObject(e.obj);
      for (const d of dots) e.obj.add(d);
      const size = box.getSize(v).toArray().map(r), world = box.getCenter(v).toArray().map(r);
      e.obj.visible = shown; e.obj.scale.copy(scale); e.obj.updateMatrixWorld(true);
      return { key: e.key, room: e.room, name: e.name, id: e.id ?? null, position: e.obj.position.toArray().map(r), turn: r(e.obj.rotation.y), world, size,
        hidden: !!e.obj.userData.hidden, story: stories[e.key]?.title ?? null, moved: !!layouts[recipe.id]?.[e.key] };
    });
    const keys = new Set(pieces.map((p) => p.key));
    return {
      home: recipe.id, name: recipe.name, shell: shellOf(recipe).name,
      beats: opts.beats.map((b) => ({ id: b.id, name: b.name })), zones: (house.zones ?? []).map((z) => z.id),
      pieces, storiesWithoutPiece: Object.keys(stories).filter((k) => !keys.has(k)),
      // every kind of piece it can use, and where each is listed (model files it does not load are found by the
      // dev server, which can read the folders: GET /__popfold/library)
      kinds: libraryOf(opts.homes, recipe.id).map(({ kind, from, file, usable, why, used }) => ({ kind, from, ...(file ? { file } : {}), usable, ...(why ? { why } : {}), used })),
      placesWithoutPiece: Object.keys(layouts[recipe.id] ?? {}).filter((k) => !keys.has(k)),
    };
  }

  renderer.setAnimationLoop(frame);

  // Warm-up. A material is built the first time it is drawn, which takes long enough to see: a stall as each
  // room first opens. So once the home is on show, every other beat of the story is set up in turn, without
  // being drawn, and the browser is asked to build what that beat shows, in the background where it can. The
  // scene is put back as it was before the next frame is drawn, so nothing of this is ever on screen.
  let disposed = false;
  const warming = !!(opts.warmUp ?? !studio);
  /** how long the last warm-up took, in ms: undefined while one runs, null when the scene does none */
  let warmMs: number | null | undefined = warming ? undefined : null;
  /**
   * Lay the home out as at one beat, hand what it shows to `build`, and put it back, all in one go: the browser
   * shows nothing until this returns, and by then the scene is as it was. `drawn` says that `build` drew the
   * beat; the real view is then drawn over it at once, since the frame loop may skip a frame at rest.
   */
  /**
   * renderer.compileAsync, but only for what `root` shows. three.js builds a program for every mesh under the
   * root, hidden or not, so a piece that is never shown (or a hidden mesh sharing a material with a morphing one)
   * cost programs nobody uses. The set of programs is settled before compile() returns, so the hidden meshes'
   * materials are only lent away for that moment.
   */
  function compileShown(root: THREE.Object3D, lights?: THREE.Scene) {
    const shown = new Set<THREE.Object3D>();
    root.traverseVisible((o) => shown.add(o));
    const lent: [THREE.Mesh, THREE.Mesh['material']][] = [];
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.material && !shown.has(o)) { lent.push([m, m.material]); (m as { material: unknown }).material = null; } });
    try { return renderer.compileAsync(root, camera, lights).catch(() => undefined); }
    finally { for (const [m, mat] of lent) m.material = mat; }
  }
  function atBeat<T>(key: State, build: () => T, drawn = false): T {
    const was = { cur: { ...cur }, target: { ...target } };
    jumpTo = key;
    frame(0, undefined, 0, false); // no time passes and nothing is drawn
    const out = build();
    jumpTo = null;
    for (const k of Object.keys(cur)) delete (cur as Record<string, number>)[k];
    for (const k of Object.keys(target)) delete (target as Record<string, number>)[k];
    Object.assign(cur, was.cur); Object.assign(target, was.target);
    frame(0, undefined, 0, drawn); // and back
    return out;
  }
  async function warmUp() {
    if (!warming) return;
    // not before whoever called has had its say: a site adds lights of its own once it has the scene, and
    // everything built before that would be built again for the new count of lights
    await new Promise((r) => setTimeout(r, 0));
    const t0 = performance.now(), run = ++warmRuns;
    warmMs = undefined;
    const story = storyHome.some(Boolean);
    for (const [n, key] of keyframes.entries()) {
      if (disposed || run !== warmRuns) return; // the scene went away, or another warm-up began (a home was switched)
      // the home this beat shows: on a story that moves between homes, its own; otherwise the one on show
      const h = story && storyHome[n] ? await loadHome(storyHome[n]!).catch(() => null) : house;
      if (!h || disposed || run !== warmRuns) continue;
      // first the bulk of it, built by the browser in the background (another home is in the scene only for the
      // moment it takes to lay it out and hand it over: nothing of it is drawn)
      await withHouse(h, () => atBeat(key, () => compileShown(scene)));
      if (disposed || run !== warmRuns) return;
      // then one real draw of the beat, which nobody sees (the true view is drawn over it before the browser
      // shows anything). It builds what only a draw builds: the shadow pass's own shaders, and any variant the
      // background build did not foresee. With the bulk ready, it is quick.
      withHouse(h, () => atBeat(key, () => renderer.render(scene, camera)));
      frame(0, undefined, 0, true); // and the true view over it
      await new Promise((r) => setTimeout(r, 0)); // let a frame through between beats
    }
    const home = house;
    if (pass) {
      const used = [...new Set(withEffect.map(effectOf).filter((fx): fx is Effect => !!fx))];
      if (disposed || house !== home) return;
      await pass.warm(used);
      for (const p of props) {
        p.object.visible = true;
        await renderer.compileAsync(p.object, camera, scene).catch(() => undefined);
        p.object.visible = false;
      }
    }
    warmMs = performance.now() - t0;
  }
  let warmed: Promise<void> = Promise.resolve();
  let warmRuns = 0;
  const api = {
    renderer, camera, scene, canvas, setHome, rebuildHome, setBeats, setTransitions, setOrbit, snapshotEffect, setLighting, replayPop, snapshot, hold, step, dispose, describe, flags, override,
    /** the ids of every home this scene can show */
    homes: opts.homes.map((h) => h.id),
    /** the house on show, and the layout it was loaded with */
    get house() { return house; },
    layoutOf: (id: string) => layouts[id] ?? {},
    get orbit() { return orbit; },
    /** settles when the warm-up is over: every beat's materials are built (at once, if there was no warm-up) */
    get warmed() { return warmed; },
    /** how long the last warm-up took, in ms: undefined while one runs, null when the scene does none */
    get warmMs() { return warmMs; },
    /** the effect playing on screen this frame, if any (for debugging and tests) */
    get effect() { return fxFrame ? { name: Object.keys(effects).find((k) => effects[k] === fxFrame!.effect) ?? 'own', progress: fxFrame.progress, strength: fxFrame.strength, from: fxFrame.link.from, quality: level } : null; },
    /** live (smoothed) state, for read-outs */
    state: cur as Readonly<State>,
    get homeId() { return homeId; },
    /** where the story stands: the beat it is easing towards (fractional between two), as getStage gives it */
    get stage() { return easedStage; },
    /** for read-outs: the quality level the scene has settled on (0 full .. 2 lowest) and whether it is drawing at half rate */
    get economy() { return { level, resting }; },
  };
  // dev-only, for tools and agents: window.__popfold.scene is this scene, and step(n) advances the animation n
  // frames of 1/30 s by hand (a background tab does not animate on its own)
  if (import.meta.env.DEV) {
    (window as unknown as { __popfold: unknown }).__popfold = { scene: api, step };
  }
  followMood(homeId); // the first home's time of day, before anything is warmed
  // the site's own additions to the scene (lights, above all) go in before anything is warmed or handed back
  await opts.onScene?.(api);
  warmed = warmUp();
  if (opts.warmUp === 'wait') await warmed;
  opts.onHome?.(homeId, 'start');
  if (opts.debug !== false) removeDebug = installDebug({ scene: api, beats: opts.beats, getStage: opts.getStage, readyMs: performance.now(), rows: opts.debugRows, studio: opts.debugStudio });
  return api;
}
