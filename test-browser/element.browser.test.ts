// <popfold-home> from the library bundle, on a plain page with no build step: it builds the bundle, serves a page
// that loads it with the diorama template's home, and checks the element starts, follows the scroll, takes a page's
// own art, opens a story's card and lets its scene go when it is removed. Run with `pnpm test:browser`.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Plain</title><link rel="icon" href="data:," />
<style>body { margin: 0; } .gap { height: 90vh; } popfold-home { height: 90vh; }</style>
<script type="module">
  import { PopfoldHome, THREE } from './lib/popfold.js';
  PopfoldHome.code = { diorama: { art: { art_board: () => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#3F6E8C'; g.fillRect(0, 0, 64, 64); window.painted = true; return new THREE.CanvasTexture(c); } } } };
</script></head><body><div class="gap"></div><popfold-home id="home" src="room/home.json"></popfold-home><div class="gap"></div></body></html>`;

test('<popfold-home> shows a home on a plain page from the library bundle', { timeout: 240_000 }, async () => {
  const { build } = await import('vite');
  await build({ configFile: join(root, 'vite.lib.config.ts'), logLevel: 'warn' });
  const dir = mkdtempSync(join(tmpdir(), 'popfold-element-'));
  cpSync(join(root, 'dist'), join(dir, 'lib'), { recursive: true });
  mkdirSync(join(dir, 'room/models'), { recursive: true });
  cpSync(join(root, 'templates/diorama/src/home.json'), join(dir, 'room/home.json'));
  for (const f of readdirSync(join(root, 'templates/diorama/public/models'))) cpSync(join(root, 'templates/diorama/public/models', f), join(dir, 'room/models', f));
  writeFileSync(join(dir, 'index.html'), PAGE);
  const server = createServer((req, res) => {
    const path = normalize(join(dir, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname).replace(/\/$/, '/index.html')));
    try { const body = readFileSync(path); res.setHeader('content-type', TYPES[extname(path)] ?? 'application/octet-stream'); res.end(body); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  const { chromium } = await import('playwright-core');
  const where = process.env.POPFOLD_BROWSER ? { executablePath: process.env.POPFOLD_BROWSER } : { channel: 'chrome' };
  const browser = await chromium.launch({ headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])], ...where });
  const problems: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => (document.getElementById('home') as unknown as { scene: unknown }).scene, null, { timeout: 60_000 });
    // the room's pieces arrive, and the page's own art is painted on the model
    await page.waitForFunction(() => (document.getElementById('home') as unknown as { scene: { house: { editables: unknown[] } } }).scene.house.editables.length > 10, null, { timeout: 30_000 });
    assert.equal(await page.evaluate(() => (window as unknown as { painted?: boolean }).painted), true);
    // the story follows the element through the viewport: further down the page, further on in the story
    const stage = () => page.evaluate(() => (document.getElementById('home') as unknown as { scene: { stage: number } }).scene.stage);
    await page.evaluate(() => document.getElementById('home')!.scrollIntoView({ block: 'end', behavior: 'instant' }));
    await page.waitForTimeout(1500);
    const early = await stage();
    await page.evaluate(() => scrollBy(0, innerHeight * 0.6));
    await page.waitForTimeout(1500);
    assert.ok((await stage()) > early, `the story moves on as the page scrolls (${early} -> ${await stage()})`);
    // a click on a story's dot opens its card
    await page.evaluate(() => document.getElementById('home')!.scrollIntoView({ block: 'end', behavior: 'instant' }));
    await page.waitForTimeout(2500);
    const at = await page.evaluate(() => {
      const s = (document.getElementById('home') as unknown as { scene: { scene: { traverse: (f: (o: { isSprite?: boolean; userData: Record<string, unknown> }) => void) => void }; camera: { position: { clone: () => unknown } }; canvas: HTMLCanvasElement } }).scene as any;
      let dot: any = null;
      s.scene.traverse((o: any) => { if (!dot && o.isSprite && o.userData.storyKey === 'lounge/sofa') dot = o; });
      const v = dot.getWorldPosition(s.camera.position.clone()).project(s.camera), r = s.canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    });
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => (document.querySelector('.story-card') as HTMLElement | null)?.getBoundingClientRect().width ? 'open' : 'closed'), 'open');
    // removed from the page, it lets its scene go
    await page.evaluate(() => document.getElementById('home')!.remove());
    await page.waitForTimeout(300);
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
