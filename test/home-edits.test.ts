// A built studio's edits: the home file's commands run in the browser on a copy kept in localStorage for a day, with
// undo and redo (src/studio/home-edits.ts). Node has no page, so a small stand-in gives it storage and a location.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } },
  location: { pathname: '/studio.html', origin: 'https://site.test' },
});
const { dropLastEdit, editsInBrowser, forgetEdits, homeRequest, KEEP_MS, keptEdits, saveSite, saveToRepo, useHomeFiles } = await import('../src/studio/home-edits.ts');

const built = { pieces: [{ id: 'sofa', room: 'living', kind: 'builtin/sofa' }] };
useHomeFiles((id) => (id === 'den' ? built : undefined));
const add = (id: string) => ({ commands: [{ name: 'add', args: { id, room: 'living', kind: 'builtin/lamp' } }], quiet: true });
const ids = (home: unknown) => (home as typeof built).pieces.map((p) => p.id);

test('away from the dev server, an edit runs on a copy kept in this browser and leaves the built file alone', async () => {
  store.clear();
  assert.equal(editsInBrowser(), true);
  const res = await homeRequest('den', add('lamp'));
  assert.equal(res.ok, true);
  assert.deepEqual(ids(res.home), ['sofa', 'lamp']);
  assert.deepEqual(ids(built), ['sofa'], 'the file the site was built with is not changed');
  assert.deepEqual(ids(keptEdits('den')?.home), ['sofa', 'lamp']);
  assert.deepEqual(ids((await homeRequest('den')).home), ['sofa', 'lamp'], 'reading the home gives the kept one');
});

test('a built studio undoes and redoes its own edits, and says when there is nothing to undo', async () => {
  store.clear();
  await homeRequest('den', add('lamp'));
  await homeRequest('den', add('lamp-2'));
  assert.deepEqual(ids((await homeRequest('den', { undo: true })).home), ['sofa', 'lamp']);
  assert.deepEqual(ids((await homeRequest('den', { undo: true })).home), ['sofa']);
  assert.equal((await homeRequest('den', { undo: true })).ok, false);
  assert.deepEqual(ids((await homeRequest('den', { redo: true })).home), ['sofa', 'lamp']);
  assert.deepEqual(ids((await homeRequest('den', add('rug'))).home), ['sofa', 'lamp', 'rug']);
  assert.equal((await homeRequest('den', { redo: true })).ok, false, 'a new edit drops what was undone');
});

test('kept edits are forgotten a day after the last one, or when asked', async () => {
  store.clear();
  await homeRequest('den', add('lamp'));
  const now = Date.now;
  try {
    Date.now = () => now() + KEEP_MS - 60_000;
    assert.ok(keptEdits('den'), 'still kept just before the day is up');
    Date.now = () => now() + KEEP_MS + 60_000;
    assert.equal(keptEdits('den'), null);
    assert.equal(store.size, 0, 'and taken out of storage');
  } finally { Date.now = now; }
  await homeRequest('den', add('lamp'));
  forgetEdits('den');
  assert.deepEqual(ids((await homeRequest('den')).home), ['sofa']);
});

test('a mistake, or a home made in code, is an answer that says why', async () => {
  store.clear();
  const bad = await homeRequest('den', { commands: [{ name: 'add', args: { id: 'x', room: 'living' } }] });
  assert.equal(bad.ok, false);
  assert.match(bad.why ?? '', /kind/);
  assert.equal(keptEdits('den'), null, 'nothing is kept');
  const code = await homeRequest('made-in-code', add('lamp'));
  assert.equal(code.ok, false);
  assert.match(code.why ?? '', /made in code/);
});

test('an edit the studio could not build is taken back for good', async () => {
  store.clear();
  await homeRequest('den', add('lamp'));
  await homeRequest('den', add('odd'));
  assert.deepEqual(ids(dropLastEdit('den')), ['sofa', 'lamp']);
  assert.equal((await homeRequest('den', { redo: true })).ok, false, 'it cannot be redone');
  assert.deepEqual(ids(dropLastEdit('den')), ['sofa']);
  assert.deepEqual(ids(dropLastEdit('den')), ['sofa'], 'with no edit left, the home as built');
  assert.equal(keptEdits('den'), null, 'and nothing is kept');
});

test("each kept edit remembers its commands, so they can be saved to the site's repository; undo takes them back", async () => {
  store.clear();
  await homeRequest('den', add('lamp'));
  await homeRequest('den', add('rug'));
  const names = () => (keptEdits('den')?.log ?? []).flat().map((c) => (c.args as { id: string }).id);
  assert.deepEqual(names(), ['lamp', 'rug']);
  await homeRequest('den', { undo: true });
  assert.deepEqual(names(), ['lamp']);
  await homeRequest('den', { redo: true });
  assert.deepEqual(names(), ['lamp', 'rug']);
  dropLastEdit('den');
  assert.deepEqual(names(), ['lamp']);
});

test("a site with a save service: Save sends the kept commands, and the kept copy becomes the repository's file", async () => {
  store.clear();
  const sent: { url: string; init?: RequestInit }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, init });
    if (url === 'https://site.test/popfold-save.json') return Response.json({ service: 'https://save.test/', repo: 'owner/site', branch: 'main', mode: 'pull-request', homes: {} });
    const commands = JSON.parse(String(init?.body)).commands as { args: { id: string } }[];
    const home = { pieces: [...built.pieces, ...commands.map((c) => ({ id: c.args.id, room: 'living', kind: 'builtin/lamp' })), { id: 'theirs', room: 'living', kind: 'builtin/lamp' }] };
    return Response.json({ ok: true, home, branch: 'studio/editor', pullRequest: 'https://github.com/owner/site/pull/1' });
  }) as typeof fetch;
  try {
    const site = await saveSite();
    assert.equal(site?.service, 'https://save.test');
    assert.equal((await saveToRepo(site!, 'den')).ok, false, 'nothing to save yet');
    await homeRequest('den', add('lamp'));
    const out = await saveToRepo(site!, 'den');
    assert.equal(out.ok, false);
    assert.equal(out.signIn, true, 'not signed in: the studio asks to sign in');
    store.set('popfold:save-session:https://save.test', JSON.stringify({ session: 'sealed', login: 'editor', until: Date.now() + 60_000 }));
    const res = await saveToRepo(site!, 'den');
    assert.equal(res.ok, true, res.why);
    const post = sent.at(-1)!;
    assert.equal(post.url, 'https://save.test/home/den');
    assert.equal((post.init!.headers as Record<string, string>).authorization, 'Bearer sealed');
    assert.deepEqual(JSON.parse(String(post.init?.body)).commands.map((c: { args: { id: string } }) => c.args.id), ['lamp']);
    const k = keptEdits('den')!;
    assert.deepEqual(ids(k.home), ['sofa', 'lamp', 'theirs'], "the repository's newest file, with anyone else's edits");
    assert.deepEqual(k.log, [], 'nothing left to save');
    assert.equal(k.saved?.pullRequest, 'https://github.com/owner/site/pull/1');
  } finally { globalThis.fetch = realFetch; }
});
