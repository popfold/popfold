# Using Sweet Home 3D furniture models

The site can use models from Sweet Home 3D's free furniture libraries next to the generated props.
Two scripts in `tools/blender/` do the work (paths here are relative to the Popfold folder):

| Script | Runs in | Does |
|---|---|---|
| `sh3d_catalog.py` | Python 3 + Pillow | Unpacks `.sh3f` libraries, writes `catalog.json`, preview sheets and `index.tsv` |
| `sh3d_to_glb.py` | Blender 4.2+ (tested 5.3) | Converts one catalogue entry to a GLB prop plus a credits JSON |

Use a working folder outside any repository (about 190 MB packed, more unpacked). Below it is `<sh3d>`.

## 1. Download the libraries

Source mirror: <https://github.com/YoannDev90/SweetHome3D-Packs> (same libraries as sweethome3d.com).
The `.sh3f` files are plain files in the repo, so use `raw.githubusercontent.com` (the LFS media URL returns 404):

```powershell
$root = '<sh3d>'; New-Item -ItemType Directory -Force "$root\packs" | Out-Null
foreach ($p in 'BlendSwap-CC-0','BlendSwap-CC-BY','Contributions','KatorLegaz','LucaPresidente','Reallusion','Scopia','Trees') {
  curl.exe -sSL --fail -o "$root\packs\$p.sh3f" "https://raw.githubusercontent.com/YoannDev90/SweetHome3D-Packs/main/Furnitures/$p.sh3f"
}
```

Each `.sh3f` is a zip: `PluginFurnitureCatalog.properties` plus one folder per model (OBJ + MTL + textures) and a PNG icon.

## 2. Catalogue and pick

```powershell
python tools/blender/sh3d_catalog.py --root <sh3d>
```

Writes `extracted/<pack>/`, `catalog.json` (every field of every model) and `preview/<group>.jpg` sheets with a code under each icon.
Codes are pack letters + catalogue number: `B0` BlendSwap CC-0, `BB` BlendSwap CC-BY, `C` Contributions, `K` Kator Legaz,
`L` Luca Presidente, `R` Reallusion, `S` Scopia, `T` Trees. So `C178` is Contributions #178.
Add `--group NAME "regex"` to make a sheet for something specific (matched against name and tags).
Each run rewrites `preview/index.tsv` with only the groups of that run (the sheets for other groups stay).
Already-unpacked packs are not extracted again.

Run it with the working directory outside `extracted/` (as above): the archives are third-party data.

## 3. Convert one model

```powershell
blender -b --factory-startup --python tools/blender/sh3d_to_glb.py -- `
  --pack <sh3d>\extracted\Contributions --index 178 `
  --out <site>/public/models/props/sh3d/toronto-ontario-place-frame.glb
```

The last output line starts with `SH3D_TO_GLB_OK` followed by the metadata. Output:

- `<name>.glb`: one mesh, one material per OBJ material, textures embedded.
  Same convention as the generated props: glTF Y-up, **front faces +Z**, origin at the centre of the base,
  **longest side = 1 unit**, metalness 0, roughness 0.6 (`--roughness` to change).
- `<name>.json`: name, creator, license, pack, index, real size in cm, `elevation_cm` (Sweet Home 3D's default
  height off the floor; non-zero means a wall or shelf piece), triangle count.

How the conversion matches Sweet Home 3D: the OBJ is Y-up with its front toward +Z; the catalogue's optional
`modelRotation` (3x3, row-major) is applied first; then the bounding box is stretched to the catalogue
`width x height x depth`. All 1,510 models in these packs are OBJ.

## 4. Use it in the site

1. Add a piece of that kind to the home file: `{ "id": "frame", "room": "center", "kind": "sh3d/<name>", "at": [0,
   -1], "size": 1.2 }` (with `"wall": true` for a wall piece). A kind that is a model file needs no code. A name
   with a folder loads from the site's shared props folder (`models/props/` unless the recipe sets `sharedDir`), so
   every home can use it.
2. `size` is the longest side in scene units. The rooms are 4 units wide with 2.2-unit walls; compare with nearby
   pieces rather than converting the real size from the JSON literally (the home is toy-scaled). Then place it by
   eye in the studio and **Save**.
3. A model piece keeps the model's own roughness, with metalness 0.
4. Add a line to the site's `CREDITS.md` from the JSON (creator, model name, license). CC-BY models need it.

## Gotchas

- Sweet Home 3D models are realistic and plainly textured; they usually need recolouring to match either theme.
  Small textures (some are 320 px) are fine for small wall pieces only.
- The dev server picks up new files in `public/` on reload; no restart needed.
- Keep the `--out` file name lowercase with dashes; it becomes the prop name.
