// The little of GitHub's API the save service needs, with plain fetch, so it runs on a Worker, in Node and anywhere
// else with the web's fetch: read a file at a branch, commit several files as one commit, make a branch, open a pull
// request. Every call is made with the editor's own token, so GitHub decides what they may do.

export interface GitHubOptions {
  token: string;
  /** the API's address (tests and GitHub Enterprise give another) */
  api?: string;
  fetch?: typeof fetch;
}

export class GitHubError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export interface RepoFile { path: string; text: string; sha: string }

export class GitHub {
  private readonly api: string;
  private readonly fetcher: typeof fetch;
  private readonly o: GitHubOptions;
  constructor(o: GitHubOptions) {
    this.o = o;
    this.api = (o.api ?? 'https://api.github.com').replace(/\/$/, '');
    // (fetch called as this.fetcher would get `this`: a Worker refuses that as an "illegal invocation")
    const f = o.fetch ?? fetch;
    this.fetcher = (input, init) => f(input, init);
  }

  /** a call to the API; a refusal is a GitHubError with GitHub's own words */
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await this.fetcher(`${this.api}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.o.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'popfold-save',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) throw new GitHubError(`GitHub said ${r.status}: ${data?.message ?? text.slice(0, 200)}`, r.status);
    return data as T;
  }

  /** who the token belongs to */
  user() { return this.call<{ login: string; name: string | null }>('GET', '/user'); }

  /** what the editor may do in a repository (null: they cannot see it, or the app is not installed on it) */
  async permissions(repo: string): Promise<{ push: boolean; admin: boolean } | null> {
    try {
      const r = await this.call<{ permissions?: { push?: boolean; admin?: boolean } }>('GET', `/repos/${repo}`);
      return { push: !!r.permissions?.push, admin: !!r.permissions?.admin };
    } catch (err) {
      if (err instanceof GitHubError && (err.status === 404 || err.status === 403)) return null;
      throw err;
    }
  }

  /** the commit a branch is at (null: there is no such branch) */
  async head(repo: string, branch: string): Promise<string | null> {
    try {
      return (await this.call<{ object: { sha: string } }>('GET', `/repos/${repo}/git/ref/heads/${encodeURI(branch)}`)).object.sha;
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return null;
      throw err;
    }
  }

  /** a text file at a commit or branch (null: it is not there) */
  async file(repo: string, path: string, ref: string): Promise<RepoFile | null> {
    try {
      const r = await this.call<{ content: string; encoding: string; sha: string; type: string }>('GET', `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`);
      if (r.type !== 'file' || r.encoding !== 'base64') throw new GitHubError(`${path} is not a file`, 400);
      return { path, text: fromBase64(r.content), sha: r.sha };
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return null;
      throw err;
    }
  }

  /** start a branch at a commit */
  async branch(repo: string, name: string, at: string) {
    await this.call('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${name}`, sha: at });
  }

  /**
   * Commit files onto a branch as one commit whose parent is `parent`. The branch moves only if it is still at
   * `parent` (no force): when someone else committed in between, this throws a GitHubError with status 422, and the
   * caller replays its commands on the newer files.
   */
  async commit(repo: string, branch: string, parent: string, files: { path: string; text: string }[], message: string): Promise<string> {
    const base = await this.call<{ tree: { sha: string } }>('GET', `/repos/${repo}/git/commits/${parent}`);
    const tree = await this.call<{ sha: string }>('POST', `/repos/${repo}/git/trees`, {
      base_tree: base.tree.sha,
      tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.text })),
    });
    const commit = await this.call<{ sha: string }>('POST', `/repos/${repo}/git/commits`, { message, tree: tree.sha, parents: [parent] });
    await this.call('PATCH', `/repos/${repo}/git/refs/heads/${encodeURI(branch)}`, { sha: commit.sha, force: false });
    return commit.sha;
  }

  /** the open pull request from a branch, or a new one */
  async pullRequest(repo: string, head: string, base: string, title: string, body: string): Promise<{ url: string; number: number; opened: boolean }> {
    const owner = repo.split('/')[0];
    const open = await this.call<{ html_url: string; number: number }[]>('GET', `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${head}`)}&base=${encodeURIComponent(base)}`);
    if (open.length) return { url: open[0].html_url, number: open[0].number, opened: false };
    const pr = await this.call<{ html_url: string; number: number }>('POST', `/repos/${repo}/pulls`, { title, head, base, body });
    return { url: pr.html_url, number: pr.number, opened: true };
  }
}

/** UTF-8 text from GitHub's base64 (which it breaks into lines) */
export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
