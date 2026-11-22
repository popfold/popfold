"""
Convert one Sweet Home 3D furniture model (from an unpacked .sh3f library) into a GLB prop for the site.

Usage (Blender 4.2+; tested with 5.3):
  blender -b --factory-startup --python tools/blender/sh3d_to_glb.py -- \
      --pack <folder>/extracted/Contributions --index 178 \
      --out <site>/public/models/props/sh3d/toronto-ontario-place-frame.glb

  --pack   folder of an unpacked .sh3f (holds PluginFurnitureCatalog.properties)
  --index  the model's number in that catalogue (the "178" in preview code C178)
  --out    GLB to write; a <name>.json with credits and real-world size is written next to it

What it does, in Sweet Home 3D terms:
  * Sweet Home 3D OBJ files are Y-up with the front facing +Z. The app applies the catalogue's
    optional modelRotation (a 3x3 matrix) and then stretches the model's bounding box to the
    catalogue width x height x depth (cm). This script does the same.
  * Output follows the site's prop convention: glTF Y-up, front facing +Z, origin at the centre
    of the base, longest side = 1 unit (the site scales each prop with gen(name, size)).
    The real size and the catalogue's wall/floor elevation are kept in the JSON for placement.
  * All parts are joined into one mesh; each OBJ material stays a separate material.
    Textures are embedded. Metalness is 0 and roughness 0.6 (OBJ "Ks/Ns" shininess is ignored).
"""
import argparse, json, math, os, re, sys

import bpy
from mathutils import Matrix, Vector


def read_properties(path):
    """Minimal Java .properties reader: latin-1, \\uXXXX escapes, backslash line continuations."""
    text = open(path, encoding='latin-1').read()
    text = re.sub(r'\\\r?\n[ \t]*', '', text)
    out = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line[0] in '#!':
            continue
        m = re.match(r'((?:[^=:\s\\]|\\.)+)\s*[=:]?\s*(.*)', line)
        if not m:
            continue
        unesc = lambda s: re.sub(r'\\u([0-9a-fA-F]{4})', lambda u: chr(int(u.group(1), 16)), s).replace('\\:', ':').replace('\\=', '=').replace('\\\\', '\\')
        out[unesc(m.group(1))] = unesc(m.group(2))
    return out


def entry(props, index):
    suffix = f'#{index}'
    e = {k[:-len(suffix)]: v for k, v in props.items() if k.endswith(suffix)}
    if 'model' not in e:
        sys.exit(f'no model #{index} in catalogue')
    return e


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--pack', required=True)
    ap.add_argument('--index', type=int, required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--roughness', type=float, default=0.6)
    a = ap.parse_args(argv)

    props = read_properties(os.path.join(a.pack, 'PluginFurnitureCatalog.properties'))
    e = entry(props, a.index)
    obj = os.path.normpath(os.path.join(a.pack, e['model'].lstrip('/')))
    if not os.path.realpath(obj).startswith(os.path.realpath(a.pack)):
        sys.exit('model path leaves the pack folder')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    # OBJ Y-up, front +Z  ->  Blender Z-up, front -Y (the importer's default axis mapping)
    bpy.ops.wm.obj_import(filepath=obj, forward_axis='NEGATIVE_Z', up_axis='Y')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        sys.exit('nothing imported')

    # join everything into one object with its transforms applied
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # modelRotation is given in OBJ space (row-major, v' = M v); convert to Blender space: C M C^-1
    if e.get('modelRotation'):
        v = [float(x) for x in e['modelRotation'].split()]
        M = Matrix((v[0:3], v[3:6], v[6:9]))
        C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # OBJ (x, y, z) -> Blender (x, -z, y)
        ob.data.transform((C @ M @ C.inverted()).to_4x4())

    # stretch the bounding box to the catalogue size (cm): width = X, depth = Y, height = Z
    w, d, h = (float(e[k]) for k in ('width', 'depth', 'height'))
    co = [ob.matrix_world @ vv.co for vv in ob.data.vertices]
    lo = Vector((min(c.x for c in co), min(c.y for c in co), min(c.z for c in co)))
    hi = Vector((max(c.x for c in co), max(c.y for c in co), max(c.z for c in co)))
    size = hi - lo
    longest = max(w, d, h)
    sx, sy, sz = (t / longest / max(s, 1e-9) for t, s in zip((w, d, h), size))
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    ob.data.transform(Matrix.Translation(-centre))
    ob.data.transform(Matrix.Diagonal((sx, sy, sz, 1)))
    ob.location = (0, 0, 0)

    for mat in ob.data.materials:
        if mat and mat.use_nodes:
            bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf:
                bsdf.inputs['Metallic'].default_value = 0.0
                bsdf.inputs['Roughness'].default_value = a.roughness
                for name in ('Specular IOR Level', 'Specular'):
                    if name in bsdf.inputs:
                        bsdf.inputs[name].default_value = 0.5
                        break

    out = os.path.abspath(a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    ob.name = os.path.splitext(os.path.basename(out))[0]
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_image_format='AUTO', use_selection=False,
                              export_animations=False, export_cameras=False, export_lights=False)

    meta = {
        'source': 'Sweet Home 3D furniture library (SweetHome3D-Packs mirror)',
        'pack': os.path.basename(os.path.normpath(a.pack)),
        'index': a.index,
        'id': e.get('id'),
        'name': e.get('name'),
        'creator': e.get('creator'),
        'license': e.get('license'),
        'category': e.get('category'),
        'size_cm': {'width': w, 'depth': d, 'height': h},
        'elevation_cm': float(e.get('elevation', 0)),
        'triangles': sum(len(p.vertices) - 2 for p in ob.data.polygons),
        'materials': [m.name for m in ob.data.materials if m],
    }
    with open(os.path.splitext(out)[0] + '.json', 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print('SH3D_TO_GLB_OK', json.dumps(meta, ensure_ascii=False))


main()
