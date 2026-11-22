// The popfold command's parts that need a browser: check, describe, shot, and popfold mcp against a running dev
// server. Run with `pnpm test:browser` (a local Chrome or Edge, or POPFOLD_BROWSER); each takes a few seconds.
// They run on the compact template and change nothing in it (mcp's edit is undone, and the file is put back).
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = fileURLToPath(new URL('../templates/compact/', import.meta.url));
const bin = fileURLToPath(new URL('../bin/popfold.mjs', import.meta.url));
const popfold = (...args: string[]) => new Promise<{ out: string; err: string; code: number }>((done) => {
  execFile(process.execPath, [bin, ...args], { cwd: site, maxBuffer: 64 * 1024 * 1024 }, (e, out, err) => done({ out, err, code: e ? (e as { code?: number }).code ?? 1 : 0 }));
});

test('popfold check --json finds nothing wrong in the template', async () => {
  const { out, code } = await popfold('check', '--json');
  assert.equal(code, 0);
  const found = JSON.parse(out) as { level: string }[];
  assert.deepEqual(found.filter((f) => f.level === 'error'), []);
});

test('popfold describe lists the home with its pieces, keys and stories', async () => {
  const { out, code } = await popfold('describe');
  assert.equal(code, 0);
  const [home] = JSON.parse(out) as { home: string; shell: string; pieces: { key: string; story?: string }[]; kinds: { kind: string; from: string; usable: boolean; used: unknown[] }[] }[];
  const file = JSON.parse(readFileSync(join(site, 'src/home.json'), 'utf8'));
  assert.equal(home.home, file.id);
  assert.equal(home.shell, 'compact');
  for (const p of file.pieces) assert.ok(home.pieces.some((x) => x.key === `${p.room}${p.wall ? '-wall' : ''}/${p.id}`), `${p.room}/${p.id}`);
  assert.ok(home.pieces.some((x) => x.story));
  // every kind it can use: each one its list names, and Popfold's built-ins
  for (const p of file.pieces) assert.ok(home.kinds.some((k) => k.kind === p.kind && k.usable && k.used.length), p.kind);
  assert.ok(home.kinds.some((k) => k.kind === 'builtin/sofa' && k.from === 'built-in'));
});

test('popfold shot writes a picture of a view', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'popfold-test-'));
  try {
    const out = join(dir, 'shot.png');
    const { code } = await popfold('shot', '--stage', '2', '--out', out);
    assert.equal(code, 0);
    const png = readFileSync(out);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.ok(png.length > 20_000, `a picture of the home, not a blank one (${png.length} bytes)`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('popfold mcp offers the command list and its edits can be undone', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(join(site, 'package.json'));
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  const file = join(site, 'src/home.json');
  const kept = readFileSync(file, 'utf8');
  const server = await createServer({ root: site, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const port = (server.httpServer!.address() as { port: number }).port;
  const mcp = spawn(process.execPath, [bin, 'mcp', '--url', `http://127.0.0.1:${port}`], { cwd: site });
  const waiting = new Map<number, (m: { result: Record<string, any> }) => void>();
  createInterface({ input: mcp.stdout }).on('line', (l) => { const m = JSON.parse(l); waiting.get(m.id)?.(m); });
  let n = 0;
  const call = (method: string, params?: object) => new Promise<{ result: Record<string, any> }>((done) => { const id = ++n; waiting.set(id, done); mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  try {
    assert.equal((await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } })).result.serverInfo.name, 'popfold');
    const names = (await call('tools/list')).result.tools.map((t: { name: string }) => t.name);
    for (const want of ['place', 'add', 'remove', 'story', 'camera', 'beat', 'look', 'read_home', 'undo', 'shot', 'library']) assert.ok(names.includes(want), want);
    const home = JSON.parse(kept);
    const p = home.pieces[0];
    const moved = (await call('tools/call', { name: 'place', arguments: { id: p.id, room: p.room, wall: !!p.wall, change: { turn: 1 } } })).result;
    assert.ok(!moved.isError, moved.content?.[0]?.text);
    assert.notEqual(readFileSync(file, 'utf8'), kept);
    const undone = (await call('tools/call', { name: 'undo', arguments: {} })).result;
    assert.ok(!undone.isError, undone.content?.[0]?.text);
    assert.equal(readFileSync(file, 'utf8'), kept);
    const wrong = (await call('tools/call', { name: 'remove', arguments: { id: 'no-such-piece', room: p.room } })).result;
    assert.equal(wrong.isError, true);
  } finally {
    if (existsSync(file) && readFileSync(file, 'utf8') !== kept) writeFileSync(file, kept);
    mcp.kill();
    await server.close();
  }
});
