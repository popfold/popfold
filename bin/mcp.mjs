// popfold mcp: a Model Context Protocol server (stdio) for an agent working on a Popfold site.
//
// Its tools are the site's command list (the same edits the studio makes: place, add, remove, story, camera, beat,
// add-beat, remove-beat, move-beat, look, places, link), read from the running dev server, plus reading a home file, undo and redo of saves, and the
// popfold command's check, describe and shot. Edits go through the site's dev server, so the studio open in a
// browser shows them, and they can be undone from either side.
//
//   popfold mcp [--url http://127.0.0.1:5180]
//
// The dev server must be running (pnpm dev). Without --url its address is read from the site's `dev` script
// (--port). Messages are JSON-RPC, one per line, on stdin and stdout; anything else goes to stderr.
import { execFile } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')).version;

/** the dev server's address: --url, or the port in the site's dev script */
function devUrl(root, flags) {
  const i = flags.indexOf('--url');
  if (i >= 0 && flags[i + 1]) return flags[i + 1].replace(/\/$/, '');
  try {
    const dev = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts?.dev ?? '';
    const port = /--port[ =](\d+)/.exec(dev)?.[1];
    if (port) return `http://127.0.0.1:${port}`;
  } catch { /* no package.json: the default below */ }
  return 'http://127.0.0.1:5173';
}

export async function serve({ root, flags }) {
  const url = devUrl(root, flags);
  const err = (s) => process.stderr.write(`popfold mcp: ${s}\n`);
  err(`working on ${root}, through the dev server at ${url}`);

  const ask = async (path, body) => {
    let r;
    try {
      r = await fetch(`${url}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw new Error(`the site's dev server does not answer at ${url}: start it with \`pnpm dev\` (or pass --url)`); }
    const text = await r.text();
    try { return JSON.parse(text); } catch { throw new Error(`${path}: ${r.status} ${text.slice(0, 200)}`); }
  };
  /** the site's homes kept in files, by id */
  const homes = async () => {
    const { homes: files = [] } = await ask('/__popfold/commands');
    return files.map((f) => ({ file: f, id: JSON.parse(readFileSync(resolve(root, f), 'utf8')).id }));
  };
  const homeId = async (given) => {
    const all = await homes();
    if (given) { if (!all.some((h) => h.id === given)) throw new Error(`no home "${given}" (there ${all.length === 1 ? 'is' : 'are'} ${all.map((h) => h.id).join(', ') || 'none in a file'})`); return given; }
    if (all.length === 1) return all[0].id;
    throw new Error(all.length ? `say which home: ${all.map((h) => h.id).join(', ')}` : 'this site keeps no home in a file (homeSaver({ home }) in vite.config.ts)');
  };
  /** run the popfold command itself (check, describe, shot) and hand back what it printed */
  const popfold = (args) => new Promise((done, fail) => {
    execFile(process.execPath, [resolve(here, 'popfold.mjs'), ...args], { cwd: root, maxBuffer: 64 * 1024 * 1024 }, (e, stdout, stderr) => {
      if (e && !stdout) fail(new Error((stderr || e.message).trim().split('\n').slice(-6).join('\n'))); else done(stdout);
    });
  });

  const homeArg = { home: { type: 'string', description: "the home's id (needed only when the site has more than one)" } };
  const fixed = [
    {
      name: 'read_home', description: "The home file as it is now: its beats (the story), pieces with places and stories, look, and a diorama's stories and places.",
      inputSchema: { type: 'object', properties: homeArg },
      run: async (a) => { const res = await ask(`/__popfold/home/${await homeId(a.home)}`); if (!res.ok) throw new Error(res.why); return text(JSON.stringify(res.home, null, 2)); },
    },
    {
      name: 'undo', description: 'Take back the last save of the home file (by anyone: this server, the studio or another agent).',
      inputSchema: { type: 'object', properties: homeArg },
      run: async (a) => saved(await ask(`/__popfold/home/${await homeId(a.home)}`, { undo: true }), 'Undone'),
    },
    {
      name: 'redo', description: 'Make again the last save that was undone.',
      inputSchema: { type: 'object', properties: homeArg },
      run: async (a) => saved(await ask(`/__popfold/home/${await homeId(a.home)}`, { redo: true }), 'Redone'),
    },
    {
      name: 'check', description: "Look for mistakes in the site: beats and sections that do not line up, stories and places that match no piece, models that did not load, missing stills. Takes 10 to 30 seconds (it opens the studio in a headless browser).",
      inputSchema: { type: 'object', properties: {} },
      run: async () => text(await popfold(['check', '--json'])),
    },
    {
      name: 'describe', description: "Every piece of a home as the scene builds it: its key, room, place, turn, size, whether it is hidden and its story's title. Use it to find a piece's key and where things stand.",
      inputSchema: { type: 'object', properties: homeArg },
      run: async (a) => text(await popfold(['describe', ...(a.home ? ['--home', a.home] : [])])),
    },
    {
      name: 'library', description: "Every kind of piece a home can use, before you add or make one: the site's own kinds, Popfold's built-in pieces (builtin/sofa, …: a home file can name them without code) and model files, each with where it is used and whether the home can build it now. Model files in the site that no home loads are listed too. Takes 10 to 30 seconds (it opens the studio in a headless browser).",
      inputSchema: { type: 'object', properties: homeArg },
      run: async (a) => {
        const shown = JSON.parse(await popfold(['describe', ...(a.home ? ['--home', a.home] : [])]));
        let files = [];
        try { ({ files = [] } = await ask('/__popfold/library')); } catch { /* without the dev server: what the homes list */ }
        const loaded = new Set(shown.flatMap((h) => h.kinds.map((k) => k.file).filter(Boolean)));
        const homes = shown.map((h) => ({ home: h.home, shell: h.shell, kinds: h.kinds }));
        return text(JSON.stringify({ homes, modelFilesNoHomeLoads: files.filter((f) => !loaded.has(f.path)) }, null, 2));
      },
    },
    {
      name: 'shot', description: 'A picture of the home at a point in its story, to see what an edit did.',
      inputSchema: { type: 'object', properties: { ...homeArg, stage: { type: 'number', description: 'where in the story: 0 is the first beat, 1 the second, fractions between' }, cam: { type: 'string', description: "a studio camera preset (default: the story's own camera)" }, light: { enum: ['day', 'evening'] } } },
      run: async (a) => {
        const dir = mkdtempSync(join(tmpdir(), 'popfold-shot-'));
        try {
          const out = join(dir, 'shot.png');
          await popfold(['shot', '--out', out, ...(a.home ? ['--home', a.home] : []), ...(a.stage !== undefined ? ['--stage', String(a.stage)] : []), ...(a.cam ? ['--cam', a.cam] : []), ...(a.light ? ['--light', a.light] : [])]);
          return { content: [{ type: 'image', data: readFileSync(out).toString('base64'), mimeType: 'image/png' }] };
        } finally { rmSync(dir, { recursive: true, force: true }); }
      },
    },
  ];
  const text = (t) => ({ content: [{ type: 'text', text: t }] });
  const saved = (res, did) => {
    if (!res.ok) throw new Error(res.why ?? 'not saved');
    return text(`${did} in ${res.file} (${res.names?.join(', ') ?? ''}). ${res.undo} save${res.undo === 1 ? '' : 's'} can be undone, ${res.redo} redone. Open site and studio pages reload to show it.`);
  };
  /** the site's command list, as tools: each takes the command's own arguments, and `home` */
  const commandTools = async () => {
    const { commands } = await ask('/__popfold/commands');
    return commands.map((c) => ({
      name: c.name, description: `${c.summary} (Writes the home file; undo takes it back.)`,
      inputSchema: { ...c.args, properties: { ...homeArg, ...c.args.properties } },
      run: async ({ home, ...args }) => saved(await ask(`/__popfold/home/${await homeId(home)}`, { commands: [{ name: c.name, args }] }), 'Saved'),
    }));
  };
  const allTools = async () => {
    try { return [...(await commandTools()), ...fixed]; } catch (e) { err(e.message); return fixed; } // without the dev server, the popfold command's own tools still work
  };

  const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { send({ id: null, error: { code: -32700, message: 'not JSON' } }); continue; }
    const { id, method, params = {} } = msg;
    const reply = (result) => { if (id !== undefined) send({ id, result }); };
    try {
      if (method === 'initialize') {
        reply({ protocolVersion: params.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'popfold', version }, instructions: `Popfold site at ${root}. Edit its homes with the command tools; read_home and describe show what is there, library what can be added, shot shows it, undo takes an edit back, check finds mistakes.` });
      } else if (method === 'ping') reply({});
      else if (method === 'tools/list') reply({ tools: (await allTools()).map(({ run, ...t }) => t) });
      else if (method === 'tools/call') {
        const tool = (await allTools()).find((t) => t.name === params.name);
        if (!tool) { send({ id, error: { code: -32602, message: `no tool "${params.name}"` } }); continue; }
        try { reply(await tool.run(params.arguments ?? {})); }
        catch (e) { reply({ content: [{ type: 'text', text: e.message }], isError: true }); }
      } else if (method?.startsWith('notifications/')) { /* nothing to answer */ }
      else if (id !== undefined) send({ id, error: { code: -32601, message: `no method "${method}"` } });
    } catch (e) { if (id !== undefined) send({ id, error: { code: -32603, message: e.message } }); }
  }
}
