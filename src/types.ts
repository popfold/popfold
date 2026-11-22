import type * as THREE from 'three';
import type { GenAssets, PopItem, Room } from './compact';
import type { DioramaSpec } from './diorama';
import type { Places } from './layout';
import type { FloorContext, TowerSpec } from './tower';
import type { BookPage, BookSpec } from './book';
import type { HingeEdge } from './fold';

/** Shell colours and room surfaces (textures are made when a home is built). */
/** The parts of a compact's case that can come from different case models (`look.parts`). */
export type CasePart = 'base' | 'lid' | 'drawers' | 'walls' | 'clasp' | 'heart';

export interface Look {
  /**
   * Which case the compact comes in. 'round': the soft, pillowy modelled shell (the default). 'crisp': the same
   * shell with nearly square edges. 'code': built from simple shapes, with `corner` setting its roundness.
   * { url }: the site's own shell model (see tools/blender/build_compact.py), relative to the site.
   */
  shell?: 'round' | 'crisp' | 'code' | { url: string };
  /**
   * Take some of the case's parts from another case: `{ lid: 'crisp' }` puts the crisp lid on a round case. Each of
   * base, lid, drawers (the drawer slabs), walls (the walls that tip up from them), clasp and heart (shown with
   * emblem.heart) is 'round', 'crisp' or { url };
   * a part not named comes from `shell`. Not for shell 'code'.
   */
  parts?: Partial<Record<CasePart, 'round' | 'crisp' | { url: string }>>;
  /** for shell 'code': how round the case is, from 0 (nearly sharp) to 1 (the default, soft) */
  corner?: number;
  base: string;      // bottom half of the shell
  lid: string;       // lid shell
  heart: string;     // clasp / heart on the lid
  leftSlab: string;  // left room's base
  rightSlab: string; // right room's base
  centerFloor: () => THREE.Texture;
  lidPaper: () => THREE.Texture;   // the centre room's back wall (inside of the lid)
  leftFloor: () => THREE.Texture;
  leftWall: () => THREE.Texture;
  rightFloor: () => THREE.Texture;
  rightWall: () => THREE.Texture;
  /** the three numbered step badges: [background, number] colours for the centre, left and right rooms */
  badges?: [string, string][];
  /** the ring around each badge */
  badgeRing?: string;
  /** the case's metal fittings: hinges and the clasp's ring (default: the palette's gold) */
  trim?: string;
  /** the walls that tip up from the drawers, in a modelled case (default: the palette's white) */
  drawerWall?: string;
}

/** The story behind a piece, shown when someone clicks it. */
export interface PropStory {
  title: string;
  text: string;
  tags: string[];
  /** where the dot sits: above the piece (default), in front of it (wall pieces) or below it (hanging pieces) */
  dot?: 'top' | 'front' | 'below';
  /** a line under the title: dates, role, client */
  meta?: string;
  /** buttons at the bottom of the card: http, https or mailto links (new tab), or links within the site ("docs/guide", "#contact") */
  links?: { label: string; href: string }[];
  /** the card's kicker (default "Why it's here") */
  kicker?: string;
}

export interface Lamp { group: THREE.Object3D; bulb: THREE.Mesh }

/** What a recipe's furnish() gets to place its pieces with. */
export interface FurnishContext {
  recipe: HomeRecipe;
  /** the house; centre-room pieces go here at y = y0 */
  root: THREE.Group;
  /** the lid, which becomes the centre room's back wall when open (add with rotation.x = PI/2, y = -0.04, z = height) */
  lid: THREE.Group;
  /** pop-in list for the centre room */
  center: PopItem[];
  /** left / right rooms: add floor pieces to .drawer at y = fy, wall pieces to .wall at z ≈ 0.14; pop them into .props */
  left: Room;
  right: Room;
  /** centre floor height */
  y0: number;
  /** side-room floor height */
  fy: number;
  /**
   * a loaded prop GLB scaled so its longest side = size, or null if it failed to load (then use a built-in piece).
   * glow: let its texture glow. play: false leaves its animation alone (default: its first clip plays back and forth)
   */
  gen: (name: string, size: number, glow?: number, play?: boolean) => THREE.Object3D | null;
  place: <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry?: number) => T;
  /** register a piece to spring in with its room, `delay` 0..0.4 into the room's pop-in */
  pop: (list: PopItem[], obj: THREE.Object3D, delay: number) => THREE.Object3D;
  assets: GenAssets;
  /** wall art: public/art/<recipe.artDir>/<name>.jpg, or the drawn fallback */
  art: (name: string, fallback: THREE.Texture) => THREE.Texture;
  /** a lamp whose glow the story controls (optional; each call adds one) */
  setLamp: (lamp: Lamp) => void;
}

/** A value in a piece's `opts`: a number, some text, or true/false. A list of these is allowed too (a shelf's items). */
export type OptValue = number | string | boolean;

/**
 * One piece of a home, as data: what it is and where it stands. Its key is "<room>/<id>" ("<room>-wall/<id>" on a
 * wall), so a story or a layout entry stays on it whatever is listed around it. For the compact and the tower.
 */
export interface PieceSpec {
  /** this piece's own id, unlike any other in its room */
  id: string;
  /** where it is: in a compact, one of its three rooms, 'center', 'left' or 'right'; in a tower, a floor's id */
  room: string;
  /** what it is: a name in the recipe's `kinds`, or one of its `props` (a model file) */
  kind: string;
  /** on the floor: [x, z], from the middle of the floor. On the wall: [x, height] */
  at: [number, number];
  /** it hangs on the room's wall (the open lid, for a compact's centre room; the back wall, for a tower's floor) rather than standing on the floor */
  wall?: boolean;
  /** turn around the upright axis, in radians (floor pieces) */
  turn?: number;
  /** how far above the floor it floats (floor pieces; default 0) */
  lift?: number;
  /** how far it stands out from the wall (wall pieces; default 0.14, 0.04 on the lid, 0.06 in a tower) */
  out?: number;
  /** a model's longest side, in units (default 1) */
  size?: number;
  /** make it this many times its built size (default 1); the studio writes this when a piece is resized */
  scale?: number;
  /** when it springs in, 0..0.4 into its room's pop-in (default: in the order listed) */
  delay?: number;
  /** compact and tower: it folds up from lying flat instead of springing in, hinged along the foot of this side (it lies down towards it) */
  fold?: HingeEdge;
  /** it is in the home but not shown: parked, for the studio to bring back. A piece nobody wants is taken off the list */
  hidden?: boolean;
  /** compact only: this is a lamp whose glow the story controls (any number may be); its kind must return a Lamp */
  lamp?: boolean;
  /** the story behind it: a dot on the piece, a card when it is clicked, and a paragraph on the page without 3D */
  story?: PropStory;
  /** anything else its kind wants to know: a height, a colour, a list of things on a shelf */
  opts?: Record<string, OptValue | OptValue[]>;
}

/**
 * What a site says about one of its model files when a listed piece uses it as its kind. The model still loads
 * as a model (so it can load in stages); this is what data cannot say about it.
 */
export interface ModelOptions {
  /** compact: let the model's own texture glow, 0 to 1 (a lamp, a screen) */
  glow?: number;
  /** compact: false leaves the model's animation alone instead of playing it back and forth; `ready` gets the clip */
  loop?: boolean;
  /** tower: recolour materials by name prefix, e.g. { led_: '#FF4FD8' } */
  tint?: Record<string, string>;
  /** tower: the animation to loop, by the end of its name ('Idle') */
  clip?: string;
  /** tower: measure the model at load instead of assuming it was normalised */
  fit?: boolean;
  /**
   * Called once the piece is built and in its room, whether its model came with the home or arrived later: add a
   * bulb, a glass rim, wire its animation to the story. `clip` is the model's first animation, if it has one
   * (shared by every piece built from the model: clone it before changing it). It runs once per build, and a home
   * is built once and shown again when it is switched back to.
   * For the piece marked `lamp`, return its { group, bulb }.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: a ready() that returns nothing must still fit
  ready?: (piece: THREE.Object3D, info: { clip?: THREE.AnimationClip; spec: PieceSpec; ctx: FurnishContext | FloorContext }) => Lamp | void;
}

/** Builds one kind of piece. Origin on the floor under its middle (or at its middle, for a wall piece), facing +z. */
export type PieceKind = (spec: PieceSpec, ctx: FurnishContext | FloorContext | BookContext) => THREE.Object3D | Lamp;

/** What a book's own kind of piece is told: the page it is built for and the book's page size. */
export interface BookContext { recipe: HomeRecipe; page: BookPage; width: number; height: number }

/** A pocket home: its look, the pieces it loads and where they go. */
export interface HomeRecipe {
  id: string;
  name: string;
  blurb: string;
  /** compact shell: colours and surfaces (not used by a diorama) */
  look?: Look;
  /** compact and tower: the home's pieces, as a list (see PieceSpec). They are placed before any code that places pieces runs */
  pieces?: PieceSpec[];
  /** compact and tower: how to build each kind of piece that `pieces` names and that is not a model file */
  kinds?: Record<string, PieceKind>;
  /** compact and tower: what to do with a model file that `pieces` names as a kind (see ModelOptions), by its name in `props` */
  models?: Record<string, ModelOptions>;
  /** compact shell: places pieces in code, for what a list cannot say (not used by a diorama) */
  furnish?: (ctx: FurnishContext) => void;
  /**
   * the shell that builds this home, by name (see shell.ts): left out, the shell that claims the recipe builds it
   * (a tower for `tower`, a diorama for `diorama`, otherwise the compact)
   */
  shell?: string;
  /** a modelled room instead of the compact: its walls unfold and its zones pop in (see diorama.ts) */
  diorama?: DioramaSpec;
  /**
   * Where the studio moved, turned, resized or hid pieces that `pieces` does not list (a diorama's model parts,
   * pieces placed in code), by key. A home made from its file always has it; the studio saves only such homes.
   */
  places?: Places;
  /**
   * Make this home again from new contents of its file, with the same code (set by homeFromFile()). The studio
   * uses it to show an edit to the file without reloading the page.
   */
  remake?: (json: unknown) => HomeRecipe;
  /** the file this home was made from, as it was read (set by homeFromFile()): a built studio edits a copy of it */
  file?: unknown;
  /** a tall building of stacked floors, each its own story zone (see tower.ts) */
  tower?: TowerSpec;
  /** a pop-up storybook: pages that turn, each with a scene that folds up (see book.ts) */
  book?: BookSpec;
  /**
   * The time of day the home is shown in: 'day' (default) or 'evening' (a dim sun, a warm sky, its lamps on). The
   * scene takes it when the home goes on show, and the studio and its stills use it, so it is said once.
   */
  mood?: 'day' | 'evening';
  /** Prop GLBs: "<name>" loads <propDir>/<name>.glb; a name with a folder ("sh3d/<name>") loads <sharedDir>/sh3d/<name>.glb */
  props: string[];
  propDir: string;
  /** folder for props shared by several homes (default models/props) */
  sharedDir?: string;
  /** compact shell: what its three rooms are called in piece keys ("<room>/<piece>"); default center, left, right */
  rooms?: { center: string; left: string; right: string };
  /** wall-art folder under public/art/ (defaults to the id) */
  artDir?: string;
  /** the lid: its wordmark, and whether it carries a heart (default false) */
  emblem?: { title?: string; subtitle?: string; heart?: boolean };
  /** how the home opens: 'compact' (lid + sliding drawers, the default) or 'book' (tri-fold pop-up book) */
  fold?: 'compact' | 'book';
  /** stories by piece key (see layout.ts for keys), for pieces that are not in `pieces` */
  stories?: Record<string, PropStory>;
  /** swatches shown in the studio's home picker */
  swatch: string[];
}
