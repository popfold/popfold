# Changelog

Popfold is in **alpha**: nothing is stable and backwards compatibility is not kept before 1.0.0.

## Unreleased

- The studio works on a built site: with no dev server to write the home file, its edits (add, remove, move, look,
  links, stories, cameras) run in the browser on a copy of the file, kept in localStorage until a day after the last
  edit, with undo and redo. It shows them again when it opens, and *Download the home file* takes them away. Before,
  every edit there failed with "JSON.parse: unexpected end of data". Unsaved moves (drafts) are also forgotten after
  a day.
- A book's studio offers only what a book can build: its pop-ups and the site's own kinds. The object view no longer
  offers built-in furniture or model files for one, and an add the home cannot build is refused before anything is
  written (before, the dev server wrote it into the home file and the home stopped building).
- The home file's commands moved from `vite-plugin.ts` into `src/home-commands.ts` (still exported from
  `popfold/vite`); `pnpm build:pkg` makes `lib/home-commands.js` beside `lib/vite-plugin.js`.
- The README, `docs/models.md`, `docs/agent-tools.md` and `CREDITS.md` link to the forge, Popfold's model pipeline,
  now public at github.com/popfold/forge.
## 0.50.4 (alpha), 2026-11-21

- The badges wear Popfold's own P instead of a heart: `made-with-popfold-p-{light,dark}.svg` replaces the heart pill,
  and the round mark is the P alone. **A page using a heart badge's address** moves to the `p` one.
## 0.50.3 (alpha), 2026-11-21

- **"Made with Popfold" badges**: a heart, a folded corner and the mark alone, light and dark, in `assets/badges/`
  (`tools/badges.mjs`), with the snippet in `docs/showcase.md`.
- `CREDITS.md`: the people, Claude Code, every library and tool, and every AI model used for the demos.
## 0.50.2 (alpha), 2026-11-21

- **Popfold is public**, at github.com/popfold/popfold, its history starting here. Created by Dimiter Todorov;
  creative direction by Alyssa Jacoby (Dopamine Spaces). MIT licence.
- The forge (the AI model pipeline that was `tools/forge`) is no longer part of Popfold. `docs/models.md` and
  `docs/agent-tools.md` describe generating models with whatever tool a site uses, and the two review renders it
  had, `blender_render.py` and `ortho_views.py`, are in `tools/blender/`.
## 0.50.1 (alpha), 2026-11-21

- The npm package leaves out `tools/forge` (the local GPU model pipeline, which sites do not use; it stays in the
  repository) and Python caches.
## 0.50.0 (alpha), 2026-11-21

- The forge: `--subject` draws a subject as written, past the planner; `--painter chroma` draws with Chroma1-HD,
  for what FLUX schnell will not draw. The forge viewer says what made each model, and picks up new ones as they
  arrive.
- **Popfold is on npm, as `@popfold/engine`.** A site installs it under the name `popfold`:
  `"popfold": "npm:@popfold/engine@0.50.0"` (its code still imports `popfold`). `popfold update` asks npm for the
  releases, `popfold init` writes that line (`pnpm dlx @popfold/engine init mysite` starts a site from anywhere),
  and `--from <folder>` still links a checkout for engine work. **A site moves once:** replace the `git+https…#v0.49.0`
  line with the one above and `pnpm install`. The site visual test needs no deploy key any more.
- `pnpm publish` publishes a release (`docs/releasing.md`); `files` in `package.json` lists what goes in it.
- **A book's pages can carry a picture, printed or sewn.** A page's `"art"` prints a picture across its spread;
  with `"stitch": true` the picture is sewn as cross-stitch as the page opens, one thread at a time, and unpicked
  as it closes (`src/stitch.ts`, with tests). The picture's address is taken from the site's base, so a translated
  page in a folder (`bg/`) finds it too. Pages are now drawn at 768 pixels wide, in memory rather than on the
  GPU, so a page being sewn uploads quickly; the storybook template's stills change a little with it.


## 0.49.0 (alpha), 2026-11-21

- **Sites take Popfold as a package from a git tag, not a submodule.** A site's `package.json` says
  `"popfold": "git+https://github.com/<owner>/popfold.git#v0.49.0"`, and `pnpm install` puts it in
  `node_modules/popfold`. `popfold update [tag]` changes that line (no submodule to move), `popfold init` writes it,
  and `--from <folder>` links a checkout. **A site has to move once** (the four sites did, with this release): drop
  the `popfold/` submodule and `.gitmodules`, take `popfold` out of `pnpm-workspace.yaml`, set the line above, and
  point `$schema` and `CLAUDE.md` at `node_modules/popfold/`. Engine work from a site links the site to a Popfold
  checkout of its own while it lasts (`docs/releasing.md`).
- The Vite plugin is built to `lib/vite-plugin.js` (`pnpm build:pkg`; `pnpm test` fails while it is out of date),
  because Node does not strip TypeScript inside `node_modules`. The rest stays TypeScript that a site's dev server
  compiles; the plugin keeps Popfold out of pre-bundling and dedupes three.js.
- The `popfold` command's tools (Playwright, sharp, glTF Transform, meshoptimizer) are Popfold's dependencies now:
  a site gets them with Popfold.
- The site visual test installs Popfold through the deploy key (git fetches the repository over SSH); not run on
  GitHub since this change.
## 0.48.0 (alpha), 2026-11-21

- **`popfold check` lists what a translated page still shows in the original**: its text, stories, link cards and
  Popfold's own words that its translation file does not have.
- The storybook template's Bulgarian page is set in Rubik and Nunito, which have Cyrillic (Bricolage Grotesque and
  DM Sans do not).
## 0.47.0 (alpha), 2026-11-21

- **A site in more than one language.** A page made `from` another with `lang` and `text` (a translation file: the
  words as written, to their translation) is that page in another language at an address of its own: its text,
  image and share words, stories, link cards and `<html lang>` translated at build time; in 3D the story cards, door
  words and Popfold's own words too, through `t()`, which a site can use for its own words drawn in code. The pages
  name each other with `hreflang` in their heads and the sitemap; a link with `data-pf-lang` is a language switcher
  that needs no addresses. The dev server and the build list what is not translated yet. The storybook template is
  in English and Bulgarian.
## 0.46.0 (alpha), 2026-11-21

- **A tower's cables plug in as you scroll.** `"tower": { "cables": { "plug", "size", "tint" } }` makes a floor's
  pipes cables: hidden on a closed floor, drawn in along their length as it opens (the spine's branch first, then
  the floor's own in turn, or by `ctx.flow(points, { step })`), each with a plug model on its tip, carrying packets
  only once plugged in, and pulled back in reverse as the floor closes. `ctx.port(point, onPlug)` and
  `ctx.flow(points, { onPlug })` say when a cable plugs in or out, to light a port. `Flow` gains `reveal`, `plug`,
  `onPlug` and `step`; the timing is plain numbers in `src/cable-math.ts`, with tests. Opt-in: without `"cables"`
  a tower draws exactly as before.

## 0.45.0 (alpha), 2026-11-21

- **A book can start shut.** `"closed": true` in a home file's `book` puts its front cover on the pages; the new
  zone `cover` opens it, folding the first page's pieces up as it does, and no leaf turns further than the cover
  has. The storybook template now opens on its closed cover, with a section of its own for the title.
- `tools/forge/viewer.py`: a small web viewer for every model the forge made, with each one's brief, scores and
  review pictures; works on a phone (`--host 0.0.0.0` or a tunnel).

## 0.44.0 (alpha), 2026-11-21

- **A fourth shell, the book, and a template, `storybook`.** A pop-up storybook lying open: each page is a room
  with its own scene, and scrolling turns the leaves. Its pieces fold and never appear: V-folds, box folds, stands,
  parallel cards and fans (`src/popup.ts`), each hinged to its pages and posed from their angles, so a page folds
  flat as it closes, opens on the leaf's back and runs backwards with the scroll. The geometry is plain numbers in
  `src/popup-math.ts`, with tests. A home file says `"book": { "pages": [...] }`; a page's zone is how far its leaf
  is turned. `popfold init --template storybook` starts a site from it.
- **Fold-in arrivals for any home.** A compact's or a tower's listed piece with `"fold": "back"` (front, left,
  right) rises from lying flat about that edge instead of springing in; `hinge()` does the same for any object.
- **A jump back no longer leaves later zones open.** A zone neither neighbouring beat names is shut, so jumping
  back from the end of a story (a reload, a link) closes a tower's lower floors and a book's later pages.

## 0.43.0 (alpha), 2026-11-21

- **Every object, in the studio.** A drawer (*Every object*, beside *Props*) lists every kind of piece the home on
  show can use: the site's own kinds, Popfold's built-in pieces and model files, each with a picture the studio
  draws, where it is used and its file size, and an **Add** button that puts one in a room and selects it. Model
  files in the site's folders that the home does not load are listed greyed, with what to do; the dev server lists
  them (`GET /__popfold/library`).
- **Built-in pieces need no code.** A home file may name `builtin/sofa`, `builtin/floor-lamp`, `builtin/rug` and
  ten more as a piece's kind; a few read `opts` (`color`, a rug's `width`, `depth` and `round`). A site's own kind
  of the same name comes first, and a `builtin/` name that does not exist is a mistake in the file.
- **`popfold describe` lists every kind** a home can use, with where each is used, and `popfold mcp` has a
  `library` tool: the same per home, plus the model files no home loads.
- **The forge runs a file of briefs.** `forge.py --batch briefs.json` makes each prop in turn, so a list of briefs
  is a recipe that makes the same props again; `jobs/example-briefs.json` is one. A night of test props also gave
  the planner, the picker and the cut-out several fixes (each picture scored on its own, the picture's canvas shaped
  like the object, colours and detail kept from the brief, pale parts kept), all listed in `tools/forge/README.md`.

## 0.42.0 (alpha), 2026-11-21

- **The forge makes props with TRELLIS.2, locally: shape and colours on every side.** `forge.py` uses it unless
  given `--mesh hunyuan`. `comfy_trellis.py` builds ComfyUI's TRELLIS.2 graph in code (about two minutes a model on
  a 12 GB card), and `blender_fit.py` reduces the result to the triangle budget with Blender's collapse decimation,
  which keeps the texture, turns it to face front and sizes it. The README lists the six model files and what we
  learned: let Blender, not ComfyUI, do the final decimation; the colours come out darker. The picker must now score
  every picture, the white-background check looks only at the border (furniture casts a soft floor shadow), the
  judge is told the style, and the silhouette bar is per mesh model.
- **A diorama's colours in the Look group.** A diorama's home file may say `"paint": { "<material>": "<colour>" }`
  to change the model's own colours by material name (each build paints its own copy of the material). The Look
  group lists the model's materials with the colours they show, saves a change through the `look` command's new
  `paint`, and **×** gives a material its own colour back. The art and the cover stay drawn in code.

- **The Look group for a home made in code.** It shows the home's plain colours (a compact's case and lid title, a
  tower's floors and building), builds the home again in place when one changes, and writes the changes as code to
  copy into the recipe (**Copy as code**, **Put back**). Nothing is saved: the look is the code's.

- **The studio shows a changed story in place.** Adding, removing, moving or renaming a beat, and undoing or redoing
  any of those or a beat's camera, no longer reloads the studio: its stops, its scroll and the scene take the new
  beats at once (`scene.setBeats(beats)`). The dev server holds back Vite's reload of the page whose sections the
  studio just changed, for the studio that asked.

## 0.41.2 (alpha), 2026-11-21

- **The docs, reviewed against the code.** About seventy fixes across the README, AGENTS.md, the guide, the other
  docs, the templates' READMEs, the skill and TODO.md: three templates, Save (not Save layout), places (not layout
  entries), CI off until 1.0.0, the bundle as the whole `dist/` folder, a lift that shows unless switched off, a
  heart that is off by default, and no site's own names, colours or models in the examples. `docs/showcase.md`
  shows a site made with Popfold; the studio's working notes are gone (TODO.md section 4 has what is left).
- **A site's visual-test workflow runs only when started by hand** until 1.0.0 (`gh workflow run visual.yml`), and
  fetches Popfold from the site's own GitHub owner.

## 0.41.1 (alpha), 2026-11-21

- **The forge makes a prop from a brief the same way every time, with local models only.** `tools/forge/forge.py
  "a sprinkled donut"` replaces `director.py`. The script makes every decision and the local language model only
  answers questions: fixed seeds; measured checks on each picture (one object, not cut off, its size, a white
  background) and mesh (its front silhouette against the picture) that the model cannot overrule; and fixed rules
  for what the next round changes. Every step is keyed by a hash of its inputs and skipped when nothing changed,
  and `llm.py` asks at temperature 0 with a seed and keeps every answer, so a second run gives the same files in
  seconds and a stopped run picks up where it stopped. `run.json` records every input, measure, score and decision,
  and `progress/` holds a labelled picture of each stage as it happens.

## 0.41.0 (alpha), 2026-11-21

- **Add, remove and move beats in the studio.** Under the story's stops, the beat the story is on can be renamed,
  moved earlier or later, removed, or have a new beat added after it. Each is a command (`add-beat`, `remove-beat`,
  `move-beat`, and `beat`'s new `name`) that edits the home file's beats and the page's `<section class="stage">`
  together: a new section is shaped like its neighbour, with the beat's name as its heading and a placeholder for
  its words. One undo takes back both files. `popfold mcp` has the same commands. `readPage()`'s sections now say
  where each starts and ends.

- **The time of day is said once, by the home.** A home file's `"mood": "evening"` (a recipe's `mood`) makes the
  scene open in the evening and take each home's own as it goes on show; the studio opens in it, sets the backdrop
  to suit, follows it when another home is picked, and captures stills in it whatever its Day and Evening buttons
  show. `mountStudio()`'s `mood` is gone, and the tower template no longer calls `setLighting('evening')`: its file
  says it. `<popfold-home>` uses the home's own unless `light` is given. The debug panel's studio link carries the
  light on show. The compact template's sage variant is an evening home.

- **Stills for every home.** `popfold stills` (and `--check`, and the visual test) now also captures each home
  a studio page has that no page shows, into `stills/` at the site's root: kept and compared, but outside
  `public/`, so no build carries them. The studio's **Capture stills** saves there for such a home too, and
  `popfold check` reports their missing stills and stills left in the wrong folder. The compact template's studio
  has such a home: the office in a sage palette.

- **A tower's building is data, and the studio colours it.** A home file with floors may say `"tower": { "wall",
  "slab", "spine", "elevator", "width", "depth", "floorHeight" }` (`spine` is the pipe's colour; left out, there is
  no pipe). `homeFromFile()`'s `tower` now takes only `build`; the wall, slab, spine and lift move into the file
  (the tower template's did). The Look group has the walls, slabs and pipe, through the `look` command's `tower`.

- **Edit links in the studio.** A **Links** group lists a home file's links, each with where it starts and leads
  (a section of this home or another), its words, piece (or the one selected), effect and strength, door cue,
  button and card; links are added and removed there too. Every change is the new `link` command, so `popfold mcp`
  and scripts have it as well. `mountStudio({ transitions })` shows the site's doors in the studio, and a click on
  one goes to its section; the templates' studio pages pass their links. `scene.setTransitions(list)` replaces a
  scene's links (the next build of each home uses them). The Look group now also follows an undo or redo.

## 0.40.1 (alpha), 2026-11-20

- **Tests run on this machine until 1.0.0.** Every GitHub Actions workflow is disabled; AGENTS.md (rule 9) and the
  docs say to typecheck, test and run the visual test locally, and not to push to have something checked.

## 0.40.0 (alpha), 2026-11-20

- **`<popfold-home>`: Popfold without a build step.** `pnpm build:lib` bundles Popfold and three.js into
  `dist/popfold.js` (with the cases in `dist/cases/`), and loading it defines `<popfold-home src="home.json">`: the
  story follows the element through the viewport (or `stage` holds it), models load beside the home file, story dots
  open their cards, and a page's own code (kinds, a diorama's art) comes through `PopfoldHome.code` with the
  bundle's `THREE`. CI builds the bundle, and each release tag attaches it to a GitHub release as a zip. A scene
  now also says where its story stands (`scene.stage`).

## 0.39.0 (alpha), 2026-11-20

- **The clasp and the heart are parts of their own.** `tools/blender/build_compact.py` exports them apart from
  the lid (`Clasp`, `Heart`, both on the lid's hinge), the two cases are rebuilt that way (they look exactly as
  before), and `look.parts` takes them from another case too: `{ "heart": { "url": "models/star.glb" } }`. A
  site's own case built before, with them in its lid, still works.

## 0.38.2 (alpha), 2026-11-20

- **`popfold update` run again brings a site's visual test up to date** when the update was made by an older
  release's command: it reads what the site's last pinned release shipped, and replaces the workflow if the site
  has not changed it.

## 0.38.1 (alpha), 2026-11-20

- **A site's visual test reaches Popfold.** GPU runners may have no way out on port 22, so the site workflow
  fetches the private Popfold repository over SSH on port 443 (`ssh.github.com`), with GitHub's published host
  key. `popfold update` replaces a site's workflow that is exactly what the old release shipped (a site's own
  changes are kept).

## 0.38.0 (alpha), 2026-11-20

- **`room_to_glb.py` takes a room any way round.** `walls` names any of back, front, right and left with where
  each stands (`{ "back": 4, "right": 6 }`, was `{ "backY", "rightX" }`), and `turn` turns the room about z first.
  A poster's face and a bank of screens follow the wall they hang on. **A site's room config changes** `walls` to
  the new form. An existing room exports exactly as before; turned 90 degrees with a left wall, it folds right.

- **A case of mixed parts.** `look.parts` takes any of the compact's `base`, `lid`, `drawers` and `walls` from
  another case: `{ "lid": "crisp" }` puts the crisp lid on a round case, and `{ url }` a site's own. A part not
  named comes from `look.shell`, each model is loaded once, and a build carries every case a part names.

## 0.37.1 (alpha), 2026-11-20

- **Still captures that can be trusted.** Each still settles at its beat before the clock starts again (a tower's
  pipes carried the easing from the beat before, so the first capture after a change differed), and is kept only
  when two shots agree. The command checks each studio page draws on the browser's GPU (Chrome's GPU process can
  restart under load) and stops if the drawing is lost, instead of comparing pictures drawn some other way. The
  tower template's stills changed once for this (the pipes' packets moved). `POPFOLD_STILLS_OUT=<folder>` keeps
  the stills that differ.
- **`popfold update` run a second time adds the visual test** to a site an older command updated (that command
  does not know about it).
- **`popfold optimize --simplify [error]`**: fewer triangles, within an error of 0.1% of each part's size by
  default. Lossy, so asked for; `docs/models.md` has one room's numbers.

## 0.37.0 (alpha), 2026-11-20

- **The visual test for every site.** `tools/visual-test.mjs` captures a checkout's stills before and after a
  change, each side with its own `popfold stills`, and fails if any still differs (with the pairs in a report). It
  works on Popfold (every template) and on a site; Popfold's own workflow now runs it. `popfold init` and `popfold
  update` give a site `.github/workflows/visual.yml` (from `tools/site-ci/`), which runs it on a Machine.dev GPU
  runner on every push, with each side on the Popfold it is pinned to. On one site, 0.36.0 against 0.36.1:
  16 stills compared, none differ.

## 0.36.1 (alpha), 2026-11-20

- **The debug panel finds the studio from a page in a folder.** A page whose studio is not beside it (a page made
  with `from`, say) carries `<meta name="popfold-studio">`, and the panel's Studio link follows it instead of
  looking for a `studio.html` beside the page (a 404).

## 0.36.0 (alpha), 2026-11-20

- **One page per home, from one HTML file.** A page in `popfoldFallback({ pages })` with `from: 'index.html'` is
  made from that page's HTML, in the dev server and the build, with its relative paths moved to its folder. It gets
  its home's stills, stories and link cards, its own share image, canonical address, sitemap entry and part of
  `llms.txt`, and it says which home it shows (`<meta name="popfold-home">`), which `startScene()` starts in after
  `?home=`. A link card to another home's section leads to that home's page when the site has one (`evening/#room`,
  and back `../#room`); a link to the page's own home is a plain `#section`. `popfold check`, `describe` and
  `stills` cover the page. A page in a folder also finds the site's models without a `base` (`<meta
  name="popfold-base">`).

## 0.35.0 (alpha), 2026-11-20

- **A diorama template**, `templates/diorama`: a modelled room with a lounge, a gallery wall and a desk, cut by
  `split-room` (the room 6 KB, its pieces 132 KB) and shown in stages, two lamps, painted art, a cover, a door with
  a button, and the guide figure. `popfold init --template diorama` starts a site from it; CI checks it and the
  visual test captures it. Its room is made from simple shapes by `tools/demo-room.mjs`, so Popfold can ship it.
- **A lamp's glow waits for its piece** in a diorama (it glowed in an empty room before), and a shell says how big
  the guide figure is (`guideSize`; a diorama draws it at a person's size in its own metres).

## 0.34.0 (alpha), 2026-11-20

- **A story opened from the keyboard goes to its piece.** Enter or Space on a written-out story whose piece is
  out of view (its room closed, or off screen) scrolls to the story's own section first, and opens the card
  beside the piece once the camera has arrived (mid-screen only if it still cannot be seen).

- **Names that say what they do now.** `layoutSaver()` is `homeSaver()` (it saves the home file; there are no
  layout files), and the types `Layout` and `LayoutEntry` are `Places` and `Place`, `applyLayout()` is
  `applyPlaces()`. **A site changes one line** in `vite.config.ts`: import and call `homeSaver` instead of
  `layoutSaver`. The guide's word list is up to date (beats, places, links and doors, home files).

- **Draw nothing when nothing moves.** `startScene({ ambient: false })` holds the decoration still, and a page
  whose story is at rest then draws no frames at all until the scroll, the pointer or a change wakes it (on the
  compact template: 0 frames in 2 seconds at rest, against 60). Reduced motion holds the decoration still too.
  Shells get `still` in their frame context.

- **Several lamps, and the guide stands on any shell's floor.** Every piece marked `"lamp": true` in a compact
  glows with the story's `glow` (it was the last one only), and a diorama's `lamp` may list several pieces. A
  shell's house now has `lamps` (was `lamp`) and `ground(x, z)`, the floor's height where the guide figure
  stands: it was the compact's, built into the engine, so the figure floated or sank in a diorama.

- **The built-in pieces take the site's colours.** `setPalette({ ... })` (before `startScene()`) recolours every
  built-in piece and the guide figure by name (pink, cherry, wine, butter, cobalt, mint, lilac, white, gold,
  orange, green); `DEFAULT_PALETTE` is what they ship with. A compact's look gains `trim` (the case's hinges and
  clasp ring, gold until now) and `drawerWall` (the walls that tip up from the drawers, white until now).

- **A build carries only the cases it uses.** The two modelled cases come from the Vite plugin as a module, and a
  build puts in only those the site's home files name (`look.shell`, 'round' by default): a tower or a diorama
  site now ships neither (448 KB less), a compact one. `popfoldFallback({ cases })` names them for a compact made
  in code; the dev server has both. A case missing from a build is drawn in code, with a warning.

## 0.33.0 (alpha), 2026-11-20

- **A diorama's room shows before its pieces.** `popfold split-room <room.glb>` cuts a room model into the room
  (floor and walls: one room's is 10 KB of its 1.7 MB) and `<name>-pieces.glb`. With `diorama.pieces`
  naming the second and `lazyModels: true`, the page shows the room as soon as its file is in and grafts the
  pieces on when theirs lands. The studio and the stills still wait for everything. A piece that arrives late, in
  any shell, now gets its door cues too.
- **The visual test runs in CI** (`.github/workflows/visual.yml`), on a Machine.dev GPU runner: both templates are
  captured with the engine before and after each change, on the same machine, and the run fails if any still
  differs (the stills before and after are uploaded). `popfold stills` finds a GPU on Linux (Vulkan, then EGL);
  `POPFOLD_GPU=require` makes it fail rather than draw in software, and `POPFOLD_GPU_ARGS` sets Chrome's flags.

## 0.32.0 (alpha), 2026-11-20

- **No more layout files.** The engine no longer fetches `public/layouts/<home>.json` and the dev server's
  `/__popfold/layout/` endpoint is gone: every change the studio makes is saved into the home file (its pieces'
  lines and its `places`). A home made in code cannot be saved from the studio; *Save* downloads its changes as
  `<home id>-places.json` for `recipe.places`. The studio's button is now *Save*, and `describe()` reports
  `placesWithoutPiece` (was `layoutKeysWithoutPiece`).

## 0.31.1 (alpha), 2026-11-20

- **A button back from another home.** A link whose `fromHome` is not the page's home had no button at all, so on
  the other home there was no way back but the door. Its button is now written for the 3D page, shown only while
  its home is on show, and left out of the page without 3D. (Found on a site.)

## 0.31.0 (alpha), 2026-11-20

- **Doors show that they are doors.** A piece that carries a link gets a portal marker (a ring with an arrow), a
  glow and the link's words by the pointer on hover, and a pulse the first time the story reaches its section.
  A link's `cue` chooses: `"full"` (default, or `startScene({ linkCue })`), `"hover"` (only the glow and words) or
  `"none"` (nothing: an easter egg that still works). `"button": true` also puts the link in its section's text
  card in 3D, as a chip that plays the effect and goes. The compact template shows each.

## 0.30.1 (alpha), 2026-11-20

- **A door's effect no longer waits for frames.** The page jumped at the effect's middle only when a frame was
  drawn, so in a hidden pane a click waited and the next replaced it. The jump now has its own timer, a click
  during an effect that still plays is ignored, and a hidden page jumps at once. (Found on a site.)

## 0.30.0 (alpha), 2026-11-20

- **A story that moves between homes** (transitions, step D): a beat can name the home it shows (`home`). Scrolling
  from one home's beat to another's plays the link's effect for that step, or a fade, and the homes swap at its
  strongest, unseen; one home is drawn at a time. Every home the story shows is built and warmed ahead, so the
  scroll never waits (a test across two homes: no gap between frames over 22 ms). `onHome(id, 'story')` at each
  swap. On the page without 3D each section shows its own home's still (`sectionHomes` for beats in code).

## 0.29.0 (alpha), 2026-11-20

- **`fromHome` on a link**: on a page that shows more than one home, a link works in 3D only while its home is on
  show, and gets a card only on a page that shows that home. **`onHome(id, why)`** says why a home went on show
  (`'start'`, `'switch'`, `'link'`, `'rebuild'`), so a site's own home switch can follow a door and ignore the
  start. The guide says a door must be in the open part of its stage. (From a site's first links.)

## 0.28.0 (alpha), 2026-11-20

- **Routes and fly-throughs** (transitions, step C): a link between two neighbouring beats can give `via` points
  the camera passes through on the way, and `"look": "path"` to look ahead along them. An effect can bring
  objects that exist only while it plays, along the route (`objects`), and the built-in `tunnel` is a glowing tube
  to fly through. With reduced motion the camera goes straight and a fade plays. `scene.effect` names what plays.
  When several links join the same two beats, scrolling plays the first with an effect.

## 0.27.0 (alpha), 2026-11-20

- **Effects on the way along a link** (transitions, step B): a link's `effect` plays `fade`, `zoom`, `vortex`, a
  plain `cut`, or a site's own (`startScene({ effects })`). Between two neighbouring beats it follows the scroll,
  and plays backwards scrolling back; a door plays it over 0.9 s and the page jumps at its strongest. Reduced
  motion and the lowest quality play a fade. The frame is drawn as always and copied into a texture that one
  shader draws back, so an effect at nothing changes no pixel; nothing extra runs when no effect plays.
  `scene.snapshotEffect()` and `scene.effect` for tests and tools. The compact template's chart door zooms.

## 0.26.0 (alpha), 2026-11-20

- **Links between sections and homes** (`transitions`, the first step of transitions): one list, in the home file
  or in code, read by both pages. On the page without 3D a labelled link is a card in its section, with the still
  of the section it leads to (from another home too: `popfold stills` captures every home a link leads to). In 3D
  a link's piece takes it: a piece with a story gets the link on its card, one without is a door a click follows.
  `?home=<id>` opens a page on that home. `popfold check` names links to sections, pieces or homes that do not
  exist. Effects on the way are the next step. The compact template has three links.

## 0.25.0 (alpha), 2026-11-20

- **A Studio link in the debug panel**: *Studio ↗* opens the site's studio in a new tab on the same home, story
  stop and light. It links to `studio.html` beside the page, shows only when that page exists, and a site points
  it elsewhere with `startScene({ debugStudio })` or leaves it out with `debugStudio: false`.

## 0.24.1 (alpha), 2026-11-20

- **A page open during a deploy recovers its 3D.** A deploy removes the previous build's files, so a page left
  open (or cached) across one asked for a file that was gone and never started its 3D. Each story page now
  reloads itself once when one of the site's own files fails to load (another site's file, such as a blocked
  analytics script, does not count), and not again for 30 seconds, so a page whose files stay missing keeps the
  page without 3D instead of looping.

## 0.24.0 (alpha), 2026-11-20

- **A tower kept in a home file can keep code per floor**: `homeFromFile(json, { tower: { build: { <floor id>:
  (ctx) => … } } })` runs after the floor's listed pieces, for pipes and a moved port. A build for a floor the file
  does not have is a mistake, named.

## 0.23.1 (alpha), 2026-11-20

- **The studio says when a lamp's glow is not the story's.** In evening light the engine keeps the lamp at full
  glow, so the *Lamp glow* slider is disabled and labelled there, and *Use for* leaves glow out of the beat.

## 0.23.0 (alpha), 2026-11-20

- **The page without 3D is built from a parsed page.** `popfoldFallback` reads each story page with parse5 to find
  its sections, headings, cards and head, then adds its stills, stories and head tags at those places; the rest of
  the page is left exactly as written. Nested sections, single-quoted or reordered attributes and a page without a
  written `<head>` no longer trip it. The built pages and `llms.txt` of both templates and two sites came out
  the same as before. (New dependency: `parse5`.) `readPage(html)` is exported for tools.
- **`popfold check` checks credits**: a model in `public/models/` that `CREDITS.md` does not name (by path, file
  name or a folder below `public/models/`) is a warning, and so is a site with models and no `CREDITS.md`.
- **A linter**: `pnpm lint` (Biome, lint rules only; CI runs it). **Browser tests** for the `popfold` command:
  `pnpm test:browser` runs check, describe, shot and mcp on the compact template.

## 0.22.0 (alpha), 2026-11-20

- **Shells as plug-ins.** A `Shell` (`shell.ts`) builds a home and moves its own parts each frame
  (`house.update(cur, frame)`); the engine no longer knows about lids, drawers, walls or floors, and the diorama
  and tower no longer carry a stand-in lid and drawers. The studio takes its sliders, camera presets and fold
  styles from the shell, and the rooms a piece can be added to. `registerShell()` adds a site's own shell, which a
  recipe claims or names (`shell: 'name'`). The compact, diorama and tower are `compactShell`, `dioramaShell` and
  `towerShell`. A home's lamp is now `house.lamp` (optional); the `Compact` type extends `House`.

## 0.21.0 (alpha), 2026-11-20

- **One command list for every edit to a home file**: `place`, `add`, `remove`, `story`, `camera`, `beat`,
  `look`, `places`. The studio sends them; `GET /__popfold/commands` lists them with their arguments, and
  `POST /__popfold/home/<id>` takes `{ commands }`, `{ undo: true }` or `{ redo: true }`. The dev server keeps
  each home file's saves, so Ctrl+Z in the studio steps back through saves once nothing unsaved is left.
- **`popfold mcp`**: an MCP server (stdio) whose tools are that command list, plus `read_home`, `undo`, `redo`,
  `check`, `describe` and `shot` (a picture). An agent's edit reloads open pages; the studio's own do not.

## 0.20.0 (alpha), 2026-11-20

- **The studio edits more of a home, without reloading.** A *Look* group sets a compact's colours, surfaces
  (plain or patterned) and lid title, and a tower's floor colours and signs. A listed piece's *Kind* can be
  swapped. Every beat gets *Side on wide screens* and *Float while closed* sliders. Adding, removing, a story, a
  kind or a look change now rebuilds the home in place (`scene.rebuildHome(recipe)`, and `recipe.remake(json)`
  from `homeFromFile()`), keeping the view and selection; the save endpoint hands the file back and stops Vite
  reloading the studio for its own write. `GET /__popfold/home/<id>` reads the file.

## 0.19.0 (alpha), 2026-11-20

- **A diorama in a home file.** A home file can describe a diorama (`"diorama"`: its room model, scale, zones and
  lamp); the art and cover stay in code, passed to `homeFromFile(json, { diorama: { art, cover } })`. Stories of
  the model's parts are kept by key under `"stories"`, and the studio's story editor writes them there.
- **No layout file for a home made from its file.** Where the studio moves, turns, resizes or hides a piece the
  file does not list is saved in the file, under `"places"`. `public/layouts/` remains only for homes made in code.
- **The story card's close button is centred in every font.** Its cross is drawn instead of typed (a site's
  own fix for this can go).

## 0.18.0 (alpha), 2026-11-20

- **The warm-up builds only what is shown.** three.js compiles every mesh under the root, hidden or not, so
  pieces that never appear cost shader programs nobody used. The warm-up, a late model and a home being
  switched to now compile only visible meshes: 48 programs down to 29 on a larger site, 22 to 18 on the compact
  template, 19 to 19 on the tower, and in each case none built later during the first pass.

## 0.17.0 (alpha), 2026-11-20

- **`startScene({ onScene })`.** Called with the scene before the warm-up starts, so a site's own lights and
  objects are in place when the warm-up builds its materials. With `warmUp: 'wait'` a light added after
  `startScene()` resolved used to undo the warm-up (a 362 ms frame on the compact template); added in
  `onScene` it costs nothing. The background warm-up also waits a tick, so code right after
  `await startScene()` runs before it begins.

## 0.16.0 (alpha), 2026-11-20

- **The warm-up now covers the shadow pass.** Building materials in the background missed the shaders that draw
  shadows, which a browser only builds on a real draw; a site with many shadow casters still stalled once or
  twice. Each beat is now also drawn once, unseen (the true view is drawn over it before the browser shows
  anything). On a site with two homes and 34 pieces: no warm-up, slowest first-pass frame 793 ms; this warm-up,
  3 ms, with the page appearing at the same time.

- **Forge: Hyper3D Rodin through its MCP server.** `tools/forge/README.md` says how to add and sign in to it, its
  tools and what they cost. It bills the signed-in workspace, so it works on a Creator plan, where `rodin.py`'s
  REST API needs Business.

## 0.15.0 (alpha), 2026-11-20

- **A Debug button beside *Simple view*.** `viewToggle()` adds a small button that shows and hides the debug
  panel. `viewToggle({ debug: false })` leaves it out; a site that switched the panel off has no button either.
  `toggleDebug()` does the same from a site's own control.

- **More warm-up.** A model that arrives late is warmed as it lands, and a home is warmed before `setHome()`
  swaps it in (in a test with two homes, the slowest frame after a switch was 37 ms and the new home's first
  pass 5 ms). `warmUp: 'wait'` holds `startScene()` until the warm-up is over, for a site with a loader. The
  debug panel has a *warm-up* row.

## 0.14.0 (alpha), 2026-11-20

- **A smooth first scroll.** The story used to stall the first time each room opened, while the browser built
  the materials it was about to draw. Two fixes:
  - the compact's lamp light is no longer inside the lamp, which is hidden until its room opens. A light
    appearing changes the number of lights, and every material is then built again;
  - **warm-up** (`warmUp`, on by default on a site): once the home is on show, the engine has the browser build
    each beat's materials in the background, without drawing them. `scene.warmed` settles when it is done.
  On the compact template the slowest frame of a first pass went from 1,222 ms to 14 ms, and on the tower from
  252 ms to 27 ms, with the page appearing no later than before.

- **A budget for models.** `popfoldFallback({ modelBudget: { each, total } })`, in kilobytes: a build over it
  stops and lists the files, and `popfold check` reports the same.

- `startScene({ onHome })` is called with a home's id when it goes on show: at the start, and after each switch.
- A piece's `opts` may hold lists of plain values (a shelf's items), not only single ones.

## 0.13.0 (alpha), 2026-11-20

- **Forge: `rodin.py`** sends pictures or a prompt to Hyper3D Rodin (paid, hosted) and downloads the textured
  model. Its API needs a Business or Enterprise plan. Settings: `rodin.key_file` and `rodin.tier` in `forge.json`.

- **`popfoldFallback({ homeFile: 'src/home.json' })`**: the page without 3D reads the home file from disk when it
  needs it, and names the stills after the file's id. A site's `vite.config.ts` no longer imports the file, so
  the dev server keeps running when the studio saves; before, every save restarted it.

- Docs: what to know about a model's `ready` (it runs once per build; clone the clip before changing it).

## 0.12.0 (alpha), 2026-11-20

- **`models`: what a site says about a model file.** A listed piece whose kind is a model can now glow
  (`glow`), keep its animation still for the site to drive (`loop: false`), and be finished in code once it is
  built (`ready(piece, { clip, spec, ctx })`, which may return the lamp's `{ group, bulb }`). Such a model is
  still a model, so it still loads in stages; before, each of these needed a code kind, which loaded up front.
- `popfold describe` covers every home a studio has, not only the homes a page shows (`--home <id>` for one), and
  `popfold check` checks their stories and models too.
- Fixed: `popfold describe` counted a piece's story dot in its size, so a size could differ between two runs
  with nothing moved.

- **Undo and redo in the studio**: Ctrl+Z and Ctrl+Shift+Z (and two buttons) step back and forward through
  unsaved changes to pieces: moves, turns, sizes, hiding.

- **Staged loading for towers too.** `lazyModels` now covers a tower whose pieces are all listed: its first
  floors' models come first. In the same test as for the compact, 1.3 s against 5.3 s.
- A piece whose model arrives after its room has opened springs in, where it used to appear at once.

## 0.11.0 (alpha), 2026-11-20

- **Models can load in stages.** `startScene({ lazyModels: true })` shows the home as soon as the models of its
  first rooms are in; each later model brings its pieces in when it arrives. It applies to a compact whose
  pieces are all listed in its home file. With two side-room models held back four seconds, the home was on
  screen in 1.3 s, where it took 5.4 s waiting for all of them.

- **A compact's look is data.** `home.json` can hold `look` (the case's colours, and each floor and wall as a
  colour or a pattern: checker, stripes, dots, waves, terrazzo), `emblem` and `swatch`. `readHome()` checks them.
- **`homeFromFile(json, { kinds })`** makes a home and its story from its file in one call. Both templates use
  it: their `home.ts` now holds only how each kind of piece is built. A look written in code still works.

## 0.10.0 (alpha), 2026-11-20

- Fixed: the first still of a tower differed slightly from one capture to the next, so `popfold stills --check`
  failed about one time in three on an unchanged site. The capture now starts from the first beat at rest. A
  tower's first still changes once when it is next captured.

- **The studio sets what a beat does.** With *Manual* on in the Fold group, **Use for "<beat>"** writes the
  sliders (how far each room or floor is open, the glow, the badges) into that beat in `home.json`.
- **The studio writes stories.** Select a listed piece, open *Story*, and write its title, text and tags; it is
  saved into the piece's entry in `home.json`, which is also what the page without 3D shows.
- **The studio adds and removes pieces.** With a home file, *Add a piece* puts a piece of any of the home's kinds
  into a room, and *Remove…* takes a listed piece off the list; both are written into `home.json`.
- **Hiding a listed piece is saved in the home file** (`"hidden": true`), not in the layout file. A layout file
  now holds only pieces placed in code.

## 0.9.0 (alpha), 2026-11-20

- **A debug panel on every page.** `?debug` in the address, or Alt+Shift+D, opens a panel with what build this is
  (the site's commit, when it was built, the versions of the site, Popfold and three.js) and how the page is
  running (the home and beat, models fetched, frames drawn, draw calls, triangles, the graphics card). It works
  on the page without 3D and on a deployed site, and its code is fetched only when it is opened. On by default:
  `startScene({ debug: false })` and `markFallback({ debug: false })` take it away, and `debugRows` adds rows
  of the site's own.

- **The story is in the home file.** `home.json` can hold `beats`: one per page section, each with its camera and
  what the home does there. `beatsOf(home)` turns them into what `startScene()` and `mountStudio()` take, and
  `readHome()` checks them. Both templates keep their story there; `src/beats.ts` is gone from them. Beats
  written in code with `beat()` still work.
- **The studio sets a beat's camera.** In *Free orbit*, **Use for "<beat>"** writes the view into that beat in the
  home file and returns to the story camera.

- **The studio saves into the home file.** With `layoutSaver({ home: 'src/home.json' })`, *Save layout* writes a
  moved, turned or resized listed piece back into `home.json`, changing only that piece's line. Pieces placed
  in code, and which pieces are hidden, still go to `public/layouts/`. A site that does not name a home file
  saves as before.
- A listed piece can have a `scale`.

## 0.8.2 (alpha), 2026-11-20

- Fixed: `popfold optimize` merged materials that were the same but for their names. A site that paints art or
  swaps colours by material name then got one picture on every poster. Materials and meshes with different
  names now stay apart, and the command refuses a model if any part would end up on a different material.
  **If you optimised models with 0.8.0 or 0.8.1, restore the originals from git and run it again.**

## 0.8.1 (alpha), 2026-11-20

- Fixed: `popfold describe` gave different places and sizes each time it ran, by up to 20 cm for pieces on a
  diorama's folding walls, because it measured whatever frame the page was on. It now measures a settled scene,
  so two runs can be compared.
- Fixed: `popfold optimize` in a site with no `public/models` folder stopped with an error. It now says there is
  nothing to do.

## 0.8.0 (alpha), 2026-11-20

- **`popfold optimize`** makes a site's models smaller without changing how they look: usually 40 to 65%. It
  removes duplicate data, packs geometry with meshopt and saves textures as WebP, and leaves every position and
  every node where it was, which Popfold depends on. Run it in a site, then `popfold stills --check`.
- The engine loads meshopt-compressed models with WebP textures.
- Popfold's own case models are optimised: 495 KB each before, 224 KB now. Nothing looks different.
- `popfold check` warns when a site ships models that are not compressed.

## 0.7.0 (alpha), 2026-11-20

- Fixed: the gold rim of the modelled case flickered between gold and the base colour along the floor's edge,
  most visibly on the `'crisp'` case. The rim's top face lay in the same plane as the base's; it now sits a
  hair above it. Both case models are rebuilt.
- **The home is a JSON file.** The templates keep what is in a home (its id and name, a tower's floors, the
  pieces and their stories) in `src/home.json`, with a JSON Schema (`schema/home.schema.json`) that editors
  check as you type. `readHome(json)` checks the file when the site loads and names every mistake in it, with the
  piece it is in. `home.ts` keeps only code: the look and how each kind of piece is built. Lists written in
  TypeScript still work.
- **The studio shows the camera.** In *Free orbit*, the panel gives the camera's position and the point it looks
  at, and *Copy for a beat* copies them as the two arrays a beat takes. No browser console needed.
- **A tower template**, `templates/tower`: a studio in a four-floor building, six sections, no model files.
  `popfold init <folder> --template tower` starts a site from it.
- **A tower lists its pieces as data too.** The same `recipe.pieces` and `recipe.kinds` as a compact; a piece's
  `room` is its floor's id, and a kind is told which floor it is building for (`ctx.color`). Pieces on a floor's
  back wall are keyed `<floor>-wall/<id>`. A floor's `build()` is now optional and runs after its listed pieces.
- `mountStudio({ mood: 'evening' })`: the studio opens, and captures the stills, in the time of day the site
  shows its home in.
- The README that `popfold init` writes takes its table of files from the template it copied.

## 0.6.0 (alpha), 2026-11-20

- **A skill for AI agents**, `skills/popfold-site/SKILL.md`: the order of work for making or changing a site,
  how to build a piece, and how to check and look at the result.
- `popfold init`: a failed run removes what it made, so it can be run again; `--from` accepts a folder on this
  machine. `popfold check` warns about stills of a home no page shows. `popfold shot --out` makes the folder it
  is given.
- **A compact home can list its pieces as data.** `recipe.pieces` is a list of `{ id, room, kind, at, … }` and
  `recipe.kinds` says how to build each kind (a kind that names a model file in `props` needs no entry). Every
  listed piece has the key `<room>/<id>`. `furnish()` is now optional and runs after the list. The template is
  written this way; its keys and its stills are unchanged.
- **A listed piece carries its own story** (`story: { title, text, tags }`), so a story can no longer point at a
  piece that is not there. `popfoldFallback({ pieces })` writes those stories into the page without 3D;
  `stories` by key still works, for pieces placed in code. The template's `stories.ts` is now `pieces.ts`: the
  pieces, where they stand and their stories in one plain-data file.
- The `popfold` command says at once why a home could not be built (a mistyped kind, say). It used to wait two
  minutes and report a timeout.
- CI opens the template in a browser and runs `popfold check` on it. `POPFOLD_GPU=off` makes the command draw in
  software, as a machine without a GPU does.
- Fixed: the README that `popfold init` writes named `src/keyframes.ts`, which is `src/beats.ts` since 0.5.0.
- **Pieces can have an id of their own.** `piece(obj, 'reading-lamp')` makes the piece's key `<room>/reading-lamp`
  whatever is added or removed around it, so its story and its layout entry stay on it. A diorama piece takes its
  id from a custom property `id` in the model. Pieces without an id keep their generated keys. `popfold check`
  warns when a story or a layout entry hangs on a numbered piece, and fails when two pieces in a room share an
  id; `popfold describe` lists each piece's `id` and whether a layout `moved` it.

## 0.5.0 (alpha), 2026-11-20

- **Stories can be reached without a mouse in 3D mode.** The written-out stories are no longer removed when 3D
  starts: a screen reader reads them under their section, and the Tab key reaches each one and brings its
  section's list into view. The *Simple view* button now comes first in the page, not last.
- **The scene draws less when little is happening** (`quality: 'auto'`, the default on a site). While the story is
  at rest it draws every other frame, and goes back to full rate the moment the page scrolls or the pointer
  moves. On a device that cannot keep up it steps the picture down (fewer pixels, then a smaller shadow map); each
  step is undone if it does not help. `quality: 'high'` switches this off, and the studio always uses it.
- **The story is one list of beats.** `startScene({ beats })` and `mountStudio({ beats })` replace `keyframes` and
  `stopNames`. A beat is `beat('section-id', 'Name', values, camera, lookAt, zones?)`: the section it belongs
  to, the name the studio shows, and the keyframe. `popfold check` compares the beats with the page's sections
  by id and names the one that is missing or out of order. To move a site over: wrap each `keyframe(…)` in
  `beat(id, name, …)`, pass `beats`, and drop the stop names.
- **`scrollStage()`** in `popfold/fallback` gives `getStage` from the scroll position, replacing fifteen lines
  every site's `main.ts` carried.
- **Three commands for seeing and checking a site without opening a browser**, made for agents and useful to
  people:
  - `popfold check` looks for the mistakes that fail silently: sections, keyframes and stop names that do not
    line up, a story or a layout entry that matches no piece (with the key it probably meant), a story whose
    section the page does not have, a model that did not load, missing stills, heavy models. It exits 1 on an
    error; `--json` prints the list as data.
  - `popfold describe [--home id]` prints every home as JSON: each piece with its key, room, place, size and
    story. `scene.describe()` returns the same for one home.
  - `popfold shot [--home id] [--stage n] [--cam name] [--light evening] [--out file.png]` saves a picture of
    any view, not only the story stops.
- **`popfold init <folder>`** starts a new site: its own git repository, Popfold inside it as a submodule on the
  newest release, and the compact template from that same release as its first pages. `--name`, `--port` and
  `--ref` choose the package name, the dev port and the Popfold release.
- **Enter or Space on a focused story opens its card in 3D**, beside its piece, and closing the card gives the
  keyboard focus back to the story. The written stories carry their key as `data-pf-story`.
- **A build now fails when a story has no section to go under** (it was a warning that was easy to miss). The
  message names the stories and the missing section. The dev server still only warns.
- Unit tests for piece keys and layouts.

- `pnpm test` names its test files with a pattern, so it also runs on Linux (it failed in CI on 0.4.0).

## 0.4.0 (alpha), 2026-11-20

- **Several story pages in one site.** `popfoldFallback({ pages: [{ html, stories, sections, stillsHome }, …] })`.
  Each page gets its own stories and stills (paths work from a sub-folder), `llms.txt` and the sitemap cover every
  page, and `popfold stills` captures each page's home from that page's own studio. A site with one page changes
  nothing.
- **`scene.dispose()`** stops a scene for good: its loop, its listeners and its GPU memory.
- **No more three.js deprecation warnings** (the clock, the shadow type, the iridescence range). No visual change.
- **Unit tests** (`pnpm test`) for the story blending, the story-link rule and the page writer; CI runs them.
- **Template:** `vite.config.ts` imports the stories with their file extension, which Vite's next config loader
  needs. Sites copied from it: do the same and add `"allowImportingTsExtensions": true` to `tsconfig.json`.

## 0.3.0 (alpha), 2026-11-19

**Sites have to act on this release.**

- **The compact's case is part of a home's look.** `look.shell` is `'round'` (the default, as before), `'crisp'`
  (a new modelled shell with nearly square edges), `'code'` (simple shapes) or `{ url }` (your own model).
  `look.corner`, from 0 to 1, sets how round the code-built case is. The scene option `shellUrl` is gone: use
  `look.shell: 'code'` where you passed `shellUrl: null`, and `look.shell: { url }` where you passed a url.
- **No heart unless a home asks.** `emblem: { heart: true }` puts the heart on the lid; the default is none.
- **`tools/blender/build_compact.py`** takes `--corner`, `--no-heart` and `--out`, so a site can build its own shell.

## 0.2.1 (alpha), 2026-11-19

- **Story links can point within the site** (`docs/guide`, `./tour/`, `#contact`); they open in the same tab.
  `http`, `https` and `mailto` links still open in a new one. Anything else (`javascript:`, `data:`, `//host`) is
  dropped, as before.

## 0.2.0 (alpha), 2026-11-19

**Sites have to act on this release.** Popfold no longer carries one site's colours. Defaults are neutral, and a
site that wants its own look sets it:

- **Story card:** its colours and fonts are CSS variables on `:root` (`--pf-card-bg`, `--pf-card-ink`,
  `--pf-card-accent`, `--pf-card-tag`, `--pf-card-focus`, `--pf-card-font`, `--pf-card-display`). Default: white
  card, ink outline, yellow accents.
- **Story dots:** `startScene({ storyDot })` and `mountStudio({ storyDot })`. Default: blue.
- **Step badges:** `look.badges` and `look.badgeRing`. The default ring is ink, not wine.
- **The heart:** `emblem: { heart: false }` now also hides the raised heart on the shell model.
- **Studio:** a neutral theme; `mountStudio({ theme })` restyles it. The default backdrop is Paper, and the pink
  one is called Blush (`?bg=blush`).
- **Template:** a neutral favicon.
- **`base` option** on `startScene()` and `mountStudio()`: where the site's models, layouts and art are, as seen
  from the page. A page in a sub-folder passes `'../'`. The studio's save endpoints no longer depend on it.
- **`pnpm release`** dates a release by the local calendar, not UTC.
- **Stills:** the capture waits for the page's pictures to finish loading, so a cold first run matches later ones.

- **Template: the scene no longer runs a section behind the text.** `templates/compact/src/main.ts` measured the
  sections only at start, on `resize` and on `load`. When 3D starts the written-out stories are hidden, so a
  section that was taller than the window shrinks and the stored positions go stale; late web fonts do the same.
  It now measures again whenever `<main>` changes height. **Sites copied from the template:** add the same line
  to your own `src/main.ts`, after the `resize` and `load` listeners:
  `new ResizeObserver(measure).observe(document.getElementById('main') as HTMLElement);`

## 0.1.3 (alpha), 2026-11-20

- **Docs:** how to change the engine from a site's own `popfold/` copy, on a branch, so several sessions can work
  from different sites at once (`docs/releasing.md`, `AGENTS.md`).
- **`pnpm release`** fetches first and refuses to run when `main` is behind `origin/main`.

## 0.1.2 (alpha), 2026-11-20

- **Repeatable stills.** The scene has `hold(on)` and `step(n)`: holding stops its own clock and puts every moving
  part back to its starting pose. The studio holds before each still, so the same scene gives the same picture.
  Light pipes start at a fixed phase instead of a random one.
- **`popfold stills` rewrites only the stills that changed** (more than 0.02% of pixels), and lists them. Git
  stays quiet when nothing changed.
- **`popfold stills --check`** captures and compares without changing a file, and fails if any still differs.
- **Sites:** the first capture after this release rewrites most stills once, because the old ones were taken at
  an arbitrary moment. Commit them; after that only real changes show up.

## 0.1.1 (alpha), 2026-11-20

- **`popfold update [tag]`:** in a site, moves the `popfold/` submodule to a release (the newest by default), then
  installs, typechecks and builds to prove the site still works. Nothing is committed for you.
- **`pnpm release <version>`:** cuts a Popfold release locally: changelog, versions, typecheck, build, commit, tag.
- **Docs:** `docs/releasing.md` describes both sides of a release. `TODO.md` holds the backlog.
- **CI:** moved to the current versions of the checkout, Node and pnpm actions.

## 0.1.0 (alpha), 2026-11-19

The first version of Popfold in its own repository. It was grown inside a monorepo next to the first sites built
on it; that history stays there.

- **Engine:** scroll-driven 3D pocket homes with three shells: the compact (or pop-up book), the diorama and the
  tower. Lighting, room names and page-click handling are options of the site.
- **Studio:** a workbench on each site to scrub the story, fold by hand, lay out pieces and capture stills.
- **Page without 3D:** stories, stills, structured data, `llms.txt`, robots and sitemap built into the HTML.
- **Command:** `popfold build` and `popfold stills`, with headless capture.
- **Template:** `templates/compact`, a complete small site to copy.
- **Model tools:** Blender scripts (`tools/blender`) and the AI model pipeline (`tools/forge`).
- **Docs:** a guide, a site walkthrough, model docs and agent docs in `docs/`.
