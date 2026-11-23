// A signed-in editor's session, sealed (AES-GCM, the service's SESSION_KEY) into a token the studio holds and sends
// back with every save. Nothing is stored on the service. The page cannot read what is inside, and the token is
// bound to the site (its origin) it was given to: another site that gets it cannot save with it.

export interface Session {
  /** the editor's GitHub login */
  login: string;
  /** their GitHub user token (from the GitHub App's sign-in) */
  token: string;
  /** the site's origin the session was given to */
  origin: string;
  /** when it stops working (ms since 1970); GitHub's user tokens last eight hours */
  until: number;
}

const enc = new TextEncoder(), dec = new TextDecoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function keyOf(secret: string): Promise<CryptoKey> {
  const raw = unb64url(secret.replace(/=+$/, ''));
  if (raw.length !== 32) throw new Error('SESSION_KEY must be 32 bytes, in base64 (openssl rand -base64 32)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** seal a value into a token (a session, or a sign-in's state) */
export async function seal(secret: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(secret), enc.encode(JSON.stringify(value))));
  return `${b64url(iv)}.${b64url(data)}`;
}

/** what a token holds, or null when it was not sealed with this secret or was changed */
export async function unseal<T>(secret: string, token: string): Promise<T | null> {
  const [iv, data] = token.split('.');
  if (!iv || !data) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(iv) }, await keyOf(secret), unb64url(data));
    return JSON.parse(dec.decode(plain)) as T;
  } catch { return null; }
}

/** the session a request carries (Authorization: Bearer <token>), if it is good for this origin and not too old */
export async function sessionOf(secret: string, req: Request, now = Date.now()): Promise<Session | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) return null;
  const s = await unseal<Session>(secret, token);
  if (!s || typeof s.login !== 'string' || typeof s.token !== 'string' || s.until < now) return null;
  if (s.origin !== req.headers.get('origin')) return null;
  return s;
}
