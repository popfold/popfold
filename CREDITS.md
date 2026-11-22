# Credits

## People

- **Dimiter Todorov**: creator.
- **Alyssa Jacoby** (Dopamine Spaces): creative director.

## Built with

- **Claude Code** (Anthropic), with Claude Opus and Claude Fable models: Popfold's code, tests and docs were
  written with Claude Code, directed and reviewed by Dimiter Todorov.

## Libraries Popfold uses

| Library | Licence |
|---|---|
| [three.js](https://threejs.org) | MIT |
| [Vite](https://vite.dev) | MIT |
| [parse5](https://github.com/inikulin/parse5) | MIT |
| [glTF Transform](https://gltf-transform.dev) | MIT |
| [meshoptimizer](https://github.com/zeux/meshoptimizer) | MIT |
| [sharp](https://sharp.pixelplumbing.com) | Apache 2.0 |
| [Playwright](https://playwright.dev) (`playwright-core`) | Apache 2.0 |
| Fonts through [Fontsource](https://fontsource.org): Bricolage Grotesque, DM Sans, Rubik, Nunito | SIL Open Font License |
| [Biome](https://biomejs.dev) (development only) | MIT |

## Tools

- [Blender](https://www.blender.org): the case models and the scripts in `tools/blender/` (Blender is GPL; the
  models it makes are not).
- [Sweet Home 3D](https://www.sweethome3d.com) libraries and [Poly Pizza](https://poly.pizza): furniture for sites
  (`tools/blender/sh3d_*.py`, `docs/sweethome3d-models.md`). Each model keeps its own licence, credited in the site
  that uses it.

## AI models used for the demos' models and art

None of these models, nor anything they made, is in this repository: the templates' pieces are built in code and
Blender. They made props, pictures and art for the sites built with Popfold, locally through
[ComfyUI](https://www.comfy.org) and [Ollama](https://ollama.com), or through hosted services. Check each one's
licence before publishing or selling what it makes.

| Model | Used for | Where it ran | Licence |
|---|---|---|---|
| FLUX.1 schnell (Black Forest Labs) | Source pictures for props, wall art | Local | Apache 2.0 |
| Chroma1-HD | Source pictures FLUX would not draw | Local | Apache 2.0 |
| SDXL base 1.0 (Stability AI) | Tileable patterns | Local | CreativeML Open RAIL++-M |
| TRELLIS.2 (Microsoft) | Picture to textured 3D mesh | Local | MIT |
| DINOv3 (Meta), BiRefNet | Inside TRELLIS.2's graph: image features, background removal | Local | DINOv3 licence; MIT |
| Hunyuan3D 2 and 2.1 (Tencent) | Picture to 3D shape | Local | Tencent Hunyuan 3D Community License |
| rembg (U²-Net) | Background removal | Local | MIT |
| Qwen3-VL 8B (Alibaba Qwen) | Planning, picking and judging props | Local, through Ollama | Apache 2.0 |
| Hyper3D Rodin (Deemos) | Picture to textured 3D mesh | Hosted, paid | Deemos' terms of service |
| Direct3D-V3, Pixal3D, Hi3D | Picture to 3D, in comparisons | Hugging Face Spaces | See each model card |
| Midjourney | Page art for the storybook demo | Hosted, paid | Midjourney's terms of service |
