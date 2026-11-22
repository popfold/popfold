// Popfold's built-in pieces as kinds a home file can name without code: "kind": "builtin/sofa". Each is built with
// plain defaults; `opts` can change the few things noted beside it.
import { P } from './compact';
import { C } from './props';
import * as tex from './textures';
import type { BUILT_IN_KINDS } from './pieces';
import type { HomeRecipe, PieceKind, PieceSpec } from './types';

const text = (s: PieceSpec, k: string, fallback: string) => typeof s.opts?.[k] === 'string' ? s.opts[k] as string : fallback;
const num = (s: PieceSpec, k: string, fallback: number) => typeof s.opts?.[k] === 'number' ? s.opts[k] as number : fallback;
const plain = (colour: string) => tex.canvasTexture((g, size) => { g.fillStyle = colour; g.fillRect(0, 0, size, size); }, 8);

/** the built-in kinds, by name (BUILT_IN_KINDS in pieces.ts lists the names; the type keeps the two the same) */
export const BUILT_IN: Record<(typeof BUILT_IN_KINDS)[number], PieceKind> = {
  'builtin/bed': () => P.bed(),
  'builtin/clothes-rack': () => P.clothesRack(),
  'builtin/coffee-table': () => P.coffeeTable(),
  'builtin/disco-ball': () => P.discoBall(),
  // opts.color: the shade
  'builtin/floor-lamp': (s) => P.floorLamp(text(s, 'color', C.cobalt)),
  'builtin/mirror': () => P.mirror(),
  'builtin/nightstand': () => P.nightstand(),
  'builtin/plant': () => P.plant(),
  // opts.color, opts.width and opts.depth (default 2 × 1.4), opts.round
  'builtin/rug': (s) => P.rug(num(s, 'width', 2), num(s, 'depth', 1.4), plain(text(s, 'color', C.butter)), s.opts?.round === true),
  // opts.color
  'builtin/sculpture': (s) => P.sculpture(text(s, 'color', C.lilac)),
  // opts.color
  'builtin/shopping-bag': (s) => P.shoppingBag(text(s, 'color', C.pink)),
  'builtin/sofa': () => P.sofa(),
  'builtin/spark': () => P.spark(),
};

/** How a home builds the kind a piece names: the site's own kinds first, then Popfold's built-in ones. */
export function kindOf(recipe: Pick<HomeRecipe, 'kinds'>, name: string): PieceKind | undefined {
  return recipe.kinds?.[name] ?? (BUILT_IN as Record<string, PieceKind | undefined>)[name];
}
