// Shells as plug-ins. A shell is a home's body: the compact (a case with a lid and two drawers), a diorama (a
// modelled room whose walls unfold), a tower (stacked floors), or one a site adds with registerShell(). The engine
// knows only this interface: it asks the shell to build a home from its recipe, and each frame hands it the
// story's values to move its own parts. The studio asks it which sliders and camera presets suit it.
import type * as THREE from 'three';
import type { GenAssets, PopItem } from './compact';
import type { Editable } from './layout';
import type { HomeRecipe, PieceSpec } from './types';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const backOut = (t: number) => { const s = 2.2; const u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; };

/** What a shell is handed each frame besides the story's values. */
export interface FrameContext {
  time: number;
  dt: number;
  /** the compact's fold style (other shells may ignore it) */
  fold: 'compact' | 'book';
  reducedMotion: boolean;
  /** the decoration is held still (reduced motion, or the site's ambient: false): no motion that is only for show */
  still: boolean;
  /** spring a list of pieces in, to `p` (0 hidden, 1 all in, each after its own delay) */
  pop: (items: PopItem[], p: number) => void;
}

/** What a shell's frame tells the engine: how open the home is (story dots wait for it) and how much its lamp may glow. */
export interface FrameResult { open: number; lit: number }

/** A built home, as the engine sees it. */
export interface House {
  root: THREE.Group;
  /** the lamps the story's glow field lights, if the home has any. Each one's light stays on the root (a steady light
   *  count); the engine moves it to `anchor` each frame */
  lamps?: { light: THREE.PointLight; anchor?: THREE.Object3D; bulb?: THREE.Mesh; halo?: THREE.Sprite; shown?: () => boolean }[];
  /** the height of the floor at a point, in the home's own space: where the guide figure stands (default 0) */
  ground?: (x: number, z: number) => number;
  /** how big the guide figure is drawn (default 0.95: the compact's). The built-in figure is about 1.65 tall at 1 */
  guideSize?: number;
  /** the story's step badges */
  badges: THREE.Sprite[];
  spinners: { obj: THREE.Object3D; spin: number; bob: number; baseY: number; baseRot: number }[];
  mixers: THREE.AnimationMixer[];
  /** what a click can land on (each part carries userData.pick: its room, or userData.zoneId) */
  pickables: THREE.Object3D[];
  /** every movable piece, keyed for layouts */
  editables: Editable[];
  /** listed pieces whose model had not arrived when the home was built, and how to place one once it has */
  late?: { specs: PieceSpec[]; add: (spec: PieceSpec) => Editable | null };
  /** pieces still on their way when the house was built (a staged diorama's): their editables, once they are in */
  arriving?: Promise<Editable[]>;
  /** named zones a click can report (a tower's floors) */
  zones?: { id: string }[];
  /** move the shell's own parts to where the story is */
  update: (cur: Record<string, number>, f: FrameContext) => FrameResult;
  /** put the shell's own moving parts back to their starting pose (for repeatable captures) */
  reset?: () => void;
}

/** What the engine lends a shell to build with. */
export interface ShellEnv {
  /** the home's models, by name, as they have arrived (null: failed, built-in stand-in used) */
  assets: GenAssets;
  /** the site's base URL */
  base: string;
  /** a model file (cached; null when it cannot be loaded) */
  loadModel: (url: string) => Promise<THREE.Object3D | null>;
  /** a site path made absolute against the site's base */
  siteUrl: (path: string) => string;
}

/** One room the story opens: the story field that opens it, the room's id (piece keys start with it) and a label. */
export interface ShellZone { field: string; room: string; label: string }

export interface Shell {
  /** its name, as a recipe's `shell` names it */
  name: string;
  /** is this recipe one of this shell's? (a recipe that names its shell skips the question) */
  claims: (recipe: HomeRecipe) => boolean;
  build: (recipe: HomeRecipe, env: ShellEnv) => Promise<House> | House;
  /** the rooms the story opens, in order: the studio's sliders, and which models a first view needs */
  zones: (recipe: HomeRecipe) => ShellZone[];
  /** other story fields worth a slider in the studio (glow, badges …) */
  extras?: (recipe: HomeRecipe) => { field: string; label: string }[];
  /** the rooms a new listed piece can go in; none when the pieces come from a model */
  rooms: (recipe: HomeRecipe) => string[];
  /** fixed camera presets for the studio, besides the story's own and free orbit */
  cams?: (recipe: HomeRecipe) => { id: string; label: string; camera: [number, number, number]; lookAt: [number, number, number] }[];
  /** offers the compact / pop-up book fold styles */
  folds?: boolean;
  /** whether some of its models can arrive after the home is first shown (listed pieces, or `arriving`) */
  lazy?: boolean;
}

const shells: Shell[] = [];

/**
 * Add a shell (or replace one of the same name). A site's own shell is asked before the built-in ones, so it may
 * claim recipes they would; a recipe can also name it outright (`shell: 'my-shell'`).
 */
export function registerShell(shell: Shell) {
  const at = shells.findIndex((s) => s.name === shell.name);
  if (at >= 0) shells.splice(at, 1);
  shells.unshift(shell);
}

/** The shell that builds this recipe. */
export function shellOf(recipe: HomeRecipe): Shell {
  if (recipe.shell) {
    const named = shells.find((s) => s.name === recipe.shell);
    if (!named) throw new Error(`home "${recipe.id}" asks for the shell "${recipe.shell}", and none has that name (there are ${shells.map((s) => s.name).join(', ')})`);
    return named;
  }
  const found = shells.find((s) => s.claims(recipe));
  if (!found) throw new Error(`no shell builds home "${recipe.id}"`);
  return found;
}

/** Every shell there is, the site's own first. */
export const allShells = () => [...shells];
