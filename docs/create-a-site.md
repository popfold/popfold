# Create your own Popfold site

> **Alpha.** Formats and commands still change between releases.

This walks through a new site from nothing to a built `dist/`. It is written for a person or an agent. Read
[guide.md](guide.md) first for the words used here. Paths are relative to the Popfold folder.

## 1. Decide the story before the 3D

Popfold is a story with one beat per screen. Write the beats down first:

| # | Section id | What the visitor reads | What the home does |
|---|---|---|---|
| 0 | `top` | The promise | Closed, floating |
| 1 | `approach` | How you think | Opens, the first room fills in |
| 2 | `services` | What you do | The second room |
| 3 | `build` | Proof | The third room |
| 4 | `process` | The steps | Everything open, pulled back |
| 5 | `contact` | The ask | Closes again |

Five to nine beats works well. Then pick the shell that fits:

- **Compact**: three rooms of about equal weight. Friendly, toy-like. Needs no modelling. Start here.
- **Diorama**: you have (or will model) one real room. Three zones inside it.
- **Tower**: many beats in a line, such as a career, a product stack or a process. One floor per beat.

## 2. Copy the template

`templates/compact` is a complete small site: an office in a box, six sections, no model files.
`templates/tower` is another, for a long story told top to bottom: a studio in a four-floor building.
`templates/diorama` is a third: one modelled room whose walls unfold, with a lounge, a gallery wall and a desk.
Start from it when your home is a room made in Blender.

`popfold init` makes a new site from it, in a folder of its own:

```
pnpm dlx @popfold/engine init mysite --port 5200        # --template tower, diorama or storybook for the others
cd mysite
pnpm install
pnpm dev
```

The new folder is a git repository with nothing committed yet. Its `package.json` (named after the folder; `--name`
to choose) installs Popfold from npm (`@popfold/engine`, under the name `popfold`) at the newest release (`--ref
<version>` picks another; `--from <folder>` links a checkout on this machine instead, for engine work), and its
files are the template's from that same release. `pnpm install` puts Popfold in
`node_modules/popfold`, with its docs. Updating Popfold later is `pnpm exec popfold update`.

The rest of this page walks through the compact template. The tower template has the same files; its
`README.md` says what differs. For a diorama (a modelled room), run `init --template diorama`; its `README.md`
says how to swap in your own room.

## 3. The files, one by one

### `package.json`

```json
{
  "name": "mysite", "private": true, "version": "0.0.1", "type": "module",
  "scripts": {
    "dev": "vite --port 5200 --strictPort --host 127.0.0.1",
    "typecheck": "tsc --noEmit",
    "build": "tsc --noEmit && vite build",
    "build:static": "tsc --noEmit && popfold build"
  },
  "dependencies": { "popfold": "workspace:*", "three": "^0.187.0" },
  "devDependencies": { "@types/node": "^22.20.5", "@types/three": "^0.187.0", "typescript": "^7.0.2", "vite": "^8.3.8" }
}
```

### `index.html`

The parts Popfold relies on:

```html
<body>
  <div class="bg" aria-hidden="true"></div>
  <canvas id="scene" aria-hidden="true"></canvas>
  <main id="main">
    <section class="stage" id="top" data-text="left">
      <div class="card">
        <h1>One line that says what you do.</h1>
        <p>Two sentences.</p>
      </div>
    </section>
    <!-- one <section class="stage" id="…"> per beat, in story order -->
  </main>
  <script type="module" src="./src/main.ts"></script>
</body>
```

Rules:

- Every beat is a `<section class="stage">` with a unique `id`.
- The sections sit in `<main id="main">`. `main.ts` watches that element to know when the page's height changes.
- Each section has an `<h1>` or `<h2>`. The simple page and `llms.txt` use it as the section's title.
- The copy sits in one wrapper (`<div class="card">` or `<article>`). Stories are written in before its closing tag.
- `data-text="left|right|center"` says where the text card sits. Set the keyframe's `side` to the opposite
  (`data-text="left"` goes with `side: 1`).
- The canvas is fixed behind the page:
  `#scene { position: fixed; inset: 0; width: 100vw; height: 100lvh; z-index: -1; }`
- A click on the empty part of a `.stage` section reaches the home. A click on anything else (your card, your
  header) does not. Change that with the `isOverUi` option if your page is built differently.

### `src/home.ts`: the code a home needs

The home itself is data, in `src/home.json` (next). This file adds the one thing data cannot hold: how each kind
of piece is built.

```ts
import { P, homeFromFile } from 'popfold';
import json from './home.json';

export const { recipe: HOME, beats: BEATS, transitions: LINKS } = homeFromFile(json, {
  // how to build each kind the file names (a kind that is a model file in `props` needs no entry here)
  kinds: { sofa: () => P.sofa(), 'coffee-table': () => P.coffeeTable(), plant: () => P.plant(), bed: () => P.bed() },
  // props: ['lamp'],   // model files, if the home has any: public/models/props/<name>.glb
});
```

`homeFromFile()` checks the file and reports a mistake in words, then gives back the home (`recipe`, for
`homes: [HOME]`) and its story (`beats`). A tower's building (wall and slab colours, the pipe beside the lift and
the lift) is in the file, beside its floors: `"tower": { "wall": "#1A1830", "slab": "#24223D", "spine": "#3EE6FF",
"elevator": true }`.

### `src/home.json`

The home as data: its look, its story and what is in it. No code, so `vite.config.ts`, the `popfold` command and the studio can all read
it, and an editor that knows JSON Schema checks it as you type (`$schema` points at Popfold's
`schema/home.schema.json`).

```json
{
  "$schema": "../node_modules/popfold/schema/home.schema.json",
  "id": "my-home",
  "name": "My home",
  "blurb": "One line for the studio.",
  "look": {
    "base": "#1E2A44",
    "lid": "#1E2A44",
    "heart": "#FF6B4A",
    "leftSlab": "#EFE6D8",
    "rightSlab": "#EFE6D8",
    "centerFloor": { "pattern": "checker", "colors": ["#EFE6D8", "#FBF8F3"], "count": 8 },
    "lidPaper": { "pattern": "stripes", "colors": ["#FBF8F3", "#EFE6D8"], "count": 10 },
    "leftFloor": { "pattern": "dots", "colors": ["#EFE6D8", "#FF6B4A"], "count": 6 },
    "leftWall": "#FBF8F3",
    "rightFloor": { "pattern": "terrazzo", "colors": ["#FBF8F3", "#FF6B4A", "#FFD66B"] },
    "rightWall": { "pattern": "waves", "colors": ["#FBF8F3", "#9CC3E6"], "count": 7 }
  },
  "emblem": { "title": "my", "subtitle": "studio", "heart": false },
  "beats": [
    { "id": "top", "name": "Closed", "camera": [0, 4.4, 11.5], "lookAt": [0, 0.7, 0], "set": { "hero": 1, "side": 1 } },
    { "id": "approach", "name": "Centre room", "camera": [0, 4.6, 11], "lookAt": [0, 1.7, 0], "set": { "c": 1, "glow": 0.8, "side": -1 } },
    { "id": "services", "name": "Left room", "camera": [-2.6, 3.6, 7.2], "lookAt": [-4.1, 1.1, -0.2], "set": { "c": 1, "L": 1, "glow": 0.4, "side": 1 } },
    { "id": "contact", "name": "Folded", "camera": [0, 4.2, 12.5], "lookAt": [0, -1.3, 0], "set": { "hero": 1 } }
  ],
  "pieces": [
    {
      "id": "sofa", "room": "center", "kind": "sofa", "at": [0, -1.3],
      "story": { "title": "Where we start", "text": "Every project begins with a conversation.", "tags": ["Discovery"] }
    },
    { "id": "coffee-table", "room": "center", "kind": "coffee-table", "at": [0, 0.45] },
    { "id": "plant", "room": "left", "kind": "plant", "at": [-1.2, -0.9] },
    { "id": "bed", "room": "right", "kind": "bed", "at": [0, -0.4], "turn": 1.571 }
  ]
}
```

`look` is the compact's case and rooms: five colours (`base`, `lid`, `heart`, and the two side rooms' slabs), and
six surfaces (the three floors and the three walls; `lidPaper` is the centre room's back wall). A surface is a
plain colour or a pattern, `checker`, `stripes`, `dots`, `waves` or `terrazzo`, with its colours and how many
across. `"shell": "crisp"` gives the case square edges. `emblem` is the wordmark on the lid. A tower has no
`look`; its `floors` carry their own colours.

`beats` is the story: one beat per section of the page, in the same order, each with its section's id. `set` says
what the home does there (`c`, `L`, `R`: how far the centre, left and right rooms are open; `glow`; `badges`;
`hero`; `side`), and anything left out is 0. `camera` and `lookAt` are where the camera is and the point it looks
at. Do not guess them: in the studio, scrub to the beat, switch the camera to *Free orbit*, frame the shot and
press **Use for "<beat>"**, which writes both into this file. Without a browser, change the numbers a little at
a time and take a picture after each change with `pnpm exec popfold shot --stage <n>`.

`at` is `[x, z]` on the floor, or `[x, height]` with `"wall": true`. `turn` is in radians: 1.571 is a quarter
turn, 3.142 half. A tower's file also has `"floors"`, and a piece's `room` is a floor's id. Every field is
described in the schema.

Keys: a compact's rooms are `center`, `left` and `right`, with `-wall` for wall pieces
(`center-wall/whiteboard`). Give them your own names in code, `homeFromFile(json, { kinds, rooms: { center:
'studio', … } })`, and the same `rooms` in `popfoldFallback()` (a home file cannot hold them). A
diorama's keys are `<zone>/<piece>`; a tower's are `<floor id>/<piece>`. To see every key a home has, open the
studio's *Props* list.

Keep this file free of 3D code. `vite.config.ts` imports it, and the config must not load the engine.

### `src/main.ts`

Copy it from the template. It is under 40 lines and does four things:

1. calls `scrollStage()` from `popfold/fallback`, which turns the scroll position into a stage number and
   measures the sections again whenever the page changes height;
2. calls `shouldStart3D()`; if no, `markFallback()` and stop;
3. loads `popfold`, the recipe and the beats, and calls `startScene({ canvas, homes, home, beats,
   getStage, reducedMotion, avatar: false, onStory, onPick })`;
4. calls `markReady(canvas)` and `viewToggle()`.

Change the home it imports, and the section ids in `onPick` (a click on the centre, left or right room scrolls to
that section). Add `lighting: { … }` and `storyDot: '#…'` to give the site its own light and dot colour, and pass
the same to the studio. The story card takes its colours from CSS variables (`--pf-card-bg`, `--pf-card-ink`,
`--pf-card-accent`, `--pf-card-tag`) that you set on `:root` in `src/style.css`.

### `studio.html` and `src/studio.ts`

`studio.html` is the same in every site. `src/studio.ts`:

```ts
import { mountStudio } from 'popfold/studio';
import { BEATS, HOME, LINKS } from './home';

mountStudio({
  homes: [HOME], beats: BEATS, transitions: LINKS,
  avatar: false,
  pickStages: { center: 1, left: 2, right: 3 },
  siteUrl: './',
});
```

### `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import { homeSaver, popfoldFallback } from 'popfold/vite';

export default defineConfig({
  base: './',
  plugins: [
    homeSaver({ home: 'src/home.json' }),   // the studio's Save writes moved pieces into the home file
    popfoldFallback({
      siteName: 'My Studio',
      siteUrl: 'https://example.com/',          // optional: enables og:image, canonical and sitemap.xml
      homeFile: 'src/home.json',   // its pieces' stories, and its id for the stills
      sections: { center: 'approach', left: 'services', right: 'build' },   // room or zone -> section id
    }),
  ],
  build: { target: 'es2020', assetsInlineLimit: 0, rollupOptions: { input: { main: 'index.html', studio: 'studio.html' } } },
});
```

## 4. Work in the studio

```
pnpm dev        # then open the address it prints, with /studio.html
```

1. Scrub the story. Fix keyframes until each stop frames its room.
2. Tick *Pick in view*, click pieces, nudge them, **Save**: each moved piece's line in `src/home.json`
   changes. *Add a piece* and *Remove…* put pieces on the list and take them off.
3. Check *Evening* light and the phone width.
4. **Capture stills** (or run `pnpm build:static`, which does it for you).

## 5. Add real models

Replace built-in pieces one at a time with `.glb` files. [models.md](models.md) covers every way to get one.
Add each name to the recipe's `props` and use `gen('name', size) ?? P.something()` so the site still works if a
file is missing.

## 6. Build and check

```
pnpm build:static
```

Check before you call it done:

- [ ] `pnpm exec popfold check` finds nothing wrong (one beat per `.stage` section, in the same order).
- [ ] `pnpm typecheck` passes.
- [ ] `dist/index.html` opened with `?view=simple` shows a still and the stories in every section.
- [ ] `dist/llms.txt` reads like the page.
- [ ] The page works at phone width, and with *reduce motion* switched on in the operating system.
- [ ] Every third-party model is listed in the site's `CREDITS.md` with its creator and licence. `popfold check`
      warns about any model in `public/models/` that `CREDITS.md` does not name by path, file name or folder.
- [ ] No placeholder copy in `[brackets]` is left.

### The visual test

Until 1.0.0, run it on your own machine (it needs a GPU): commit first, since it rewrites the site's stills, then
`node node_modules/popfold/tools/visual-test.mjs --before <a clone at the old commit> --after .`. It captures the stills as they
were and as they are, each side with the Popfold it is pinned to, and lists any that differ; the pairs go to
`../visual-report`.

`popfold init` and `popfold update` also put `.github/workflows/visual.yml` in the site (from
Popfold's `tools/site-ci/`): the same test on a Machine.dev GPU runner. Until 1.0.0 it runs only when started by
hand (`gh workflow run visual.yml`), to check that the workflow itself works. It needs the Machine Provisioner
GitHub App on the organisation, and self-hosted runners allowed for the repository.

## 7. Publish

Upload `dist/` to any static host. Paths are relative, so a sub-folder works. Set `siteUrl` in
`popfoldFallback()` to the real address before the final build, so the share image and sitemap are right.
