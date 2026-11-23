#!/usr/bin/env node
// Make the save service's GitHub App in two clicks, with GitHub's app manifest flow: every setting is filled in here,
// you press "Create GitHub App" on GitHub, and the app's client id and secret come straight back to this script,
// which gives the secret to the Worker (wrangler secret put) and writes the id into wrangler.jsonc. Nobody copies
// a secret by hand.
//
//   node tools/create-github-app.mjs --service https://save.example.com [--org my-org] [--name "My Popfold"]
//
// Then open http://127.0.0.1:8799 in a browser where you are signed in to GitHub. Run it from save/, with
// CLOUDFLARE_ACCOUNT_ID set to the account the service is deployed to. The app's private key is not kept: the
// service signs editors in with the app and needs only its client id and secret.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const service = arg('service')?.replace(/\/$/, '');
const org = arg('org');
const name = arg('name', 'Popfold');
const port = Number(arg('port', 8799));
if (!service || !/^https:\/\//.test(service)) { console.error('give the service\'s address: --service https://save.example.com'); process.exit(1); }

const here = `http://127.0.0.1:${port}`;
const state = randomBytes(16).toString('hex');
const manifest = {
  name,
  url: 'https://popfold.ca',
  description: 'Saves edits made in the Popfold studio on a deployed site into the site\'s repository, as the editor.',
  hook_attributes: { url: `${service}/no-webhooks`, active: false },
  redirect_url: `${here}/done`,
  callback_urls: [`${service}/callback`, 'http://127.0.0.1:8787/callback'],
  public: true,
  request_oauth_on_install: false,
  default_permissions: { contents: 'write', pull_requests: 'write' },
  default_events: [],
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const page = (body) => `<!doctype html><meta charset="utf-8"><title>Popfold save: GitHub App</title><body style="font:16px/1.5 system-ui;max-width:34rem;margin:3rem auto;padding:0 1rem">${body}</body>`;
const target = org ? `https://github.com/organizations/${org}/settings/apps/new` : 'https://github.com/settings/apps/new';

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', here);
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (url.pathname === '/') {
    res.end(page(`<h1>Create the GitHub App</h1><p>Sending you to GitHub with every setting filled in${org ? ` (for the organisation <b>${esc(org)}</b>)` : ''}. Press <b>Create GitHub App</b> there.</p>
      <form id="f" method="post" action="${esc(target)}?state=${state}"><input type="hidden" name="manifest" value="${esc(JSON.stringify(manifest))}"><button>Go to GitHub</button></form>
      <script>document.getElementById('f').submit()</script>`));
    return;
  }
  if (url.pathname !== '/done') { res.statusCode = 404; res.end(page('Not here.')); return; }
  if (url.searchParams.get('state') !== state) { res.statusCode = 400; res.end(page('<p>This answer was not for this run. Start again.</p>')); return; }
  try {
    const r = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(url.searchParams.get('code') ?? '')}/conversions`, {
      method: 'POST', headers: { accept: 'application/vnd.github+json', 'user-agent': 'popfold-save-setup' },
    });
    const app = await r.json();
    if (!r.ok) throw new Error(`GitHub said ${r.status}: ${app.message ?? ''}`);
    // the secret goes to the Worker on stdin, and to the local .dev.vars; it is never printed
    await new Promise((ok, no) => {
      const p = spawn('pnpm exec wrangler secret put GITHUB_CLIENT_SECRET', { stdio: ['pipe', 'ignore', 'inherit'], shell: true });
      p.on('exit', (code) => (code === 0 ? ok() : no(new Error(`wrangler secret put failed (${code})`))));
      p.stdin.end(app.client_secret);
    });
    const w = readFileSync('wrangler.jsonc', 'utf8')
      .replace(/"GITHUB_CLIENT_ID": "[^"]*"/, `"GITHUB_CLIENT_ID": "${app.client_id}"`)
      .replace(/"GITHUB_APP_URL": "[^"]*"/, `"GITHUB_APP_URL": "${app.html_url}"`);
    writeFileSync('wrangler.jsonc', w);
    if (existsSync('.dev.vars')) {
      writeFileSync('.dev.vars', readFileSync('.dev.vars', 'utf8')
        .replace(/^GITHUB_CLIENT_ID=.*$/m, `GITHUB_CLIENT_ID=${app.client_id}`)
        .replace(/^GITHUB_CLIENT_SECRET=.*$/m, `GITHUB_CLIENT_SECRET=${app.client_secret}`));
    }
    res.end(page(`<h1>Made: ${esc(app.name)}</h1><p>Its secret is with the save service. One more step: install it on your site's repository.</p>
      <p><a href="${esc(app.html_url)}/installations/new">Install ${esc(app.name)}</a></p><p>You can close this window afterwards.</p>`));
    console.log(`create-github-app: made ${app.name} (${app.html_url}), client id ${app.client_id}; the secret is set on the Worker and in .dev.vars; wrangler.jsonc has the id. Redeploy: pnpm deploy`);
    setTimeout(() => process.exit(0), 500);
  } catch (err) {
    res.statusCode = 500;
    res.end(page(`<p>Something went wrong: ${esc(err.message)}</p>`));
    console.error(`create-github-app: ${err.message}`);
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(`create-github-app: open ${here} in a browser where you are signed in to GitHub`);
  try { execFileSync(process.platform === 'win32' ? 'explorer' : 'open', [here]); } catch { /* open it by hand */ }
});
