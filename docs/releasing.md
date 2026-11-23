# Releasing Popfold, and updating a site

Popfold and the sites built on it are separate repositories. Popfold is published on npm as `@popfold/engine`, and a
site installs it under the name `popfold`: `"popfold": "npm:@popfold/engine@0.50.0"` in its `package.json`, put by
`pnpm install` into `node_modules/popfold` (so its code still says `import … from 'popfold'`). It moves to a newer release only when someone moves it. So a change
to Popfold reaches a site in two steps: release Popfold, then update the site.

> **Alpha.** Any release may break a site. That is allowed before 1.0.0, and it is why sites pin a tag.

There are two ways to change Popfold. Use the first when the change comes out of work on a site, which is most
of the time. Use the second for work on Popfold alone (its docs, the template, the model tools).

## Change the engine while working on a site

Make the change in a checkout of Popfold of its own, one per site and topic (a git worktree is cheapest), and point
the site at it while you work: the site's dev server shows the change at once, and several people or agents can
each change the engine from their own site without touching each other's files.

1. **Start a branch** in a worktree of your Popfold checkout, from the newest `main`, and install it:

   ```
   git -C <your Popfold> fetch origin
   git -C <your Popfold> worktree add ../popfold-<site>-<topic> -b <site>/<topic> origin/main   # e.g. mysite/wall-hinges
   pnpm --dir ../popfold-<site>-<topic> install
   ```

   Starting from `main`, not from the tag the site pins, means the site also takes whatever was merged since its
   pin. Read its `CHANGELOG.md` if the site then needs a change.
2. **Point the site at it**: in the site's `package.json`, `"popfold": "link:../popfold-<site>-<topic>"`, then
   `pnpm install`. Do not commit that line: it names a folder on this machine.
3. **Edit** the engine there. Keep the change general: nothing that belongs to this one site goes into Popfold (no
   site name, person's name, brand colour, section id or CSS class). If only this site needs it, it belongs in the
   site, perhaps behind a new option of the engine. After changing `src/vite-plugin.ts`, run `pnpm build:pkg` in
   the checkout: a site loads the plugin from `lib/vite-plugin.js` (restart the site's dev server too).
4. **Prove it** in the site: `pnpm typecheck`, `pnpm build`, and `pnpm exec popfold stills --check` to see exactly
   which stills the change alters. In the checkout: `pnpm -r typecheck`, `pnpm test`, `pnpm lint`, `pnpm -r build`.
5. **Record it**: a line under `## Unreleased` in its `CHANGELOG.md` (say what a site has to do, if anything), and
   the docs page that describes what you changed.
6. **Commit in the checkout**, naming the files.
7. **Push the branch and open a pull request** on the Popfold repository, when the owner says so:

   ```
   git push -u origin <site>/<topic>
   gh pr create --repo <owner>/popfold --head <site>/<topic> --base main
   ```

   Typecheck, test, lint, build and run the visual test here (CI is off until 1.0.0, AGENTS.md rule 9). Merge
   when the owner agrees.
8. **Release** it (below), then **pin the release** in the site: `pnpm exec popfold update v<version>` puts the
   git line back in place of the link. Commit the site.

A site is committed only on a release, never on a link. Until the release, keep the link out of the site's
commits (or commit the site's own changes without `package.json` and the lockfile).

Two sessions changing the same engine file from two sites will meet in the pull requests. The second one
rebases onto the new `main` (`git fetch origin && git rebase origin/main` in its checkout) and checks its site
again.

## Change Popfold on its own

Work in a clone of the Popfold repository that is not inside a site.

1. Make the change. Add a line under `## Unreleased` in `CHANGELOG.md` saying what changed and, if it breaks
   sites, what a site has to do.
2. `pnpm -r typecheck`, `pnpm test`, `pnpm lint` and `pnpm -r build`.
3. If the change can alter how a home looks, try it in a site before releasing: in a clone of the site, link it to
   your working copy (`"popfold": "link:<path to your Popfold>"`, then `pnpm install`), build, and run
   `pnpm exec popfold stills --check`. It lists the stills that differ and by how much.
   `node tools/visual-test.mjs --before <a checkout of the last release> --after .` does the same for every
   template. Run it here before a release: CI is off until 1.0.0 (AGENTS.md, rule 9).
4. Commit. Push when the owner says so.

## Cut a release

```
pnpm release 0.2.0
```

Cut releases in your Popfold checkout on `main`, one at a time: pull first.

This runs `tools/release.mjs`. It refuses to start unless the tree is clean, you are on `main` and not behind
`origin/main`, the version is newer, and `CHANGELOG.md` has notes under `## Unreleased`. Then it:

- moves those notes under `## 0.2.0 (alpha), <today>` and leaves an empty `## Unreleased` above them;
- sets the version in `package.json`, every template and the README;
- builds `lib/vite-plugin.js` (the one file a site's `vite.config.ts` loads as it is), installs, typechecks and
  builds everything;
- commits `Popfold 0.2.0 (alpha)` and makes the tag `v0.2.0`.

Nothing is pushed. When the owner says so:

```
git push origin main
git push origin v0.2.0
```

The `<popfold-home>` bundle is not attached to the release while CI is off: `pnpm build:lib` makes it in `dist/`.

Version numbers before 1.0.0: raise the middle number when sites have to change something, the last number when
they do not.

## Update a site

In the site's folder:

```
pnpm exec popfold update            # to the newest release
pnpm exec popfold update v0.2.0     # or to a named one
```

It asks npm for Popfold's releases, sets the site's `popfold` line to the one asked for, then runs `pnpm install`,
`pnpm typecheck` and `pnpm build`. If the site no longer builds, it says so and tells you how to go back.
It commits nothing and captures no stills, so it does not use the GPU. A site linked to a checkout goes back to a
release the same way.

Then finish by hand:

1. Read `node_modules/popfold/CHANGELOG.md` for anything the site has to change, and change it.
2. `pnpm build:static` recaptures the stills (this uses the GPU) and lists the ones that changed. Stills that
   look the same are left untouched. Look at each changed one.
3. Commit the move: `git add package.json pnpm-lock.yaml public/stills stills .github/workflows/visual.yml && git
   commit -m "Popfold v0.2.0"` (`stills/` holds the stills of homes only the studio shows).
4. Push when the owner says so.

## Publish a release to npm

After the release is pushed, from your Popfold checkout on that release's commit, signed in to npm as a member of
the `popfold` organisation (`npm login`):

```
pnpm publish
```

It publishes `@popfold/engine` at the version in `package.json`, with the files `package.json` lists (`files`):
the source, `lib/vite-plugin.js`, the command, the cases, the schema, the templates, the docs and the tools, and
nothing of the tests or a machine's own notes. `pnpm pack` makes the same file to look into first. npm may ask for
a one-time code. Sites can then `pnpm exec popfold update`.

### When npm is out of reach

A pushed release's tag installs the same package from GitHub, with the same files, `lib/` included (it is
committed). Until the release is on npm, a site takes it by hand:

```
"popfold": "github:popfold/popfold#v0.51.0"
```

then `pnpm install`, `pnpm typecheck`, `pnpm build` and the steps under *Update a site*. `popfold update` reads only
`npm:@popfold/engine@<version>` and refuses this line, so once the release is on npm, put that line back and run
`pnpm install`.
