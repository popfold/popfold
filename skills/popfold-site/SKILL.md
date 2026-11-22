---
name: popfold-site
description: Make a new Popfold site, or change one. Popfold sites are web pages where a 3D "pocket home" unfolds into rooms as the visitor scrolls. Use when asked to build, start, extend or fix a site made with Popfold, to add pieces, rooms, stories or sections to one, or to check one before it ships.
---

# Make or change a Popfold site

A Popfold site is an ordinary Vite site that installs Popfold from npm (`@popfold/engine`), in `node_modules/popfold`. The
page is real HTML: each `<section class="stage">` is one beat of a story, and the 3D home behind the page opens,
turns and folds as the visitor scrolls from one section to the next.

The docs that came with the site's own Popfold are the truth for that site. This skill is the order of work;
read these for the details, from the site's folder:

- `node_modules/popfold/AGENTS.md`: the rules, the commands, and the things that trip people up. Read it first, fully.
- `node_modules/popfold/docs/create-a-site.md`: every file of a site and what goes in it.
- `node_modules/popfold/docs/guide.md`: how the story, the home, the pieces and the page without 3D work.

## Before you start

- **Do not invent the site's facts.** Names, clients, numbers, quotes, prices and biographies come from the person
  you are working for. Where you have none, write a placeholder in `[square brackets]` and list them at the end.
- **Do not publish a real person's photo, likeness or biography** without that person's consent.
- Use `pnpm`, never `npm install`. Commit when a step works; push only when asked.

## A new site

From anywhere (npm has Popfold as `@popfold/engine`):

```
pnpm dlx @popfold/engine init my-site --port 5200
cd my-site
pnpm install
git add . && git commit -m "Start from the Popfold compact template"
```

`init` makes a git repository that installs Popfold from npm, and a complete small site, the compact template: a box
whose lid opens on a centre room and whose two drawers slide out as side rooms. `--template diorama` starts from a
modelled room whose walls unfold (for a room made in Blender: its README says how to swap the model in). `--template tower` starts from
the other template: a building of stacked floors that open one by one as the page scrolls down, for a long
story. Its `README.md` says what differs: the floors are a list in `src/home.json`, a piece's `room` is its
floor's id, a floor is 6 wide (x from -3 to 3), and each floor has its own beat in `beats`. It commits nothing; make the
first commit yourself, as above. Pick a port nothing else uses. `--ref <tag or branch>` picks a Popfold other
than the newest release, and `--from <git url or folder>` takes Popfold from somewhere other than the checkout's
own remote.

`pnpm dev` serves the site (and the studio at `/studio.html`) until it is stopped, so start it in the background
if you want it. You do not need it for the commands below: each starts its own server and browser.

## The order of work

Change one thing, check it, look at it. The files, in the order to work on them:

1. **`index.html`: the words.** One `<section class="stage" id="…">` per beat. Write the real copy first; the
   3D follows the page, not the other way round.
2. **`src/home.json`, `beats`: what the home does at each section.** One beat per section, in the same order:
   the section's `id`, a `name`, the `camera` and what it looks at, and `set`: how far each room is open (0 to 1)
   and what glows. Anything left out of `set` is 0. In the studio, *Manual* in the Fold group plus *Use for
   "<beat>"* saves the sliders into the beat.
3. **`src/home.json`, `pieces`: what is in the rooms.** Plain data, no code; edit the file, or use the studio,
   which can add, move, hide and remove pieces and write their stories, and writes the file itself. One entry per piece: an `id`, its `room` (`center`, `left`,
   `right`), its `kind`, and `at`: `[x, z]` on the floor or, with `wall: true`, `[x, height]` on the wall. A
   piece may carry a `story`: a title, a short text and tags, shown on a card when the piece is clicked.
4. **`src/home.json`, `look`: the case's colours and what covers each floor and wall** (a compact; a tower's
   floors carry their own colours).
5. **`src/home.ts`: how each kind of piece is built.** `kinds` maps a kind's name to a
   function that returns a three.js object. See "Building a piece" below.
6. **`vite.config.ts`: the site's name, and which section each room's stories go under** (`sections`).
7. **`src/style.css` and the fonts**, last.

Three names are written in more than one file. Change every copy together:

- **A section's id**: `index.html`, its beat in `src/home.json`, `sections` in `vite.config.ts`, and `onPick` in
  `src/main.ts` (which section a click on each room scrolls to). `check` reports the first three; nothing reports
  a stale id in `onPick`, the click just does nothing.
- **The home's id** (`"id"` in `src/home.json`): the stills are named after it, so after changing it delete the
  old stills (in `public/stills/` and `stills/`) and run `pnpm exec popfold stills`. You may also leave the id as it is: visitors never see it.
- **The home's exported name** (`OFFICE` in the template): imported by `src/main.ts` and `src/studio.ts`.

If the site's Popfold is older and has `src/beats.ts`, `src/pieces.ts`, `src/stories.ts` or a `furnish()`
function in place of `src/home.json`,
follow `node_modules/popfold/docs/create-a-site.md` for that version.

### Where things go

Rooms are 4 units wide and deep: floor positions run from -2 to 2 in `x` (left to right) and `z` (back to
front). Side-room walls are 2.2 tall. A chair is about 0.9 tall, a desk 0.75. Keep floor pieces at least 0.3
from the edges, and leave the front of each room (z > 1) low or empty so the camera can see in.

A beat's two arrays are where the camera is and the point it looks at. With a browser: open `studio.html` on
the dev server, scrub the story to the beat, choose *Free orbit*, find the view, and press *Use for "<beat>"*
under the camera buttons: it writes the camera into `src/home.json`. Without one: start from the template's beats, which frame each room of the compact well, and move the
numbers a little at a time, taking a picture after each change.

### Building a piece

A kind is a function that returns a three.js object, usually a `THREE.Group` of simple shapes. From `popfold`:

| Helper | Gives |
|---|---|
| `rbox(width, height, depth, cornerRadius, material)` | a box with rounded edges, centred on its own middle |
| `toy(colour, { roughness, clearcoat, metalness })` | the glossy toy-plastic material everything is made of |
| `P.rug(width, depth, texture)`, `P.pictureFrame(width, height, texture, frameColour)`, `P.floorLamp(shadeColour)`, `P.plant()`, `P.sofa()`, … | built-in pieces (`popfold/src/props.ts` has them all) |
| `tex.stripes(colours, count)`, `tex.checker(a, b, squares)`, `tex.dots(…)`, `tex.waves(…)` | patterned textures for floors, walls and rugs |
| `tex.canvasTexture((ctx, size) => { … }, size)` | a texture you draw yourself on a square canvas: signs, charts, boards |

- **A floor piece** has its origin on the floor under its middle, stands along +y and faces +z (towards the
  visitor). `turn` in its entry turns it.
- **A wall piece** (`wall: true`) is built upright and flat: wide along x, tall along y, its origin at its own
  middle, its front facing +z. `at` is `[x, height of its middle]`. It stands out from the wall by `out`
  (default 0.14 on a side wall, 0.04 on the lid); a thick piece needs about half its depth.
- **The centre room's back wall is the open lid**, about 4 tall: heights from 1.5 to 3 read well there. Side-room
  walls are 2.2 tall: keep the middle of a wall piece between 1 and 1.7.
- A canvas texture is square. On a frame that is not square the drawing is stretched to fit, so draw text
  narrower or wider by the same ratio.
- Colours: keep the site's palette in one object, as the template's `K`. The step badges take theirs from
  `look.badges` in the home's look: three `[background, number]` colour pairs, for the centre, left and right rooms.

## Check it and look at it

Run these in the site's folder. They start their own server and browser.

```
pnpm exec popfold check                          # mistakes: beats and sections that do not match, stories and places on no piece, models that did not load
pnpm exec popfold describe                       # every piece as JSON: key, room, position, size, story
pnpm exec popfold shot --stage 2 --out shots/2.png  # a picture of the home at section 2 (counted from 0)
pnpm exec tsc --noEmit                           # types
```

A shot is the 3D canvas alone, 2400 x 1800, on a plain or transparent background: not the page's own background,
text cards or story dots. A piece that a text card would cover on the real page is not hidden in a shot, so
check the page itself in a browser when you can. Without `--out` the file is `popfold-shot-<home>.png`, which
the site's `.gitignore` already leaves out; add your own shots folder to it.

After every change to beats, pieces or kinds: run `check`, then take a `shot` of each section you touched and
**open the picture and look at it**. Look for pieces that overlap, float, sink into the floor, face the wall, or
hide behind something; a room the camera does not see into; text on a wall piece that is too small to read. Fix
and shoot again. `describe` gives each piece's real size and place when a picture is not enough.

`check` must end with "nothing wrong found" before you call anything finished. While you work, one warning is
expected: stills that are missing or out of date. `pnpm exec popfold stills` captures them, and so does the
final build.

## Finish

```
pnpm exec popfold optimize   # only if the site has model files: makes them smaller, looks the same
pnpm build:static            # captures a still of each section, then builds dist/
```

The stills are what the page shows where 3D cannot run, so capture them after the last visual change. Then
report, plainly:

- what you made or changed;
- what you looked at (which shots, at which sections) and what you did not;
- every placeholder in `[brackets]` that still needs real copy;
- anything `check` warned about that you left.

If `init` or a command fails, read its message: it names the file and usually the fix. A failed `init` removes
what it made, so the same command can be run again.
