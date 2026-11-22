// Where the studio's edits to a home file go. On the dev server (`pnpm dev`) they go to the file itself, through
// POST /__popfold/home/<id>. A built site has no dev server, so there the same commands run in the browser on a copy
// of the home file, kept in localStorage until a day after the last edit, with its own undo and redo: the studio
// works on a deployed site, and its Download takes the edited file away.
import { runCommands } from '../home-commands';

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
export interface Kept { home: Json; past: string[]; future: string[]; at: number }
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
  } else {
    const next = structuredClone(cur.home);
    try { runCommands(next, body.commands); } catch (err) { return { ok: false, why: (err as Error).message }; }
    names = (body.commands as { name: string }[]).map((c) => c.name);
    cur.past.push(now);
    cur.future = [];
    cur.home = next;
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
