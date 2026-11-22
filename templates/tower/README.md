# Popfold starter: a tower, built in code

A complete small Popfold site to copy: a studio in a four-floor building, for a long story told top to bottom.
Six sections, one home, no model files. Every line in `[brackets]` in `index.html` is placeholder copy.

```
pnpm --filter popfold-template-tower dev            # http://127.0.0.1:5191   (studio: /studio.html)
pnpm --filter popfold-template-tower build:static   # stills + dist/
```

To start your own site from it, run `node bin/popfold.mjs init <folder> --template tower` in the Popfold folder,
then work through `docs/create-a-site.md` in the Popfold folder.

| File | What to change |
|---|---|
| `index.html` | The copy. One `<section class="stage" id="…">` per beat of the story; each floor's section has the floor's id |
| `src/home.json` | The home as data: the floors (`floors`: id, label, colour, height), the building's own colours (`tower`: wall, slab, pipe, lift), its time of day (`mood`), the story (`beats`: one per section, with its camera and which floors are open) and what is on each floor (`pieces`), with the story card behind a piece |
| `src/home.ts` | How each kind of piece is built (`kinds`), and the pieces' palette (`K`) |
| `src/main.ts` | What a click on a floor does (`onZone`) |
| `src/style.css` | The page's look |
| `vite.config.ts` | The site's name |
| `src/studio.ts`, `studio.html` | The studio page; nothing to change unless you add homes |

To add a floor: add it to `floors` in `src/home.json`, list its pieces there with `"room": "<its id>"`, give it
a beat in `beats` (copy a neighbour's and move the camera's height by the floor's height), and add a
`<section class="stage" id="<its id>">` to `index.html` in the same place. `pnpm exec popfold check` says when the
three do not agree.

Piece keys here are `<floor>/<id>`, and `<floor>-wall/<id>` for pieces on a floor's back wall.
