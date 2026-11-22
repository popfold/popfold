#!/usr/bin/env node
// popfold: work on a Popfold site from the command line. Run it in the site's folder.
//
//   popfold build              capture fresh stills, then `vite build` (the 3D site plus the page without 3D)
//   popfold build --keep       build with the stills already in public/stills
//   popfold stills             only capture the stills
//   popfold stills --check     capture, compare with the stills already there, change nothing, and fail if any differ
//   popfold check [--json]     look for mistakes: sections and beats that do not line up, stories and
//                              places that match no piece, models that did not load, missing stills
//   popfold describe [--home id]   every home as JSON: its pieces with their keys, places and sizes, and its stories
//   popfold shot [--home id] [--stage n] [--cam name] [--light evening] [--out file.png]
//                              a picture of any view (the stage may be a fraction; cam is a studio camera preset)
//   popfold optimize [files or folders] [--check] [--texture-size 1024] [--simplify [error]]
//   popfold split-room <room.glb>  cut a diorama's room model into the room and its pieces, to show the room first
//                              make .glb models smaller without changing how they look (default: public/models);
//                              --check only says what would be saved
//   popfold init <folder> [--template compact|tower|diorama|storybook] [--name n] [--port p] [--ref tag] [--from url-or-folder]
//                              start a new site in <folder>: a git repository that installs Popfold from npm, and a
//                              template (default: compact) as its first pages, both of one release (--ref; default the
//                              newest). --from <folder> links a Popfold checkout instead. Run it from anywhere Popfold
//                              is installed: `pnpm dlx @popfold/engine init mysite`, or `node bin/popfold.mjs init ../mysite`
//   popfold update [tag]       move the site to a Popfold release (default: the newest), then install, typecheck and
//                              build to prove the site still works with it
//   popfold mcp [--url u]      an MCP server (stdio) for an agent: the studio's edits as tools, through the running
//                              dev server, plus check, describe and shot (see bin/mcp.mjs)
//
// Everything but `init`, `optimize` and `update` starts the site's Vite dev server on a free local port and opens its studio in a headless
// Chrome or Edge (installed on this machine; or set POPFOLD_BROWSER to a browser's path, e.g. one from
// `pnpm dlx playwright install chromium`). Which homes and studio pages come from popfoldFallback() in the site's
// vite.config.ts, so nothing is configured twice.
//
// Stills: each new still is compared with the one it replaces, pixel by pixel. A still that did not visibly change
// is put back exactly as it was, so git shows only the stills that really changed.
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { uncredited } from './credits.mjs';

const [cmd = 'help', ...flags] = process.argv.slice(2);
const root = process.cwd();
const log = (s) => console.error(`popfold: ${s}`); // progress goes to stderr, so `describe` and `check --json` print clean JSON
const say = (s) => console.log(`popfold: ${s}`);
/** the value after a flag: option('--home') */
const option = (name) => { const i = flags.indexOf(name); return i >= 0 ? flags[i + 1] : undefined; };

// A still counts as changed when more than CHANGED_PERCENT of its pixels differ by more than PIXEL_STEP (of 255) in
// any channel. Captures are repeatable (the studio holds the scene's clock), so an unchanged scene scores 0.
const PIXEL_STEP = 16;
const CHANGED_PERCENT = 0.02;

/** In the page: what share of pixels differ between two WebP files (given as base64). */
const compareInPage = async ([a, b, step]) => {
  const load = async (b64) => createImageBitmap(await (await fetch(`data:image/webp;base64,${b64}`)).blob());
  const [x, y] = await Promise.all([load(a), load(b)]);
  if (x.width !== y.width || x.height !== y.height) return { percent: 100, resized: `${x.width}x${x.height} -> ${y.width}x${y.height}` };
  const pixels = (img) => {
    const g = new OffscreenCanvas(img.width, img.height).getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, img.width, img.height).data;
  };
  const p = pixels(x), q = pixels(y);
  let n = 0;
  for (let i = 0; i < p.length; i += 4) {
    if (Math.abs(p[i] - q[i]) > step || Math.abs(p[i + 1] - q[i + 1]) > step || Math.abs(p[i + 2] - q[i + 2]) > step || Math.abs(p[i + 3] - q[i + 3]) > step) n++;
  }
  return { percent: (n / (p.length / 4)) * 100 };
};

/**
 * Start the site's dev server and a headless browser, and hand `work` what it needs:
 *   site.captures   [{ home, studio }]: each story page's home and the studio page that shows it
 *   site.pages      [{ html, home, studio, stories, sections, lang?, text?, untranslated? }]: every story page
 *   site.open(studio, query)   a page with that studio loaded and its scene running; page.problems collects
 *                              page errors and console warnings
 */
async function withStudio(work) {
  const { createServer } = await import('vite');
  const server = await createServer({ root, logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: false, open: false, hmr: false } });
  let browser;
  try {
    const api = server.config.plugins.find((p) => p.name === 'popfold-fallback')?.api;
    // a site with several story pages has a home, and a studio page, for each
    const captures = api?.captures ?? [];
    if (!captures.length) throw new Error('no popfoldFallback({ stillsHome }) in this site\'s vite.config.ts');
    if (!server.config.plugins.some((p) => p.name === 'popfold-home-saver')) throw new Error('homeSaver() is missing from this site\'s vite.config.ts');
    for (const c of captures) if (!existsSync(`${root}/${c.studio}`)) throw new Error(`this site has no ${c.studio} (the studio page that shows "${c.home}")`);
    await server.listen();
    const { port } = server.httpServer.address();
    const origin = `http://127.0.0.1:${port}${server.config.base.replace(/^\.?\/?/, '/')}`;

    const { chromium } = await import('playwright-core');
    const where = process.env.POPFOLD_BROWSER ? [{ executablePath: process.env.POPFOLD_BROWSER }] : [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
    const launch = async (args) => {
      for (const w of where) { try { return await chromium.launch({ headless: true, args, ...w }); } catch { /* next */ } }
      throw new Error('no Chrome or Edge found; install one, or set POPFOLD_BROWSER to a Chromium path');
    };
    const renderer = async (b) => (await b.newPage()).evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'WebGL') : '';
    });
    // the real GPU first (seconds per still); SwiftShader, Chrome's software renderer, only if there is none
    // (minutes per still, e.g. on CI machines)
    // Each platform's ways to reach the GPU, tried in turn; POPFOLD_GPU_ARGS (space-separated) replaces them. On
    // Linux a headless Chrome has no display: Vulkan, then EGL, reach the GPU without one (CI on a GPU runner).
    const base = ['--enable-gpu', '--ignore-gpu-blocklist'];
    const ways = process.env.POPFOLD_GPU_ARGS ? [process.env.POPFOLD_GPU_ARGS.split(/\s+/).filter(Boolean)]
      : process.platform === 'win32' ? [[...base, '--use-angle=d3d11']]
      : process.platform === 'linux' ? [[...base, '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'], [...base, '--use-angle=gl-egl'], base]
      : [base];
    const soft = (name) => !name || /swiftshader|llvmpipe|softpipe/i.test(name);
    // POPFOLD_GPU=off goes straight to software, to see what a machine without a GPU (CI) would; POPFOLD_GPU=require
    // fails instead of falling back to software (a GPU runner whose GPU Chrome cannot reach)
    const software = process.env.POPFOLD_GPU === 'off';
    let gl = '';
    for (const args of software ? [] : ways) {
      browser = await launch(args);
      gl = await renderer(browser);
      if (!soft(gl)) break;
      log(`no GPU with ${args.slice(base.length).join(' ') || 'the defaults'} (${gl || 'no WebGL'})`);
      await browser.close(); browser = undefined;
    }
    if (soft(gl) && process.env.POPFOLD_GPU === 'require') throw new Error('POPFOLD_GPU=require, and Chrome reaches no GPU here');
    if (soft(gl)) {
      await browser?.close();
      browser = await launch(['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist']);
      gl = await renderer(browser);
      if (!gl) throw new Error('this browser has no WebGL, even in software');
      log('no GPU here: drawing in software, which takes a few minutes');
    }
    log(`WebGL: ${gl}`);

    const open = async (studio, query = {}) => {
      // 2x pixels, like a retina screen: stills come out 2400 x 1800 and stay sharp on phones and HiDPI displays
      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
      page.problems = [];
      page.on('pageerror', (e) => page.problems.push(`page error: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') page.problems.push(m.text()); });
      const url = `${origin}${studio}?${new URLSearchParams(query)}`;
      page.address = url;
      await page.goto(url, { waitUntil: 'load' });
      // wait for the scene, or for the studio to say that its home could not be built (a mistyped kind, say)
      // (the studio flags that), or for the page to throw while it loads (a mistake in the home file does that)
      let failed, threwAt = 0;
      for (const until = Date.now() + 120_000; ; await page.waitForTimeout(200)) {
        failed = await page.evaluate(() => (window.__popfold?.scene ? 'ok' : window.__popfold?.failed));
        if (failed) break;
        const threw = page.problems.find((p) => p.startsWith('page error: '));
        if (threw && Date.now() - (threwAt ||= Date.now()) > 1500) { failed = threw.slice(12); break; }
        if (Date.now() > until) throw new Error(`${studio} did not start within two minutes`);
      }
      if (failed !== 'ok') throw new Error(`${studio} did not start: ${failed}`);
      // wall art and other pictures load after the scene starts; a still taken before they arrive shows their
      // drawn stand-ins, which makes a cold first run differ from the next one
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);
      return page;
    };
    return await work({ captures, pages: api.pages ?? [], budget: api.budget, origin, open, gl });
  } finally {
    await browser?.close();
    await server.close();
  }
}

/**
 * Capture the stills: of every home a page shows (into public/stills/, for the page without 3D), then of every
 * other home its studio page has (into stills/, which no build carries). check: change nothing on disk and report
 * whether any still differs from the one there.
 */
const captureStills = ({ check = false } = {}) => withStudio(async ({ captures, open, gl }) => {
  let differ = 0;
  const todo = captures.map((c) => ({ ...c, extra: false }));
  for (let n = 0; n < todo.length; n++) {
    const { home, studio, extra } = todo[n];
    const folder = extra ? 'stills' : 'public/stills';
    const dir = `${root}/${folder}`;
    // the stills as they are now, to compare the new ones with ("office-0.webp", not "office-crisp-0.webp")
    const mine = (name) => name.startsWith(`${home}-`) && /^\d+\.webp$/.test(name.slice(home.length + 1));
    const before = new Map((existsSync(dir) ? readdirSync(dir).filter(mine) : []).map((name) => [name, readFileSync(`${dir}/${name}`)]));
    let page = await open(studio, { home });
    // the studio's other homes, which no page shows, get stills of their own after the pages' homes
    if (!extra) for (const id of await page.evaluate(() => window.__popfold.scene.homes)) if (!todo.some((c) => c.home === id)) todo.push({ home: id, studio, extra: true });
    log(`capturing stills of "${home}" (${page.address})`);
    // the page draws on the GPU the browser started with (Chrome's GPU process can restart under load, and a page
    // made after that may draw in software), and its drawing is not lost while it captures
    const drawsOn = (p) => p.evaluate(() => {
      const gl = window.__popfold.scene.renderer.getContext();
      gl.canvas.addEventListener('webglcontextlost', () => { window.__popfoldLost = true; }, { once: true });
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'WebGL');
    });
    for (let tries = 0; ; tries++) {
      const on = await drawsOn(page);
      if (on === gl) break;
      if (tries === 2) throw new Error(`the studio page draws on "${on}", not on "${gl}" as the browser started: the GPU is not steady, so its stills could not be trusted`);
      log(`the page draws on "${on}", not "${gl}"; opening it again`);
      await page.close();
      page = await open(studio, { home });
    }
    const capture = async () => {
      await page.waitForFunction(() => document.querySelector('#capture')?.textContent === 'Capture stills', null, { timeout: 30_000 });
      await page.click('#capture');
      await page.waitForFunction(() => /^(Saved|Stopped)/.test(document.querySelector('#capture')?.textContent ?? ''), null, { timeout: 600_000, polling: 250 });
      return page.textContent('#capture');
    };
    let result = await capture();
    // a file briefly locked on Windows (an editor, a viewer, a sync tool) stops a run; one more try usually works
    if (!result.startsWith('Saved')) { log(`${result}; trying once more`); result = await capture(); }
    if (await page.evaluate(() => window.__popfoldLost === true)) throw new Error(`the page lost its drawing (WebGL context) while capturing "${home}": the GPU is not steady, so its stills could not be trusted`);
    for (const p of page.problems.filter((x) => x.includes('did not settle'))) log(p);
    const errors = page.problems.filter((p) => p.startsWith('page error'));
    if (errors.length) log(`${errors.join('\n  ')}`);
    if (!result.startsWith('Saved')) {
      for (const [name, old] of before) writeFileSync(`${dir}/${name}`, old); // a half-finished capture leaves the old stills
      throw new Error(result);
    }

    // which stills really changed?
    const after = readdirSync(dir).filter(mine).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const report = [];
    let changed = 0;
    for (const name of after) {
      const fresh = readFileSync(`${dir}/${name}`);
      const old = before.get(name);
      if (!old) { report.push(`${name}: new`); changed++; continue; }
      const { percent, resized } = old.equals(fresh) ? { percent: 0 } : await page.evaluate(compareInPage, [old.toString('base64'), fresh.toString('base64'), PIXEL_STEP]);
      if (percent > CHANGED_PERCENT) {
        report.push(`${name}: ${resized ? `size ${resized}` : `${percent.toFixed(2)}% of pixels changed`}`); changed++;
        // POPFOLD_STILLS_OUT=<folder>: keep each still that differs, beside the one it is compared with, to look at
        if (process.env.POPFOLD_STILLS_OUT) { mkdirSync(process.env.POPFOLD_STILLS_OUT, { recursive: true }); writeFileSync(`${process.env.POPFOLD_STILLS_OUT}/${name.replace(/\.webp$/, '')}-new.webp`, fresh); writeFileSync(`${process.env.POPFOLD_STILLS_OUT}/${name.replace(/\.webp$/, '')}-old.webp`, old); }
      }
      else if (!check) writeFileSync(`${dir}/${name}`, old); // looks the same: keep the old file, so git stays quiet
    }
    for (const name of before.keys()) if (!after.includes(name)) { report.push(`${name}: no longer captured`); changed++; }
    if (check) { // leave the folder exactly as it was
      for (const name of after) if (!before.has(name)) rmSync(`${dir}/${name}`);
      for (const [name, old] of before) writeFileSync(`${dir}/${name}`, old);
    }
    differ += changed;
    if (!changed) say(`"${home}": ${after.length} stills captured${extra ? ' (in stills/: no page shows it)' : ''}; all look the same as before${check ? '' : ', nothing rewritten'}`);
    else say(`"${home}": ${after.length} stills captured; ${changed} ${check ? 'differ from' : 'changed in'} ${folder}/:\n    ${report.join('\n    ')}`);
    await page.close();
  }
  return differ;
});

/** Every home the site shows, as data: for `describe`, and for `check` to reason about. */
const describeSite = (only) => withStudio(async ({ captures, pages, budget, open }) => {
  const out = [];
  // a page's own home first; then, in each studio, the homes it has that no page shows (they have no stills, but
  // they are homes all the same)
  const seen = new Set();
  const todo = captures.map((c) => ({ ...c }));
  for (let n = 0; n < todo.length; n++) {
    const { home, studio, extra } = todo[n];
    if (seen.has(`${studio}|${home}`)) continue;
    seen.add(`${studio}|${home}`);
    const page = await open(studio, { home });
    if (!extra) for (const id of await page.evaluate(() => window.__popfold.scene.homes)) if (!captures.some((c) => c.home === id)) todo.push({ home: id, studio, extra: true });
    if (only && only !== home) { await page.close(); continue; }
    // measure a settled scene, not whatever frame the page happens to be on: walls are mid-fold and the home
    // floats, so numbers taken a moment apart would differ
    const data = await page.evaluate(() => {
      const scene = window.__popfold.scene;
      scene.flags.idle = false;
      scene.hold(true);
      scene.step(240);
      return scene.describe();
    });
    out.push({ ...data, page: extra ? null : pages.find((p) => p.home === home)?.html ?? null, studio, problems: page.problems });
    await page.close();
  }
  if (only && !out.length) throw new Error(`this site has no home "${only}"; it has ${[...new Set(todo.map((c) => c.home))].join(', ')}`);
  return { pages, budget, homes: out };
});

/** Mistakes a person or an agent can act on. Returns [{ level: 'error' | 'warning', where, message }]. */
async function check() {
  const { pages, budget, homes } = await describeSite();
  const found = [];
  const add = (level, where, message) => found.push({ level, where, message });
  for (const p of pages) {
    const file = resolve(root, p.source); // (a page made from another's HTML is checked against that HTML)
    if (!existsSync(file)) { add('error', p.html, `this page is listed in popfoldFallback() but ${p.source === p.html ? 'the file' : p.source} does not exist`); continue; }
    const html = readFileSync(file, 'utf8');
    const stages = [...html.matchAll(/<section\b[^>]*class="[^"]*\bstage\b[^"]*"[^>]*>/g)].map((m) => /\bid="([^"]+)"/.exec(m[0])?.[1] ?? null);
    const ids = new Set([...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
    if (stages.includes(null)) add('error', p.html, `${stages.filter((s) => s === null).length} <section class="stage"> without an id`);
    if (!/<main\b[^>]*\bid="main"/.test(html)) add('warning', p.html, 'no <main id="main">; the template\'s main.ts watches it to measure the sections again');
    // a page in another language: the words it still shows in the original
    if (p.untranslated?.length) {
      const shown = p.untranslated.slice(0, 5).map((w) => JSON.stringify(w.length > 50 ? `${w.slice(0, 47)}...` : w)).join(', ');
      add('warning', p.html, `${p.untranslated.length} text${p.untranslated.length === 1 ? ' is' : 's are'} not in ${p.text}, so this ${p.lang} page shows ${p.untranslated.length === 1 ? 'it' : 'them'} untranslated: ${shown}${p.untranslated.length > 5 ? ', …' : ''}`);
    }
    const home = homes.find((h) => h.home === p.home);
    if (!p.home) { add('warning', p.html, 'no stillsHome, so the page without 3D has no pictures and this page is not checked further'); continue; }
    if (!home) continue;

    // the story's beats and the page's sections: the same ids in the same order
    const beats = home.beats.map((b) => b.id);
    const sections = stages.filter((s) => s !== null);
    for (const id of beats.filter((b, n) => beats.indexOf(b) !== n)) add('error', `home "${home.home}"`, `two beats are for the section "${id}"`);
    for (const id of sections.filter((s) => !beats.includes(s))) add('error', p.html, `<section class="stage" id="${id}"> has no beat, so every later section shows the wrong view. Add a beat with that id, in the same place in the list`);
    for (const id of beats.filter((b) => !sections.includes(b))) add('error', `home "${home.home}"`, `the beat "${id}" has no <section class="stage" id="${id}"> in ${p.html}`);
    const shared = (list, other) => list.filter((x) => other.includes(x)).join(', ');
    if (shared(beats, sections) !== shared(sections, beats)) add('error', p.html, `the sections are in a different order from the beats (page: ${shared(sections, beats)}; beats: ${shared(beats, sections)})`);

    // stories: each needs a piece to sit on, and a section to be written under
    const keys = home.pieces.map((x) => x.key);
    const near = (key) => { const piece = key.split('/')[1]?.replace(/#\d+$/, ''); const hit = keys.filter((k) => k.split('/')[1]?.replace(/#\d+$/, '') === piece); return hit.length ? ` Did you mean ${hit.map((k) => `"${k}"`).join(' or ')}?` : ''; };
    for (const key of home.storiesWithoutPiece) add('error', `home "${home.home}"`, `the story "${key}" matches no piece, so it shows no dot and cannot be opened in 3D.${near(key)}`);
    for (const key of p.stories) {
      const zone = key.split('/')[0].replace(/-wall$/, '');
      const id = p.sections[zone] ?? zone;
      if (!ids.has(id)) add('error', p.html, `the story "${key}" goes under <section id="${id}">, which this page does not have, so the page without 3D leaves it out (map its room with "sections" in popfoldFallback())`);
    }
    for (const key of home.placesWithoutPiece) add('warning', `home "${home.home}"`, `the places entry "${key}" matches no piece and does nothing.${near(key)}`);

    // piece ids: one of each per room, and nothing important hanging on a key that depends on the code's order
    for (const x of home.pieces.filter((x) => x.id && x.key !== `${x.room}/${x.id}`)) add('error', `home "${home.home}"`, `more than one piece in "${x.room}" has the id "${x.id}"; ids must differ within a room`);
    for (const x of home.pieces.filter((x) => !x.id && (x.story || x.moved))) {
      const kind = home.pieces.filter((y) => !y.id && y.room === x.room && y.name === x.name).length;
      if (kind > 1) add('warning', `home "${home.home}"`, `"${x.key}" has a ${x.story ? 'story' : 'places entry'} but is one of ${kind} "${x.name}" in "${x.room}", numbered in the order the code adds them: adding or removing one moves the ${x.story ? 'story' : 'entry'} to another piece. Give it an id with piece(obj, 'some-id') and use "${x.room}/some-id"`);
    }

    // stills, one per section
    const missing = stages.map((_, n) => `${home.home}-${n}.webp`).filter((f) => !existsSync(resolve(root, 'public/stills', f)));
    if (missing.length) add('warning', p.html, `${missing.length} of ${stages.length} stills are missing (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''}); run popfold stills`);

    // links: the sections they start from and lead to, their pieces and homes, and the stills their cards show
    for (const t of p.transitions ?? []) {
      const to = typeof t.to === 'string' ? { section: t.to } : t.to;
      const where = `the link from "${t.from}" to "${to.home ? `${to.home}/` : ''}${to.section}"`;
      if (!ids.has(t.from)) add('error', p.html, `${where} starts from <section id="${t.from}">, which this page does not have`);
      if (!ids.has(to.section)) add('error', p.html, `${where} leads to <section id="${to.section}">, which this page does not have`);
      if (to.home && !homes.some((h) => h.home === to.home)) add('error', p.html, `${where} leads to the home "${to.home}", which the studio does not have`);
      if (t.piece && !homes.some((h) => h.pieces.some((x) => x.key === t.piece))) add('error', p.html, `${where} is carried by the piece "${t.piece}", which no home has.${near(t.piece)}`);
      const n = stages.indexOf(to.section);
      if (t.label && t.card !== false && to.home && n >= 0 && !existsSync(resolve(root, 'public/stills', `${to.home}-${n}.webp`))) add('warning', p.html, `${where} has a card with no picture: run popfold stills (it captures ${to.home} too)`);
    }

    // what the scene itself complained about while loading
    for (const text of home.problems) {
      if (/not loaded/.test(text)) add('error', `home "${home.home}"`, `a model did not load: ${text.split('\n')[0].slice(0, 160)}`);
      else if (text.startsWith('page error')) add('error', p.studio, text.slice(0, 200));
    }
  }
  // homes the studio has that no page shows: their stories, models and stills (in stills/) are checked all the same
  for (const home of homes.filter((h) => !h.page)) {
    const missing = home.beats.map((_, n) => `${home.home}-${n}.webp`).filter((f) => !existsSync(resolve(root, 'stills', f)));
    if (missing.length) add('warning', `home "${home.home}"`, `${missing.length} of ${home.beats.length} stills are missing from stills/ (no page shows this home, so its stills are kept there); run popfold stills`);
    for (const key of home.storiesWithoutPiece) add('error', `home "${home.home}"`, `the story "${key}" matches no piece, so it shows no dot and cannot be opened in 3D`);
    for (const key of home.placesWithoutPiece) add('warning', `home "${home.home}"`, `the places entry "${key}" matches no piece and does nothing`);
    for (const text of home.problems) if (/not loaded/.test(text)) add('error', `home "${home.home}"`, `a model did not load: ${text.split('\n')[0].slice(0, 160)}`);
  }

  // stills no page shows: left from a home that was renamed or removed, and copied into every build
  const stillsDir = resolve(root, 'public/stills');
  // (a page shows its own home's stills, and those of every home its links lead to)
  const shown = new Set(pages.flatMap((p) => [p.home, ...(p.transitions ?? []).map((t) => (typeof t.to === 'string' ? null : t.to.home))]).filter(Boolean));
  const stray = (existsSync(stillsDir) ? readdirSync(stillsDir) : []).filter((f) => { const m = /^(.+)-\d+\.webp$/.exec(f); return m && !shown.has(m[1]); });
  if (stray.length) add('warning', 'public/stills', `${stray.length} still${stray.length === 1 ? ' is' : 's are'} of a home no page shows (${stray.slice(0, 3).join(', ')}${stray.length > 3 ? ', …' : ''}), and every build carries ${stray.length === 1 ? 'it' : 'them'}; delete ${stray.length === 1 ? 'it' : 'them'} (popfold stills keeps a studio-only home's stills in stills/)`);
  // stills/ keeps the stills of homes only the studio has: anything else there is left over
  const studioOnly = new Set(homes.filter((h) => !h.page).map((h) => h.home));
  const leftOver = (existsSync(resolve(root, 'stills')) ? readdirSync(resolve(root, 'stills')) : []).filter((f) => { const m = /^(.+)-\d+\.webp$/.exec(f); return m && !studioOnly.has(m[1]); });
  if (leftOver.length) add('warning', 'stills', `${leftOver.length} still${leftOver.length === 1 ? ' is' : 's are'} of a home that is not a studio-only home (${leftOver.slice(0, 3).join(', ')}${leftOver.length > 3 ? ', …' : ''}): a page shows it now (its stills are in public/stills/), or no studio has it; delete ${leftOver.length === 1 ? 'it' : 'them'}`);

  // heavy models
  const models = resolve(root, 'public/models');
  const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`])) : []);
  const sizes = walk(models).filter((f) => f.endsWith('.glb')).map((f) => [f.slice(root.length + 1).replace(/\\/g, '/'), statSync(f).size]);
  const total = sizes.reduce((s, [, n]) => s + n, 0);
  // against the site's own budget if it set one (then it is an error: the build would stop), else a rule of thumb
  const kb = (n) => `${Math.round(n / 1000).toLocaleString('en-US')} KB`;
  for (const [f, n] of sizes) {
    if (budget?.each !== undefined) { if (n > budget.each * 1000) add('error', f, `${kb(n)}: over the site's budget of ${kb(budget.each * 1000)} for one model`); }
    else if (n > 1_500_000) add('warning', f, `${(n / 1e6).toFixed(1)} MB: a heavy model for a web page`);
  }
  const loose = sizes.filter(([f, n]) => n > 50_000 && !isCompressed(resolve(root, f)));
  if (loose.length) add('warning', 'public/models', `${loose.length} model${loose.length === 1 ? ' is' : 's are'} not compressed (${(loose.reduce((s, [, n]) => s + n, 0) / 1e6).toFixed(1)} MB); \`popfold optimize\` usually halves them without changing how they look`);
  if (budget?.total !== undefined) { if (total > budget.total * 1000) add('error', 'public/models', `${kb(total)} of models in all: over the site's budget of ${kb(budget.total * 1000)}`); }
  else if (total > 10_000_000) add('warning', 'public/models', `${(total / 1e6).toFixed(1)} MB of models in all`);

  // credits: every model that ships is accounted for in CREDITS.md (by path, file name or folder)
  if (sizes.length) {
    const credits = resolve(root, 'CREDITS.md');
    if (!existsSync(credits)) add('warning', 'CREDITS.md', `there is none, and ${sizes.length} model${sizes.length === 1 ? '' : 's'} ship: say where each came from and under what licence (or that it was made for the site)`);
    else for (const f of uncredited(sizes.map(([f]) => f), readFileSync(credits, 'utf8'))) add('warning', f, 'not in CREDITS.md: name its creator and licence (or say it was made for the site), by file, or its folder');
  }
  return found;
}

/** Every .glb under the given files and folders. */
const modelsIn = (paths) => paths.flatMap((p) => {
  const at = resolve(root, p);
  if (!existsSync(at)) throw new Error(`there is no ${p}`);
  if (!statSync(at).isDirectory()) return [at];
  return readdirSync(at, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? modelsIn([`${at}/${e.name}`]) : e.name.endsWith('.glb') ? [`${at}/${e.name}`] : []));
});

/** Does this .glb already hold meshopt-compressed data (what `popfold optimize` writes)? */
const isCompressed = (file) => {
  const buf = readFileSync(file);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return false; // not a .glb
  return buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8').includes('EXT_meshopt_compression');
};

/**
 * Make model files smaller without changing what they look like or where anything in them is.
 * Removes duplicate and unused data, packs the geometry (meshopt) and turns textures into WebP no larger than
 * --texture-size. Positions are left exactly as they are: Popfold places a model's parts, and a site's saved
 * layouts, by the parts' own nodes, and the usual trick of squeezing positions into whole numbers moves those.
 */
async function optimize() {
  const paths = flags.filter((f, i) => !f.startsWith('-') && flags[i - 1] !== '--texture-size' && !(flags[i - 1] === '--simplify' && /^[\d.]+$/.test(f)));
  // --simplify [error]: fewer triangles, as many as fit within that error (a fraction of each part's size; default
  // 0.001, a tenth of a percent). Lossy, unlike the rest, so it is asked for, and the stills say what it changed
  const simplifyAt = flags.includes('--simplify') ? Number(/^[\d.]+$/.test(option('--simplify') ?? '') ? option('--simplify') : 0.001) : null;
  if (simplifyAt !== null && !(simplifyAt > 0 && simplifyAt < 0.1)) throw new Error('--simplify takes an error between 0 and 0.1 (as a fraction of each part, by size), e.g. 0.001');
  // with nothing named, the site's own models; a site that has none has nothing to do
  const files = paths.length ? modelsIn(paths) : existsSync(resolve(root, 'public/models')) ? modelsIn(['public/models']) : [];
  const checking = flags.includes('--check');
  const size = Number(option('--texture-size') ?? 1024);
  if (!Number.isInteger(size) || size < 64) throw new Error('--texture-size must be a whole number of pixels, 64 or more');
  let lib;
  try {
    const [core, ext, fn, meshopt] = await Promise.all([import('@gltf-transform/core'), import('@gltf-transform/extensions'), import('@gltf-transform/functions'), import('meshoptimizer')]);
    lib = { ...core, ...ext, ...fn, ...meshopt };
  } catch {
    throw new Error('popfold optimize needs packages that are not installed here (@gltf-transform/core, extensions and functions, and meshoptimizer). They come with Popfold as dev dependencies: run `pnpm install` in this folder');
  }
  const sharp = await import('sharp').then((m) => m.default, () => null);
  if (!sharp) log('sharp is not installed, so textures are left as they are');
  await Promise.all([lib.MeshoptDecoder.ready, lib.MeshoptEncoder.ready, lib.MeshoptSimplifier.ready]);
  const quiet = new lib.Logger(lib.Logger.Verbosity.SILENT);
  const io = new lib.NodeIO().registerExtensions(lib.ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': lib.MeshoptDecoder, 'meshopt.encoder': lib.MeshoptEncoder });
  const places = (doc) => JSON.stringify(doc.getRoot().listNodes().map((n) => [n.getName(), n.getTranslation(), n.getRotation(), n.getScale()]));
  // which material each part is made of, by name
  const madeOf = (doc) => JSON.stringify(doc.getRoot().listNodes().map((n) => n.getMesh()?.listPrimitives().map((p) => p.getMaterial()?.getName() ?? '')));
  const kb = (n) => `${Math.round(n / 1000)} KB`;

  let before = 0, after = 0, changed = 0;
  for (const file of files) {
    const name = file.slice(root.length + 1).replace(/\\/g, '/');
    const was = statSync(file).size;
    before += was;
    if (isCompressed(file) && simplifyAt === null) { after += was; continue; }
    const doc = (await io.read(file)).setLogger(quiet);
    const placed = places(doc), made = madeOf(doc);
    const trisBefore = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
    await doc.transform(
      // two materials or meshes that are the same but for their names stay two: a site paints art and swaps
      // colours by material name, so merging them would paint one picture on every poster
      lib.dedup({ keepUniqueNames: true }),
      lib.prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }), // empty nodes and custom properties mean something to Popfold
      lib.weld(),
      ...(simplifyAt !== null ? [lib.simplify({ simplifier: lib.MeshoptSimplifier, ratio: 0, error: simplifyAt, lockBorder: true })] : []),
      lib.reorder({ encoder: lib.MeshoptEncoder, level: 'medium' }),
      lib.quantize({ pattern: /^(NORMAL|TANGENT|TEXCOORD|COLOR)(_\d+)?$/, quantizeNormal: 14, quantizeTexcoord: 12, quantizeColor: 8 }), // everything but the positions
      ...(sharp ? [lib.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 85 })] : []),
    );
    doc.createExtension(lib.EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: lib.EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    if (places(doc) !== placed) throw new Error(`${name}: optimising would move its parts, so it is left alone. Please report this model`);
    if (madeOf(doc) !== made) throw new Error(`${name}: optimising would change which material a part is made of, so it is left alone. Please report this model`);
    const out = await io.writeBinary(doc);
    if (out.length > was * 0.95) { after += was; say(`${name}: ${kb(was)}, left as it is (nothing to gain)`); continue; }
    const tris = (d) => d.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
    if (simplifyAt !== null) say(`${name}: ${Math.round(trisBefore).toLocaleString('en-US')} -> ${Math.round(tris(doc)).toLocaleString('en-US')} triangles`);
    after += out.length;
    changed++;
    if (!checking) writeFileSync(file, out);
    say(`${name}: ${kb(was)} -> ${kb(out.length)}`);
  }
  if (!files.length) say(paths.length ? 'no .glb files found' : 'this site has no models in public/models: nothing to do');
  else if (!changed) say(`${files.length} model${files.length === 1 ? '' : 's'}, ${kb(before)}: nothing to do`);
  else say(`${changed} of ${files.length} model${files.length === 1 ? '' : 's'} ${checking ? 'would shrink' : 'made smaller'}: ${kb(before)} -> ${kb(after)} in all${checking ? ' (nothing was changed)' : '. Look at the result: pnpm exec popfold stills --check'}`);
}

/**
 * Cut a diorama's room model in two, so a page can show the room before its pieces are in: the room itself (floor
 * and walls, kept in the file) and its pieces (`<name>-pieces.glb`, beside it). The pieces file keeps the parts
 * each piece hangs from, empty, with their names and places, so the engine grafts every piece back exactly where it
 * was. Nothing else changes: the same nodes, places, materials and compression.
 */
async function splitRoom() {
  const file = flags.find((f) => !f.startsWith('-'));
  if (!file?.endsWith('.glb')) throw new Error('usage: popfold split-room <room.glb>  (a diorama\'s room model, e.g. public/models/room.glb)');
  const path = resolve(root, file);
  if (!existsSync(path)) throw new Error(`${file}: no such file`);
  const [core, ext, fn, meshopt] = await Promise.all([import('@gltf-transform/core'), import('@gltf-transform/extensions'), import('@gltf-transform/functions'), import('meshoptimizer')])
    .catch(() => { throw new Error('popfold split-room needs the packages popfold optimize uses: run `pnpm install` in this folder'); });
  await Promise.all([meshopt.MeshoptDecoder.ready, meshopt.MeshoptEncoder.ready]);
  const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': meshopt.MeshoptDecoder, 'meshopt.encoder': meshopt.MeshoptEncoder });
  const quiet = new core.Logger(core.Logger.Verbosity.SILENT);
  const isPiece = (n) => n.getName().startsWith('piece_');
  const under = (n, test) => { for (let p = n; p; p = p.getParentNode()) if (test(p)) return true; return false; };
  const read = async () => (await io.read(path)).setLogger(quiet);
  const room = await read(), pieces = await read();
  const all = room.getRoot().listNodes();
  if (!all.some(isPiece)) throw new Error(`${file} has no pieces (nodes named piece_*): nothing to split`);
  if (pieces.getRoot().listNodes().some((n) => n.getName() === '' && !isPiece(n) && n.listChildren().some(isPiece))) throw new Error(`${file}: a piece hangs from a part with no name, so it could not be grafted back`);
  // the room: every piece goes, with all it holds
  for (const n of room.getRoot().listNodes().filter((n) => under(n, isPiece))) n.dispose();
  // the pieces: what is not a piece goes, but for the parts a piece hangs from, kept empty to carry their places
  const holds = (n) => n.listChildren().some((c) => isPiece(c) || holds(c));
  for (const n of pieces.getRoot().listNodes()) {
    if (under(n, isPiece)) continue;
    if (holds(n)) n.setMesh(null);
    else n.dispose();
  }
  const tidy = fn.prune({ keepLeaves: true, keepAttributes: true, keepExtras: true });
  for (const doc of [room, pieces]) {
    await doc.transform(tidy);
    // (prune keeps materials and textures that carry custom properties, and Blender gives them some: those that
    // nothing in this half uses go by hand, so each half carries only its own)
    const used = new Set(doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives().map((p) => p.getMaterial())));
    for (const m of doc.getRoot().listMaterials()) if (!used.has(m)) m.dispose();
    for (const t of doc.getRoot().listTextures()) if (!t.listParents().some((p) => p.propertyType === 'Material')) t.dispose();
    await doc.transform(tidy);
  }
  const a = await io.writeBinary(room), b = await io.writeBinary(pieces);
  const out = path.replace(/\.glb$/, '-pieces.glb');
  writeFileSync(path, a);
  writeFileSync(out, b);
  const kb = (n) => `${Math.round(n / 1000)} KB`;
  const rel = (p) => p.slice(root.length + 1).replace(/\\/g, '/');
  say(`${rel(path)}: the room alone, ${kb(a.length)}; ${rel(out)}: its pieces, ${kb(b.length)}`);
  say(`next: in the home file, "diorama": { "url": "${rel(path).replace(/^public\//, '')}", "pieces": "${rel(out).replace(/^public\//, '')}", ... }, and lazyModels: true in startScene() on the site's page`);
}

/** A picture of one view of one home. */
const shot = () => withStudio(async ({ captures, open }) => {
  const home = option('--home') ?? captures[0].home;
  const studio = (captures.find((c) => c.home === home) ?? captures[0]).studio;
  const query = { home };
  for (const [flag, key] of [['--stage', 'stage'], ['--cam', 'cam'], ['--light', 'light'], ['--fold', 'fold']]) if (option(flag) !== undefined) query[key] = option(flag);
  const out = resolve(root, option('--out') ?? `popfold-shot-${home}.png`);
  mkdirSync(dirname(out), { recursive: true });
  const page = await open(studio, query);
  const got = await page.evaluate(async () => {
    const scene = window.__popfold.scene;
    const stage = document.querySelector('.studio-stage');
    // the same 4:3 frame as the stills, and nothing that moves on its own
    stage.setAttribute('style', 'position:fixed;left:0;top:0;width:1200px;height:900px;z-index:50');
    Object.assign(scene.flags, { idle: false, hotspots: false, sparkles: false, speed: 1 });
    await new Promise((r) => setTimeout(r, 400));
    scene.hold(true);
    scene.step(240);
    return { png: scene.snapshot(), home: scene.homeId };
  });
  if (got.home !== home) throw new Error(`this studio has no home "${home}"`);
  writeFileSync(out, Buffer.from(got.png.split(',')[1], 'base64'));
  await page.close();
  say(`saved ${out}`);
});

/**
 * Give a site the visual test's workflow (Popfold's tools/site-ci/), unless it has one of its own: one that is exactly
 * what an older Popfold shipped (`shipped`) is replaced by this release's. Says whether it wrote the file.
 */
function addSiteVisualTest(site, pf, shipped = null) {
  const from = `${pf}/tools/site-ci/visual.yml`, to = `${site}/.github/workflows/visual.yml`;
  if (!existsSync(from)) return false;
  if (existsSync(to)) {
    const plain = (text) => text?.replace(/\r\n/g, '\n').trim();
    const now = plain(readFileSync(to, 'utf8'));
    if (now === plain(readFileSync(from, 'utf8')) || now !== plain(shipped)) return false; // current, or the site's own
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  return true;
}

// A site takes Popfold from npm, installed under the name `popfold`: "popfold": "npm:@popfold/engine@0.50.0" in its
// package.json (or "link:../popfold" while it tries an engine change). These read and write that line.
const here = fileURLToPath(new URL('..', import.meta.url)); // the Popfold this command belongs to
const own = JSON.parse(readFileSync(`${here}/package.json`, 'utf8'));
/** the npm package Popfold is published as */
const NPM_NAME = own.name;
const NPM_SPEC = new RegExp(`^npm:${NPM_NAME.replace(/[/@.]/g, '\\$&')}@(.+)$`);
/** the site's Popfold dependency: the version it names, or a link to a checkout */
function popfoldDependency(site) {
  const pkg = JSON.parse(readFileSync(`${site}/package.json`, 'utf8'));
  const spec = pkg.dependencies?.popfold ?? pkg.devDependencies?.popfold;
  if (!spec) throw new Error('this site does not depend on popfold (package.json)');
  if (spec.startsWith('link:') || spec.startsWith('file:')) return { pkg, spec, link: spec.slice(5) };
  const m = NPM_SPEC.exec(spec);
  if (!m) throw new Error(`package.json takes popfold from "${spec}"; it should be "npm:${NPM_NAME}@<version>"`);
  return { pkg, spec, version: m[1] };
}
/** Popfold's published versions, newest first */
function releases() {
  const out = execSync(`npm view ${NPM_NAME} versions --json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const list = [JSON.parse(out)].flat().filter((v) => /^\d+\.\d+\.\d+$/.test(v));
  const num = (v) => v.split('.').map(Number);
  return list.sort((a, b) => { const [x, y] = [num(a), num(b)]; return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; });
}

// Move the site to a Popfold release (default: the newest), and prove the site still works with it.
// It changes package.json and the lockfile only: nothing is committed or pushed, no stills are captured.
function update(tag) {
  const run = (command) => execSync(command, { cwd: root, stdio: 'inherit' });
  const dep = popfoldDependency(root);
  const all = releases();
  const to = tag?.replace(/^v/, '') ?? all[0];
  if (!to) throw new Error(`${NPM_NAME} has no releases on npm`);
  if (!all.includes(to)) throw new Error(`${NPM_NAME} has no release ${to}; the newest are ${all.slice(0, 5).join(', ')}`);
  const installed = `${root}/node_modules/popfold`;
  // the visual test the release the site is on gave it, to know whether the site has changed it since
  const shipped = existsSync(`${installed}/tools/site-ci/visual.yml`) ? readFileSync(`${installed}/tools/site-ci/visual.yml`, 'utf8') : null;
  if (dep.version === to && existsSync(installed)) {
    const added = addSiteVisualTest(root, installed, shipped);
    say(`already on Popfold ${to}${added ? "; the visual test (.github/workflows/visual.yml) is now this release's: commit it" : ''}`);
    return;
  }
  say(`Popfold ${dep.version ?? dep.spec} -> ${to}`);
  const before = readFileSync(`${root}/package.json`, 'utf8');
  writeFileSync(`${root}/package.json`, before.replace(JSON.stringify(dep.spec), JSON.stringify(`npm:${NPM_NAME}@${to}`)));
  try {
    run('pnpm install');
    run('pnpm typecheck');
    run('pnpm build');
  } catch {
    throw new Error(`the site does not build with Popfold ${to}. Fix the site, or go back with: git checkout package.json pnpm-lock.yaml && pnpm install`);
  }
  const added = addSiteVisualTest(root, installed, shipped);
  say(`the site typechecks and builds with Popfold ${to} (node_modules/popfold/CHANGELOG.md says what changed). Nothing is committed.${added ? ' Its visual test (.github/workflows/visual.yml) is this release\'s.' : ''} Next:`);
  console.log('    1. pnpm build:static        recapture the stills (uses the GPU); it lists the ones that changed, look at each');
  console.log(`    2. git add package.json pnpm-lock.yaml public/stills stills${added ? ' .github/workflows/visual.yml' : ''} && git commit -m "Popfold ${to}"`);
}

// Start a new site: its own git repository, Popfold from npm, and a template from that same release (so the two
// always fit) as the site's first pages. Nothing is committed, installed or pushed.
function init(folder) {
  if (!folder) throw new Error('name the folder for the new site: popfold init <folder>');
  const site = resolve(root, folder);
  if (existsSync(site) && readdirSync(site).length) throw new Error(`${site} already has files in it`);
  const name = option('--name') ?? basename(site).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const port = Number(option('--port') ?? 5200);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`"${name}" is not a package name; pass --name with lower-case letters, digits and dashes`);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port must be a number from 1024 to 65535');
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  // --from <folder>: a Popfold checkout on this machine, which the site links to (for engine work)
  const from = option('--from');
  if (from && !existsSync(from)) throw new Error(`--from names a Popfold checkout on this machine; ${from} is not there`);
  const local = from ? resolve(root, from) : null;

  let version = null, spec, pf, temp = null;
  const existed = existsSync(site);
  mkdirSync(site, { recursive: true });
  try {
    git(site, 'init', '--quiet', '--initial-branch=main');
    if (local) {
      pf = local;
      spec = `link:${relative(site, local).replace(/\\/g, '/')}`;
    } else {
      version = option('--ref')?.replace(/^v/, '') ?? releases()[0];
      if (!version) throw new Error(`${NPM_NAME} has no releases on npm`);
      if (version === own.version) pf = here; // this command's own release: its templates are right here
      else {
        // the template comes from the same release as the engine: that release's package, unpacked
        temp = mkdtempSync(resolve(tmpdir(), 'popfold-init-'));
        say(`fetching ${NPM_NAME}@${version}`);
        const file = execSync(`npm pack ${NPM_NAME}@${version} --silent`, { cwd: temp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop();
        execFileSync('tar', ['-xzf', file], { cwd: temp, stdio: ['ignore', 'pipe', 'pipe'] });
        pf = `${temp}/package`;
      }
      spec = `npm:${NPM_NAME}@${version}`;
    }
    const kind = option('--template') ?? 'compact';
    const template = `${pf}/templates/${kind}`;
    if (!/^[a-z-]+$/.test(kind) || !existsSync(`${template}/package.json`)) {
      const have = existsSync(`${pf}/templates`) ? readdirSync(`${pf}/templates`).filter((t) => existsSync(`${pf}/templates/${t}/package.json`)) : [];
      throw new Error(`Popfold ${version ?? ''} has no template "${kind}"; it has: ${have.join(', ') || 'none'}`);
    }

    cpSync(template, site, { recursive: true, filter: (src) => !/[\\/](node_modules|dist)$/.test(src) && resolve(src) !== resolve(template, 'README.md') });
    // the home file names its schema by path: Popfold is installed in node_modules/popfold
    const homeFile = `${site}/src/home.json`;
    if (existsSync(homeFile)) writeFileSync(homeFile, readFileSync(homeFile, 'utf8').replace(/"\$schema": "[^"]*"/, '"$schema": "../node_modules/popfold/schema/home.schema.json"'));
    const pkg = JSON.parse(readFileSync(`${site}/package.json`, 'utf8'));
    const engine = JSON.parse(readFileSync(`${pf}/package.json`, 'utf8'));
    Object.assign(pkg, { name, version: '0.0.1' });
    pkg.dependencies.popfold = spec;
    pkg.scripts.dev = `vite --port ${port} --strictPort --host 127.0.0.1`;
    if (engine.packageManager) pkg.packageManager = engine.packageManager;
    writeFileSync(`${site}/package.json`, `${JSON.stringify(pkg, null, 2)}\n`);
    addSiteVisualTest(site, pf); // the visual test in CI, started by hand until 1.0.0 (its header says what it needs)
    writeFileSync(`${site}/.gitignore`, 'node_modules\ndist\npopfold-shot-*.png\n');
    writeFileSync(`${site}/AGENTS.md`, `# ${name}\n\nA site built with Popfold, which it installs from npm (\`${NPM_NAME}\`, as \`popfold\`; \`package.json\` names the\nrelease) into \`node_modules/popfold\`. Read [node_modules/popfold/AGENTS.md](node_modules/popfold/AGENTS.md) before changing anything, and\n[node_modules/popfold/docs/create-a-site.md](node_modules/popfold/docs/create-a-site.md) for what each file here does.\n`);
    writeFileSync(`${site}/CLAUDE.md`, '@AGENTS.md\n@node_modules/popfold/AGENTS.md\n');
    writeFileSync(`${site}/README.md`, [
      `# ${name}`, '', `A [Popfold](node_modules/popfold/README.md) site. It started as Popfold's ${kind} template: every line in \`[brackets]\` in`,
      '`index.html` is placeholder copy.', '', '```',
      `pnpm install              # Popfold comes from npm (${NPM_NAME}), at the release package.json names`,
      `pnpm dev                  # http://127.0.0.1:${port}   (studio: /studio.html)`,
      'pnpm exec popfold check   # find mistakes',
      'pnpm build:static         # capture the stills, then build dist/',
      'pnpm exec popfold update  # move to the newest Popfold release',
      '```', '',
      // what each file is for: the table in the template's own README
      ...readFileSync(`${template}/README.md`, 'utf8').split(/\r?\n/).filter((line) => line.startsWith('|')), '',
    ].join('\n'));
  } catch (err) {
    // leave nothing half-made behind, so the same command can be run again
    for (const entry of readdirSync(site)) rmSync(`${site}/${entry}`, { recursive: true, force: true });
    if (!existed) rmSync(site, { recursive: true, force: true });
    throw err;
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
  }
  say(`${name} is in ${site}, on Popfold ${version ?? `the checkout at ${local}`}. Nothing is installed or committed. Next:`);
  console.log(`    cd ${folder}`);
  console.log('    pnpm install');
  console.log(`    pnpm dev          # http://127.0.0.1:${port}`);
  console.log(`    git add . && git commit -m "Start from the Popfold ${option('--template') ?? 'compact'} template"`);
}

try {
  if (cmd === 'stills') {
    const checking = flags.includes('--check');
    const differ = await captureStills({ check: checking });
    if (checking && differ) process.exitCode = 1;
  } else if (cmd === 'check') {
    const found = await check();
    const errors = found.filter((f) => f.level === 'error').length;
    if (flags.includes('--json')) console.log(JSON.stringify(found, null, 2));
    else {
      for (const f of found) console.log(`${f.level}: ${f.where}: ${f.message}`);
      say(found.length ? `${errors} error${errors === 1 ? '' : 's'}, ${found.length - errors} warning${found.length - errors === 1 ? '' : 's'}` : 'nothing wrong found');
    }
    if (errors) process.exitCode = 1;
  } else if (cmd === 'optimize') {
    await optimize();
  } else if (cmd === 'split-room') {
    await splitRoom();
  } else if (cmd === 'describe') {
    const { homes } = await describeSite(option('--home'));
    console.log(JSON.stringify(homes.map(({ problems, ...h }) => h), null, 2));
  } else if (cmd === 'shot') await shot();
  else if (cmd === 'update') update(flags.find((f) => !f.startsWith('-')));
  else if (cmd === 'mcp') await (await import('./mcp.mjs')).serve({ root, flags });
  else if (cmd === 'init') init(flags.find((f) => !f.startsWith('-')));
  else if (cmd === 'build') {
    if (!flags.includes('--keep')) await captureStills();
    await (await import('vite')).build({ root });
  } else {
    console.log('usage: popfold build [--keep] | stills [--check] | check [--json] | describe [--home id] | shot [--home id] [--stage n] [--cam name] [--out file.png] | optimize [paths] [--check] | split-room <room.glb> | update [tag] | mcp [--url u]\n       (run in a Popfold site\'s folder)\n       popfold init <folder> [--template compact|tower|diorama|storybook] [--name n] [--port p] [--ref tag]   start a new site');
    process.exit(cmd === 'help' || cmd === '--help' ? 0 : 1);
  }
} catch (err) {
  console.error(`popfold: ${err.message}`);
  process.exit(1);
}
