"""
Normalise a downloaded GLB to Popfold's prop convention, so ctx.gen(name, size) can place it:
glTF Y-up, front facing +Z, origin at the centre of the base, longest side = 1 unit.
Animations are kept (e.g. a robot's Idle clip). Materials and textures are kept as they are.

Usage (Blender 4.2+; tested 5.3). Run with the downloads folder as data, never as the working directory:
  blender -b --factory-startup --python tools/blender/normalize_glb.py -- \
      --in <downloads>/office-chair.glb \
      --out <site>/public/models/props/office-chair.glb [--turn 180] [--keep-anims]

  --turn  degrees to spin the model about the vertical before export, when its front isn't +Z
"""
import argparse, math, os, sys
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--in', dest='src', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--turn', type=float, default=0.0)
ap.add_argument('--keep-anims', action='store_true')
a = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.src))
roots = [o for o in bpy.context.scene.objects if o.parent is None]

# one root to move and scale everything together (armatures, meshes, empties)
pivot = bpy.data.objects.new('prop', None)
bpy.context.scene.collection.objects.link(pivot)
for o in roots:
    mw = o.matrix_world.copy(); o.parent = pivot; o.matrix_world = mw
bpy.context.view_layer.update()

def bounds():
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        ev = o.evaluated_get(dg)
        for v in ev.data.vertices:
            w = ev.matrix_world @ v.co
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z))); hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi

if a.turn:
    pivot.rotation_euler.z = math.radians(a.turn)
    bpy.context.view_layer.update()
lo, hi = bounds()
size = hi - lo
k = 1.0 / max(size.x, size.y, size.z)
centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
pivot.matrix_world = Matrix.Scale(k, 4) @ Matrix.Translation(-centre) @ pivot.matrix_world
bpy.context.view_layer.update()
lo, hi = bounds()

out = os.path.abspath(a.out)
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=False,
                          export_animations=a.keep_anims, export_cameras=False, export_lights=False)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH')
print('NORMALIZE_OK', os.path.basename(out), 'size', tuple(round(v, 3) for v in (hi - lo)), 'base', round(lo.z, 4), 'tris', tris, 'bytes', os.path.getsize(out))
