# Popfold starter: a diorama, a modelled room

A complete small Popfold site to copy: one modelled room whose walls unfold, with a lounge, a gallery wall and a
desk. Six sections, one home. Every line in `[brackets]` in `index.html` is placeholder copy.

```
pnpm --filter popfold-template-diorama dev            # http://127.0.0.1:5192   (studio: /studio.html)
pnpm --filter popfold-template-diorama build:static   # stills + dist/
```

To start your own site from it, run `node bin/popfold.mjs init <folder> --template diorama` in the Popfold folder.

| File | What to change |
|---|---|
| `index.html` | The copy. One `<section class="stage" id="…">` per beat of the story |
| `src/home.json` | The home as data: the room model and its zones (`diorama`), the story (`beats`, one per section, with its camera), the pieces' stories by key, and links between sections |
| `src/room.ts` | What the site paints on the model: the board, the screen, the poster (`ART_TEXT`), and the wordmark on the floor while the room lies flat |
| `public/models/room.glb`, `public/models/room-pieces.glb` | The room (floor and walls, shown first) and its pieces, cut in two by `popfold split-room` |
| `src/main.ts` | Which section a click on each zone scrolls to (`onPick`) |
| `src/style.css` | The page's look |
| `vite.config.ts` | The site's name (each zone's stories go under the section with the zone's id) |
| `src/studio.ts`, `studio.html` | The studio page |

The room is made by Popfold's `tools/demo-room.mjs` from simple shapes, so it can ship with the template. Your own
room comes from Blender through `tools/blender/room_to_glb.py` (see `docs/models.md`, "A whole room"); then run
`pnpm exec popfold optimize` and `pnpm exec popfold split-room public/models/room.glb`.

Piece keys are `<zone>/<piece>` and `<zone>-wall/<piece>`: `lounge/sofa`, `gallery-wall/board`, `desk-wall/poster`.
The two lamps (`"lamp"` in `home.json`) glow with the story's `glow`. The guide figure walks between the zones
(`av`, `ax`, `az` in a beat); `avatar: false` in `main.ts` takes it away.
