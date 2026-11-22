// The four shells that ship with Popfold, registered when the engine loads. A site adds its own with
// registerShell() (shell.ts); it is asked before these.
/// <reference path="./virtual.d.ts" />
import cases from 'virtual:popfold-cases';
import { buildCompact } from './compact';
import { buildDiorama, type DioramaSpec } from './diorama';
import type * as THREE from 'three';
import { registerShell, type Shell } from './shell';
import { buildTower, type TowerSpec } from './tower';
import { buildBook, type BookSpec } from './book';
import type { HomeRecipe } from './types';

const words = (id: string) => id.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The compact: a case whose lid opens on the centre room (c), with a drawer room either side (L, R). */
export const compactShell: Shell = {
  name: 'compact',
  claims: () => true, // what is neither a tower nor a diorama
  folds: true,
  lazy: true,
  async build(recipe, env) {
    // the case is chosen by the look: the two modelled cases ship with Popfold, or a site's own, or none (code);
    // a part may come from another case (look.parts)
    const shell = recipe.look?.shell ?? 'round';
    // the two modelled cases come from the Vite plugin, which puts in a build only those the site's homes use
    const urlOf = (want: typeof shell) => {
      const url = want === 'code' ? null : typeof want === 'string' ? cases[want] ?? null : env.siteUrl(want.url);
      if (want !== 'code' && typeof want === 'string' && !url) console.warn(`popfold: the "${want}" case is not in this build, so its parts are drawn in code (the build carries the cases its home files name; popfoldFallback({ cases }) adds others)`);
      return url;
    };
    const loaded = new Map<string, Promise<THREE.Object3D | null>>();
    const modelOf = async (want: typeof shell) => {
      const url = urlOf(want);
      if (!url) return null;
      if (!loaded.has(url)) loaded.set(url, env.loadModel(url).then((m) => m?.clone() ?? null));
      return loaded.get(url)!;
    };
    const parts = shell === 'code' ? {} : recipe.look?.parts ?? {};
    const [base, lid, drawers, walls, clasp, heart] = await Promise.all((['base', 'lid', 'drawers', 'walls', 'clasp', 'heart'] as const).map((p) => modelOf(parts[p] ?? shell)));
    return buildCompact({ base, lid, drawers, walls, clasp, heart }, env.assets, recipe, env.base);
  },
  zones: () => [
    { field: 'c', room: 'center', label: 'Lid + centre room' },
    { field: 'L', room: 'left', label: 'Left room' },
    { field: 'R', room: 'right', label: 'Right room' },
  ],
  extras: () => [{ field: 'glow', label: 'Lamp glow' }, { field: 'badges', label: 'Step badges' }],
  rooms: () => ['center', 'left', 'right'],
  cams: () => [
    { id: 'hero', label: 'Hero', camera: [0, 4.4, 11.5], lookAt: [0, 0.7, 0] },
    { id: 'wide', label: 'Overview', camera: [0, 9.5, 13.5], lookAt: [0, 0.9, 0] },
    { id: 'center', label: 'Centre room', camera: [0, 3.6, 8.2], lookAt: [0, 1.4, -0.4] },
    { id: 'left', label: 'Left room', camera: [-2.6, 3.6, 7.2], lookAt: [-4.1, 1.1, -0.2] },
    { id: 'right', label: 'Right room', camera: [2.6, 3.6, 7.2], lookAt: [4.1, 1.1, -0.2] },
    { id: 'top', label: 'Top down', camera: [0, 16, 0.6], lookAt: [0, 0, 0] },
  ],
};

/** A diorama: one modelled room whose walls rise with c, and whose three zones fill in with c, L and R. */
export const dioramaShell: Shell = {
  name: 'diorama',
  claims: (r) => !!r.diorama,
  async build(recipe, env) {
    const spec = recipe.diorama!;
    // a staged room's pieces start loading with it, and are grafted on when they land
    const pieces = spec.pieces ? env.loadModel(env.siteUrl(spec.pieces)).then((m) => m?.clone() ?? null) : undefined;
    const model = await env.loadModel(env.siteUrl(spec.url));
    if (!model) throw new Error(`home "${recipe.id}": its room model ${spec.url} could not be loaded`);
    return buildDiorama(model.clone(), recipe as HomeRecipe & { diorama: DioramaSpec }, pieces);
  },
  zones: (r) => {
    const z = r.diorama!.zones;
    return [
      { field: 'c', room: z.center, label: `Walls up + ${z.center}` },
      { field: 'L', room: z.left, label: words(z.left) },
      { field: 'R', room: z.right, label: words(z.right) },
    ];
  },
  extras: (r) => [...(r.diorama!.lamp ? [{ field: 'glow', label: `Lamp glow (${[r.diorama!.lamp].flat().join(", ")})` }] : []), { field: 'badges', label: 'Step badges' }],
  rooms: () => [], // its pieces come from its model
  cams: () => [
    { id: 'wide', label: 'Overview', camera: [-7.4, 8.4, 9.6], lookAt: [0, 0.6, 0] },
    { id: 'top', label: 'Top down', camera: [0, 12, 0.6], lookAt: [0, 0, 0] },
  ],
};

/** A tower: stacked floors, each opened by its own field, z:<floor id>. */
export const towerShell: Shell = {
  name: 'tower',
  claims: (r) => !!r.tower,
  lazy: true,
  build: (recipe, env) => buildTower(recipe as HomeRecipe & { tower: TowerSpec }, env.assets),
  zones: (r) => r.tower!.floors.map((f) => ({ field: `z:${f.id}`, room: f.id, label: f.label.length <= 3 ? f.label : words(f.label.toLowerCase()) })),
  rooms: (r) => r.tower!.floors.map((f) => f.id),
  cams: () => [], // the story already rides floor to floor; fixed presets don't fit a building this tall
};

/** A pop-up storybook: its pages turn one by one, each by its own field, z:<page id> (the last page has none). */
export const bookShell: Shell = {
  name: 'book',
  claims: (r) => !!r.book,
  build: (recipe, env) => buildBook(recipe as HomeRecipe & { book: BookSpec }, env.siteUrl),
  zones: (r) => [
    // a book that starts shut opens its front cover first, onto its first page
    ...(r.book!.closed ? [{ field: 'z:cover', room: r.book!.pages[0].id, label: 'Open the cover' }] : []),
    ...r.book!.pages.slice(0, -1).map((p) => ({ field: `z:${p.id}`, room: p.id, label: `Turn ${p.label ?? words(p.id)}` })),
  ],
  rooms: (r) => r.book!.pages.map((p) => p.id),
  cams: () => [
    { id: 'front', label: 'Reader', camera: [0, 6.4, 7.8], lookAt: [0, 0.5, 0.2] },
    { id: 'side', label: 'Three quarters', camera: [6.2, 5.2, 6.4], lookAt: [0, 0.6, 0] },
    { id: 'low', label: 'Low', camera: [0, 2.2, 8.4], lookAt: [0, 0.9, 0] },
    { id: 'top', label: 'Top down', camera: [0, 12, 0.6], lookAt: [0, 0, 0] },
  ],
};

// registered last-first, so the compact (which claims anything) is asked last
for (const s of [compactShell, dioramaShell, towerShell, bookShell]) registerShell(s);
