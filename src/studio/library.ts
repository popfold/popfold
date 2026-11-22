// The studio's object view: every kind of piece the home on show can use (the site's kinds, Popfold's built-in
// pieces, model files), each with a picture and where it is used, and a button that adds one to a room. The
// pictures are drawn once by a small renderer of their own and kept for the visit (a model's again when its file
// changes).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { kindOf } from '../builtins';
import { libraryOf, type LibraryEntry, type ModelFile } from '../pieces';
import { shellOf } from '../shell';
import type { HomeRecipe, PieceSpec } from '../types';

type Engine = Awaited<ReturnType<typeof import('../engine').startScene>>;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SIZE = 192;

/** "dream-wall" -> "Dream wall" */
const roomLabel = (room: string) => { const t = room.replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const kb = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`;
const FROM: Record<LibraryEntry['from'], string> = { site: 'Site', 'built-in': 'Built-in', model: 'Model' };

export interface LibraryHost {
  engine: Engine;
  getHome: () => string;
  homes: () => HomeRecipe[];
  /** add a piece of `kind` to `room`; says how it went */
  add: (kind: string, room: string, wall: boolean) => Promise<string>;
  /** the site's base URL, where model files are fetched from */
  base: string;
}

export function createLibrary(host: LibraryHost) {
  const drawer = $('library');
  const grid = $('library-grid');
  const note = $('library-note');
  const count = $('library-count');
  const search = $<HTMLInputElement>('library-search');
  const roomSel = $<HTMLSelectElement>('library-room');
  const wallBox = $<HTMLInputElement>('library-wall');
  const filters = $('library-filter');
  let filter: 'all' | LibraryEntry['from'] | 'unused' = 'all';
  let files: ModelFile[] = [];
  let entries: LibraryEntry[] = [];

  for (const [value, label] of [['all', 'All'], ['site', 'Site'], ['built-in', 'Built-in'], ['model', 'Models'], ['unused', 'Unused']] as const) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: label });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(value === filter));
    b.addEventListener('click', () => {
      filter = value;
      for (const c of filters.children) c.setAttribute('aria-checked', String(c === b));
      render();
    });
    filters.append(b);
  }
  search.addEventListener('input', () => render());

  // ----- the pictures: one small renderer, a plain floor-less stage, the piece fitted to the frame -----
  let renderer: THREE.WebGLRenderer | null = null;
  const stage = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
  const pictures = new Map<string, string>(); // "<home>|<kind>|<file date>" -> data URL
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  function setUp() {
    if (renderer) return renderer;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    stage.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    stage.environmentIntensity = 0.6;
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(3, 6, 4);
    stage.add(sun, new THREE.HemisphereLight('#ffffff', '#d9d3ea', 0.9));
    return renderer;
  }

  /** the piece to draw: a copy of one already in the home on show, or one built from its kind or its model file */
  async function pieceFor(e: LibraryEntry): Promise<{ obj: THREE.Object3D; own: boolean } | null> {
    const shown = host.engine.house.editables.find((x) => x.listed?.spec.kind === e.kind || (!x.listed && x.obj.userData.propName === e.kind));
    if (shown) {
      const obj = shown.obj.clone();
      for (const d of obj.children.filter((c) => c.userData.storyKey)) obj.remove(d); // its story dot
      obj.visible = true;
      return { obj, own: false };
    }
    if (e.from === 'model' && e.file) {
      const gltf = await loader.loadAsync(`${host.base}${e.file}`);
      return { obj: gltf.scene, own: true };
    }
    const recipe = host.homes().find((h) => h.id === host.getHome());
    const kind = recipe && kindOf(recipe, e.kind);
    if (!kind) return null;
    // a kind is built for a room; here there is none, so whatever it asks of one gives nothing
    const ctx = new Proxy({ recipe } as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : () => null) });
    const spec: PieceSpec = { id: 'picture', room: '', kind: e.kind, at: [0, 0] };
    const made = kind(spec, ctx as never);
    return { obj: made instanceof THREE.Object3D ? made : made.group, own: true };
  }

  async function draw(e: LibraryEntry): Promise<string | null> {
    const key = `${host.getHome()}|${e.kind}|${e.modified ?? ''}`;
    const had = pictures.get(key);
    if (had) return had;
    const got = await pieceFor(e).catch(() => null);
    if (!got) return null;
    const r = setUp();
    const { obj } = got;
    obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); obj.scale.setScalar(1);
    stage.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const flat = box.getSize(new THREE.Vector3()).y < 0.08; // a rug: seen from above
    const dir = flat ? new THREE.Vector3(0.2, 1.4, 0.9) : new THREE.Vector3(0.9, 0.55, 1.6);
    const far = Math.max(sphere.radius, 0.05) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    camera.position.copy(sphere.center).addScaledVector(dir.normalize(), far);
    camera.near = far / 50; camera.far = far * 4;
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
    r.render(stage, camera);
    const url = r.domElement.toDataURL('image/png');
    stage.remove(obj);
    if (got.own) obj.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); for (const x of ([] as THREE.Material[]).concat(m.material ?? [])) x.dispose(); });
    pictures.set(key, url);
    return url;
  }

  // the pictures are drawn one after another, so a long list does not hold the page up
  let queue: { e: LibraryEntry; img: HTMLImageElement; slot: HTMLElement }[] = [];
  let drawing = false;
  async function drawQueued() {
    if (drawing) return;
    drawing = true;
    while (queue.length) {
      const { e, img, slot } = queue.shift()!;
      const url = await draw(e);
      if (url) { img.src = url; slot.classList.add('is-drawn'); } else slot.classList.add('is-blank');
      await new Promise((r) => setTimeout(r, 0));
    }
    drawing = false;
  }

  function usedText(e: LibraryEntry) {
    if (!e.used.length) return 'Not used in any list';
    const n = e.used.reduce((s, u) => s + u.count, 0);
    const where = e.used.slice(0, 2).map((u) => `${u.home}: ${roomLabel(u.room).toLowerCase()}${u.count > 1 ? ` ×${u.count}` : ''}`).join(', ');
    return `Used ${n}× · ${where}${e.used.length > 2 ? ', …' : ''}`;
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const shown = entries.filter((e) => (filter === 'all' || (filter === 'unused' ? !e.used.length : e.from === filter)) && (!q || e.kind.toLowerCase().includes(q) || e.file?.toLowerCase().includes(q)));
    count.textContent = `${shown.length} of ${entries.length}`;
    queue = [];
    grid.replaceChildren(...shown.map((e) => {
      const card = document.createElement('article');
      card.className = 'lib-card';
      if (!e.usable) card.classList.add('is-off');
      const slot = document.createElement('div');
      slot.className = 'lib-pic';
      const img = Object.assign(document.createElement('img'), { alt: '', width: SIZE, height: SIZE });
      slot.append(img);
      const name = document.createElement('h3');
      name.textContent = e.kind.replace(/^builtin\//, '');
      const tag = Object.assign(document.createElement('span'), { className: `lib-from from-${e.from}`, textContent: FROM[e.from] });
      const meta = document.createElement('p');
      meta.className = 'lib-meta';
      meta.textContent = usedText(e) + (e.bytes ? ` · ${kb(e.bytes)}` : '');
      const add = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: 'Add' });
      add.disabled = !e.usable || !roomSel.value;
      add.title = e.why ?? `Add a ${name.textContent} to ${roomLabel(roomSel.value).toLowerCase()}`;
      add.setAttribute('aria-label', add.title);
      add.addEventListener('click', async () => {
        add.disabled = true;
        note.textContent = 'Adding…';
        note.textContent = await host.add(e.kind, roomSel.value, wallBox.checked);
        refresh();
      });
      const head = document.createElement('div');
      head.className = 'lib-head';
      head.append(name, tag);
      card.append(slot, head, meta);
      if (e.why) { const why = Object.assign(document.createElement('p'), { className: 'lib-why', textContent: e.why }); card.append(why); }
      card.append(add);
      queue.push({ e, img, slot });
      return card;
    }));
    if (!shown.length) grid.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: entries.length ? 'Nothing matches.' : 'This home has no kinds of piece to list.' }));
    drawQueued();
  }

  /** read the list again: the home on show, its rooms, and the model files the dev server finds */
  function refresh() {
    const recipe = host.homes().find((h) => h.id === host.getHome());
    const rooms = recipe?.pieces && !recipe.diorama ? shellOf(recipe).rooms(recipe) : [];
    const keep = roomSel.value;
    roomSel.replaceChildren(...rooms.map((r) => new Option(roomLabel(r), r)));
    if (rooms.includes(keep)) roomSel.value = keep;
    roomSel.disabled = wallBox.disabled = !rooms.length;
    entries = libraryOf(host.homes(), host.getHome(), files);
    if (recipe?.diorama) note.textContent = "A diorama's pieces are its model's parts: nothing is added to one from here.";
    else if (!recipe?.pieces) note.textContent = 'This home has no list of pieces, so nothing can be added to it from here.';
    render();
  }

  async function open() {
    drawer.hidden = false;
    $('library-open').setAttribute('aria-expanded', 'true');
    note.textContent = '';
    try {
      const r = await fetch('/__popfold/library');
      files = r.ok ? ((await r.json()) as { files: ModelFile[] }).files : [];
    } catch { files = []; } // not on the dev server: only what the homes list
    refresh();
    search.focus();
  }
  function close() {
    drawer.hidden = true;
    queue = [];
    $('library-open').setAttribute('aria-expanded', 'false');
  }
  $('library-open').addEventListener('click', () => (drawer.hidden ? open() : close()));
  $('library-close').addEventListener('click', close);
  roomSel.addEventListener('change', render);
  drawer.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });

  return {
    /** call after the home changes (or its file is shown again) */
    homeChanged() { if (!drawer.hidden) { note.textContent = ''; refresh(); } },
  };
}
