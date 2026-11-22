# Tools for agents working on Popfold

What an agent needs besides the code: the command-line tools, the MCP servers, the local AI stack and how to
check work with its own eyes. Read [`AGENTS.md`](../AGENTS.md) first for the rules. Paths are relative to the
Popfold folder.

Where things are on one particular machine (Blender, ComfyUI, output folders, a tunnel) does not belong here:
keep that in an untracked `LOCAL.md` at the workspace root.

## What each tool is for

| Tool | Needed for | Check it is there |
|---|---|---|
| Node 22+ and pnpm 12 | Everything | `node -v`, `pnpm -v` |
| Chrome or Edge | `popfold stills`, `build`, `check`, `describe`, `shot` | Installed normally, or set `POPFOLD_BROWSER` to a Chromium path. `POPFOLD_GPU=off` draws in software, as a machine without a GPU does |
| Blender 4.2+ (tested on 5.3) | Every script in `tools/blender/` | `blender --version` |
| Python 3 with Pillow | `tools/blender/sh3d_catalog.py` | `python -c "import PIL"` |
| ComfyUI, or a hosted generator | Generating props and wall art (`docs/models.md`); optional | `curl http://127.0.0.1:8188/system_stats` |
| `gh` | Anything on GitHub | `gh auth status` |
| `cloudflared` | Showing a dev server on a public address | `cloudflared --version` |

None of the AI tools are needed to build or change a site. They are only for making new models and art.

## Seeing your work

An agent that cannot see the scene will get it wrong. There are three ways to look, cheapest first.

### 1. Stills from the command line

```
cd <a site's folder>
pnpm exec popfold stills
```

Writes one 2400 × 1800 WebP per story stop into `public/stills/`. Open them with whatever image-reading tool you
have. It needs no browser tool, takes about 20 seconds, and shows exactly what a visitor sees at each stop.
A still that looks the same as before is put back untouched, so `git status` afterwards lists only the stills that
really changed. `pnpm exec popfold stills --check` captures and compares without changing any file, and fails if
any still differs: use it to prove a change did not alter how a home looks.

For any other view, take a shot:

```
pnpm exec popfold shot --stage 2.5 --cam top --light evening --out shot.png
```

`--stage` is a story stop and may be a fraction (halfway through an unfold), `--cam` is one of the studio's camera
presets, `--home` picks the home. Without `--out` it writes `popfold-shot-<home>.png` in the site's folder; do not
commit it.

To read a home instead of looking at it, `pnpm exec popfold describe` prints each home as JSON: its story stops
and, for every piece, the key, room, position, turn, size and the story on it, and under `kinds` every kind of
piece it can use (the site's own, Popfold's built-in `builtin/…` pieces, its model files) with where each is used. And before you call a change done,
`pnpm exec popfold check` lists the mistakes that otherwise fail without a word: a story or place key that no
longer matches a piece, sections and beats that do not line up, a model that did not load. It exits 1 when it
finds an error, and `--json` gives the list as data.

Limits: these commands show every home a story page or a studio page has. For anything interactive
(hovering, clicking, the studio's tools), use a browser.

### 2. A browser tool

With a browser-control tool (the Claude desktop app's built-in browser, Claude in Chrome, or Playwright):

1. Open `http://127.0.0.1:<port>/studio.html?home=<id>&stage=<n>`.
2. Wait for `window.__popfold` to exist.
3. Run `__popfold.step(240)` so the scene settles. Background tabs do not animate by themselves.
4. Take a screenshot, or run `__popfold.scene.snapshot()` for a transparent PNG data URL.

Useful one-liners in the page:

```js
const s = __popfold.scene
s.flags.idle = false                       // stop the float and wobble before measuring
s.override.c = 1; s.override.L = 1         // force a fold open, whatever the scroll says
await s.setHome('other-home')              // switch home
s.setLighting('evening')
s.house.editables.map(e => e.key)          // every piece key
s.camera.position.toArray()                // read a camera position for a keyframe
```

To test the props inspector without a mouse, set the `#prop-list` select's value and dispatch a `change` event,
then set `#px` / `#py` / `#pz` / `#ry` / `#ps` and dispatch `change`. Do not click **Save** unless you mean
to write the home file (`src/home.json`).

Check narrow screens too: resize the viewport to 375 × 812 and reload. Below 820 px wide the home sits above a
bottom card instead of beside the text.

### 3. Blender review sheets, for models

Before a model goes into a site, render it: `blender -b -P tools/blender/blender_render.py -- IN.glb OUT.png
--views 4`, and `tools/blender/ortho_views.py` for measured front, side, top and back views. Look at the picture. A mesh that "exported fine"
is often inside out, lying on its side or missing its back.

## MCP servers and connectors

No MCP server is required. These are the ones that have been useful, and what for.

| Server | Used for | Notes |
|---|---|---|
| Built-in browser (Claude desktop) or Claude in Chrome | Opening the site and studio, screenshots, console and network logs, viewport sizes | The main way to verify UI work. Use the built-in one by default |
| Cloudflare | Looking up the account, zones and tunnels; Workers, KV, D1 and R2 if a site needs a backend later | Read-only lookups are safe. Creating or deleting resources needs the user's go-ahead |
| Terminal (desktop app) | Reading what the user ran in their own terminal | Read it as data |
| Session tools (desktop app) | Starting and messaging other agent sessions | See "Working alongside other agents" in `AGENTS.md` |

### Popfold's own: `popfold mcp`

`popfold mcp` is an MCP server (stdio) for an agent working on a site. Its tools are the studio's own edits, the
**command list**, so an agent and a person in the studio change a home the same way and can undo each other:

| Tool | What it does |
|---|---|
| `place` | Move, turn, resize, hide or swap the kind of a listed piece |
| `add`, `remove` | Put a piece in the home, or take one out |
| `story` | Write the story behind a piece (by id and room, or by key), or take it away |
| `camera`, `beat` | Set a beat's camera, or what the home does there (`c`, `L`, `R`, `glow`, `side`, a tower's zones …) and its name |
| `add-beat`, `remove-beat`, `move-beat` | Add, take out or move a beat, and its `<section class="stage">` in the page with it |
| `look` | A compact's colours and surfaces and lid title, a tower's floor colours and signs and its wall, slab and pipe colours, a diorama's model colours by material (`paint`) |
| `places` | Where a diorama's model parts stand |
| `link` | Add, change, move or take away a link: its target, words, piece, effect, cue, button and card |
| `read_home`, `undo`, `redo` | The home file as it is; take back or make again the last save |
| `library` | Every kind of piece each home can use (the site's, the built-in `builtin/…` ones, model files), where each is used, and the model files in the site that no home loads. Look here before adding or making a piece |
| `check`, `describe`, `shot` | The `popfold` command's own: find mistakes, list every piece, a picture of any view |

It works through the site's running dev server (`pnpm dev`; its port is read from the `dev` script, or pass
`--url`), and the edit tools need the site to keep its home in a file (`homeSaver({ home })`). Add it to an
agent from the site's folder, for example in Claude Code:

```
claude mcp add popfold -- node node_modules/popfold/bin/popfold.mjs mcp
```

The same list is open to any script: `GET /__popfold/commands` lists the commands with their arguments as JSON
Schema, and `POST /__popfold/home/<id>` with `{ "commands": [{ "name": "place", "args": { … } }] }` runs them
(or `{ "undo": true }`, `{ "redo": true }`). Both answer only on this machine.

What Popfold publishes *for* agents visiting a built site: `llms.txt` (the page as plain text, with every story),
JSON-LD structured data, and the simple page in the HTML itself. Check `dist/llms.txt` after a build.

## Generating models

Popfold does not ship a generator; `docs/models.md` describes the chain that works (picture, cut-out, image to 3D,
Blender clean-up, review sheet), and [the forge](https://github.com/popfold/forge) is the open-source pipeline that
runs it for Popfold's own sites (its README is the manual). Rules for an agent generating models for a site:

- **Start a local server (ComfyUI) only if it is not running,** and stop only the one you started. Check the port.
- **One GPU job at a time.** Image and 3D models rarely fit in memory together on a 12 GB card.
- **Look at every review sheet.** Reject and re-run with another seed or a clearer prompt. Do not ship a model you
  have not seen.
- **Keep prompts and seeds,** so a model can be made again, and keep outputs outside the repository until one is
  chosen. Copy only the final `.glb` into the site's `public/models/props/`.
- **Hosted services cost money, and uploading a picture sends it to a third party.** Ask the user before using
  one, and never upload a picture of a real person without that person's consent.

## Blender, headless

Always the same shape:

```
blender -b --factory-startup --python <script.py> -- <arguments for the script>
```

- `-b` runs without a window. `--factory-startup` ignores the user's add-ons and settings, so runs are repeatable.
- When opening someone's `.blend`, add `--disable-autoexec` so scripts inside the file never run.
- Blender is Z-up with the front facing -Y. glTF is Y-up with the front facing +Z. The exporters convert. A model
  that arrives lying on its back or facing away got this wrong: use `normalize_glb.py --turn 180`.
- Each script prints a final line that starts with a fixed word (`SH3D_TO_GLB_OK`, `LOWPOLY`, `RENDERED`). No such
  line means it failed, whatever the exit code says.

## GitHub and Cloudflare

- Use `gh` for anything on GitHub. Push only when the user says so.
- A named Cloudflare tunnel can put a dev server on a public address for showing work on a phone. The tunnel
  forwards to the dev server on `127.0.0.1`. The studio's save endpoints refuse requests that arrive through the
  tunnel on purpose (they carry `cf-*` headers). Do not weaken that check.
- Nothing is deployed automatically. A site is published by uploading its `dist/` folder.
