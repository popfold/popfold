// A home from its file: readHome() checks the data, and this turns it into what startScene() and mountStudio()
// take. The file says what a home is; the code a site passes here says how its kinds of piece are built.
import * as tex from './textures';
import { beatsOf, type Beat } from './keyframes';
import { readHome, towerFromFile, type LookData, type SurfaceData } from './pieces';
import type { DioramaSpec } from './diorama';
import type { Transition } from './transitions';
import type { FloorSpec } from './tower';
import type { HomeRecipe, Look } from './types';

/** The texture a surface's entry describes: a plain colour, or a pattern with its colours. */
export function surface(s: SurfaceData): () => ReturnType<typeof tex.checker> {
  if (typeof s === 'string') return () => tex.canvasTexture((g, size) => { g.fillStyle = s; g.fillRect(0, 0, size, size); }, 8);
  const [a, b = a] = s.colors;
  switch (s.pattern) {
    case 'checker': return () => tex.checker(a, b, s.count, s.repeat);
    case 'stripes': return () => tex.stripes(s.colors, s.count, s.repeat);
    case 'dots': return () => tex.dots(a, b, s.count, s.repeat);
    case 'waves': return () => tex.waves(a, b, s.count, s.repeat);
    case 'terrazzo': return () => tex.terrazzo(a, s.colors.slice(1), s.count, s.repeat); // count picks which scatter of chips
  }
}

/** A compact's look from its entry in the home file. */
export function lookFromData(d: LookData): Look {
  return {
    ...(d.shell !== undefined ? { shell: d.shell } : {}), ...(d.parts ? { parts: d.parts } : {}), ...(d.corner !== undefined ? { corner: d.corner } : {}),
    base: d.base, lid: d.lid, heart: d.heart, leftSlab: d.leftSlab, rightSlab: d.rightSlab,
    centerFloor: surface(d.centerFloor), lidPaper: surface(d.lidPaper),
    leftFloor: surface(d.leftFloor), leftWall: surface(d.leftWall),
    rightFloor: surface(d.rightFloor), rightWall: surface(d.rightWall),
    ...(d.badges ? { badges: d.badges } : {}), ...(d.badgeRing ? { badgeRing: d.badgeRing } : {}),
    ...(d.trim ? { trim: d.trim } : {}), ...(d.drawerWall ? { drawerWall: d.drawerWall } : {}),
  };
}

/**
 * What a site adds in code to a home that is kept in a file: above all `kinds`, for a tower the code a floor runs
 * (its pipes), and for a diorama the art painted on its screens and posters and its cover.
 */
export type HomeCode = Partial<Omit<HomeRecipe, 'id' | 'name' | 'pieces' | 'tower' | 'book' | 'diorama' | 'places'>> & {
  /** a tower's `build`: code a floor runs after its listed pieces (pipes, a moved port), by floor id. Its colours, pipe and lift are in the file */
  tower?: { build?: Record<string, NonNullable<FloorSpec['build']>> };
  diorama?: Pick<DioramaSpec, 'art' | 'cover'>;
};

/**
 * The home a file describes, and its story. `json` is the contents of the home file (it is checked, and a mistake
 * is reported in words); `code` is whatever the file cannot hold. A file with floors makes a tower, one with a
 * diorama a diorama, one with a book a book, and one with none of them a compact.
 */
export function homeFromFile(json: unknown, code: HomeCode = {}): { recipe: HomeRecipe; beats: Beat[]; transitions: Transition[] } {
  const { beats, look, floors, tower: building, book, diorama, stories, places, transitions, ...data } = readHome(json);
  const { tower, diorama: drawn, ...rest } = code;
  const recipe: HomeRecipe = {
    props: [], propDir: 'models/props',
    // the picker's swatches, when the file gives none: a tower's floor colours, or the compact's own
    swatch: floors ? floors.map((f) => f.color) : look ? [look.base, look.lid, look.leftSlab, look.rightSlab]
      : book ? [book.cover ?? '#B5523B', ...book.pages.flatMap((p) => (p.color ? [p.color] : []))].slice(0, 4) : [],
    ...rest,
    ...data,
    ...(look ? { look: lookFromData(look) } : {}),
    ...(floors ? { tower: towerFromFile(data.id, floors, building, tower?.build) } : {}),
    // a book's pop-ups are built in; its kinds are the site's own pieces (mounted as stands)
    ...(book ? { book } : {}),
    ...(diorama ? { diorama: { ...drawn, ...diorama } } : {}),
    ...(stories || rest.stories ? { stories: { ...rest.stories, ...stories } } : {}),
    places: places ?? {}, // (the studio saves these into the file too)
    remake: (next) => homeFromFile(next, code).recipe,
  };
  return { recipe, beats: beatsOf({ beats }), transitions: transitions ?? [] };
}
