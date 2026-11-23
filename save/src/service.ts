// Popfold's save service: the studio on a deployed site saves its edits into the site's GitHub repository.
//
// The studio sends the home file's commands (the same list the dev server and `popfold mcp` run); the service
// replays them on the newest home file in the repository, checks the result, and commits it with the editor's own
// GitHub token. Edits made by two people both land, unless one of them makes the other's command impossible (a
// piece that is gone), which comes back as an answer that says so.
//
// Users are GitHub's: a site's owner signs up by installing the Popfold GitHub App on the site's repository, and an
// editor by signing in with GitHub from the studio. Nothing is stored here: a session is a sealed token the studio
// holds (session.ts), and which files a site's homes live in is the site's own popfold-save.json.
//
// Written against the web's Request and Response only, so the same handler runs on a Cloudflare Worker
// (worker.ts), in Node, or on Azure.
import { formatHome, HOME_COMMANDS, runCommands, usePageReader, type HomeCommand, type PageText } from '../../src/home-commands';
import { readPage } from '../../src/page-reader';
import { readHome } from '../../src/pieces';
import { GitHub, GitHubError } from './github';
import { seal, sessionOf, unseal, type Session } from './session';

usePageReader(readPage);

export interface Env {
  /** the GitHub App's client id and secret (its "Sign in with GitHub") */
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** 32 random bytes in base64: seals sessions (openssl rand -base64 32) */
  SESSION_KEY: string;
  /** the GitHub App's public page (https://github.com/apps/<name>), for "install the app" answers */
  GITHUB_APP_URL?: string;
  /** other addresses for GitHub's API and site (tests, GitHub Enterprise) */
  GITHUB_API?: string;
  GITHUB_WEB?: string;
}

/** What a site publishes at /popfold-save.json: where its homes are kept, and how edits land. */
export interface SaveManifest {
  /** the site's repository, "owner/name" */
  repo: string;
  /** the branch the site is built from */
  branch: string;
  /**
   * "pull-request" (default): each editor's edits go to their own branch, studio/<login>, with a pull request
   * into `branch`. "direct": they are committed onto `branch` itself.
   */
  mode?: 'pull-request' | 'direct';
  /** each home's file, and the story page whose sections are its beats, relative to the repository's root */
  homes: Record<string, { file: string; page?: string }>;
}

const SESSION_HOURS = 8;
const json = (body: unknown, status = 200, origin?: string | null) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(origin) } });
const cors = (origin?: string | null): Record<string, string> => origin
  ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '600', vary: 'origin' }
  : {};

/** a refusal: an answer that says why, with its HTTP status */
class Refusal extends Error {
  readonly status: number;
  constructor(status: number, why: string) { super(why); this.status = status; }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isOrigin = (s: string | null): s is string => !!s && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s) && new URL(s).origin === s;

/** read and check a site's manifest (cached for a minute, per running copy of the service) */
const manifests = new Map<string, { m: SaveManifest; at: number }>();
/** forget the manifests read so far (a test, or a site that just changed its own) */
export const forgetManifests = () => manifests.clear();
export async function manifestOf(origin: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<SaveManifest> {
  const hit = manifests.get(origin);
  if (hit && now - hit.at < 60_000) return hit.m;
  let r: Response;
  try { r = await fetcher(`${origin}/popfold-save.json`, { headers: { accept: 'application/json' } }); } catch { throw new Refusal(400, `${origin} did not answer`); }
  if (!r.ok) throw new Refusal(400, `${origin} has no popfold-save.json (${r.status}): the site has not turned on saving`);
  let m: SaveManifest;
  try { m = await r.json() as SaveManifest; } catch { throw new Refusal(400, `${origin}/popfold-save.json is not JSON`); }
  const wrong: string[] = [];
  if (typeof m?.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(m.repo)) wrong.push('"repo" must be "owner/name"');
  if (typeof m?.branch !== 'string' || !m.branch) wrong.push('"branch" must name a branch');
  if (m?.mode !== undefined && m.mode !== 'pull-request' && m.mode !== 'direct') wrong.push('"mode" must be "pull-request" or "direct"');
  if (!m?.homes || typeof m.homes !== 'object') wrong.push('"homes" must be { "<id>": { "file": "src/home.json" } }');
  else for (const [id, h] of Object.entries(m.homes)) {
    if (!/^[a-z0-9-]{1,40}$/.test(id)) wrong.push(`"${id}" is not a home id`);
    if (typeof h?.file !== 'string' || !safePath(h.file)) wrong.push(`home "${id}": "file" must be a path in the repository`);
    if (h?.page !== undefined && (typeof h.page !== 'string' || !safePath(h.page))) wrong.push(`home "${id}": "page" must be a path in the repository`);
  }
  if (wrong.length) throw new Refusal(400, `${origin}/popfold-save.json: ${wrong.join('; ')}`);
  manifests.set(origin, { m, at: now });
  return m;
}
const safePath = (p: string) => /^[\w./-]+$/.test(p) && !p.startsWith('/') && !p.split('/').includes('..') && !p.startsWith('.git/');

/** the branch an editor's edits go to */
const branchOf = (m: SaveManifest, login: string) => (m.mode === 'direct' ? m.branch : `studio/${login.toLowerCase()}`);

/**
 * Replay commands on a home's newest file in the repository and commit the result: the home file, and the story
 * page when a command changes its sections. Tries again on the newer files when someone else committed meanwhile.
 */
export async function saveCommands(gh: GitHub, m: SaveManifest, s: Session, id: string, commands: HomeCommand[]) {
  const where = m.homes[id];
  if (!where) throw new Refusal(404, `the site keeps no home file for "${id}" (popfold-save.json)`);
  const branch = branchOf(m, s.login);
  const names = [...new Set(commands.map((c) => c?.name))];
  const needsPage = commands.some((c) => HOME_COMMANDS[c?.name]?.page);
  if (needsPage && !where.page) throw new Refusal(400, `"${id}" has no story page in popfold-save.json, so its beats cannot be added, removed or moved here`);
  for (let attempt = 0; attempt < 3; attempt++) {
    let head = await gh.head(m.repo, branch);
    if (!head) {
      const base = await gh.head(m.repo, m.branch);
      if (!base) throw new Refusal(400, `${m.repo} has no branch "${m.branch}"`);
      await gh.branch(m.repo, branch, base);
      head = base;
    }
    const file = await gh.file(m.repo, where.file, head);
    if (!file) throw new Refusal(404, `${m.repo} has no ${where.file} on ${branch}`);
    const home = JSON.parse(file.text) as Record<string, unknown>;
    const pageFile = needsPage ? await gh.file(m.repo, where.page!, head) : null;
    if (needsPage && !pageFile) throw new Refusal(404, `${m.repo} has no ${where.page} on ${branch}`);
    const page: PageText | null = pageFile ? { file: pageFile.path, text: pageFile.text.replace(/\r\n/g, '\n') } : null;
    try { runCommands(home, commands, page); } catch (err) { throw new Refusal(409, (err as Error).message); }
    try { readHome(home); } catch (err) { throw new Refusal(409, `the home would no longer read: ${(err as Error).message}`); }
    const crlf = /\r\n/.test(file.text);
    const text = crlf ? formatHome(home).replace(/\n/g, '\r\n') : formatHome(home);
    const files = [{ path: where.file, text }];
    if (page && pageFile) {
      const pageText = /\r\n/.test(pageFile.text) ? page.text.replace(/\n/g, '\r\n') : page.text;
      if (pageText !== pageFile.text) files.push({ path: pageFile.path, text: pageText });
    }
    const changed = files.filter((f) => f.path !== where.file || f.text !== file.text);
    if (!changed.length) return { ok: true, file: where.file, branch, home, names, commit: null };
    try {
      const commit = await gh.commit(m.repo, branch, head, changed, `Studio: ${names.join(', ')} (${id})`);
      return { ok: true, file: where.file, branch, home, names, commit, ...(changed.some((f) => f.path !== where.file) ? { page: where.page } : {}) };
    } catch (err) {
      if (err instanceof GitHubError && err.status === 422 && attempt < 2) continue; // someone else committed: replay on theirs
      throw err;
    }
  }
  throw new Refusal(409, 'the branch kept moving while saving; try again');
}

/** the service: every request */
export async function handle(req: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  try {
    if (url.pathname === '/' && req.method === 'GET') return new Response('Popfold save service: the studio on a deployed site saves into its GitHub repository.\n', { headers: { 'content-type': 'text/plain' } });
    if (url.pathname === '/sign-in' && req.method === 'GET') return await signIn(url, env, fetcher);
    if (url.pathname === '/callback' && req.method === 'GET') return await callback(url, env, fetcher);
    if (!isOrigin(origin)) return json({ ok: false, why: 'only a site\'s own pages can save (no Origin)' }, 403);
    const s = await sessionOf(env.SESSION_KEY, req);
    if (!s) return json({ ok: false, why: 'sign in with GitHub to save', signIn: true }, 401, origin);
    const gh = new GitHub({ token: s.token, api: env.GITHUB_API, fetch: fetcher });
    const m = await manifestOf(origin, fetcher);
    if (url.pathname === '/me' && req.method === 'GET') {
      const can = await gh.permissions(m.repo);
      return json({ ok: true, login: s.login, repo: m.repo, branch: branchOf(m, s.login), mode: m.mode ?? 'pull-request', push: !!can?.push }, 200, origin);
    }
    const id = /^\/home\/([a-z0-9-]{1,40})$/.exec(url.pathname)?.[1];
    if (!id) return json({ ok: false, why: 'no such address' }, 404, origin);
    if (req.method === 'GET') {
      const where = m.homes[id];
      if (!where) return json({ ok: false, why: `the site keeps no home file for "${id}"` }, 404, origin);
      const branch = branchOf(m, s.login);
      const ref = (await gh.head(m.repo, branch)) ? branch : m.branch;
      const file = await gh.file(m.repo, where.file, ref);
      if (!file) return json({ ok: false, why: `${m.repo} has no ${where.file} on ${ref}` }, 404, origin);
      return json({ ok: true, file: where.file, branch: ref, home: JSON.parse(file.text) }, 200, origin);
    }
    if (req.method !== 'POST') return json({ ok: false, why: 'GET or POST only' }, 405, origin);
    if (!req.headers.get('content-type')?.startsWith('application/json')) return json({ ok: false, why: 'JSON only' }, 415, origin);
    const body = await req.json().catch(() => null) as { commands?: HomeCommand[] } | null;
    if (!Array.isArray(body?.commands) || !body.commands.length) return json({ ok: false, why: 'Expected { commands: [{ name, args }] }' }, 400, origin);
    if (body.commands.length > 500) return json({ ok: false, why: 'at most 500 commands in one save' }, 400, origin);
    const can = await gh.permissions(m.repo);
    if (!can) return json({ ok: false, why: `${s.login} cannot reach ${m.repo}: install the Popfold app on it${env.GITHUB_APP_URL ? ` (${env.GITHUB_APP_URL})` : ''}, or ask its owner to` }, 403, origin);
    if (!can.push) return json({ ok: false, why: `${s.login} may not write to ${m.repo}: ask its owner for write access` }, 403, origin);
    const saved = await saveCommands(gh, m, s, id, body.commands);
    const pr = saved.commit && (m.mode ?? 'pull-request') === 'pull-request'
      ? await gh.pullRequest(m.repo, saved.branch, m.branch, `Studio edits by ${s.login}`, `Made in the Popfold studio on ${origin}. Each save is a commit on this branch.`)
      : null;
    return json({ ...saved, ...(pr ? { pullRequest: pr.url } : {}) }, 200, origin);
  } catch (err) {
    if (err instanceof Refusal) return json({ ok: false, why: err.message }, err.status, origin);
    if (err instanceof GitHubError) return json({ ok: false, why: err.message, ...(err.status === 401 ? { signIn: true } : {}) }, err.status === 401 ? 401 : 502, origin);
    return json({ ok: false, why: `Could not save: ${(err as Error).message}` }, 500, origin);
  }
}

// ----- sign-in: GitHub's web flow for a GitHub App. The studio's page goes to it and comes back: a pop-up would lose
// its link to the studio on GitHub's pages (they set Cross-Origin-Opener-Policy), so the session comes back in the
// address's fragment (#popfold-save=...), which no server sees. The studio's kept edits wait in localStorage. -----

interface SignInState { origin: string; back: string; until: number }

async function signIn(url: URL, env: Env, fetcher: typeof fetch): Promise<Response> {
  const origin = url.searchParams.get('origin');
  if (!isOrigin(origin)) throw new Refusal(400, 'sign-in needs the site\'s origin (?origin=https://example.com)');
  // where to come back to: a page of that same site (the studio), by default its root
  const back = url.searchParams.get('back') ?? `${origin}/`;
  if (!back.startsWith(`${origin}/`)) throw new Refusal(400, 'sign-in comes back only to a page of the site it was started from');
  await manifestOf(origin, fetcher); // only a site that has turned on saving
  const state = await seal(env.SESSION_KEY, { origin, back: back.replace(/#.*$/, ''), until: Date.now() + 10 * 60_000 } satisfies SignInState);
  const to = new URL('/login/oauth/authorize', env.GITHUB_WEB ?? 'https://github.com');
  to.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  to.searchParams.set('redirect_uri', `${url.origin}/callback`);
  to.searchParams.set('state', state);
  return Response.redirect(to.toString(), 302);
}

async function callback(url: URL, env: Env, fetcher: typeof fetch): Promise<Response> {
  const state = await unseal<SignInState>(env.SESSION_KEY, url.searchParams.get('state') ?? '');
  if (!state || state.until < Date.now() || !isOrigin(state.origin) || !state.back?.startsWith(`${state.origin}/`)) return page('Sign-in expired', '<p>This sign-in is too old or was not started here. Go back to the studio and sign in again.</p>');
  const code = url.searchParams.get('code');
  if (!code) return page('Not signed in', '<p>GitHub did not sign you in. Close this window and try again.</p>');
  const r = await fetcher(new URL('/login/oauth/access_token', env.GITHUB_WEB ?? 'https://github.com').toString(), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/callback` }),
  });
  const t = await r.json().catch(() => null) as { access_token?: string; expires_in?: number; error_description?: string } | null;
  if (!t?.access_token) return page('Not signed in', `<p>GitHub would not sign you in${t?.error_description ? `: ${esc(t.error_description)}` : ''}.</p>`);
  const gh = new GitHub({ token: t.access_token, api: env.GITHUB_API, fetch: fetcher });
  const [user, m] = await Promise.all([gh.user(), manifestOf(state.origin, fetcher)]);
  const can = await gh.permissions(m.repo);
  const hours = Math.min(SESSION_HOURS, t.expires_in ? t.expires_in / 3600 : SESSION_HOURS);
  const until = Date.now() + hours * 3600_000;
  const session = await seal(env.SESSION_KEY, { login: user.login, token: t.access_token, origin: state.origin, until } satisfies Session);
  const where = branchOf(m, user.login) === m.branch ? `straight onto <b>${esc(m.branch)}</b>` : `onto your own branch <b>${esc(branchOf(m, user.login))}</b>, with a pull request into <b>${esc(m.branch)}</b>`;
  const warn = !can ? `<p class="warn">You cannot reach ${esc(m.repo)} yet: its owner installs the Popfold app on it${env.GITHUB_APP_URL ? ` (<a href="${esc(env.GITHUB_APP_URL)}">here</a>)` : ''}.</p>`
    : !can.push ? `<p class="warn">You may read ${esc(m.repo)} but not write to it: ask its owner for write access.</p>` : '';
  const handBack = `${state.back}#popfold-save=${encodeURIComponent(JSON.stringify({ service: url.origin, session, login: user.login, until }))}`;
  return page('Save from the studio', `
    <p><b>${esc(state.origin)}</b> asks to save your studio edits to <b>${esc(m.repo)}</b> as <b>${esc(user.login)}</b>, ${where}.</p>
    ${warn}
    <p class="small">The studio keeps this sign-in for ${Math.round(hours)} hours. It cannot see your GitHub token.</p>
    <p><a class="button" id="ok" href="${esc(handBack)}">Allow</a> <a class="button" href="${esc(state.back)}">Cancel</a></p>`);
}

function page(title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#222;background:#fbf8f3}
h1{font-size:1.3rem}.warn{background:#fff1e6;border-left:3px solid #e07b39;padding:.5rem .75rem}.small{color:#666;font-size:.9rem}
.button{display:inline-block;text-decoration:none;color:inherit;padding:.45rem 1rem;border-radius:.5rem;border:1px solid #bbb;background:#fff}#ok{background:#222;color:#fff;border-color:#222}
@media (prefers-color-scheme:dark){body{background:#1b1a19;color:#eee}.small{color:#aaa}.warn{background:#3a2a1f}.button{background:#2a2928;color:#eee;border-color:#555}#ok{background:#eee;color:#111}}</style>
</head><body><h1>${esc(title)}</h1>${body}</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'x-frame-options': 'DENY' } });
}
