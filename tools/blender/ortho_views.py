"""Orthographic front / right side / top / back views of a .glb, side by side on one sheet, with a
10 cm-of-the-normalised-unit grid (0.1) so shapes can be measured (run inside Blender).

    blender -b -P ortho_views.py -- IN.glb OUT.png [--res 768]
"""
import math, sys, bpy, numpy as np
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
res = int(a[a.index("--res") + 1]) if "--res" in a else 768
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
sc = bpy.context.scene
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try: sc.render.engine = eng; break
    except TypeError: pass
sc.render.resolution_x = sc.render.resolution_y = res; sc.render.film_transparent = False
w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.92, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0; sc.world = w
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3; sun.rotation_euler = (math.radians(40), 0, math.radians(25)); sc.collection.objects.link(sun)
# grid lines every 0.1
gm = bpy.data.materials.new("g"); gm.use_nodes = True; gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.2, 0.5, 1, 1)
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 1.1
views = {"front": ((0, -3, 0.5), (math.radians(90), 0, 0)), "right": ((3, 0, 0.5), (math.radians(90), 0, math.radians(90))),
         "top": ((0, 0, 3), (0, 0, 0)), "back": ((0, 3, 0.5), (math.radians(90), 0, math.radians(180)))}
paths = []
for k, (loc, rot) in views.items():
    cam.location = loc; cam.rotation_euler = rot
    if k == "top": cam.location = (0, 0, 3)
    p = a[1].replace(".png", f"_{k}.png"); sc.render.filepath = p; bpy.ops.render.render(write_still=True); paths.append(p)
imgs = [np.array(bpy.data.images.load(p).pixels[:]).reshape(res, res, 4) for p in paths]
for im in imgs:  # grid every 0.1 units: ortho_scale 1.1 over res px
    for g in np.arange(-0.5, 0.61, 0.1):
        px = int(res / 2 + g * res / 1.1)
        if 0 <= px < res: im[:, px, :3] = im[:, px, :3] * 0.6 + np.array([0.2, 0.4, 1]) * 0.4; im[px, :, :3] = im[px, :, :3] * 0.6 + np.array([0.2, 0.4, 1]) * 0.4
sheet = np.concatenate(imgs, axis=1)
o = bpy.data.images.new("s", res * 4, res); o.pixels = sheet.ravel().tolist(); o.filepath_raw = a[1]; o.file_format = "PNG"; o.save()
import os
for p in paths: os.remove(p)
