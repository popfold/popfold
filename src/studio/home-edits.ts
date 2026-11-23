// Where the studio's edits to a home file go. On the dev server (`pnpm dev`) they go to the file itself, through
// POST /__popfold/home/<id>. A built site has no dev server, so there the same commands run in the browser on a copy
// of the home file, kept in localStorage until a day after the last edit, with its own undo and redo: the studio
// works on a deployed site, and its Download takes the edited file away.
import { runCommands, type HomeCommand } from '../home-commands';

type Json = Record<string, unknown>;
/** what an edit gives back: the same answer the dev server sends */
export interface HomeAnswer { ok: boolean; why?: string; file?: string; home?: Json; names?: string[]; page?: string; undo?: number; redo?: number }

/** how long a built studio keeps a home's edits after the last one */
export const KEEP_MS = 24 * 60 * 60 * 1000;
/** where a built studio's edits are kept, as the studio says it */
export const IN_BROWSER = 'this browser (kept for 24 hours)';
/** sent on window when a built studio keeps an edit to a home (detail: the home's id) */
export const KEPT_EVENT = 'popfold:kept';
/** true on a built site: edits are made on a copy kept in this browser */
export const editsInBrowser = () => !(import.meta as { env?: { DEV?: boolean } }).env?.DEV;

let fileOf: (id: string) => unknown = () => undefined;
/** the file each home was made from (a home made in code has none) */
export function useHomeFiles(f: (id: string) => unknown) { fileOf = f; }

/** a home's edits kept in this browser: its file now, the earlier and undone versions, and when it was last edited */
export interface Kept {
  home: Json; past: string[]; future: string[]; at: number;
  /** the commands of each edit since the site's file (or the last save to its repository), and of those undone */
  log?: HomeCommand[][]; undone?: HomeCommand[][];
  /** the last save to the site's repository (save service) */
  saved?: { repo: string; branch: string; pullRequest?: string; at: number };
}
const keyOf = (id: string) => `popfold:home:${location.pathname}:${id}`;

/** the edits kept for a home, if there are any from the last 24 hours (older ones are forgotten here) */
export function keptEdits(id: string): Kept | null {
  try {
    const k = JSON.parse(localStorage.getItem(keyOf(id)) ?? 'null') as Kept | null;
    if (!k || typeof k.at !== 'number' || !k.home || typeof k.home !== 'object' || !Array.isArray(k.past) || !Array.isArray(k.future)) return null;
    if (Date.now() - k.at > KEEP_MS) { localStorage.removeItem(keyOf(id)); return null; }
    return k;
  } catch { return null; }
}
/** forget the edits kept for a home: the studio goes back to the file the site was built with */
export function forgetEdits(id: string) {
  try { localStorage.removeItem(keyOf(id)); } catch { /* nothing kept */ }
}

/**
 * Take back the last edit kept for a home, for good (no redo): one the studio could not build. Gives the home as it
 * is now kept, or as the site was built with it when no edit is left.
 */
export function dropLastEdit(id: string): Json | null {
  const k = keptEdits(id);
  if (!k) return null;
  const prev = k.past.pop();
  k.log?.pop();
  if (prev === undefined) {
    forgetEdits(id);
    const built = fileOf(id);
    return built && typeof built === 'object' ? structuredClone(built) as Json : null;
  }
  k.home = JSON.parse(prev) as Json;
  try { localStorage.setItem(keyOf(id), JSON.stringify(k)); } catch { /* kept as it was */ }
  return k.home;
}

/**
 * Read a home's file (no body), or run commands on it, or undo or redo the last change ({ commands }, { undo: true },
 * { redo: true }). A refusal is an answer that says why.
 */
export async function homeRequest(id: string, body?: Json): Promise<HomeAnswer> {
  if (!editsInBrowser()) {
    const r = await fetch(`/__popfold/home/${id}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    return await devJson(r) as HomeAnswer;
  }
  const original = fileOf(id);
  const k = keptEdits(id);
  if (!k && (!original || typeof original !== 'object')) return { ok: false, why: 'this home is made in code, so only the dev server can change it' };
  const cur: Kept = k ?? { home: structuredClone(original) as Json, past: [], future: [], at: Date.now() };
  if (!body) return { ok: true, file: IN_BROWSER, home: cur.home };
  const now = JSON.stringify(cur.home);
  let names: string[] = [];
  if (body.undo || body.redo) {
    const [from, to] = body.undo ? [cur.past, cur.future] : [cur.future, cur.past];
    const other = from.pop();
    if (other === undefined) return { ok: false, why: `Nothing to ${body.undo ? 'undo' : 'redo'}.` };
    to.push(now);
    cur.home = JSON.parse(other) as Json;
    const [logFrom, logTo] = body.undo ? [cur.log ??= [], cur.undone ??= []] : [cur.undone ??= [], cur.log ??= []];
    const step = logFrom.pop();
    if (step) logTo.push(step);
  } else {
    const next = structuredClone(cur.home);
    try { runCommands(next, body.commands); } catch (err) { return { ok: false, why: (err as Error).message }; }
    names = (body.commands as { name: string }[]).map((c) => c.name);
    cur.past.push(now);
    cur.future = [];
    cur.home = next;
    (cur.log ??= []).push(body.commands as HomeCommand[]);
    cur.undone = [];
  }
  cur.past.splice(0, Math.max(0, cur.past.length - 50)); // a day's work, not a full history
  cur.at = Date.now();
  try { localStorage.setItem(keyOf(id), JSON.stringify(cur)); } catch { return { ok: false, why: 'this browser would not keep it (storage full or blocked)' }; }
  globalThis.dispatchEvent?.(new CustomEvent(KEPT_EVENT, { detail: id })); // (the studio shows that it was kept)
  return { ok: true, file: IN_BROWSER, home: cur.home, names, undo: cur.past.length, redo: cur.future.length };
}

/** The dev server's JSON answer, or an error that says in words why there is none. */
async function devJson(r: Response): Promise<unknown> {
  const text = await r.text();
  try { return JSON.parse(text); } catch { /* not the dev server's answer */ }
  // the dev server's own refusals are one plain sentence ("Saving only works on the local dev server")
  if (text && text.length < 200 && !text.trimStart().startsWith('<')) throw new Error(text);
  throw new Error(`the dev server did not answer (${r.status})`);
}

// ----- saving to the site's repository: a site that turned on the save service publishes /popfold-save.json -----

/** where a built site's edits can be saved: the save service, and the site's repository */
export interface SaveSite { service: string; repo: string; branch: string; mode: 'pull-request' | 'direct' }
let siteOnce: Promise<SaveSite | null> | null = null;
/** the site's save service, if it has one (null: edits stay in this browser and are downloaded) */
export function saveSite(): Promise<SaveSite | null> {
  takeSignIn();
  siteOnce ??= fetch(new URL('/popfold-save.json', location.origin))
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => (m && typeof m.service === 'string' && typeof m.repo === 'string'
      ? { service: m.service.replace(/\/$/, ''), repo: m.repo, branch: m.branch, mode: m.mode === 'direct' ? 'direct' : 'pull-request' } as SaveSite
      : null))
    .catch(() => null);
  return siteOnce;
}

interface Signed { session: string; login: string; until: number }
const signedKey = (service: string) => `popfold:save-session:${service}`;
/** the editor signed in to the save service from this browser, if they still are */
export function signedIn(site: SaveSite): Signed | null {
  try {
    const s = JSON.parse(localStorage.getItem(signedKey(site.service)) ?? 'null') as Signed | null;
    return s && s.until > Date.now() ? s : null;
  } catch { return null; }
}
const signOut = (site: SaveSite) => { try { localStorage.removeItem(signedKey(site.service)); } catch { /* not kept */ } };

/**
 * Sign in with GitHub: this page goes to the save service (and GitHub) and comes back with the session in its
 * address's fragment, which takeSignIn() keeps. (A pop-up loses its link back on GitHub's pages.) The kept edits wait
 * in localStorage meanwhile; `then` names the home to save as soon as the studio is back.
 */
export function signInToSave(site: SaveSite, then?: string) {
  try { if (then) sessionStorage.setItem(SAVE_NEXT, then); } catch { /* the editor presses Save again */ }
  location.assign(`${site.service}/sign-in?origin=${encodeURIComponent(location.origin)}&back=${encodeURIComponent(location.href.replace(/#.*$/, ''))}`);
}
const SAVE_NEXT = 'popfold:save-after-sign-in';
/** the home to save now that the editor is back from signing in, once (null: none) */
export function saveAfterSignIn(): string | null {
  try { const id = sessionStorage.getItem(SAVE_NEXT); sessionStorage.removeItem(SAVE_NEXT); return id; } catch { return null; }
}
/** keep a session the save service handed back in this page's address (#popfold-save=...), and take it out of it */
function takeSignIn() {
  const m = /[#&]popfold-save=([^&]+)/.exec(location.hash);
  if (!m) return;
  try {
    const s = JSON.parse(decodeURIComponent(m[1])) as Signed & { service: string };
    if (typeof s.service === 'string' && typeof s.session === 'string') localStorage.setItem(signedKey(s.service.replace(/\/$/, '')), JSON.stringify({ session: s.session, login: s.login, until: s.until } satisfies Signed));
  } catch { /* not a session */ }
  history.replaceState(history.state, '', location.href.replace(/#.*$/, ''));
}

/**
 * Save a home's kept edits to the site's repository: the save service replays their commands on the newest home
 * file there and commits it. The kept copy becomes the repository's file, with no edits left to save.
 */
export async function saveToRepo(site: SaveSite, id: string): Promise<HomeAnswer & { signIn?: boolean; branch?: string; pullRequest?: string }> {
  const k = keptEdits(id);
  const commands = (k?.log ?? []).flat();
  if (!k || !commands.length) return { ok: false, why: 'Nothing to save: no edits since the last save.' };
  const who = signedIn(site);
  if (!who) return { ok: false, why: 'Sign in with GitHub to save.', signIn: true };
  let res: HomeAnswer & { signIn?: boolean; branch?: string; pullRequest?: string };
  try {
    const r = await fetch(`${site.service}/home/${id}`, { method: 'POST', headers: { authorization: `Bearer ${who.session}`, 'content-type': 'application/json' }, body: JSON.stringify({ commands }) });
    res = await r.json();
  } catch (err) { return { ok: false, why: `the save service did not answer (${(err as Error).message})` }; }
  if (res.signIn) signOut(site);
  if (!res.ok || !res.home) return res;
  const kept: Kept = { home: res.home, past: [], future: [], at: Date.now(), log: [], undone: [], saved: { repo: site.repo, branch: res.branch ?? site.branch, pullRequest: res.pullRequest, at: Date.now() } };
  try { localStorage.setItem(keyOf(id), JSON.stringify(kept)); } catch { /* the repository has it */ }
  globalThis.dispatchEvent?.(new CustomEvent(KEPT_EVENT, { detail: id }));
  return { ...res, file: `${site.repo} (${res.branch})` };
}
