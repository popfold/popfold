# Popfold starter: a compact, built in code

A complete small Popfold site to copy: an office in a box. Six sections, one home, no model files. Every line in
`[brackets]` in `index.html` is placeholder copy.

```
pnpm --filter popfold-template-compact dev            # http://127.0.0.1:5190   (studio: /studio.html)
pnpm --filter popfold-template-compact build:static   # stills + dist/
```

To start your own site from it, run `node bin/popfold.mjs init <folder>` in the Popfold folder, then work through
`docs/create-a-site.md` in the Popfold folder.

| File | What to change |
|---|---|
| `index.html` | The copy. One `<section class="stage" id="…">` per beat of the story |
| `src/home.ts` | How each kind of piece is built (`kinds`), and the pieces' palette (`K`) |
| `src/home.json` | The home as data: its name, its look (`look`: the case's colours and each floor and wall), the lid's wordmark (`emblem`), the story (`beats`: one per section, with its camera), and each piece, where it stands and the story card behind it |
| `src/main.ts` | Which section a click on each room scrolls to (`onPick`) |
| `src/style.css` | The page's look |
| `vite.config.ts` | The site's name, and which section each room's stories go under |
| `src/studio.ts`, `studio.html` | The studio page, with a second home (another palette) that only the studio shows |

Piece keys here are `center/…`, `left/…` and `right/…` (with `-wall` for wall pieces). Give the rooms your own
names in code: `homeFromFile(json, { kinds, rooms: { center: 'studio', left: 'library', right: 'workshop' } })`, and
the same `rooms` in `popfoldFallback()`.
