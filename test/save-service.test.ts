// The save service (save/src): a deployed studio's commands replayed on the newest home file in a site's GitHub
// repository and committed with the editor's token. GitHub and the site are stand-ins here, in memory: a repository
// of commits, branches and pull requests, and a site that serves its popfold-save.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forgetManifests, handle, type Env } from '../save/src/service.ts';
import { seal, type Session } from '../save/src/session.ts';

const SITE = 'https://site.test', REPO = 'owner/site';
const HOME = readFileSync(new URL('../templates/storybook/src/home.json', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../templates/storybook/index.html', import.meta.url), 'utf8');
const env: Env = { GITHUB_CLIENT_ID: 'client', GITHUB_CLIENT_SECRET: 'secret', SESSION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))) };

/** a GitHub with one repository in memory, and a site; `before` runs on a request before it is answered */
function world(o: { push?: boolean; manifest?: unknown; before?: (method: string, path: string, repo: Repo) => Response | undefined } = {}) {
  forgetManifests();
  const repo = new Repo({ 'src/home.json': HOME, 'index.html': PAGE });
  const manifest = o.manifest ?? { repo: REPO, branch: 'main', homes: { storybook: { file: 'src/home.json', page: 'index.html' } } };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.origin === SITE) return url.pathname === '/popfold-save.json' ? Response.json(manifest) : new Response('nope', { status: 404 });
    const path = url.pathname.replace(`/repos/${REPO}`, '');
    const early = o.before?.(method, path, repo);
    if (early) return early;
    if (url.pathname === '/user') return Response.json({ login: 'Editor', name: 'An Editor' });
    if (url.pathname === `/repos/${REPO}`) return Response.json({ permissions: { push: o.push ?? true } });
    return repo.answer(method, path, url.searchParams, body);
  }) as typeof fetch;
  return { repo, fetcher };
}

class Repo {
  commits = new Map<string, { files: Map<string, string>; parent: string | null; message: string }>();
  trees = new Map<string, Map<string, string>>();
  refs = new Map<string, string>();
  pulls: { head: string; base: string; title: string }[] = [];
  private n = 0;
  constructor(files: Record<string, string>) { this.refs.set('main', this.add(new Map(Object.entries(files)), null, 'start')); }
  add(files: Map<string, string>, parent: string | null, message: string) {
    const sha = `c${++this.n}`;
    this.commits.set(sha, { files, parent, message });
    return sha;
  }
  /** someone else's commit onto a branch */
  push(branch: string, path: string, change: (text: string) => string) {
    const head = this.refs.get(branch)!;
    const files = new Map(this.commits.get(head)!.files);
    files.set(path, change(files.get(path)!));
    this.refs.set(branch, this.add(files, head, 'by hand'));
  }
  text(branch: string, path: string) { return this.commits.get(this.refs.get(branch)!)!.files.get(path)!; }
  answer(method: string, path: string, q: URLSearchParams, body: any): Response {
    let m: RegExpExecArray | null;
    if ((m = /^\/git\/ref\/heads\/(.+)$/.exec(path)) && method === 'GET') {
      const sha = this.refs.get(decodeURI(m[1]));
      return sha ? Response.json({ object: { sha } }) : Response.json({ message: 'Not Found' }, { status: 404 });
    }
    if (path === '/git/refs' && method === 'POST') { this.refs.set(body.ref.replace('refs/heads/', ''), body.sha); return Response.json({}); }
    if ((m = /^\/contents\/(.+)$/.exec(path))) {
      const ref = q.get('ref')!;
      const commit = this.commits.get(this.refs.get(ref) ?? ref);
      const text = commit?.files.get(decodeURI(m[1]));
      if (text === undefined) return Response.json({ message: 'Not Found' }, { status: 404 });
      return Response.json({ type: 'file', encoding: 'base64', sha: 'blob', content: Buffer.from(text).toString('base64') });
    }
    if ((m = /^\/git\/commits\/(.+)$/.exec(path))) return Response.json({ tree: { sha: `t-${m[1]}` } });
    if (path === '/git/trees') {
      const files = new Map(this.commits.get(body.base_tree.slice(2))!.files);
      for (const f of body.tree) files.set(f.path, f.content);
      const sha = `t${this.trees.size + 1}x`;
      this.trees.set(sha, files);
      return Response.json({ sha });
    }
    if (path === '/git/commits' && method === 'POST') return Response.json({ sha: this.add(this.trees.get(body.tree)!, body.parents[0], body.message) });
    if ((m = /^\/git\/refs\/heads\/(.+)$/.exec(path)) && method === 'PATCH') {
      const branch = decodeURI(m[1]);
      if (this.commits.get(body.sha)!.parent !== this.refs.get(branch)) return Response.json({ message: 'Update is not a fast forward' }, { status: 422 });
      this.refs.set(branch, body.sha);
      return Response.json({});
    }
    if (path === '/pulls' && method === 'GET') return Response.json(this.pulls.filter((p) => `owner:${p.head}` === q.get('head')).map((_, i) => ({ html_url: `https://github.com/${REPO}/pull/${i + 1}`, number: i + 1 })));
    if (path === '/pulls' && method === 'POST') { this.pulls.push(body); return Response.json({ html_url: `https://github.com/${REPO}/pull/${this.pulls.length}`, number: this.pulls.length }); }
    return Response.json({ message: `no stand-in for ${method} ${path}` }, { status: 500 });
  }
}

const session = (o: Partial<Session> = {}) => seal(env.SESSION_KEY, { login: 'Editor', token: 'gho_x', origin: SITE, until: Date.now() + 3600_000, ...o } satisfies Session);
async function save(fetcher: typeof fetch, commands: unknown[], o: { token?: string; origin?: string; home?: string } = {}) {
  const req = new Request(`https://save.test/home/${o.home ?? 'storybook'}`, {
    method: 'POST',
    headers: { origin: o.origin ?? SITE, authorization: `Bearer ${o.token ?? await session()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ commands }),
  });
  const r = await handle(req, env, fetcher);
  return { status: r.status, body: await r.json() as Record<string, any> };
}
const stand = (id: string) => ({ name: 'add', args: { id, room: 'home', kind: 'stand' } });
const ids = (text: string) => (JSON.parse(text).pieces as { id: string }[]).map((p) => p.id);

test('a save commits the edited home file to the editor\'s own branch, with a pull request, and leaves main alone', async () => {
  const { repo, fetcher } = world();
  const { status, body } = await save(fetcher, [stand('lamp-post')]);
  assert.equal(status, 200, body.why);
  assert.equal(body.branch, 'studio/editor');
  assert.ok(ids(repo.text('studio/editor', 'src/home.json')).includes('lamp-post'));
  assert.equal(repo.text('main', 'src/home.json'), HOME, 'main is untouched');
  assert.equal(body.pullRequest, `https://github.com/${REPO}/pull/1`);
  await save(fetcher, [stand('lamp-post-2')]);
  assert.equal(repo.pulls.length, 1, 'a second save goes onto the same pull request');
  assert.ok(ids(repo.text('studio/editor', 'src/home.json')).includes('lamp-post-2'));
});

test('"direct" commits onto the site\'s branch itself, and opens no pull request', async () => {
  const { repo, fetcher } = world({ manifest: { repo: REPO, branch: 'main', mode: 'direct', homes: { storybook: { file: 'src/home.json' } } } });
  const { status, body } = await save(fetcher, [stand('lamp-post')]);
  assert.equal(status, 200, body.why);
  assert.ok(ids(repo.text('main', 'src/home.json')).includes('lamp-post'));
  assert.equal(repo.pulls.length, 0);
});

test('when someone else commits while saving, the commands are replayed on theirs and both edits land', async () => {
  let once = true;
  const { repo, fetcher } = world({
    manifest: { repo: REPO, branch: 'main', mode: 'direct', homes: { storybook: { file: 'src/home.json' } } },
    before: (method, _path, r) => {
      if (method === 'PATCH' && once) { // just before the branch moves, another edit lands on main
        once = false;
        r.push('main', 'src/home.json', (t) => t.replace('"name": "', '"name": "Edited: '));
      }
      return undefined;
    },
  });
  const { status, body } = await save(fetcher, [stand('lamp-post')]);
  assert.equal(status, 200, body.why);
  const text = repo.text('main', 'src/home.json');
  assert.match(text, /"name": "Edited: /, 'the other edit is kept');
  assert.ok(ids(text).includes('lamp-post'), 'and this one is on top of it');
});

test('a beat added in the studio adds its section to the story page in the same commit', async () => {
  const { repo, fetcher } = world();
  const { status, body } = await save(fetcher, [{ name: 'add-beat', args: { id: 'meadow', name: 'The meadow', at: 2 } }]);
  assert.equal(status, 200, body.why);
  assert.equal(body.page, 'index.html');
  const head = repo.refs.get('studio/editor')!;
  assert.equal(repo.commits.get(head)!.parent, repo.refs.get('main'), 'one commit holds both files');
  assert.match(repo.text('studio/editor', 'index.html'), /id="meadow"/);
  assert.deepEqual((JSON.parse(repo.text('studio/editor', 'src/home.json')).beats as { id: string }[]).map((b) => b.id).slice(0, 3), ['cover', 'home', 'meadow']);
});

test('a command that cannot be done is an answer that says why, and nothing is committed', async () => {
  const { repo, fetcher } = world();
  const { status, body } = await save(fetcher, [{ name: 'remove', args: { id: 'no-such-piece', room: 'home' } }]);
  assert.equal(status, 409);
  assert.match(body.why, /remove/);
  assert.equal(repo.commits.size, 1, 'no commit');
});

test('no session, another site\'s session, or no write access: refused, and the studio is told how to go on', async () => {
  const { fetcher } = world();
  const none = await save(fetcher, [stand('x')], { token: 'not-a-session' });
  assert.equal(none.status, 401);
  assert.equal(none.body.signIn, true);
  const elsewhere = await save(fetcher, [stand('x')], { token: await session({ origin: 'https://other.test' }) });
  assert.equal(elsewhere.status, 401, 'a session is good only on the site it was given to');
  const old = await save(fetcher, [stand('x')], { token: await session({ until: Date.now() - 1 }) });
  assert.equal(old.status, 401);
  const reader = world({ push: false });
  const ro = await save(reader.fetcher, [stand('x')]);
  assert.equal(ro.status, 403);
  assert.match(ro.body.why, /write access/);
});

test('a manifest naming a path outside the repository, or an unknown home, is refused', async () => {
  const bad = world({ manifest: { repo: REPO, branch: 'main', homes: { storybook: { file: '../secrets.json' } } } });
  const r1 = await save(bad.fetcher, [stand('x')], { origin: 'https://bad.test' }); // (another origin: the manifest cache is per origin)
  assert.equal(r1.status, 401, 'a session for site.test is no good on bad.test');
  const s = await session({ origin: 'https://bad.test' });
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => new URL(String(input)).origin === 'https://bad.test'
    ? Response.json({ repo: REPO, branch: 'main', homes: { storybook: { file: '../secrets.json' } } })
    : bad.fetcher(input, init)) as typeof fetch;
  const r2 = await save(fetcher, [stand('x')], { origin: 'https://bad.test', token: s });
  assert.equal(r2.status, 400);
  assert.match(r2.body.why, /path in the repository/);
  const { fetcher: f } = world();
  const r3 = await save(f, [stand('x')], { home: 'elsewhere' });
  assert.equal(r3.status, 404);
});

test('sign-in sends the editor to GitHub only for a site that has turned saving on', async () => {
  const { fetcher } = world();
  const r = await handle(new Request(`https://save.test/sign-in?origin=${encodeURIComponent(SITE)}`), env, fetcher);
  assert.equal(r.status, 302);
  const to = new URL(r.headers.get('location')!);
  assert.equal(to.origin + to.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(to.searchParams.get('redirect_uri'), 'https://save.test/callback');
  const off = await handle(new Request('https://save.test/sign-in?origin=https://nothing.test'), env, (async () => new Response('', { status: 404 })) as typeof fetch);
  assert.equal(off.status, 400);
});
