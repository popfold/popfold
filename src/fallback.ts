// In the browser: decide between the 3D scene and the simple page, and switch when asked.
// The page starts as the simple version (popfoldFallback() builds it into the HTML); markReady() upgrades it to
// 3D by setting html.has-3d once the scene is running. No three.js here, so it costs nothing to load first.
//
//   if (shouldStart3D()) { await startScene(...); markReady(canvas); } else markFallback();
//   viewToggle();   // a small "Simple view / 3D view" button
import { t } from './text';
import { debugAvailable, installDebug, toggleDebug } from './debug-hook';

const KEY = 'popfold-view';

function storedChoice(): '3d' | 'simple' | null {
  const q = new URLSearchParams(location.search).get('view');
  if (q === 'simple' || q === '3d') return q;
  try { const v = localStorage.getItem(KEY); return v === 'simple' || v === '3d' ? v : null; } catch { return null; }
}

/** WebGL works, and nothing says this visitor would be better off without 3D. */
export function shouldStart3D(): boolean {
  const choice = storedChoice();
  if (choice === 'simple') return false;
  try {
    const c = document.createElement('canvas');
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) return false;
  } catch { return false; }
  if (choice === '3d') return true;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return false; // the visitor asked for less data
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 2) return false; // very low-memory device
  return true;
}

/** Show the 3D scene; if the GPU drops the context later, fall back to the simple page. */
export function markReady(canvas?: HTMLCanvasElement) {
  document.documentElement.classList.add('has-3d');
  document.documentElement.classList.remove('no-webgl');
  canvas?.addEventListener('webglcontextlost', () => markFallback(), { once: true });
}

/** Show the simple page (the stills and the written-out stories). */
export function markFallback(o: { debug?: boolean } = {}) {
  document.documentElement.classList.remove('has-3d');
  document.documentElement.classList.add('no-webgl');
  // the debug panel works here too, with what it can know without a scene (debug: false takes it away)
  if (o.debug !== false) installDebug({ note: 'off (the page without 3D)' });
}

/**
 * A small button to switch between the 3D and the simple view (remembered; reloads the page), and beside it a
 * smaller one that shows and hides the debug panel. `debug: false` leaves the second one out; it is also left out
 * where the site switched the panel itself off (startScene({ debug: false }) or markFallback({ debug: false })).
 * Call it after startScene() or markFallback(), as the templates do.
 */
/**
 * Where the story is, from the scroll position: i when section i's middle is at the middle of the screen, and
 * fractions in between. Pass the result to startScene() as getStage.
 * The sections change height after load (web fonts arrive, the written stories fold away once 3D starts), so
 * they are measured again whenever the page's height changes; otherwise the scene runs a section behind the text.
 */
export function scrollStage(sections: HTMLElement[] = Array.from(document.querySelectorAll<HTMLElement>('.stage'))): () => number {
  let centers: number[] = [];
  const measure = () => { centers = sections.map((el) => { const r = el.getBoundingClientRect(); return r.top + scrollY + r.height / 2; }); };
  measure();
  addEventListener('resize', measure);
  addEventListener('load', measure);
  new ResizeObserver(measure).observe(document.body);
  return () => {
    const mid = scrollY + innerHeight / 2;
    if (!centers.length || mid <= centers[0]) return 0;
    for (let i = 0; i < centers.length - 1; i++) if (mid < centers[i + 1]) return i + (mid - centers[i]) / (centers[i + 1] - centers[i]);
    return centers.length - 1;
  };
}

export function viewToggle(o: { debug?: boolean } = {}) {
  if ((o.debug ?? true) && debugAvailable()) debugButton();
  const in3D = document.documentElement.classList.contains('has-3d');
  if (!in3D && storedChoice() !== 'simple') {
    // no 3D available at all: offer nothing to switch to
    try { const c = document.createElement('canvas'); if (!(c.getContext('webgl2') || c.getContext('webgl'))) return; } catch { return; }
  }
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pf-view-toggle';
  b.textContent = t(in3D ? 'Simple view' : '3D view');
  b.setAttribute('aria-label', t(in3D ? 'Switch to the simple view without 3D' : 'Switch to the 3D view'));
  b.addEventListener('click', () => {
    try { localStorage.setItem(KEY, in3D ? 'simple' : '3d'); } catch { /* not remembered */ }
    const u = new URL(location.href);
    u.searchParams.delete('view');
    location.href = u.toString();
  });
  // first in the page, so a keyboard or screen-reader user meets the choice before the content, not after it
  document.body.prepend(b);
  // the debug button stands to its right, wherever that turns out to be in this site's fonts
  const d = document.querySelector<HTMLElement>('.pf-debug-toggle');
  if (d) d.style.left = `${b.offsetLeft + b.offsetWidth + 8}px`;
}

/** The small button that shows and hides the debug panel. */
function debugButton() {
  if (document.querySelector('.pf-debug-toggle')) return;
  const d = document.createElement('button');
  d.type = 'button';
  d.className = 'pf-debug-toggle';
  d.textContent = 'Debug';
  d.title = 'What build this is and how the page is running (Alt+Shift+D)';
  d.setAttribute('aria-pressed', String(!!document.querySelector('.pf-debug:not([hidden])')));
  d.addEventListener('click', toggleDebug);
  document.addEventListener('pf-debug', (e) => d.setAttribute('aria-pressed', String((e as CustomEvent<boolean>).detail)));
  document.body.append(d); // after the content: a tool, not something to meet first
}
