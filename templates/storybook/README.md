# Popfold starter: a pop-up storybook

A complete small Popfold site to copy: a pop-up book lying open, for a story told page by page. Scrolling turns
its pages, and each page's scene folds up out of the gutter as it opens and folds flat again as it closes. Five
sections, one home, no model files: every piece is card and simple shapes, built into Popfold. Every line in
`[brackets]` in `index.html` is placeholder copy.

```
pnpm --filter popfold-template-storybook dev            # http://127.0.0.1:5194   (studio: /studio.html)
pnpm --filter popfold-template-storybook build:static   # stills + dist/
```

To start your own site from it, run `node bin/popfold.mjs init <folder> --template storybook` in the Popfold
folder, then work through `docs/create-a-site.md` in the Popfold folder.

| File | What to change |
|---|---|
| `index.html` | The copy. One `<section class="stage" id="…">` per page of the book; each page's section has the page's id |
| `src/home.json` | The home as data: the book (`book`: its pages, each with an id, a label and the colour printed on it, and the covers' and paper's colours), the story (`beats`: one per section, with its camera and which pages are turned) and the pop-ups on each page (`pieces`), with the story card behind a piece |
| `src/home.ts` | Kinds of piece of your own, if you add any (`kinds`): any object, mounted on its page like a stand |
| `src/main.ts` | What a click on a page does (`onZone`) |
| `src/style.css` | The page's look |
| `vite.config.ts` | The site's name |
| `src/studio.ts`, `studio.html` | The studio page; nothing to change unless you add homes |

## In two languages

The site is in English (`index.html`) and Bulgarian (`bg/`, made by the build from the same page). The Bulgarian
words are in `src/i18n/bg.json`: the English as it is written in the page, story or Popfold's own words, to the
Bulgarian. Change the English copy and its entry stops matching: the dev server lists what is not translated. The
two links at the top right (`data-pf-lang`) switch between them. `popfold check` lists what is not translated.
Bricolage Grotesque and DM Sans have no Cyrillic, so the Bulgarian page is set in Rubik and Nunito
(`:root:lang(bg)` in `src/style.css`). For one language, take the `bg/` line out of
`vite.config.ts` and remove `src/i18n/` and the language links; for another, add a line and a file like them.

## How the pages turn

Each page but the last has a story field, its id in a beat's `zones`: how far its right-hand leaf is turned, 0
lying open on the right, 1 turned over onto the left. Each beat turns one more page than the one before it
(`"zones": { "cover": 1, "home": 1 }` on the third beat shows the second page). Between two beats the scroll turns one leaf: the page it leaves folds
shut and the next one opens on the leaf's back, and scrolling back runs it the other way.

The book starts shut (`"closed": true` in `book`): the first section, `cover`, shows it closed, and its zone,
`cover`, opens the front cover onto the first page as the page scrolls on, folding that page's pieces up. So every
beat after the first has `"cover": 1` in its `zones`. To start with the
book lying open instead, remove `"closed"`, the `cover` beat and its section, and every `"cover": 1`.

## The pop-ups

A piece's `at` is `[across, along]`: how far from the spine (negative on the left page, 0 in the gutter) and where
along it (towards the reader is +; a page runs from -2 to 2 and is 3 wide). `opts` says what it looks like:
`shape`, its size (`w`, `h`) and `color`, `color2`, `color3`. Shapes: rect, gable, pine, tree, bush, hill, hills,
hills-sun, waves-sun, mountain, disc, sun, star, cloud, wave, flower, castle, turret, boat, fence, mushroom.

- `vfold`: a card folded down its middle on the spine, its halves glued either side of the gutter. `angle` 45 makes
  a corner, 75 or more a backdrop. `toward`: `front` opens towards the reader and folds away from them, `back`
  points its corner at the reader and folds towards them. `fins`: a honeycomb of cards fanned between the halves.
- `box`: a box fold. At `at[0]` 0 it stands across the gutter, a house whose roof (`roof`, the ridge's height)
  creases as it closes; elsewhere it is a crate on one page. `d` is its depth along the spine, `color2` the roof,
  and `color3` draws a door and windows on its front.
- `stand`: a card hinged across its page, facing the reader. It leans over as the page closes, towards `lean`
  (`front` or `back`).
- `card`: a card parallel to the spine, linked to the gutter, so it faces sideways.
- `fan`: cards fanned around the spine between the two pages: `shape` `dome` (half a ball), `tube` (half a
  cylinder) or `cone`, with `r`, `len` and `fins`.

A piece never pops, fades or grows: it is hinged to its page and stands up as the page opens. Lay a page out so
that its pieces fold out of each other's way: the backdrop's V-fold (`toward: front`) in the middle of the page
folds back into the empty half behind it, and the stands in front of it lean forwards (`lean: front`).
In the studio, the sliders "Turn …" hold a leaf at any angle.

Piece keys here are `<page>/<id>`.
