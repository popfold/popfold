# Making models for Popfold

Everything Popfold shows is either built in code or loaded from a `.glb` file. This page covers the file
convention and every way we have made models so far, with the exact commands.

The scripts are in `tools/blender/` (build, convert and review models). Popfold itself does not ship a model
generator: any tool that writes a `.glb` works. The one Popfold's own sites use is **the forge**, open source at
[github.com/popfold/forge](https://github.com/popfold/forge): it runs the chain below on one local GPU. Paths here are relative to the Popfold folder.

## The prop convention

Every prop `.glb` follows the same four rules, so `gen(name, size)` can place any of them:

| Rule | Value |
|---|---|
| Up axis | glTF Y-up |
| Front | faces **+Z** (in Blender: front faces -Y) |
| Origin | centre of the **base** (the piece stands on its origin) |
| Size | longest side = **1 unit** (the site scales it with `gen(name, size)`) |

Also:

- File names are lowercase with dashes. The file name is the prop name: `arch-bed.glb` → `gen('arch-bed', 2.1)`.
- Metalness is forced to 0 when a prop loads. Each model keeps its own roughness.
- Material names matter when a site recolours parts: the tower's `gen(name, size, { tint: { led_: '#FF4FD8' } })`
  recolours every material whose name starts with `led_`.
- Animated props keep their clips. A prop with clips is used once, not copied.

Budgets we have kept to (not enforced by any tool yet):

| Thing | Target |
|---|---|
| A generated prop | 1,200 to 3,000 triangles, one 1536 × 768 texture |
| A downloaded prop | under about 300 KB after normalising |
| A whole room (diorama) | about 4 to 5 MB, textures 512 px |
| A site's total models | under about 10 MB |

## Which way to make a piece

| You need | Use | Effort |
|---|---|---|
| A simple shape: table, shelf, screen, sign | Code (`rbox`, `toy`, canvas textures) | Minutes |
| A stylised object that matches a look | An image-to-3D generator: prompt → picture → mesh → low poly | Minutes each |
| A precise hard-surface object, or a matched pair | A Blender Python builder | An hour |
| A real object you own | Phone scan → clean-up | An hour |
| Ordinary furniture, quickly | Sweet Home 3D libraries or Poly Pizza | Minutes, plus credits |
| A whole room | Model it in Blender, export with `room_to_glb.py` | Days |
| A character | Generate, then rig it in Blender | Half a day |

## 1. Code-built pieces

No file at all. Good for anything boxy, and for screens and signs whose words should stay editable.

```ts
import * as THREE from 'three';
import { rbox, toy } from 'popfold';

function desk() {
  const g = new THREE.Group();
  const top = rbox(1.7, 0.08, 0.8, 0.03, toy('#7A5236', { roughness: 0.55 }));   // w, h, d, corner radius, material
  top.position.y = 0.76;
  g.add(top);
  g.userData.propName = 'desk';          // gives the piece the key "<room>/desk"
  return g;
}
```

Screens and posters are canvas drawings (`tex.canvasTexture(draw)`).
Wait for the web fonts before drawing text (`document.fonts.load(...)`, as each site's `main.ts` does).

## 2. Generated props

Popfold does not include a generator; bring the `.glb` from whichever you use. The chain that has worked for
Popfold's own sites, run locally in ComfyUI or through a hosted service (Hyper3D Rodin, Meshy, Tripo and others):

1. A text-to-image model draws a straight-on product picture of the object on white.
2. The background is cut away and the object centred.
3. An image-to-3D model (Hunyuan3D, TRELLIS and the like) turns the picture into a mesh.
4. Blender cleans the mesh, reduces it to a triangle budget, projects the picture on as the texture, and
   `tools/blender/normalize_glb.py` brings it to the prop convention.
5. A review sheet (`tools/blender/blender_render.py`) shows it from four sides.

What we learned:

- **The picture decides everything.** Most image-to-3D models only see the front. Ask for "straight-on front view,
  orthographic, whole object visible, isolated on white, no shadow", and draw several seeds to keep the most
  front-on one.
- **Thin parts fail.** Wires, cords, lamp stems and chair legs come out lumpy or missing. Ask for "thick solid
  parts, no thin wires", or build that piece in Blender instead.
- **The back is a guess.** A texture projected from the front picture goes straight through. Pieces seen from
  behind need a model that textures every side, or a different method.
- **Pairs must be mirrored, not generated twice.** Two runs never match. Mirror one in Blender.
- **Always look at the review sheet** before the model goes into a site.
- **Hosted services cost money, and uploading a picture sends it to a third party.** Check the licence of every
  generating model before anything it made goes public.

### Wall art

Draw flat artwork at the frame's shape (portrait, square or small), save the keepers as JPEG into
`public/art/<artDir>/`, and use them with `ctx.art('<name>', fallbackTexture)`.

## 3. Blender builders

For pieces the generator cannot do well, write a Python script that builds the mesh. Run headless:

```
blender -b --factory-startup --python <your builder>.py -- --out <site>/public/models/props
```

- `tools/blender/build_compact.py` builds the compact shell (`assets/compact.glb`, and `assets/compact-crisp.glb`
  with `--corner 0.3`). `--corner`, `--no-heart` and `--out` let a site build a shell of its own and use it with
  `look.shell = { url }`. Six objects (Base, Lid,
  Drawer, Wall, and Clasp and Heart on the lid's hinge), each with its origin on the pivot the engine animates. The engine swaps materials by name
  (`ShellBase`, `ShellLid`, `Gold`, `Heart`, `Drawer`, `WallWhite`).
- A builder for hard-surface props (racks, consoles, appliances) gives its light strips materials named `led_*`,
  so a site can recolour them.
- Lamps with thin stems and a bed with smooth sheets were built this way after the generator failed on them.
- `tools/blender/ortho_views.py` renders front, side, top and back with a measuring grid. Use it to check a shape against a
  reference photo.

## 4. Scans of real objects

1. Scan the object with a phone and export it (FBX works).
2. In Blender, cut the object free of the table it stood on, weld the seams, turn it to face front, put its base
   on the origin and reduce it. Note its real size.
3. A scan is usually too heavy and too lumpy to ship. Use it as a **reference** and rebuild the object in Blender
   to match its measurements.

## 5. Free libraries

### Sweet Home 3D

About 1,500 furniture models. Full instructions: [sweethome3d-models.md](sweethome3d-models.md). In short:

```
python tools/blender/sh3d_catalog.py --root <folder with packs/*.sh3f>      # catalogue and preview sheets
blender -b --factory-startup --python tools/blender/sh3d_to_glb.py -- --pack <extracted pack> --index 178 --out <site>/public/models/props/sh3d/<name>.glb
```

A name with a folder (`sh3d/<name>`) in a recipe's `props` loads from the site's shared props folder
(`models/props/` unless the recipe sets `sharedDir`). A `.json` with the creator and licence is written beside each
model. Copy it into the site's `CREDITS.md`.

### Poly Pizza and other downloads

```
blender -b --factory-startup --python tools/blender/normalize_glb.py -- --in <download>.glb --out <site>/public/models/props/<name>.glb [--turn 180] [--keep-anims]
```

This applies the prop convention to any `.glb`. `--turn` spins it when its front is not +Z. Prefer CC0 models.
CC-BY models must be credited.

Treat every downloaded file as untrusted data: keep downloads in their own folder, never run a script from
inside that folder, and pass the file as an argument.

## 6. A whole room (diorama)

Model a cutaway room in Blender: a floor, two to four walls, and furniture. Then:

```
blender -b --disable-autoexec "<room>.blend" --python tools/blender/room_to_glb.py -- --config <room>.json --out <site>/public/models/room.glb --tex 512
```

To see the whole contract in a few lines of code, read `tools/demo-room.mjs`, which makes the diorama template's
room from simple shapes. The room is described by a JSON file: which objects form which piece, what hangs on which wall, where the zones
are, which objects to leave out, and which materials the site paints. The script's header lists every field.
It expects the floor at z = 0 and the floor and its walls in one mesh. The walls are any of `back` (+y), `front`
(-y), `right` (+x) and `left` (-x), with where each stands: `"walls": { "back": 4, "right": 6 }`. A room modelled
facing another way is turned first with `"turn": 90` (degrees about z), so its back wall faces +y. A poster's face
and a bank of screens are read from the wall they hang on (`"facing"` on a sliced rule says which wall the screens
look at).

The `.glb` it writes, and that `diorama.ts` expects:

| Node | Meaning |
|---|---|
| `floor` | The floor mesh. The engine centres the room on it. |
| `wall_back`, `wall_right` (also `wall_left`, `wall_front`) | An empty on the wall's bottom edge. It is the hinge. The wall and everything mounted on it are its children. |
| `piece_<name>` | An empty on the floor under the piece, holding its meshes. glTF extras: `{ "zone": "lounge", "piece": "sofa" }`, plus `wall` for mounted pieces. |
| materials named `art_*` | Emptied by the script. The site paints them through `diorama.art`. |

Units are metres. `diorama.scale` (default 0.5) converts them to scene units.

Only textures you have the right to publish should stay in the file. The script keeps the ones named in
`keepTextures` and replaces every other image with a flat colour.

## 7. A guide figure

Generate a figurine (an image-to-3D service gives a single fused, textured mesh), then rig it with a Blender
script that adds the bones and paints the weights by rule: position along each limb, plus the texture colour to
keep hair and clothes off the arm and leg bones.

The engine needs five bones with these exact names, all pointing straight up: `Root`, `ArmL`, `ArmR`, `LegL`,
`LegR`. It rotates them itself to walk and wave. A model without them falls back to the built-in figure.
Pass it with `startScene({ avatar: { url: 'models/figure.glb' } })`, or `avatar: false` for no figure.

**Pictures of a real person need that person's permission before they are uploaded to any outside service.**

## Checking a model

- Render a review sheet (`blender -b -P tools/blender/blender_render.py -- IN.glb OUT.png --views 4`) and look at it.
- Open the site's studio, pick the piece, and check its size against its neighbours.
- Check the file size and triangle count against the budgets above.
- Add third-party models to the site's `CREDITS.md`.

## Show the home before every model has arrived

`startScene({ lazyModels: true })` on the site's page: the home appears once its first rooms' models are in, and
the rest follow. It works for a compact or a tower whose pieces are listed in its home file, and for a diorama
cut with `popfold split-room` (below). See "Loading models in stages" in [guide.md](guide.md).

For a whole room, `pnpm exec popfold split-room public/models/room.glb` cuts the room's file in two: the floor and
walls stay in it, and the pieces go to `room-pieces.glb`, with the parts they hang from kept empty so each is
grafted back exactly where it was. Nothing else changes (nodes, places, materials, compression). Run it after
`popfold optimize`, and again each time the room is exported.

## Set a budget for the models

`popfoldFallback({ modelBudget: { each: 400, total: 2500 } })` in `vite.config.ts`, in kilobytes: `each` for one
file, `total` for everything under `public/models`. A build over either stops and lists the files; `popfold
check` reports the same as errors. Without a budget, `popfold check` only warns, above 1,500 KB a file and
10,000 KB in all.

## Make the models smaller: `popfold optimize`

Run it in the site's folder once the models are in place, and again whenever you add one:

```
pnpm exec popfold optimize            # every .glb under public/models, rewritten in place
pnpm exec popfold optimize --check    # only say what would be saved
pnpm exec popfold stills --check      # then prove nothing looks different
```

It removes duplicate and unused data, packs the geometry (meshopt) and saves textures as WebP no larger than
1024 px (`--texture-size` to change). A model usually comes out 40 to 65% smaller. A file that is already
optimised is skipped, so running it twice is safe. The engine reads both kinds of file.

What it does not do, on purpose: it never merges two materials or meshes that have different names (a site
paints art and swaps colours by material name), and it leaves every position exactly as it is. General tools get models smaller
still by squeezing positions into whole numbers, which moves each part's node to make up the difference. Popfold
places a case's lid and drawers, a diorama's pieces and every saved place by those nodes, so a model treated
that way comes apart. If you compress with another tool, switch position quantization off.

Geometry is unchanged by this step: `popfold describe` before and after gives the same places and sizes. Textures are re-encoded, so look at a still of anything with fine print on
it. `popfold check` warns when a site ships models that have not been through it.

### Fewer triangles: `--simplify`

`pnpm exec popfold optimize public/models/room-pieces.glb --simplify` also takes triangles away, as many as fit
within an error of 0.1% of each part's size (`--simplify 0.003` for 0.3%). It works on a model that is already
optimised, keeps every part's place and material, and is lossy, so run `popfold stills --check` after it and look
at what changed. On one diorama's pieces (125,000 triangles, 1.7 MB): 0.1% gave 81,000 triangles and
1.4 MB with under 1% of any still's pixels changed; 0.3% gave 61,000 and 1.3 MB, but the sofas' shading changed
visibly; 1% gave 45,000 and 1.2 MB. Seams and textures keep much of the size whatever the triangle count, so the
first thing to try for a heavy model is a lighter source (a part with 400 KB of detail no one sees from the
camera).
