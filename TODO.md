# TODO

What is planned for Popfold. Sizes: **S** under half a day, **M** one or two days, **L** a week or more.
Popfold is alpha: anything here may break existing sites, and that is allowed before 1.0.0.

## Next, in order of priority

As of 0.50.2. Two tracks: the engine and sites (here), and the studio (its own track, section 4, and
`STUDIO-BACKLOG.md`). Each line is described in full in its section below.

Done on the way here: every site's homes are data (`src/*.json`) and the studio edits all of it, through one
command list that `popfold mcp` also offers an agent; shells are plug-ins; transitions A to D (links and cards,
the effects pass, camera paths and the tunnel, home to home within the story, 0.26 to 0.30); doors that show
they are doors (0.31); no more layout files (0.32); the visual test on a Machine.dev GPU runner, and a diorama's
room shown before its pieces (0.33); the small leftovers (0.34); a diorama template (0.35); one page per home
(0.36); the visual test on every site (0.37); mixed case parts (0.38); the clasp and heart as parts (0.39);
`<popfold-home>` (0.40); the studio's links, a tower's colours, stills for every home, the time of day said once,
and beats (0.41); the forge on TRELLIS.2 (0.42); every object in the studio and built-in kinds a file can name
(0.43); a fourth shell, the pop-up **book**, its `storybook` template and fold-in arrivals for any home (0.44); a
book that starts shut (0.45); a tower's cables that plug in as its floors open (0.46); a site in **more than one
language** (0.47), with untranslated words in `popfold check` and Cyrillic fonts in the template (0.48). Every
GitHub workflow is off until 1.0.0: tests run on the developer's machine (AGENTS.md, rule 9).

Engine work is tested on the templates in this repository (`templates/`), not on the sites: the visual test runs
on them, and a new template is the way to cover a shell or a feature they do not show.

Since 0.48: a book's pages from pictures, printed or sewn as cross-stitch (0.50); Popfold as a package, then on
npm as `@popfold/engine` with no more submodules (0.49, 0.50); and **Popfold public** at github.com/popfold/popfold
under the MIT licence, with the forge moved to a private repository of its own (0.50.2).

1. **Ready to announce** (S to M, section 6): a quick start that works from nothing (`pnpm dlx @popfold/engine
   init`, tried on a clean machine), a short screen recording per template for the README, `CONTRIBUTING.md`,
   `SECURITY.md`, issue templates, and popfold.ca's copy brought up to date (it still says there is no package).
2. **Release from CI** (S, section 1): a workflow that runs every check on a tag and publishes to npm with
   provenance (npm trusted publishing: no token), when the owner turns that workflow on. Until then
   `docs/releasing.md` is the routine.
3. **One way to deploy a site** (S to M, section 6): every template ships `wrangler.jsonc` and `deploy:site`
   (stills, build, upload to a Cloudflare Worker), and `popfold init --domain` fills in the address; the docs say how
   to host the same `dist/` anywhere else.
4. **Lighter models** (M, section 3): `--simplify` stopped at 1.7 to 1.4 MB on the heaviest diorama. Lighter
   sources for the heavy parts, and squeezing positions for another 10 to 15%.
5. **Share images per beat** (S to M, section 6): an Open Graph image for each section from its still.
6. **Later, larger**: brief to site, a story video, more shells.

**Studio track** (section 4): save from anywhere and Full mode wait on the owner's decisions. Without them, the
small ideas in `STUDIO-BACKLOG.md` are next: a scene tree, check from the studio, stills in the studio.

## 1. Living as its own repository

Popfold was split out of the monorepo it was grown in at 0.1.0. Sites held it as a git submodule until 0.49; they
install it from npm (`@popfold/engine`) since 0.50. It is public at github.com/popfold/popfold since 0.50.2.

- [x] **Site CI can read Popfold.** A read-only deploy key here ("Site CI (read-only)"), with its private half in
      each site as the secret `POPFOLD_DEPLOY_KEY`. A new site needs the same secret, or its own key.
- [x] **`popfold update`** for sites: moves the submodule to a release, installs, typechecks and builds.
- [x] `popfold stills` lists and rewrites only the stills that really changed.
- [x] **A visual test:** captures are repeatable and `popfold stills --check` fails when a still differs.
- [x] CI opens the templates in a browser and runs `popfold check` on them (off until 1.0.0, like every workflow).
- [x] **Run the visual test in CI** (0.33.0): `.github/workflows/visual.yml` on a Machine.dev GPU runner (a T4,
      through Vulkan). It captures every template with the engine before and after the change on the same
      machine, so no reference stills or tolerance are needed. About two minutes a run. Off until 1.0.0; `tools/visual-test.mjs` runs it here.
- [x] The same for each site (0.37.0): `tools/site-ci/visual.yml`, which `popfold init` and `popfold update` add.
- [x] **Release routine:** `pnpm release <version>` and `docs/releasing.md`.
- [x] CI uses the current major versions of the checkout, Node and pnpm actions.
- [x] **Popfold as a package** (0.49.0): sites take it from a git tag of its repository (no registry: it stays
      private, and every machine that can clone it can install it); the submodules are gone.

## 2. Small things left from the split

- [x] In a site, every pnpm command warned that `popfold/pnpm-workspace.yaml` is ignored. pnpm 12, which every
      site pins, no longer does. Running pnpm inside a site's `popfold/` still installs a second copy there
      (AGENTS.md says so).
- [x] Both case models were copied into every site's `dist/`. A build now carries only those its home files
      name (0.34.0).
- [x] **Interchangeable shell parts** (0.38.0): `look.parts` takes the base, lid, drawers and walls from
      different cases.
- [x] The clasp and the heart are parts of their own (0.39.0).
- [x] The template and docs import the stories in `vite.config.ts` with their file extension.
- [x] The look is the site's: story card, story dots, badges, the lid's heart and the studio's theme are options.
- [x] The built-in pieces and the palette `C` had one site's colours baked in: `setPalette()`, and the case's
      `look.trim` and `look.drawerWall` (0.34.0).
- [x] **Several story pages in one site**: `popfoldFallback({ pages })`, stills per page, one build.
- [x] A tower template, `templates/tower`; `popfold init --template tower` starts a site from it.
- [x] A diorama template (0.35.0), with a room made from simple shapes by `tools/demo-room.mjs`.
- [x] A storybook template (0.44.0): the book shell, five pages of pop-ups from simple shapes; it opens on its
      closed cover (0.45.0) and is in English and Bulgarian (0.47.0).
- [x] `tools/blender/room_to_glb.py` takes any of four walls and a turn (0.38.0).
- [x] Three badges, one lamp, a 4-unit room and the guide's standing height were constants in the engine. The
      badges follow each shell's zones; a home has any number of lamps; the shell says where its floor is
      (`ground`), which held the 4-unit room and the standing height (0.34.0).

## 3. Next for the engine

Roughly in this order. Each is its own piece of work.

- [x] **Homes as data** (L, done by 0.24.0: every site's homes are kept in files). One file per home: zones, pieces with explicit ids, stories, beats with cameras.
      This fixes three faults at once: a home is code (so the studio and an AI can only move pieces), piece keys
      depend on the order of the code, and sections and beats are two lists matched by position.
  - [x] Keyframes and stop names are one list of beats, each carrying its section's id; `popfold check` compares
        them with the page.
  - [x] A piece can carry an id of its own (`piece(obj, id)`), which fixes its key. Pieces placed in code without
        one are still numbered by order; `popfold check` warns when a story or a place hangs on one.
  - [x] A compact's recipe lists its pieces as data (`pieces`), with `kinds` to build each kind: the registry
        that keeps code-built pieces working.
  - [x] A listed piece carries its own story; the page without 3D reads the same list.
  - [x] Listed pieces for the tower's floors: the same `pieces` list, with a floor's id as the piece's `room`.
  - [x] The home file is plain JSON, `src/home.json`, with a JSON Schema and `readHome()`, which names every
        mistake in it. It holds the home's id and name, a tower's floors, the pieces and their stories.
  - [x] A compact's look is data (`look`: colours, and each surface as a colour or a pattern), with the lid's
        emblem and the picker's swatches. `homeFromFile(json, { kinds })` makes the home and its story.
  - [x] A tower's own colours (wall, slab, pipe) as data: the home file's `tower` (studio track).
  - [x] The studio saves a moved, turned or resized listed piece into `home.json`: only that piece's line changes.
  - [x] Hiding a listed piece is saved in the home file, and the studio adds and removes pieces.
  - [x] Beats are in the home file (`beats`), and `beatsOf()` turns them into the story.
  - [x] Layout files went away (0.32.0): everything the studio saves is in the home file.
- [x] **Shells as plug-ins** (0.22.0). One `Shell` interface and a registry; the frame loop no longer knows about
      lids and drawers. The story's fields are still c / L / R / z:<id>; naming every shell's zones freely is next.
- [x] **`scene.dispose()`**: stops the loop, drops every listener and frees the GPU memory.
- [x] **Draws less at rest, and steps quality down on slow devices** (`quality: 'auto'`). Not yet tested on a
      genuinely slow device.
- [x] Draw nothing at all when nothing moves: `ambient: false` (0.34.0).
- [x] **Stories reachable by keyboard and screen reader in 3D mode.**
- [x] In 3D mode, Enter or Space on a focused story opens its card beside its piece.
- [x] A story opened from the keyboard whose piece is out of view goes to its section first (0.34.0).
- [x] **`popfold describe`, `popfold shot`, `popfold check`**. A home as JSON, a picture of any view, and
      errors an agent can act on.
- [x] **`popfold init`**: a new site from a template (`--template compact|tower|diorama`), with Popfold as a
      submodule on a release.
- [x] **Unit tests** for `sample()`, the link rule and the fallback writer (`pnpm test`, run here).
- [x] Tests for piece keys and layouts.
- [x] Browser tests for the `popfold` command: `pnpm test:browser` (check, describe, shot, mcp). Not in CI yet.
- [x] The command reports a home that cannot be built at once, with the reason.
- [x] **`popfold optimize`**: makes models smaller (40 to 65%) without moving anything in them or changing a
      pixel. The engine reads meshopt-compressed models with WebP textures; `popfold check` says when a site's
      models have not been through it.
- [x] **Models load in stages** (`lazyModels`): the home appears with its first rooms' models and the rest follow.
      For a compact whose pieces are all listed.
- [x] The same for a tower (its top floors first), and a late piece springs in.
- [x] `models`: glow, no auto-loop and a `ready` hook for a model that is a listed kind, so a site's lamps and
      animated pieces need no code kind and still load in stages.
- [x] A smooth first scroll: a steady number of lights, and a warm-up that builds each beat's materials in the
      background.
- [x] The warm-up builds only what each beat shows: three.js compiled hidden meshes too (48 programs down to 29
      on a larger site, 22 to 18 on the compact template, none missed).
- [x] A late model is warmed as it lands and a home before `setHome` shows it; `warmUp: 'wait'` for a site with
      a loader.
- [x] A diorama's room before its pieces (0.33.0): `popfold split-room` and `diorama.pieces`.
- [ ] Staged loading for homes that place pieces in code. No site does any more, so only if one comes back.
- [x] `startScene({ onHome })` tells a site which home is on show, and a piece's `opts` may hold lists.
- [x] A size budget for models that stops a build (`modelBudget`).
- [x] A credits check in `popfold check` (0.23.0).
- [ ] Squeeze positions too, for another 10 to 15% (M): needs the shells to stop reading placement off model
      nodes, or the tool to put each part's transform back.
- [x] The tower's first still is repeatable: the capture starts from the first beat at rest. (The pipes run
      faster as floors light up, so the first still used to carry over whatever the page was showing.)
- [x] The three.js deprecation warnings are gone.
- [x] A build fails when a story has no section to go under.
- [x] Parse the HTML properly in the fallback plugin (0.23.0, parse5). `popfold check` still finds sections by pattern.
- [x] Rename the code to the glossary in `docs/guide.md` (0.34.0): `homeSaver`, `Places`, and the word list
      brought up to date. `Compact` is only the compact's own house now. Internal names (`props`, `stage`) remain.
- [x] A linter (Biome, 0.23.0). No formatter: reformatting would rewrap most lines of the hand-kept style.
- [x] **The book** (0.44.0): a fourth shell, a pop-up storybook whose pages turn with the scroll. Its pieces are
      paper pop-ups (V-fold, box, stand, card, fan) posed from their pages' angles, so they fold and never appear.
- [x] **Fold-in arrivals for any home** (0.44.0): a listed piece's `"fold"` stands it up about a hinge instead of
      springing it in.
- [x] A book that starts shut (0.45.0): `"closed": true`, and the zone `cover` opens it.
- [x] **A tower's cables plug in as its floors open** (0.46.0): `tower.cables`, opt-in.
- [x] **Built-in kinds a home file can name** (0.43.0): `builtin/sofa` and the rest, with no code.
- [ ] **A book's pages from pictures** (S to M): `book.pages[].art`, from the martenitsa site's engine branch.
- [ ] A book's cover with its title on it (S): the closed cover is plain board today.

## 4. Studio (its own track)

Worked on apart from the engine list above, and tested the same way: on the templates' studios.

Open, in order:

- [ ] **Save from anywhere** (M): a small service behind sign-in that commits the home file to a branch, for
      editing through a tunnel or by someone else. The dev endpoint stays local-only.
- [ ] **Full mode** (L): a chat panel in the studio that uses the command list, sees snapshots, and can generate
      pieces and art into the scene. Start with a dev-server proxy so no key reaches the page.

Done:

- [x] **Every object** (0.43.0): a drawer of every kind a home can use (built-in, the site's own, model files),
      with pictures, where each is used, and adding from it; `popfold describe` and the MCP `library` tool list the
      same.
- [x] A changed story shows in place, without a reload, and the Look group covers homes made in code and a
      diorama's colours (0.42.0).
- [x] **Edit links** (S to M): a section's links in the studio, with their target, label, piece, effect, cue and
      button, through the command list (the `link` command), so an agent can do it too.
- [x] **A tower's colours in the Look group** (S): wall, slab and pipe, as the home file's `tower`.
- [x] **Stills for every home** (S): a home no page shows keeps its stills in `stills/` at the site's root,
      compared by `popfold stills --check` but never built.
- [x] **The time of day, said once** (S): a home's `mood`, in its file or recipe, which the site, the studio and
      the stills all take.
- [x] **Add, remove and reorder beats** (M): the studio and the commands edit the home file's beats and the
      page's stage sections together.
- [x] Drafts: unsaved piece edits survive a reload.
- [x] In *Free orbit* the studio shows the camera's position and the point it looks at, and copies them as the
      two arrays of a beat.
- [x] The studio sets a beat's camera from the current view and saves it into the home file.
- [x] The studio saves what a beat does from the Fold sliders.
- [x] **Edit everything, not only positions** (L, 0.20.0): move, turn, resize, hide, add, remove and swap pieces,
      write their stories, set a beat's camera and every value it sets, and the look.
- [x] Adding, removing, a story, a kind or a look change rebuild the home in place, without a reload (0.20.0).
- [x] Undo and redo for unsaved piece edits (moves, turns, sizes, hiding).
- [x] **One command list** that the studio and agents use, with undo and redo of saves (0.21.0).

## 5. AI

- [x] A local vision model that plans, picks and judges props (the forge, a separate private pipeline since 0.50.2).
- [x] The forge makes props with TRELLIS.2, locally (0.42.0), runs a file of briefs (`--batch`, 0.43.0), and has
      a read-only viewer of what it made (`viewer.py`, with side-by-side trials; 0.45.0).
- [x] **MCP server** `popfold mcp` on top of the command list (0.21.0).
- [x] **An agent skill**, `skills/popfold-site/SKILL.md`: the order of work for making or changing a site. A
      fresh agent built a site from it alone; what tripped it up is fixed in the skill, the docs and the command.
- [ ] **A model generator in Popfold** (M to L), if one belongs here at all: the forge stays a private tool for
      now. Any public one needs swappable back ends, provenance written into each model, and the licence check below.
- [ ] **Full mode**: in the studio track (section 4).
- [ ] **Brief to site** (M): from a questionnaire or a resume to beats, copy, a shell and a first home.
- [ ] Check the licence of every generating model before anything goes public (S).

## 6. Reach

- [x] A built bundle and a **web component**, `<popfold-home>` (0.40.0): `pnpm build:lib` (a release workflow attaches it, while CI is on).
- [x] Sites take Popfold as a package from a git tag (0.49.0), and from npm as `@popfold/engine` (0.50.0).
- [ ] **Release from CI** (S): every check on a tag, then `npm publish --provenance` through npm trusted
      publishing, when the owner turns that workflow on.
- [x] **A site in more than one language** (0.47.0): a page made `from` another with `lang` and a translation file;
      `hreflang`, a `data-pf-lang` switcher, `t()` in the browser, and untranslated words in `popfold check` (0.48.0).
- [ ] Languages, later: the studio's own words, beat names and page labels per language, and a home file's
      stories kept per language instead of in one dictionary, if a site needs it.
- [ ] **Share images per beat** (S to M): an Open Graph image for each section, from its still.
- [ ] Other outputs from the same home: a story **video**, one animated `.glb`, AR, and a print-and-fold paper
      compact.
- [ ] Tools for visiting agents (go to a beat, list pieces, read a story), as browser support arrives.
- [ ] More shells: dollhouse, suitcase, shop window, a train of carriages. (The book came first, in 0.44.0.)
