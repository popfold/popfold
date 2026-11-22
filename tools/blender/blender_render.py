"""Render review images of a .glb with Blender (headless).

    blender -b -P blender_render.py -- IN.glb OUT.png [--tint #RRGGBB] [--wire] [--views 3]

Renders N views around the object side by side. Uses the model's own materials /
vertex colours when it has them, otherwise a glossy tint. --wire overlays edges so
the polygon density is visible.
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
import os
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
tint = argv[argv.index("--tint") + 1] if "--tint" in argv else None
wire = "--wire" in argv
views = int(argv[argv.index("--views") + 1]) if "--views" in argv else 3
frame = int(argv[argv.index("--frame") + 1]) if "--frame" in argv else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if frame is not None:
    bpy.context.scene.frame_set(frame)

# bounds
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
center, size = (lo + hi) / 2, (hi - lo).length


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4)) + (1,)


for o in meshes:
    textured = any(s.material and s.material.use_nodes and any(n.type == "TEX_IMAGE" for n in s.material.node_tree.nodes) for s in o.material_slots)
    if (textured or any(s.material for s in o.material_slots)) and not tint and not o.data.color_attributes:
        pass  # keep the model's own materials (textures or plain colours)
    elif o.data.color_attributes and not tint:
        m = bpy.data.materials.new("vcol"); m.use_nodes = True
        nt = m.node_tree; b = nt.nodes["Principled BSDF"]
        a = nt.nodes.new("ShaderNodeVertexColor"); a.layer_name = o.data.color_attributes[0].name
        nt.links.new(a.outputs["Color"], b.inputs["Base Color"]); b.inputs["Roughness"].default_value = 0.45
        o.data.materials.clear(); o.data.materials.append(m)
    else:
        m = bpy.data.materials.new("tint"); m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = hex_rgb(tint or "#FF8FC0")
        b.inputs["Roughness"].default_value = 0.4
        o.data.materials.clear(); o.data.materials.append(m)
    if wire:
        mod = o.modifiers.new("w", "WIREFRAME"); mod.use_replace = False; mod.thickness = size * 0.0025
        wm = bpy.data.materials.new("wire"); wm.use_nodes = True
        wm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.03, 0.0, 0.01, 1)
        o.data.materials.append(wm); mod.material_offset = len(o.data.materials) - 1

scene = bpy.context.scene
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        scene.render.engine = eng; break
    except TypeError:
        pass
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (1.0, 0.92, 0.95, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
scene.view_settings.view_transform = "Standard"

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), 0, math.radians(35)); scene.collection.objects.link(sun)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam)
scene.camera = cam; cam.data.lens = 60
res = 512
scene.render.resolution_x = scene.render.resolution_y = res
scene.render.film_transparent = False

paths = []
angles = [35, 145, 250, 325][:views] if views <= 4 else [i * 360 / views for i in range(views)]
for i, a in enumerate(angles):
    r = math.radians(a); d = size * 1.9
    cam.location = center + Vector((math.sin(r) * d, -math.cos(r) * d, d * 0.42))
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    p = f"{out[:-4]}_v{i}.png"; scene.render.filepath = p
    bpy.ops.render.render(write_still=True); paths.append(p)

# stitch side by side
imgs = [bpy.data.images.load(p) for p in paths]
import numpy as np
arrs = [np.array(im.pixels[:]).reshape(res, res, 4) for im in imgs]
sheet = np.concatenate(arrs, axis=1)
o = bpy.data.images.new("sheet", res * len(arrs), res, alpha=True)
o.pixels = sheet.ravel().tolist(); o.filepath_raw = out; o.file_format = "PNG"; o.save()
import os
for p in paths:
    os.remove(p)
tris = sum(len(p.vertices) - 2 for m in meshes for p in m.data.polygons)
print(f"RENDERED {out} tris={tris}")
