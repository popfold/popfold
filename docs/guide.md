# Popfold guide

> **Alpha.** Anything here can change in any commit. Nothing is kept backwards compatible before 1.0.0.

Popfold turns a long web page into a small 3D world that opens as you scroll. Each section of the page is one
beat of a story: a box opens, a room slides out, furniture springs in, the camera moves on. Visitors can click
pieces to read the story behind them. The same page also works with no 3D at all, for old browsers, search
engines and AI agents.

This guide explains how Popfold works and where everything lives. To build a new site step by step, read
[create-a-site.md](create-a-site.md). To make 3D models, read [models.md](models.md).

Paths in these docs are relative to the Popfold folder (in a site, that is `node_modules/popfold`).

## Words we use

| Word | Meaning |
|---|---|
| **Site** | One web page built on Popfold: its copy, its homes, its story and its assets. |
| **Home** | One 3D scene a site can show. Kept in a **home file** (`src/home.json`), which `homeFromFile()` turns into a `HomeRecipe`. A site can have several and switch between them. |
| **Shell** | The kind of container a home is. There are four: the **compact**, the **diorama**, the **tower** and the **book**. |
| **Fold** | How a compact opens: `compact` (lid lifts, drawers slide out) or `book` (side rooms turn like pages). |
| **Room / zone** | A part of a home that opens on its own beat. A compact has three rooms. A diorama has three zones. A tower has one zone per floor. A book has one room per page. |
| **Piece** | One object in a room. Listed in the home file (`pieces`), with a **kind** that says how it is built: a model file, or code. (Older code says *prop*.) |
| **Key** | What places and stories call a piece: `<room>/<id>` when the piece has an id (`left/reading-lamp`), otherwise `<room>/<piece>`, numbered for repeats (`center/chair#2`). |
| **Beat** | One stop of the story: one `<section class="stage">` of the page, and what the home and camera do there (the home file's `beats`; older code says *stage*, *stop* or *keyframe*). The scroll position is a number: 0 is the first beat, 2.5 is halfway between the third and fourth. |
| **Story** | The text card that opens when a visitor clicks a piece. |
| **Link / door** | A link from one beat to another, or to another home (`transitions`). A piece that carries one is a door. |
| **Places** | Where the studio moved, turned, resized or hid pieces the file does not list by line, by key (the home file's `places`). |
| **Studio** | Popfold Studio, the workbench page each site has at `/studio.html`. |
| **Still** | A picture of one stage, used by the page without 3D. |
| **Simple page** | The page without 3D: the same copy, plus stills and written-out stories. |

## What is in the box

```
src/                 the engine: startScene(), the four shells, keyframes, places, stories, built-in pieces,
                     and <popfold-home> (element.ts; `pnpm build:lib` bundles it all for pages with no build step)
src/studio/          Popfold Studio (mountStudio)
src/vite-plugin.ts   the two Vite plugins: homeSaver() and popfoldFallback()
src/fallback.ts      the browser side of the page without 3D
bin/popfold.mjs      the popfold command: init, build, stills, check, describe, shot, optimize, split-room, update, mcp
schema/              the JSON Schema of a home file
skills/popfold-site/ a skill for AI agents: the order of work for making or changing a site
assets/              the compact's two case models (compact.glb, compact-crisp.glb)
templates/compact/   a complete small site to copy: an office in a box
templates/tower/     another: a studio in a four-floor building
templates/diorama/   a third: a modelled room whose walls unfold
templates/storybook/ a fourth: a pop-up book whose pages turn and whose scenes fold up
tools/blender/       Blender scripts that build or convert models
tools/visual-test.mjs the visual test: every template's stills before and after a change
test/, test-browser/ unit tests, and tests that drive a browser
docs/                this documentation
```

Popfold is used as TypeScript source by Vite sites. A site depends on it (`"popfold": "workspace:*"`) and imports
from `popfold`, `popfold/studio`, `popfold/vite` and `popfold/fallback`.

Try the template, from the workspace root:

```
pnpm install
pnpm --filter popfold-template-compact dev            # http://127.0.0.1:5190   (studio: /studio.html)
pnpm --filter popfold-template-compact build:static   # stills + dist/
```

## How a site is put together

A site is a normal Vite project with two pages. `templates/compact`, `templates/tower` and `templates/diorama` are
complete ones (the diorama's code is `src/room.ts`, where the others have `src/home.ts`).

| File | Job |
|---|---|
| `index.html` | All the copy. Each `<section class="stage" id="…">` is one stage. Also holds `<canvas id="scene">`. |
| `src/main.ts` | Works out the scroll position, decides whether to start 3D, calls `startScene()`. |
| `src/home.json` | The home as data: its look (colours and surfaces), the story (`beats`: one per stage, in the sections' order, each with its camera), and every piece, where it stands and the story behind it. |
| `src/home.ts` | The code that data needs: how each kind of piece is built. `homeFromFile(json, { kinds })` makes the home and its story from the file. |
| `src/style.css` | The page's look. The canvas is fixed behind the page. |
| `studio.html`, `src/studio.ts` | Popfold Studio for this site. One call to `mountStudio()`. |
| `vite.config.ts` | Two plugins: `homeSaver({ home })` and `popfoldFallback({...})`. |
| `public/models/` | The site's `.glb` files. |
| `public/stills/<home>-<n>.webp` | One still per stage of each home a page shows, captured from the studio. |
| `stills/<home>-<n>.webp` | The same for each home only the studio has: kept and compared, never built into `dist/`. |

The engine never reads the page. The page tells the engine one thing, many times a second: *which stage are we
at?* (`getStage()`). The engine blends the beats on either side and draws the result.

The answer is only as good as the page's measurements. The sections change height after the first measurement
(the written-out stories are hidden when 3D starts, web fonts arrive late), so `scrollStage()` (from `popfold/fallback`) measures them
again whenever the page changes height. A site's `main.ts` passes its result as `getStage`.

## The story: sections and beats

The story is a list of beats, one per `.stage` section. The templates keep it in the home file:

```json
"beats": [
  { "id": "top", "name": "Closed", "camera": [0, 4.4, 11.5], "lookAt": [0, 0.7, 0], "set": { "hero": 1, "side": 1 } },
  { "id": "approach", "name": "Centre room", "camera": [0, 4.6, 11], "lookAt": [0, 1.7, 0], "set": { "c": 1, "glow": 0.8, "side": -1 } }
]
```

A beat is the id of its section, a short name (the studio's stop buttons and `popfold check` use it), where the
camera is and what it looks at, and what the home does there (`set`; anything left out takes its default: 0, but 0.8 for `az`). `beatsOf(home)`
turns the file's beats into what `startScene()` and `mountStudio()` take. In code the same beat is
`beat(sectionId, name, values, cameraPosition, lookAt, zones?)`, with every value given. The values are:

| Field | Meaning |
|---|---|
| `c` | Centre room. 0 closed, 0.45 lid open (or walls up), 1 furniture in. |
| `L`, `R` | Left and right rooms. 0 inside, 0.4 slid out, 0.6 wall up, 1 furniture in. |
| `glow` | How bright the home's lamp is. |
| `badges` | The numbered step badges over the three rooms (0 hidden, 1 shown). |
| `hero` | The idle float and wobble of the closed shell (1 on the first stage, 0 once it opens). |
| `side` | Where the home sits on wide screens: -1 left, 0 centre, 1 right. The text card goes on the other side. |
| `av`, `ax`, `az`, `wave` | The guide figure: shown or hidden, where it stands, whether it waves. |
| zones | Extra named values, one per tower floor: `{ lab: 1, security: 0.3 }`. 0 closed, 0.3 slid out and lit, 1 furniture in. |

Between two stages the engine holds still for the first and last fifth, and eases through the middle. So each
section "rests" while it is centred on the screen.

**The rule that matters:** the beats and the `.stage` sections must be in the same order, one beat per section.
Add, remove and reorder them together: the studio (and the `add-beat`, `remove-beat` and `move-beat` commands)
does both at once. `popfold check` compares their ids and names the one that is missing or out of place.

## The four shells

A shell is a home's body. Four ship with Popfold, and a site can add its own (see "A shell of your own" below).
The engine only asks a shell to build a home and, each frame, to move its parts to where the story is.

### Compact (and the book fold)

A glossy clamshell, 4 units wide. The lid opens to become the back wall of the centre room. Two drawers slide out
sideways, each with a wall that tips up. With `fold: 'book'` the side rooms are pages that turn open instead.
The case itself is part of the home's look: `look.shell` is `'round'` (soft and pillowy, the default), `'crisp'`
(the same modelled shell with nearly square edges), `'code'` (built from simple shapes, with `look.corner` from 0
to 1 setting how round it is) or `{ url }` for a shell of your own, built with `tools/blender/build_compact.py`.
The lid carries a heart only if the home asks for one (`emblem: { heart: true }`).
A home can mix cases: `look.parts` takes any of `base`, `lid`, `drawers`, `walls`, `clasp` and `heart` from another case
(`"parts": { "lid": "crisp" }` puts the crisp lid on a round case); a part not named comes from `look.shell`.
A build carries only the modelled cases (about 220 KB each) that the site's home files name; a compact made in
code names its own with `popfoldFallback({ cases: ['crisp'] })`. The dev server has both, for the studio.

You describe it with a `look` (colours and surface textures) and a list of `pieces`. The templates keep both in
a JSON file, `src/home.json`, and make the home from it with `homeFromFile(json, { kinds })`. That checks the
file first (`readHome()`) and names every mistake: a misspelt field, a room that does not exist, two pieces
with one id, a pattern that is not one. In the file a surface is a colour or a pattern,
`{ "pattern": "checker", "colors": ["#fff", "#eee"], "count": 8 }`; in code it is a function that returns a
texture, `() => tex.checker('#fff', '#eee', 8)`, which a site can still write for a surface no pattern covers.
In TypeScript the same list of pieces looks like this:

```ts
pieces: [
  { id: 'sofa', room: 'center', kind: 'sofa', at: [0, -1.3] },                         // centre room floor: [x, z]
  { id: 'reading-lamp', room: 'left', kind: 'lamp', size: 1.2, at: [1.5, -1.3] },      // a model file from `props`
  { id: 'print', room: 'right', wall: true, kind: 'print', at: [1.4, 1.5], out: 0.17 }, // right wall: [x, height]
],
kinds: {
  sofa: () => P.sofa(),
  print: () => P.pictureFrame(0.6, 0.6, art, '#fff'),
},
```

- `id` is the piece's own name within its room. Its key, which stories and places use, is `<room>/<id>`, or
  `<room>-wall/<id>` on a wall. It does not change when you add, remove or reorder other pieces.
- `kind` says what to build: a function in `kinds`, the name of a model file in `props` (then `size` is its
  longest side), or one of Popfold's built-in pieces, which need no code: `builtin/bed`, `builtin/clothes-rack`,
  `builtin/coffee-table`, `builtin/disco-ball`, `builtin/floor-lamp`, `builtin/mirror`, `builtin/nightstand`,
  `builtin/plant`, `builtin/rug`, `builtin/sculpture`, `builtin/shopping-bag`, `builtin/sofa`, `builtin/spark`.
  A built-in reads a few `opts`: `color` (the floor lamp's shade, the rug, the sculpture, the shopping bag) and
  the rug's `width`, `depth` and `round`. A kind gets the piece's entry, so one kind can serve several pieces:
  `plant: (s) => plant(Number(s.opts?.height ?? 1))`. A site's own kind of the same name comes first.
- `room` is `center`, `left` or `right`. `wall: true` hangs the piece on that room's wall; for the centre room
  that is the open lid.
- `story` is the card behind the piece: `{ title, text, tags }`. It puts a dot on the piece in 3D and a paragraph
  under the room's section on the page without 3D.
- Also: `turn` (radians), `lift` (above the floor), `out` (from the wall), `delay` (0 to 0.4 into the room's
  pop-in; by default pieces spring in in the order listed), and `lamp: true` on each lamp whose glow the
  story controls (its kind returns `{ group, bulb }`, as `P.floorLamp()` does).
- An unknown kind stops the home from loading, with a message that lists the kinds it has.

A recipe may also have a `furnish(ctx)` function, which runs after the list and places pieces in code. Use it for
what a list cannot say; give those pieces an id with `piece()` (see "Moving pieces in the studio" below).

```ts
furnish(ctx) {
  const { root, left, right, center, y0, fy, gen, place, pop } = ctx;
  root.add(pop(center, place(P.sofa(), 0, y0, -1.3), 0.06));                       // centre room floor
  left.drawer.add(pop(left.props, place(gen('lamp', 1.2) ?? P.floorLamp(), 1.5, fy, -1.3), 0.1));  // left room floor
  right.wall.add(pop(right.props, place(P.pictureFrame(0.6, 0.6, art, '#fff'), 1.4, 1.5, 0.17), 0.2)); // right wall
}
```

- `place(obj, x, y, z, turn)` puts a piece somewhere. `pop(list, obj, delay)` makes it spring in with its room.
- `gen(name, size)` returns a loaded `.glb` scaled so its longest side is `size`, or `null` if the file failed to
  load. Always have a fallback after `??`.
- Rooms are 4 units wide and walls are 2.2 tall. Floor pieces sit at `y0` (centre) or `fy` (side rooms). Wall
  pieces go on `left.wall` / `right.wall` at `z ≈ 0.14`. The open lid is the centre room's back wall: add to
  `lid` with `rotation.x = Math.PI / 2`, `y = -0.04`, and `z` = height.
- The rooms are keyed `center`, `left` and `right`. Name them yourself with
  `rooms: { center: 'living', left: 'closet', right: 'dream' }` in the recipe; keys become `living/sofa`.
- Example: `templates/compact/src/home.ts`.

### Diorama

One modelled room, made in Blender, exported as a single `.glb`. Closed, its walls lie flat like an unfolded box.
As the story opens the walls swing up, then three zones fill in on their own beats (`c`, `L` and `R`).
The example is `templates/diorama`: a room with a lounge, a gallery wall and a desk, made from simple shapes by
`tools/demo-room.mjs` so it can ship. Its lamps glow only once their pieces are in, and the guide figure is drawn
at a person's size in the room's metres (`guideSize`, the room's `scale`).

```ts
diorama: {
  url: 'models/room.glb',
  zones: { center: 'screen', left: 'lounge', right: 'desk' },
  art: { art_tv: () => myCanvasTexture },   // paint screens and posters by material name
  lamp: 'pendants',                         // the piece whose light the story's glow controls
}
```

A diorama can be kept in a home file too. The file holds what is data, and the code passes the art:

```json
{
  "id": "studio-room", "name": "Studio room", "blurb": "…",
  "diorama": { "url": "models/room.glb", "scale": 0.5, "zones": { "center": "screen", "left": "lounge", "right": "desk" }, "lamp": "pendants" },
  "beats": [ … ],
  "pieces": [],
  "stories": { "screen-wall/tv": { "title": "The big picture", "text": "…", "tags": ["Strategy"], "dot": "front" } }
}
```

```ts
export const { recipe, beats } = homeFromFile(json, { diorama: { art: { art_tv: tvSlide }, cover } });
```

A diorama's pieces come from its model, so `pieces` stays empty and their stories are kept by key under
`stories`. Where the studio moves them goes under `places` (it writes that itself).

The model's own colours can be changed in the file, by material name: `"diorama": { ..., "paint": { "wall":
"#6F8FB0", "fabric_sofa": "#E0664A" } }`. Each build paints its own copy of the material, so the model itself is
untouched; a material the art paints keeps its art. The studio's Look group lists the model's materials for this.

The `.glb` must follow a naming contract (`floor`, `wall_back`, `piece_*` with a zone).
`tools/blender/room_to_glb.py` produces it from a `.blend` and a JSON description of the room. Details in
[models.md](models.md). Keys are `<zone>/<piece>` and `<zone>-wall/<piece>`.

A room model is mostly its pieces, and the story's first view shows the room folded flat with none of them. Cut it
in two with `pnpm exec popfold split-room public/models/room.glb`: the file keeps the floor and walls (a few
kilobytes) and `room-pieces.glb` beside it takes the pieces. Name the second in the home file,
`"diorama": { "url": "models/room.glb", "pieces": "models/room-pieces.glb", ... }`, and pass `lazyModels: true`
to `startScene()`: the room shows as soon as its own file is in, and the pieces are grafted on when theirs lands
(see "Loading models in stages").

### Tower

A cutaway building of stacked floors, for a long vertical story such as a resume. Each floor is a zone. As you
scroll, the camera rides down, the floor slides forward, lights up and fills with pieces. An elevator follows,
and an optional glowing pipeline runs down the side with a branch into every floor.

```ts
tower: {
  floors: [{ id: 'lab', label: 'AI LAB', color: '#B8FF5C' }, { id: 'shop', label: 'SHOP', color: '#FF4FD8' }],   // top floor first
  spine: { color: '#3EE6FF' }, elevator: true,
},
pieces: [
  { id: 'desk', room: 'lab', kind: 'desk', at: [-1, -0.6] },                        // on the floor: [x, z]
  { id: 'chart', room: 'lab', wall: true, kind: 'chart', at: [1.8, 1.2] },          // on the back wall: [x, height]
],
kinds: { desk: (spec, ctx) => desk('color' in ctx ? ctx.color : '#fff'), chart: () => chart() },
```

- The pieces are the recipe's `pieces` list, as for a compact; a piece's `room` is its floor's id. A floor is 6
  wide and 4 deep by default: `x` from -3 to 3, `z` from -2 (the back wall) to 2 (the open front). The floor's
  neon sign takes the top left of the back wall.
- A kind is given the floor it is building for as its second argument: `ctx.color` is the floor's neon colour,
  so one kind can look at home on every floor.
- A floor may also have `build(ctx)`, which runs after its listed pieces, for what a list cannot say:
  `ctx.flow(points)` adds a glowing pipe, `ctx.port(point)` moves where the spine's branch enters, and
  `ctx.pop(ctx.place(obj, x, 0, z), 'name')` places a piece in code. For a tower kept in a home file, give each
  floor's build by its id: `homeFromFile(json, { kinds, tower: { build: { lab: (ctx) => ctx.flow(...) } } })`.
- A tower kept in a home file has its building there, beside its floors: `"tower": { "wall": "#1A1830", "slab":
  "#24223D", "spine": "#3EE6FF", "elevator": true }` (the wall and slab colours, the pipe beside the lift in its
  colour, and the lift; also `width`, `depth` and `floorHeight`). Left out, there is no pipe; the lift shows unless `"elevator": false`.
- **Cables that plug in as you scroll.** With `"cables"` in the building (`"tower": { "spine": "#3EE6FF",
  "cables": { "plug": "rj45-plug", "size": 0.24, "tint": "plug_boot" } }`), a floor's pipes are cables instead:
  none on a closed floor, then, once its pieces are springing in (zone 0.6 to 0.98), each is drawn in along its
  length, the spine's branch first and the floor's own `ctx.flow` cables after it in the order they are added.
  Packets run on a cable only once it is plugged in, and scrolling back pulls them out again in reverse.
  `ctx.flow(points, { step })` sets a cable's turn (cables with the same step draw together; `1.3` starts part-way
  through turn 1, for a ripple). `plug` is one of the home's props, riding each cable's tip: it points along +Z,
  its origin where the cable enters it, and its materials named by the `tint` prefix take the cable's colour;
  `size` is its length (default 0.12). `ctx.port(point, (plugged) => …)` is told when the branch plugs in and out
  (to light a port, say), as `ctx.flow(points, { onPlug })` is for a floor's own cable. Without `"cables"` the
  pipes are always there, as before. The maths, which a test covers, is in `src/cable-math.ts`; a `Flow` made with
  `reveal: true` is such a cable anywhere, drawn as far as its `reveal` (0 to 1).
- Beats for a tower set one zone value per floor: `"zones": { "lab": 1 }` in the home file. 0 is closed,
  0.3 slid out and lit, 1 furnished.
- Keys are `<floor id>/<id>`, and `<floor id>-wall/<id>` for pieces on the back wall. A click on a floor calls
  `onZone(id)`.
- A tower reads best at night: its home file says `"mood": "evening"` (see "Look, guide and clicks"), and the
  site, the studio and the stills all show it so.
- Example: `templates/tower`, a complete small site.

### Book

A pop-up storybook lying open. Each page (a spread: two facing pages) is a room with its own scene, and the story
turns the leaves one by one. Nothing in a book appears, fades or grows: every piece is a card or a folded shape
hinged to its pages, posed each frame from the angles of the two pages it sits between, so it stands up as its page
opens, folds flat as it closes, looks right at every angle in between, and runs backwards when the scroll does.

```json
"book": {
  "pages": [{ "id": "home", "label": "Home", "color": "#D7EEC2" }, { "id": "forest", "color": "#A7D08C" }],
  "cover": "#B5523B", "paper": "#FBF4E4"
},
"beats": [
  { "id": "home", "name": "Home", "camera": [0.6, 6.5, 8.9], "lookAt": [0, 0.5, 0.3] },
  { "id": "forest", "name": "Forest", "camera": [0.6, 6.5, 8.9], "lookAt": [0, 0.5, 0.3], "zones": { "home": 1 } }
],
"pieces": [
  { "id": "hills", "room": "home", "kind": "vfold", "at": [0, -0.55], "opts": { "shape": "hills-sun", "w": 4.6, "h": 1.4, "angle": 78, "toward": "front" } },
  { "id": "house", "room": "home", "kind": "box", "at": [0, 0.55], "opts": { "w": 1.3, "h": 0.8, "d": 0.8, "roof": 0.5, "color3": "#5B7FB6" } },
  { "id": "tree", "room": "home", "kind": "stand", "at": [-1.95, 0.35], "opts": { "shape": "tree", "h": 1.2, "lean": "front" } }
]
```

- A page's zone (`z:<page id>`) is how far its right-hand leaf is turned: 0 lying open on the right, 1 turned over
  onto the left. Beat N turns the first N pages; the last page has no leaf of its own. Between two beats one leaf
  turns: its page folds shut and the next opens on the leaf's back.
- `"closed": true` starts the book shut, its front cover lying on the pages. The cover has a zone of its own,
  `cover` (`z:cover`): 0 shut, 1 lying open on the left, and no leaf turns further than it has. Give the closed
  book a beat of its own, first, with no zones, and add `"cover": 1` to every beat after it; the first page's
  pieces fold up as the cover opens. No page may then have the id `cover`.
- A piece's `room` is its page, and `at` is `[across, along]`: how far from the spine (negative on the left page,
  0 in the gutter) and where along it (+ towards the reader). A page is 3 wide and 4 long (`width`, `height`).
- The built-in kinds are the pop-ups (`src/popup.ts`): `vfold` (a card folded on the spine, its halves glued either
  side of the gutter; `angle`, `toward`, and `fins` for a honeycomb), `box` (a box fold: across the gutter a house
  whose roof creases as it closes, on one page a crate), `stand` (a card hinged across its page, facing the reader;
  it leans over as the page closes, never above the plane halfway between the pages), `card` (a card parallel to
  the spine) and `fan` (cards fanned around the spine: a dome, a tube or a cone). Their look is in `opts`: a
  `shape` (`SHAPES`), its size and up to three colours.
- A site's own kind (any object, built facing +z on y = 0) is mounted on its page as a stand.
- A page can carry a picture: `"art": "art/forest.webp"` prints it across the spread, its left half on the left
  page and its right half on the right (a 3:2 picture fills a spread of the default size). Add `"stitch": true`
  and the picture is sewn instead, as cross-stitch on aida cloth (`src/stitch.ts`): it is read into a grid of
  stitches (160 across, or the number `stitch` gives) in a dozen thread colours, and sewn one thread at a time,
  row by row, as its page opens. As the page closes the stitches come out again, so the scroll runs it both
  ways. The cloth is the colour the picture's edge has, so a picture of embroidery on plain cloth works best.
  The home waits for the pictures before it is shown, so stills are the same every time.
- The geometry is plain numbers in `src/popup-math.ts` (tested in `test/popup.test.ts`): `vfoldCrease`,
  `gableRise`, `standAngle`, `leafAngles`. The pieces of a shut page are hidden: they lie flat between two leaves,
  out of sight.
- Lay a page out so its pieces fold out of each other's way: a backdrop V-fold with `toward: "front"` across the
  middle of the page folds back into the empty half behind it, and stands in front of it lean forwards.
- Keys are `<page id>/<id>`. A click on a page calls `onZone(id)`.
- Example: `templates/storybook`, a complete small site.

### Folding in instead of springing in

A compact's or a tower's listed piece can arrive by folding: `"fold": "back"` (or `front`, `left`, `right`) hinges
it along the foot of that side, and it rises from lying flat towards that side to standing, keeping its size,
instead of springing in. In code, `hinge(obj, edge)` (`src/fold.ts`) wraps any object's parts in a pivot on that
edge, and `set(t)` stands it up (0 flat, 1 standing); a pop item with a `fold` is moved that way by the engine. The
book's stands are the same hinge, driven by the angle of their pages.

### A shell of your own

A shell is an object with a name, a test for which recipes it builds, a `build()` and a description of its rooms.
Register it before `startScene()`; a recipe picks it by claiming (`claims`) or by name (`shell: 'gallery'`).

```ts
import * as THREE from 'three';
import { registerShell, type PopItem, type Shell } from 'popfold';

const gallery: Shell = {
  name: 'gallery',
  claims: (recipe) => recipe.shell === 'gallery',
  build: (recipe, env) => {
    const root = new THREE.Group();          // build it: env.assets has the home's models by name
    const hall: PopItem[] = [];               // pieces that spring in
    return {
      root, badges: [], spinners: [], mixers: [], pickables: [root], editables: [],
      // each frame: move your parts from the story's fields, say how open the home is and how lit its lamp
      update: (cur, f) => { f.pop(hall, cur.c); return { open: cur.c, lit: cur.c }; },
    };
  },
  zones: () => [{ field: 'c', room: 'hall', label: 'Hall' }],   // the studio's sliders, and which rooms open first
  rooms: () => ['hall'],                                          // where the studio can add a listed piece
};
registerShell(gallery);
```

What a shell can say besides (`shell.ts`): `extras` (more sliders, such as `glow`), `cams` (the studio's camera
presets), `folds` (offers the compact's fold styles) and `lazy` (its listed pieces' models may arrive after the
first view). A house may have `lamps` the story's `glow` lights (a compact's pieces marked `"lamp": true`, any number
of them; a diorama's `lamp`, one piece's name or a list), `badges`, a `ground(x, z)` that says where the guide
figure stands, `zones` a click reports, `late` pieces, `arriving` pieces and a `reset()` for repeatable captures. The built-in shells are in `shells.ts`, and a good place to start.

## Pieces

Three ways to get a piece, from quickest to most work:

1. **Built-in pieces**: `P.sofa()`, `P.floorLamp()`, `P.rug()`, `P.bed()`, `P.shelf()`, `P.pictureFrame()` and
   about ten more (`src/props.ts`). They take their colours from the palette `C`, which ships bright toy colours:
   `setPalette({ cobalt: '#…', … })` before `startScene()` gives them (and the guide figure) the site's own.
   Canvas textures are in `tex`
   (`tex.checker`, `tex.stripes`, `tex.dots`, `tex.waves`, `tex.terrazzo`…).
2. **Your own code-built pieces**: boxes and cylinders with `rbox(width, height, depth, radius, material)` and
   `toy(colour, options)` materials, as a function in the recipe's `kinds`. See `templates/compact/src/home.ts`.
3. **`.glb` models**: list the name in the recipe's `props`, put the file in `propDir`, and call `gen(name, size)`.
   Every prop file follows one convention (front faces +Z, origin at the centre of its base, longest side = 1).
   A name with a folder (`shared/clock`) loads from `sharedDir`, for props several homes use.
   See [models.md](models.md).

### Stories

A listed piece carries its story:

```ts
{ id: 'sofa', room: 'center', kind: 'sofa', at: [0, -1.3],
  story: { title: 'The sofa', text: 'Why it is here…', tags: ['Sourcing'], meta: '2024', links: [{ label: 'See more', href: 'https://…' }] } },
```

A piece placed in code by `furnish()`, or in a diorama or a tower, gets its story from the recipe's `stories`, by
key: `stories: { 'center/sofa': { title: … } }`. Pass the same record to `popfoldFallback({ stories })`.

On the page without 3D a room's stories are written in the order its pieces are listed. Moving stories from a
separate `stories` record onto their pieces can therefore change their order on the page; reorder the pieces to
reorder the stories.

A piece with a story gets a pulsing dot. Clicking the piece or the dot opens the card. A story's `links` may point
outside (`https://…`, `mailto:…`; they open in a new tab) or within the site (`docs/guide`, `#contact`; same tab). `dot: 'front'` or `'below'`
moves the dot for wall or hanging pieces. On the simple page the same stories are written into the HTML. Keep
stories in a file with no 3D code, so `vite.config.ts` can import it.

### Setting a beat's camera in the studio

Scrub the story to a beat, switch the camera to *Free orbit* and frame the shot. The panel shows the camera's
position and the point it looks at. **Use for "<beat>"** writes them into that beat in `src/home.json` and goes
back to the story camera, so you see the story as it now plays. *Copy for a beat* copies the two arrays instead,
for a site that keeps its beats in code.

### Setting what a beat does in the studio

Scrub the story to a beat and tick *Manual* in the **Fold** group. The sliders (a compact's rooms, lamp and
badges; a diorama's zones; a tower's floors; and for every home, which side of a wide screen it sits on and its
float while closed) now move the home directly. When it looks right, **Use for "<beat>"** writes the
sliders' values into that beat in `src/home.json` and switches Manual off, so the story plays them.

### Adding, removing and moving beats in the studio

A beat is two things kept in step: an entry in the home file's `beats` and a `<section class="stage">` in the
page. Under the story's stops, the studio edits both at once for the beat the story is on:

- **The name** box renames the beat (the studio's label; the section's heading is the page's own words).
- **←** and **→** move it earlier or later in the story, and its section with it.
- **Remove…** takes it out, with its section (and the words in it) and the links that start from it or lead to it.
- **Add a beat after** puts a new one after it: an id (its section's) and a name. Its section goes into the page
  after this one, shaped like it (the same `data-text` and card element), with the name as its heading and
  `[What this section says.]` for its words. The beat starts as a copy of this one, so the story holds still
  there until its camera and folds are set.

The page is the HTML of the page that shows the home (`popfoldFallback`'s pages). Each change is one step of undo:
the home file and the page go back together. The studio shows the new story at once, without reloading, on the beat
that was edited (a site page open in another tab shows it on its next reload). New stills
are needed after any of these (`popfold check` says which are missing). A site that keeps its beats in code, or a
page whose HTML several homes' pages share, edits them by hand: a beat without a section, or a section without a
beat, is what `popfold check` reports first.

### Moving pieces in the studio

Open the studio, tick *Pick in view*, click a piece, and drag it, turn it or resize it. **Save** then
writes the change where the piece is defined:

- **A listed piece** (one from the home file) is written back into `src/home.json`: its `at`, and `turn`, `lift`,
  `out` or `scale` if those changed. Only that piece's line changes, so the diff reads as what you did. This
  needs the site to say where its home file is: `homeSaver({ home: 'src/home.json' })` in `vite.config.ts`
  (a list of paths for a site with several homes).
  Ticking *Hidden* on a listed piece is saved there too, as `"hidden": true`: the piece stays in the file, parked,
  and the studio can bring it back.
- **A piece the file does not list** (a diorama's model part, a piece placed in code) goes under `places` in the
  home file, by key, and is applied on top of where the model or the code puts it. The studio's story editor
  writes such a piece's story under `stories`, by key:

  ```json
  "places": { "right/sculpture": { "p": [0.3, 0.55, 0.5], "r": [0, -0.35, 0], "s": 1.2, "hide": true } }
  ```

  A home made in code has no file to write to, so the studio cannot save it: *Save* downloads its changes as
  `<home id>-places.json`, which the recipe can take as `places`.

### Adding and removing pieces in the studio

With a home file, the studio can change what is in the home, not only where it stands:

- **Every object** (beside *Props*) opens a drawer of every kind of piece the home can use: the site's own
  kinds, Popfold's built-in pieces and its model files, each with a picture, where it is used (in which homes and
  rooms, how many times) and its file size. Filter by where they come from or to the unused ones, or search by
  name or file. **Add** puts one in the room chosen at the top (on its wall, if ticked), with an id made from the
  kind (`sofa`, then `sofa-2`), and selects it, ready to move. A model file in the site's folders that the home
  does not list in its `props` is shown too, greyed, with what to do to use it. The pictures are drawn by the
  studio from the pieces themselves, once per visit. A diorama's pieces are its model's parts, so nothing is
  added to one from here.
- **Add a piece** (under the props list): choose a kind from the home's `kinds`, model files and the built-in
  pieces, the room or floor, whether it goes on the wall, and an id. It is written into `home.json` in the middle
  of its room; then select it, move it into place and save.
- **Remove…** (on a selected listed piece) takes it out of `home.json`, after asking. To keep a piece but not
  show it, tick *Hidden* instead.
- **Kind** (on a selected listed piece) puts another kind in its place: the same id, place, size and story, a
  different thing. It is written into the piece's entry as its `kind`.

### Writing a piece's story in the studio

Select a piece and open **Story** under its fields: a title, the text, tags separated by commas, and where the
dot sits. *Save story* writes it into the piece's entry in `home.json` (a diorama's model part: under `stories`,
by its key); *No story* takes it away. The
same story is the card a visitor opens in 3D and a paragraph on the page without 3D, so one edit changes both.

### Changing the look in the studio

The **Look** group (for a home kept in a file) has a colour for each part of a compact's case, each floor and
wall as a plain colour or a pattern with its colours, and the lid's title and subtitle. A tower has each floor's
sign and colour, and its building's walls, slabs and pipe (ticked off, the tower has no pipe). Every change is
written into `home.json` when the colour picker closes.

A diorama has a colour for each material of its model (its `paint`), listed by name with the colour it shows now;
**×** gives a material the model's own colour back. Its art and its cover are drawn in code, so they are not here.

A home made in code has its look in code, so the studio cannot save it, but it can try it: the Look group shows its
plain colours (a compact's case, a tower's floors and building) and its lid's words, and a change builds the home
again in place. The changes so far are shown as code, with **Copy as code** to put them into the recipe and **Put
back** to return to the recipe as the code made it. A surface drawn by a function (`tex.checker(...)`) has no colours
to show. The tried changes last while the studio is open.

### Editing links in the studio

The **Links** group (for a home kept in a file) lists the links that start in the home on show. Open one to change
where it starts and where it leads (a section of this home, or of another home on the bench), its words, the piece
that takes it (choose one, or **Selected** for the piece selected under Props), its effect and strength, how its
door shows (marker, glow on hover, or nothing), and whether it is a button in its section and a card on the page
without 3D. **Add a link here** adds one from the section the story is on to the next; **Remove link** takes it
away. Each change is written into the file's `transitions` at once, by the `link` command.

The studio page passes the site's links to `mountStudio({ transitions })`, so doors show their markers there, and a
click on a door (with *Pick in view* off) takes the story to the section it leads to. The studio plays no effects,
and the glow and words on hover are the site's only.

After any of these edits, the studio builds the home again in place from the file the save wrote: the view, the
story stop, the selection and any unsaved moves stay. (The save tells Vite not to reload the studio for it; a site
page open in another tab shows the change on its next reload. A home made in code still reloads the page.)

Until you save, every change to where a piece stands, how it is turned, its size and whether it is hidden can be
taken back: **Ctrl+Z** undoes, **Ctrl+Shift+Z** redoes, and the two arrows beside *Save* do the same.
With nothing unsaved left to undo, the same keys step back through the saves of the home file (every edit above,
and an agent's through `popfold mcp`), for as long as the dev server runs. Older history is git's.

### The studio on a built site

A built site has no dev server to write the home file, but its studio still edits: every change above runs in the
browser on a copy of the home file, kept in this browser's localStorage until a day after the last edit, with its
own undo and redo. Opening the studio again in that time shows the home as you left it, with a note that says until
when. *Download the home file* saves the edited file (`<home>.home.json`) to put in the site's `src/`; *Start over*
forgets the edits. The site's own page never reads them: it shows the home it was built with. Only a home kept in a
file can be edited this way, and a change to a page's sections (adding, removing or moving a beat) still needs the
dev server. Unsaved moves are kept as a draft for a day too.

### Saving a built studio's edits to GitHub

A site can let its deployed studio save into the site's repository instead of a download, through Popfold's **save
service** (`save/` in Popfold's repository; Popfold runs one, and anyone can run their own). Turn it on in
`vite.config.ts`:

```ts
homeSaver({ home: 'src/home.json', save: { service: 'https://save.popfold.ca', repo: 'you/your-site' } }),
```

The build then writes `popfold-save.json` at the site's root: the repository, the branch the site is built from
(`branch`, default `main`), and each home's file and story page in it (`folder` when the site is not at the
repository's root). The repository's owner installs the Popfold GitHub App on it once. In the studio, the note
about kept edits gets *Sign in with GitHub to save*, then *Save to GitHub*:

- The service replays the edits' commands on the **newest** home file in the repository and commits it with the
  editor's own GitHub token, so the commit is theirs and GitHub's rules (protected branches, reviews) hold. Edits
  someone else saved meanwhile stay; a command that no longer fits (a piece they removed) comes back as a refusal
  that says so.
- Only people who may write to the repository can save. Anyone else is told to ask its owner.
- `mode: 'pull-request'` (the default) puts each editor's saves on their own branch, `studio/<login>`, with one pull
  request into `branch`; `mode: 'direct'` commits onto `branch` itself.
- The site shows the change once it is built again from the repository.

Every edit that writes the home file is one of a short **command list** (`place`, `add`, `remove`, `story`,
`camera`, `beat`, `add-beat`, `remove-beat`, `move-beat`, `look`, `places`, `link`): the studio sends them, and so can an agent (`popfold mcp`, in
[agent-tools.md](agent-tools.md)) or a script.

Writing the file straight away only works on the local dev server; a built studio keeps its edits in the browser,
or saves them to GitHub (above). Unsaved changes are kept as a draft in the browser and offered back after a reload.

One thing to know: keys for repeated pieces are numbered in the order the code adds them (`#2`, `#3`). If you add
a second lamp *before* an existing one, the later ones shift, and their stories and places move with the
numbers. To stop that, give the piece an id of its own:

```ts
import { piece } from 'popfold';
root.add(pop(center, place(piece(P.floorLamp(), 'reading-lamp'), 1.5, y0, -1.3), 0.1));   // key: center/reading-lamp
```

Do this for every piece with a story and wherever a room has two of a kind. `popfold check` warns when a story
or a place hangs on a numbered piece, and fails when two pieces in a room share an id. In a diorama's
model, a custom property `id` on the piece's node does the same.

## Links between sections and homes

A link takes a visitor from one section of the story to another, or to a section of another home. One list,
`transitions`, says them all, and both pages read it, so they cannot drift apart:

```json
"transitions": [
  { "from": "top", "to": "contact", "label": "Skip to contact" },
  { "from": "approach", "to": "process", "label": "See the whole process", "piece": "center-wall/whiteboard" },
  { "from": "approach", "to": "services", "piece": "center-wall/chart" },
  { "from": "about", "to": { "home": "evening", "section": "lounge" }, "label": "The lounge in the evening" }
]
```

- **On the page without 3D**, a link with a `label` is a card in the section it starts from (`from`): its words and
  the still of the section it leads to, from the home it leads to. Without a label (or with `"card": false`) it
  has no card. In 3D the cards stay in the page, out of sight, for keyboards and screen readers, as the stories do.
- **In 3D**, a link's `piece` takes it. A piece with a story gets the link as a button on its card (worded by the
  label, or the name of the beat it leads to); a piece without one is a door: the pointer shows it can be clicked,
  and a click goes there. `startScene({ onLink })` replaces how it goes (by default: switch home if the link
  names another, then scroll to the section).
- **Another home**: the address is `?home=<id>#section`, and a page opened with `?home=` starts on that home.
  `popfold stills` captures every home a page's links lead to, for the cards' pictures.
- `popfold check` names a link whose sections, piece or home do not exist, and a card with no picture yet.
- **A page that shows more than one home**: `fromHome` says which a link starts from. It then works in 3D only
  while that home is on show, and has a card only on a page that shows it. `startScene({ onHome(id, why) })` is
  told why a home went on show: `'start'`, `'switch'` (setHome), `'link'` (a door led there) or `'rebuild'`; a
  site with a home switch of its own follows `'link'`.
- **How a door shows it is one** (`cue`, or `startScene({ linkCue })` for every link that does not say):
  - `"full"` (the default): a portal marker on it (a ring with an arrow; a door with a story keeps its story dot
    instead), a glow and the link's words by the pointer on hover, and a pulse the first time the story reaches the
    door's section.
  - `"hover"`: only the glow and the words, once the pointer finds the door.
  - `"none"`: nothing at all, for an easter egg. The door still works and the pointer still turns to a hand over
    it; add `"card": false` to keep it off the page without 3D too.
- **A button**: `"button": true` (with a `label`) also puts the link in its section's text card in 3D, as a chip
  under the section's words: the most obvious way, and one that works on a phone. A click plays the link's effect
  and goes, as the door does. Its colours are `--pf-link-bg` and `--pf-link-ink`; the hover words' are
  `--pf-door-label-bg` and `--pf-door-label-ink`. A link with `"cue": "none"` gets no button.
- **A door must be where it can be clicked**: in the open part of its section's stage, not under the section's
  text card (a click on page content never reaches the scene). Check it at the widths the site is seen at.
- The studio's **Links** group edits the list (see "Editing links in the studio"), and so can an agent, with the
  `link` command.
- The list lives in the home file, and `homeFromFile()` hands it back (`transitions`) to pass to
  `startScene({ transitions })`. A site whose story is code keeps it in a plain data module and passes it to both
  `startScene({ transitions })` and `popfoldFallback({ transitions })`.

### Effects on the way

A link with an `effect` plays it on the way: `fade`, `zoom`, `vortex` or `tunnel` (built in), `cut` (a plain
jump), or one the site gives `startScene({ effects: { name: { fragment } } })`. `strength` (0 to 2, default 1) sets how far it goes.

- **Between two neighbouring beats** (`from` and `to` are next to each other in the story), the effect follows
  the scroll: it builds up as the visitor scrolls from one to the other, at its strongest halfway, and plays
  backwards when they scroll back. It moves with the rooms (it follows the same eased story).
- **A door** (a link's piece, clicked) plays it over 0.9 s, and the page jumps to the section at its strongest,
  so the jump itself is not seen.
- A link without an `effect` plays nothing, as before. When several links join the same two neighbouring beats,
  scrolling plays the first in the list that has an effect; a door always plays its own link's.
- **A route** (`via`, between two neighbouring beats): points the camera passes through on the way, instead of
  the straight line between the two beats' cameras. `"look": "path"` makes it look ahead along the route, as if
  flying it; by default it looks where the beats look. With reduced motion the camera goes straight.

  ```json
  { "from": "approach", "to": "services", "effect": "tunnel", "via": [[-0.6, 3.2, 15], [-4.8, 2.6, 11.5]], "look": "path" }
  ```
- **`tunnel`** brings a glowing tube along the route, with rings running past, and darkens the picture's edges.
  The tube exists only while the effect plays (it is made once, built by the warm-up, and has no lights of its own).
  A site's own effect can bring objects too: `objects: ({ curve }) => ({ object, update(progress, time) })`.
- With `prefers-reduced-motion`, and on a device the engine has stepped down to its lowest quality, every effect
  plays a fade instead (or nothing, for an effect whose `reduced` is `'cut'`).
- Story dots hide while an effect plays. The studio and the stills never play effects.

### A story that moves between homes

On a page with more than one home, a beat can say which home it shows (`"home": "evening"` in the home file, or
`home` on a beat in code); a beat that says nothing shows the home the beat before it showed. Scrolling from a beat
of one home to a beat of another plays an effect, the link's for that step if one names an effect, else a fade,
and the homes swap at the effect's strongest, where the swap is not seen. Only one home is drawn at a time.

- Every home the story shows is built and warmed in the background after the first one is on show, so the scroll
  never waits for one. `onHome(id, 'story')` is called at each swap.
- While the story decides, a site's own `setHome()` lasts only until the next frame: give the choice to the story,
  or to the visitor, not both.
- On the page without 3D, each section's still is the still of the home it shows: from the home file's beats, or
  `popfoldFallback({ sectionHomes: { <section>: <home> } })` when the beats are code. `popfold stills` captures
  those homes too.
- The studio shows the home you pick there, whatever the beats say.

How it is drawn: the frame is drawn to the screen as always, copied into a texture, and one full-screen shader
draws it back through the effect. So an effect at nothing changes no pixel, and glows, shadows and the page
showing through look the same as without it. When no effect plays, nothing extra is drawn or copied; the copy
is one texture the size of the canvas (about 15 MB at a pixel ratio of 2), made by the warm-up on a page whose
links name an effect. An effect of one's own is GLSL defining `vec4 effect(vec2 uv)`, reading `scene` (the
frame), `progress`, `strength`, `time`, `aspect` and `PI` (see `effects-pass.ts`); `scene.snapshotEffect(name,
progress)` is a picture through it.

## Look, guide and clicks

Nothing in Popfold carries a brand: the light, the story card, the dots and the badges are the site's to set.
`startScene()` options a site usually sets:

| Option | What it does |
|---|---|
| `lighting` | Override parts of the `day` and `evening` presets (sun, sky and ground colours and strengths) and the shadow colour. Pass the same object to `mountStudio()` so stills match the site. |
| `storyDot` | The colour of the dots on pieces that have a story. |
| `base` | Where the site's files are as seen from this page. Leave it out for a page at the site's root; a page in a sub-folder (`/tour/index.html`) of a site built with `base: './'` passes `'../'`. |
| `avatar` | The guide figure: `false` for none, `{}` for the built-in one, `{ url }` for your own rigged model. |
| `onPick`, `onZone`, `onStory` | What a click on a room, a tower floor or a story piece does. |
| `ambient` | `false` holds the decoration still (the float, sparkles, pulsing dots and halos, bobbing badges, animated models, a tower's pipes). With `quality: 'auto'`, a page at rest then draws nothing at all until the scroll, the pointer or a change wakes it. |
| `lazyModels` | Show the home once the models of its first rooms are in, and bring the rest in as they arrive (see "Loading models in stages"). |
| `warmUp` | Builds every beat's materials in the background once the home is on show (see "A smooth first scroll"). On by default; `false` skips it; `'wait'` holds `startScene()` until it is done. |
| `onScene` | Called once with the scene before it warms up (and, with `warmUp: 'wait'`, before `startScene()` resolves). Add the site's own lights and scene objects here so the warm-up builds for them. May return a promise. |
| `onHome` | Called with a home's id when it goes on show: when the scene starts, and after every switch. |
| `debug`, `debugRows` | The debug panel (see below). `debug: false` takes it away; `debugRows` adds rows of the site's own. |
| `isOverUi` | The canvas sits behind the page, so the engine must know which elements are page content. By default everything is, except `<body>`, `<main>` and the empty part of a `.stage` section. |

**The time of day is the home's own.** A home is shown in daylight unless its file says `"mood": "evening"` (or
its recipe `mood: 'evening'`): a dim sun, a warm sky and its lamps on. The scene opens in the first home's time of
day and takes each home's as it goes on show (a switch, a door, the story moving home), the studio opens in it and
captures the stills in it, and `<popfold-home>` uses it unless its `light` attribute says otherwise. So it is said
once. `scene.setLighting('day' | 'evening')` still switches by hand (a day and night button, say), until the home
changes; the studio's Day and Evening buttons do the same, and never change the stills.

The story card is plain HTML, styled by CSS variables on `:root`, all optional: `--pf-card-bg`, `--pf-card-ink`,
`--pf-card-accent`, `--pf-card-tag`, `--pf-card-focus`, `--pf-card-font`, `--pf-card-display`. A compact's three
step badges take their colours from `look.badges` and `look.badgeRing`, and `emblem: { heart: true }` adds a heart to
its lid (off by default). `mountStudio({ theme })` restyles the studio's panel.

## Popfold Studio

Every site has a studio at `/studio.html`. It runs the same engine as the site, but you drive it from a panel:

- pick a home, scrub the story, jump to a stop, or play it;
- open the folds by hand, switch the fold style;
- use the story camera, fixed camera presets or a free orbit;
- switch the guide figure, sparkles, idle float, story dots, day or evening light and the backdrop (each home opens
  in its own time of day, its `mood`, on a backdrop to suit);
- pick, move, turn, resize or hide pieces, and save the layout;
- save a PNG of the view, copy a link to the view, and **Capture stills** of the home on show (for the simple page,
  or in `stills/` for a home no page shows).

The address bar holds the view (`?home=office&stage=4&cam=left&light=evening`), so a link reopens it.

## The page without 3D

The HTML that ships *is* the simple page. 3D is an upgrade that starts only if the browser can do it.

- At build time, `popfoldFallback()` writes each story under its section, puts a still beside each stage, and adds
  structured data, `og:image`, `llms.txt`, `robots.txt` and `sitemap.xml`.
- In the browser, `shouldStart3D()` checks for WebGL, the visitor's saved choice, Save-Data and very low memory.
  `markReady()` switches the page to 3D once the scene is running. A *Simple view / 3D view* button lets the
  visitor choose.
- `?view=simple` or `?view=3d` forces a mode.

### More than one story page

A site can have several story pages, each with its own home, stories and stills: a landing page and a tour, say.
Put the second page in a folder (`tour/index.html`, with its own `tour/studio.html`), add both files to the Vite
build inputs, and list the pages:

```ts
popfoldFallback({
  siteName: 'My Studio', siteUrl: 'https://example.com/',
  pages: [
    { html: 'index.html', homeFile: 'src/home.json', sections: { center: 'approach' } },
    { html: 'tour/index.html', homeFile: 'tour/src/home.json' },   // or, for a home kept in code: stories: TOUR_STORIES, stillsHome: 'tower'
  ],
})
```

A page in a folder finds the site's models by itself: popfoldFallback writes the way back to the site's root into
it (`<meta name="popfold-base">`), and `startScene()` reads it when the site passes no `base`. `mountStudio()` on a
studio page in a folder still takes `base: '../'`. Stills for every page live in `public/stills/` at the site's root, `popfold stills` captures each page's
home from that page's studio, and `llms.txt` and the sitemap cover all the pages. The engine is built once.

#### One page per home, from one HTML file

A site shown in more than one home can give each home an address of its own, with the same copy, so each version
can be seen and shared (and found) on its own. List the second page with `from`; there is no file to keep in step:

```ts
pages: [
  { html: 'index.html', homeFile: 'src/homes/day.json' },
  { html: 'evening/index.html', from: 'index.html', homeFile: 'src/homes/evening.json' },
]
```

The plugin makes `evening/index.html` from `index.html` in the dev server and in the build (no Vite input to add),
with its relative paths moved to its folder. The page without 3D shows that home's stills, stories and link cards,
with its own share image, canonical address, sitemap entry and part of `llms.txt`. The page says which home it shows
(`<meta name="popfold-home">`), and `startScene()` starts in it (`?home=` still wins), so `main.ts` lists both homes
and needs nothing else. A link card to the other home's section leads to that home's page (`evening/#room`, and back
`../#room`) instead of `?home=`. `popfold check`, `describe` and `stills` cover the page, checking it against the
HTML it is made from.

#### The same page in another language

A page made `from` another with a `lang` and a translation file is that page in another language, at an address of
its own (the storybook template is in English and, at `bg/`, in Bulgarian):

```ts
pages: [
  { html: 'index.html', homeFile: 'src/home.json' },
  { html: 'bg/index.html', from: 'index.html', lang: 'bg', text: 'src/i18n/bg.json', homeFile: 'src/home.json' },
]
```

Restart the dev server after adding the page to `vite.config.ts` (Vite reads its config once): until then the new
address serves the original page. Changes to the translation file show on the next load, with no restart.

The translation file is one JSON object: the words as they are written in the original page, to their translation.

```json
{ "Turn the page": "Обърни страницата", "your<b>story</b>": "твоята<b>история</b>", "Why it's here": "Защо е тук" }
```

- **The page.** Every text in the page that the file has is swapped, and so are the words of `alt`, `title`,
  `aria-label` and `placeholder`, the title and the description and share tags. An element whose whole inner HTML is
  an entry is swapped as one, for a sentence with a link or `<b>` in it. Runs of spaces and line breaks count as one
  space, so a line broken in the HTML matches. Scripts, styles, addresses and words in an element with a `lang` of
  its own stay as they are. `<html lang>` is set.
- **The stories and links.** The stories written into the page, their heading (`storiesHeading`) and the link
  cards' labels go through the same file, as do, in 3D, the story cards, a door's words, the view toggle and the
  rest of Popfold's own words ("Why it's here", "Close", "Simple view", "3D view"). The page carries the file
  (`<script id="popfold-text">`); a site's own words drawn in code go through it too: `import { t } from 'popfold'`,
  then `t('Forest')`. `pageLang()` is the page's language.
- **What is still to translate.** `popfold check` lists every text a translated page still shows in the original:
  in its body, its stories and their heading, its link cards and Popfold's own words. The dev server and the build
  warn about the page's body as they make it.
- **Fonts.** A web font that has no letters for the language falls back to the browser's own. Set the page in fonts
  that have them, by language in CSS (`:root:lang(bg) { --display: 'Rubik Variable', serif }`): the storybook
  template's Bulgarian page uses Rubik and Nunito, as Bricolage Grotesque and DM Sans have no Cyrillic. Text a site
  draws on its art needs the same, and the font loaded (`document.fonts.load`) before it draws.
- **Finding each other.** With `siteUrl` set, each version names all of them in its head and in the sitemap
  (`hreflang`). A link with `data-pf-lang="bg"` goes to the Bulgarian version from any version, and the one in the
  page's own language is marked `aria-current="page"`: a language switcher with no addresses to keep. Mark its words
  with their language (`<a data-pf-lang="bg" lang="bg">БГ</a>`) so they are not translated.
- **One home, one set of stills.** Both pages show the same home, so they share its stills. A link to another home's
  page goes to that page in the same language when there is one.

## Build and deploy

```
pnpm build:static        # in a site's folder
```

This typechecks and runs `popfold build`: it starts the site's dev server, opens the studio in a headless Chrome
or Edge, captures a fresh still of every stage, and then runs `vite build`. It takes about 20 seconds with a GPU.
`popfold build --keep` skips the capture. `popfold stills` only captures.

Captures are repeatable: the same scene gives the same picture every time. Each new still is compared with the
one it replaces, and one that looks the same is put back untouched, so after a capture git shows exactly the
stills your change altered. `popfold stills --check` changes nothing and fails if any still differs.

Every home gets stills, not only those a page shows. A home a page shows (its own home, a home its links lead to,
a home its story moves to) has them in `public/stills/`, where the page without 3D finds them and every build
copies them. A home only the studio has (a variant being tried, say) has them in `stills/` at the site's root:
kept with the site and compared by `popfold stills --check` like the rest, but never part of a build. The studio's
**Capture stills** saves the home on show in the same place. `popfold check` reports stills missing from either
folder, and stills left in one that belong in the other.

The output is a static `dist/` folder with relative paths. Upload it to any static host.

A deploy replaces the build's files, so a page that was open (or cached) during a deploy asks for files that are
gone. Each story page carries a few lines that reload it once when one of the site's own files fails to load; if
the files are still missing, the page without 3D stays, and it does not reload again for 30 seconds. Serve the
HTML pages with `Cache-Control: max-age=0, must-revalidate` (Cloudflare's static assets do) so a reload gets the
new page.

## A smooth first scroll

A browser builds a material the first time it draws it, and that takes long enough to see: without care, the
story stalls for a moment the first time each room opens. Popfold does two things about it, and a site can undo
both by accident.

- **Warm-up.** Once the home is on show, the engine sets up every other beat in turn and asks the browser to
  build what that beat shows, in the background. It then draws the beat once, with the true view drawn over it
  before the browser shows anything, because some shaders (the shadow pass's) are only built by a real draw.
  Only what the beat shows is built: a piece that stays hidden costs nothing.
  It does not delay the home's first appearance. `startScene({ warmUp: false })` skips it; `scene.warmed` is a promise that settles when it is done.
  A model that arrives late (`lazyModels`) is warmed as it lands, and a home is warmed before `setHome()`
  swaps it in. The debug panel's *warm-up* row says how long the last one took.
- **`warmUp: 'wait'`** does the same work but `startScene()` resolves only when it is finished. A site that
  shows a loader until then never stalls, even for a visitor who scrolls at once; the price is the loader
  staying a fraction of a second longer (0.3 to 0.8 s on the templates).
- **Add the site's own lights in `onScene`.** The warm-up builds for the lights in the scene when it runs. A
  light the site adds after `startScene()` has resolved changes the count, and every material is built again
  on the first scroll (on the compact template, one extra light added afterwards cost a 362 ms frame; the same
  light added in `onScene` cost none). `startScene({ onScene: (s) => { s.scene.add(myLight); } })`. Without
  `'wait'`, code right after `await startScene()` still runs before the warm-up starts, but `onScene` is the
  sure place.
- **A steady number of lights.** three.js builds every material on screen again whenever the number of lights
  in the scene changes, and a light counts only while everything above it is visible. Pieces are hidden until
  their room opens, so **a light placed inside a piece changes the count the moment the piece appears**, and
  the whole scene stalls. Keep a light in the scene (or on the home's root) for as long as the home is shown,
  at zero brightness when it is not needed, and move it to its piece each frame. The compact's own lamp light
  works this way.

Measured on the compact template, first pass through the story: the slowest frame went from 1,222 ms to 14 ms.

## Loading models in stages

A home with many model files does not have to wait for all of them. With `startScene({ lazyModels: true })` the
home appears as soon as the models of its first rooms have arrived: the rooms the story opens at its first two
beats, which for a compact is usually the centre room and for a tower its top floor. The other models are asked for at once too, and each
brings its pieces into the home when it lands, with their shadows, their saved places and their story dots. A
piece that lands in a room already open springs in, as the others did.

- A model that needs more than its file gives it does not need a code kind (which would load up front): say it
  in `models`, below.
- It applies to a compact or a tower whose pieces are all in the home file (`pieces`). There the engine knows
  which room needs which model. It applies to a diorama whose pieces are in a file of their own
  (`diorama.pieces`, from `popfold split-room`): the room first, all its pieces together when their file lands.
  A home that also places pieces in code (`furnish()`, or a floor's `build()`) waits for every model, as before.
- Use it on the site's page. Leave it off for the studio, which the stills are captured from: a picture must be
  complete, so `mountStudio()` never loads in stages.
- A visitor who scrolls to a side room before its models arrive sees the room open without them, and then sees
  them spring in. On a slow connection that is the trade: an early home, and furniture that may arrive late.
- The debug panel's *models* row shows how many have been fetched so far.

### What a site says about a model: `models`

A listed piece whose kind is a model file is built from the file as it is. For the rest, the recipe (or
`homeFromFile()`'s second argument) has `models`, by the model's name:

```ts
models: {
  'glow-lamp': { glow: 0.45 },                                       // let its own texture glow
  'desk-lamp': { ready: (piece) => { piece.add(bulb()); } },         // add to it once it is built
  'ceiling-lamp': { loop: false, ready: (piece, { clip }) => swingOnEntry(piece, clip) },  // drive its animation yourself
  'floor-lamp': { ready: (piece) => ({ group: piece, bulb: addBulb(piece) }) },   // the piece marked "lamp": return its bulb
}
```

- `glow` (compact): 0 to 1.
- `loop: false` (compact) leaves the model's animation alone; by default its first clip plays back and forth.
- `ready(piece, { clip, spec, ctx })` runs once the piece is built and in its room, whether its model came with
  the home or arrived later. `clip` is the model's first animation, if it has one.
- For a tower: `tint`, `clip` and `fit`, as `ctx.gen()` takes them.
- Do not add a light to the piece in `ready`: see "A smooth first scroll".
- `ready` runs once for each time the piece is built, and a home is built once: switching to another home and
  back shows the same home again without building it. So whatever `ready` registers elsewhere (a list of moving
  pieces, say) must outlive the home leaving the scene and coming back. `startScene({ onHome })` says which
  home is on show.
- `clip` is the model's own animation, shared by every piece built from that model. Clone it before changing it.

A name in `models` is still a model, so it still loads in stages. A name in `kinds` is built in code, and a
model fetched by that code loads up front.

## The debug panel

Press the small **Debug** button beside *Simple view*, add `?debug` to a page's address, or press Alt+Shift+D,
and a small panel opens in the corner. It says what build
you are looking at and how the page is running:

- **Build**: the site's commit (and whether it had uncommitted changes), when it was committed and built, and
  the versions of the site, of Popfold and of three.js. These come from `popfoldFallback()`.
- **Page**: the home, where the story is and the beat's name, the light, the window, the models fetched and their
  size, how long the home took to appear, and script memory where the browser tells.
- **Drawing**: frames a second drawn of those the browser offered (the scene rests when nothing moves), the
  canvas, draw calls, triangles, geometries, textures, shaders and the graphics card.

*Studio ↗* opens the site's studio in a new tab on the same home, story stop and light, to look closer or fix
what you see (saving works on the local dev server only). It links to `studio.html` beside the page (or, for a page in a folder, where
popfoldFallback says the studio is, `<meta name="popfold-studio">`) and shows only when that page exists; `startScene({ debugStudio: 'tools/studio.html' })` points it elsewhere, and
`debugStudio: false` leaves it out. *Copy* puts all of it on the clipboard with the page's address, for a bug report. On the page without 3D the
panel still opens, with the build rows and a note that 3D is off.

Its code is fetched only when the panel is first opened; a page that never opens it carries a few lines for the
shortcut. It is on by default, in production too.

A site decides how much of this it shows:

- `viewToggle({ debug: false })` leaves the Debug button out. The panel still opens from the address and the
  keyboard, for whoever knows to ask.
- `startScene({ debug: false })` and `markFallback({ debug: false })` take the panel away altogether, and the
  button with it.
- A site with a button of its own calls `toggleDebug()` from `popfold`; the document gets a `pf-debug` event,
  with `detail` true or false, whenever the panel opens or closes. A site adds rows of its own with `debugRows: () => [['lazy models', 'on']]`.

## What is rough today

Popfold was grown from one site and is being turned into something anyone can pick up. Homes made in code have less studio
help than homes kept in a file. The pure parts have unit tests, and `test-browser/` drives the command and
`<popfold-home>` in a browser. Known faults and the plan are kept with the
project's `TODO.md`.
