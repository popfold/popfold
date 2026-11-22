// The debug panel: what build this is and how the page is running. It is opened with ?debug in the address or
// Alt+Shift+D (see debug-hook.ts) and loaded only then, so a page that never opens it pays nothing for it.
// It works on the page without 3D too, with the build rows only.
import type { DebugSource } from './debug-hook';

/** What popfoldFallback() (popfold/vite) tells the page about its own build. Absent on a site that does not use it. */
export interface BuildFacts { commit: string; committed: string; dirty: boolean; built: string; site: string; popfold: string; three: string }
declare const __POPFOLD_BUILD__: BuildFacts | undefined;
const BUILD = typeof __POPFOLD_BUILD__ === 'undefined' ? undefined : __POPFOLD_BUILD__;

// plain colours of its own: the panel is a tool, not part of a site's look
const CSS = `
.pf-debug {
  position: fixed; right: 12px; bottom: 12px; z-index: 2147483000; width: min(330px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto;
  padding: 10px 12px 12px; border-radius: 12px; background: rgba(18, 18, 24, .92); color: #F2F2F5; text-align: left;
  font: 11.5px/1.45 ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace; box-shadow: 0 6px 24px rgba(0, 0, 0, .35);
}
.pf-debug[hidden] { display: none; }
/* on a narrow screen it would lie over the buttons in the other corner: sit above them */
@media (max-width: 640px) { .pf-debug { bottom: 64px; max-height: calc(100vh - 76px); } }
.pf-debug header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.pf-debug strong { flex: 1; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.pf-debug button { padding: 2px 8px; border: 1px solid rgba(255, 255, 255, .35); border-radius: 6px; background: none; color: inherit; font: inherit; cursor: pointer; }
.pf-debug button:hover { background: rgba(255, 255, 255, .12); }
.pf-debug-studio { margin-left: auto; padding: 2px 8px; border: 1px solid rgba(255, 255, 255, .35); border-radius: 6px; color: inherit; text-decoration: none; }
.pf-debug-studio:hover { background: rgba(255, 255, 255, .12); }
.pf-debug-studio[hidden] { display: none; }
.pf-debug h4 { margin: 8px 0 2px; font: inherit; font-weight: 700; color: #9CC3FF; }
.pf-debug dl { display: grid; grid-template-columns: auto 1fr; gap: 0 10px; margin: 0; }
.pf-debug dt { opacity: .65; white-space: nowrap; }
.pf-debug dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
`;

const num = (n: number) => n.toLocaleString('en-US');
const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown');
const trim = (n: number) => n.toFixed(2).replace(/\.?0+$/, '');

/** The graphics card's name, if the browser tells. */
function gpuName(scene: NonNullable<DebugSource['scene']>): string {
  const gl = scene.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return name.replace(/^ANGLE \((.*)\)$/, '$1').replace(/ Direct3D.*$| \(0x[0-9A-F]+\)/gi, '');
}

/** The models the page has fetched so far: how many, and their size (with a note when they came from the cache). */
function models() {
  const got = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((r) => /\.glb(\?|$)/.test(r.name));
  const wire = got.reduce((sum, r) => sum + r.transferSize, 0);
  const size = got.reduce((sum, r) => sum + r.decodedBodySize, 0);
  return `${got.length}, ${(size / 1048576).toFixed(1)} MB${got.length && wire < size / 2 ? ' (cached)' : ''}`;
}

/** Every row of the panel, in its groups. Exported for the Copy button and for tests. */
export function debugRows(src: DebugSource, drawn = 0, offered = 0): [string, [string, string][]][] {
  const out: [string, [string, string][]][] = [];
  if (BUILD) out.push(['Build', [
    ['commit', BUILD.commit + (BUILD.dirty ? ' + local changes' : '')],
    ['committed', when(BUILD.committed)],
    [import.meta.env.DEV ? 'server started' : 'built', when(BUILD.built)],
    ['mode', import.meta.env.MODE],
    ['site', BUILD.site],
    ['Popfold', BUILD.popfold],
    ['three.js', BUILD.three],
  ]]);
  const page: [string, string][] = [
    ['window', `${innerWidth} × ${innerHeight} @ ${trim(devicePixelRatio)}x`],
    ['models', models()],
  ];
  const s = src.scene;
  if (!s) {
    page.unshift(['3D', src.note ?? 'starting']);
    out.push(['Page', [...page, ...(src.rows?.() ?? [])]]);
    return out;
  }
  const stage = src.getStage?.() ?? 0;
  const beat = src.beats?.[Math.min(src.beats.length - 1, Math.max(0, Math.round(stage)))];
  page.unshift(['home', s.homeId], ['stage', `${stage.toFixed(2)}${beat ? ` · ${beat.name}` : ''}`], ['light', s.flags.lighting]);
  if (src.readyMs) page.push(['home on screen', `${(src.readyMs / 1000).toFixed(2)} s`]);
  // the warm-up builds every beat's materials in the background once the home is on show
  if (s.warmMs !== null) page.push(['warm-up', s.warmMs === undefined ? 'running' : `${(s.warmMs / 1000).toFixed(2)} s`]);
  const heap = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  if (heap) page.push(['script memory', `${(heap / 1048576).toFixed(0)} MB`]);
  out.push(['Page', [...page, ...(src.rows?.() ?? [])]]);
  const info = s.renderer.info;
  out.push(['Drawing', [
    // the scene rests when nothing moves, so it can draw far fewer frames than the browser offers
    ['frames a second', `${drawn} drawn of ${offered}`],
    ['canvas', `${s.canvas.width} × ${s.canvas.height} @ ${trim(s.renderer.getPixelRatio())}x`],
    ['draw calls', num(info.render.calls)],
    ['triangles', num(info.render.triangles)],
    ['geometries', num(info.memory.geometries)],
    ['textures', num(info.memory.textures)],
    ['shaders', num(info.programs?.length ?? 0)],
    ['graphics', gpuName(s)],
  ]]);
  return out;
}

export function mountDebug(src: DebugSource) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const panel = document.createElement('aside');
  panel.className = 'pf-debug';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Debug');
  panel.innerHTML = '<header><strong>Debug</strong><a class="pf-debug-studio" data-do="studio" target="_blank" rel="noopener" hidden>Studio ↗</a><button type="button" data-do="copy">Copy</button><button type="button" data-do="close" aria-label="Close">×</button></header><div></div>';
  document.body.append(panel);
  const body = panel.querySelector('div')!;

  // the studio, opened where the page is: same home, story stop and light (shown once the page is known to be there)
  const studioLink = panel.querySelector<HTMLAnchorElement>('.pf-debug-studio')!;
  // (popfoldFallback says where the studio is when it is not beside the page: a page made in a folder, say)
  const studio = src.studio === false ? null : new URL(src.studio ?? document.querySelector<HTMLMetaElement>('meta[name="popfold-studio"]')?.content ?? 'studio.html', location.href);
  if (studio) {
    fetch(studio, { method: 'HEAD', cache: 'no-store' })
      .then((r) => { studioLink.hidden = !(r.ok && (r.headers.get('content-type') ?? 'text/html').includes('html')); })
      .catch(() => undefined);
  }
  const studioHref = () => {
    if (!studio) return '';
    const url = new URL(studio);
    if (src.scene) url.searchParams.set('home', src.scene.homeId);
    if (src.getStage) url.searchParams.set('stage', src.getStage().toFixed(2));
    if (src.scene) url.searchParams.set('light', src.scene.flags.lighting); // (the studio opens in the home's own otherwise)
    return url.href;
  };

  // frames a second, counted two ways: what the browser offers, and what the scene actually drew
  let ticks = 0, offered = 0, drawn = 0, lastFrame = 0, lastAt = performance.now(), timer = 0, raf = 0;
  const count = () => { ticks++; raf = requestAnimationFrame(count); };

  function draw() {
    const now = performance.now(), span = Math.max(0.001, (now - lastAt) / 1000);
    offered = Math.round(ticks / span);
    const frame = src.scene?.renderer.info.render.frame ?? 0;
    drawn = Math.round((frame - lastFrame) / span);
    ticks = 0; lastFrame = frame; lastAt = now;
    if (studio) studioLink.href = studioHref();
    body.replaceChildren(...debugRows(src, drawn, offered).flatMap(([title, list]) => {
      const h = Object.assign(document.createElement('h4'), { textContent: title });
      const dl = document.createElement('dl');
      for (const [k, v] of list) dl.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
      return [h, dl];
    }));
  }

  function toggle(on = panel.hidden) {
    panel.hidden = !on;
    document.dispatchEvent(new CustomEvent('pf-debug', { detail: on })); // a button elsewhere may show the state
    clearInterval(timer); cancelAnimationFrame(raf);
    if (!on) return;
    ticks = 0; lastAt = performance.now(); lastFrame = src.scene?.renderer.info.render.frame ?? 0;
    raf = requestAnimationFrame(count);
    timer = window.setInterval(draw, 500);
    draw();
  }

  panel.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).dataset.do;
    if (act === 'studio') studioLink.href = studioHref(); // where the page is at the moment of the click
    if (act === 'close') toggle(false);
    if (act === 'copy') {
      const text = debugRows(src, drawn, offered).map(([title, list]) => `${title}\n${list.map(([k, v]) => `  ${k}: ${v}`).join('\n')}`).join('\n');
      navigator.clipboard?.writeText(`${location.href}\n${text}`).catch(() => undefined);
    }
  });

  return { toggle, remove: () => { toggle(false); panel.remove(); style.remove(); } };
}
