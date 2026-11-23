# Popfold save service

The studio on a deployed site saves its edits into the site's GitHub repository through this service. The studio
sends the home file's commands, the same list the dev server and `popfold mcp` run. The service replays them on the
newest home file in the repository, checks the result with `readHome()`, and commits it with the editor's own
GitHub token. A beat added, removed or moved changes the story page in the same commit.

Users are GitHub's. A site's owner signs up by installing the Popfold GitHub App on the site's repository. An editor
signs in with GitHub from the studio, and can save only if GitHub lets them write to that repository. The service
stores nothing: a session is a sealed token that the studio keeps for up to eight hours, and it only works from the
site it was given to.

The code is `src/service.ts` (the handler, written against the web's `Request` and `Response`), `src/github.ts`
(the API calls), `src/session.ts` (sealing) and `src/worker.ts` (the Cloudflare entry). The tests are in
`../test/save-service.test.ts`, with GitHub and a site as in-memory stand-ins.

## Turn it on for a site

In the site's `vite.config.ts`:

```ts
homeSaver({ home: 'src/home.json', save: { service: 'https://save.popfold.ca', repo: 'you/your-site' } }),
```

Other options are `branch` (the branch the site is built from, default `main`), `mode` and `folder`:
- `mode: 'pull-request'` is the default: each editor's saves go to their own branch, `studio/<login>`, with one pull
  request into `branch`.
- `mode: 'direct'` commits straight onto `branch`.
- `folder` is the site's folder, when the site is not at the repository's root.

The build writes `popfold-save.json` at the site's root, and the service reads it from the site's address.

## Run your own

1. **Create a GitHub App.** `node tools/create-github-app.mjs --service https://<your service> [--org <org>]` does it in
   two clicks (GitHub's app manifest flow): it fills in every setting below, and gives the client secret to the Worker
   and the id to `wrangler.jsonc` itself. By hand: GitHub, Settings, Developer settings, GitHub Apps, New, with:
   - **Callback URL:** `https://<your service>/callback`. For a local run, `http://127.0.0.1:8787/callback`.
   - **Expire user authorization tokens:** on.
   - **Webhook:** off.
   - **Repository permissions:** Contents read and write, Pull requests read and write. Metadata is read-only and
     comes with them.
   - **Where it can be installed:** any account, so other people can install it on their sites.

   Then note its client id, make a client secret, and note its public page (`https://github.com/apps/<name>`).
2. **Configure the service.**
   - In `wrangler.jsonc`: set `GITHUB_CLIENT_ID` and `GITHUB_APP_URL` under `vars`. Name the account you deploy
     to with `CLOUDFLARE_ACCOUNT_ID` in your environment, not in the file.
   - Set the secrets:

     ```
     pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
     pnpm exec wrangler secret put SESSION_KEY       # openssl rand -base64 32
     ```
3. **Deploy** with `pnpm deploy`, then give the Worker its address (a custom domain), and use that as `service`.

To run it locally, copy `.dev.vars.example` to `.dev.vars`, fill it in and run `pnpm dev`. The service runs on port
8787, and a site built with `service: 'http://127.0.0.1:8787'` and served by `vite preview` can save through it.

## From a save to the live site

Popfold's test site, `popfold/save-test` (https://save-test.popfold.workers.dev), runs the whole loop with
Cloudflare's Workers Builds connected to its repository. Edits saved in the studio go to `studio/<login>` with a pull
request. Cloudflare builds that branch to a preview, `https://studio-<login>-<worker>.<subdomain>.workers.dev`, and
merging the pull request deploys the site. For branch previews, the site's `wrangler.jsonc` needs a `"previews": {}`
block. `wrangler preview` refuses to run without one.

Sign-in leaves the studio's page and comes back to it, rather than opening a pop-up: GitHub's pages cut a pop-up's
link back to the page that opened it. The session comes back in the address's fragment, which the studio reads
before it rewrites its own address. The kept edits wait in the browser, and the studio saves them as soon as it is
back.

## Not done yet

- People without GitHub accounts (an invite by e-mail, with a role per site).
- Wrappers for Node (`popfold serve`) and Azure. The handler needs only `Request` and `Response`.
- In the studio, beats can't be added, removed or moved on a built site yet: the browser has no page reader. The
  service can already make those changes.
