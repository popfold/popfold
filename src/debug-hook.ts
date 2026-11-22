// How the debug panel is opened: ?debug in the address, or Alt+Shift+D. This file is the few lines every page
// carries; the panel itself (debug.ts) is fetched the first time it is opened.
// One panel per page: the scene installs it when it starts, the page without 3D when it gives up on 3D, and
// whichever comes second adds what it knows to the first.
import type { startScene } from './engine';

export interface DebugSource {
  /** the running scene, once there is one */
  scene?: Awaited<ReturnType<typeof startScene>>;
  /** the story's beats, to name the one the page is on */
  beats?: { name: string }[];
  /** where the story is (as for startScene) */
  getStage?: () => number;
  /** ms from the page's start until the home was on screen */
  readyMs?: number;
  /** why there is no scene: the page without 3D says so here */
  note?: string;
  /** rows of the site's own, added under "Page" */
  rows?: () => [string, string][];
  /**
   * The studio page the panel links to, opened on the same home, story stop and light: a path relative to the
   * page (default 'studio.html', beside it), or false for no link. The link shows only if the page is there.
   */
  studio?: string | false;
}

const source: DebugSource = {};
let installed: (() => void) | null = null;
let panel: Promise<{ toggle: (on?: boolean) => void; remove: () => void }> | undefined;

/** Is the debug panel available on this page (it is unless the site switched it off)? */
export const debugAvailable = () => installed !== null;

/**
 * Show the debug panel if it is hidden, hide it if it is shown. Does nothing where the site switched the panel
 * off. Whenever the panel opens or closes, by this, the keyboard or its own close button, the document gets a
 * `pf-debug` event whose `detail` is true (shown) or false.
 */
export function toggleDebug() {
  if (!installed) return;
  panel ??= import('./debug').then((m) => m.mountDebug(source));
  panel.then((p) => p.toggle()).catch((err) => console.error(err));
}

/**
 * Make the debug panel available on this page and tell it what is known so far. Call it again to tell it more.
 * Returns a function that takes it away again (the listeners, and the panel if it was opened).
 */
export function installDebug(more: DebugSource = {}): () => void {
  Object.assign(source, more);
  if (installed) return installed;
  const onKey = (e: KeyboardEvent) => { if (e.altKey && e.shiftKey && e.code === 'KeyD') { e.preventDefault(); toggleDebug(); } };
  addEventListener('keydown', onKey);
  installed = () => {
    removeEventListener('keydown', onKey);
    panel?.then((p) => p.remove()).catch(() => undefined);
    panel = undefined; installed = null;
    for (const k of Object.keys(source) as (keyof DebugSource)[]) delete source[k];
  };
  if (new URLSearchParams(location.search).has('debug')) toggleDebug();
  return installed;
}
