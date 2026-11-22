# Builds the compact shell parts and exports a shell model (default: Popfold's assets/compact.glb).
# Run, from the popfold folder:
#   blender --background --factory-startup --python tools/blender/build_compact.py
#   blender --background --factory-startup --python tools/blender/build_compact.py -- --corner 0.3 --out assets/compact-crisp.glb
#
#   --corner N   how round the case is: 1 is the soft, pillowy default; 0.3 is a crisp case; 0 is nearly sharp
#   --no-heart   leave the raised heart off the lid (a home can also hide it with emblem.heart)
#   --out FILE   where to write the .glb (a site can build its own shell and use it with look.shell = { url })
#
# The files in assets/ are then made smaller with `node bin/popfold.mjs optimize assets` (495 KB -> 224 KB each).
#
# Six objects are exported, each with its origin on the pivot the site animates:
#   Base   (origin: bottom centre)      Lid  (origin: back hinge)
#   Drawer (origin: bottom centre)      Wall (origin: bottom back edge)
#   Clasp, Heart (origin: the lid's back hinge, as they ride on the lid): parts of their own, so a home can take
#   them from another case (look.parts) or leave the heart off
# Blender is Z-up with the front of the compact facing -Y; the exporter converts to glTF Y-up.
# The site swaps materials by name (ShellBase, ShellLid, Gold, Heart, Drawer, WallWhite).
import argparse, bpy, bmesh, math, os, sys

here = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--corner", type=float, default=1.0)
ap.add_argument("--no-heart", action="store_true")
ap.add_argument("--out", default=os.path.join(here, "..", "..", "assets", "compact.glb"))
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
out_glb = os.path.abspath(args.out)
CORNER = max(0.0, min(1.0, args.corner))
def rounded(r):
    """A big corner radius, scaled by --corner but never quite sharp (a hard edge catches no light)."""
    return max(0.02, r * CORNER)
preview = os.environ.get("COMPACT_PREVIEW")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def mat(name, rgb, rough=0.25, coat=1.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    return m


M = {
    "base": mat("ShellBase", (1.0, 0.28, 0.55)),
    "lid": mat("ShellLid", (0.62, 0.01, 0.03)),
    "gold": mat("Gold", (0.83, 0.45, 0.1), 0.28, 0.0, 0.8),
    "heart": mat("Heart", (1.0, 0.7, 0.1), 0.2),
    "drawer": mat("Drawer", (1.0, 0.72, 0.1)),
    "wall": mat("WallWhite", (1.0, 0.94, 0.9), 0.4, 0.5),
}


def smooth(o, bevel=None, segments=8, clamp=True):
    if bevel:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segments
        b.use_clamp_overlap = clamp
    o.modifiers.new("wn", "WEIGHTED_NORMAL")
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def box(size, loc, m, radius, segments=8):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m)
    return smooth(o, radius, segments)


def cyl(r, depth, loc, m, axis="X"):
    rot = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=40, location=loc, rotation=rot)
    o = bpy.context.object
    o.data.materials.append(m)
    return smooth(o, min(r, depth) * 0.25, 4)


def ball(r, loc, m, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=32, ring_count=16, location=loc)
    o = bpy.context.object
    o.scale = scale
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def ring(half, corner, thick, loc, m):
    """Rounded-rectangle inlay ring lying flat."""
    cu = bpy.data.curves.new("ring", "CURVE")
    cu.dimensions = "3D"
    pts = []
    for cx, cy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for i in range(13):
            a = math.radians(a0 + i * 7.5)
            pts.append((cx * (half - corner) + math.cos(a) * corner, cy * (half - corner) + math.sin(a) * corner))
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts):
        p.co = (x, y, 0, 1)
    sp.use_cyclic_u = True
    cu.bevel_depth = thick
    cu.bevel_resolution = 5
    cu.materials.append(m)
    o = bpy.data.objects.new("ring", cu)
    scene.collection.objects.link(o)
    o.location = loc
    return o


def heart(width, thick, loc, m):
    """Puffy domed heart lying flat, tip pointing to the front (-Y)."""
    bm = bmesh.new()
    s = width / 32.0
    n, rings = 72, 10
    prev = None
    for k in range(rings):
        f = 1 - k / rings            # 1 at the rim, shrinking toward the centre
        z = thick * math.sqrt(1 - f * f)
        cur = []
        for i in range(n):
            t = i / n * math.tau
            x = 16 * math.sin(t) ** 3
            y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            cur.append(bm.verts.new((x * s * f, y * s * f, z)))
        if prev:
            for i in range(n):
                bm.faces.new((prev[i], prev[(i + 1) % n], cur[(i + 1) % n], cur[i]))
        prev = cur
    centre = bm.verts.new((0, 0, thick))
    for i in range(n):
        bm.faces.new((prev[i], prev[(i + 1) % n], centre))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("heart")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(m)
    o = bpy.data.objects.new("heart", me)
    scene.collection.objects.link(o)
    o.location = loc
    return o


def finish(name, parts, pivot):
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    scene.cursor.location = pivot
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    return o


W, BASE_H, LID_H = 4.0, 0.7, 0.45
top = BASE_H + LID_H

base = finish("Base", [
    box((W, W, BASE_H), (0, 0, BASE_H / 2), M["base"], rounded(0.28), 10),
    # seam trim. Its top sits a hair above the base's own top face: level with it, the two faces fight for the
    # same pixels and the rim flickers between gold and the base colour wherever the floor does not cover it.
    box((W + 0.07, W + 0.07, 0.08), (0, 0, BASE_H - 0.04 + 0.002), M["gold"], 0.035, 4),
    *[ball(0.24, (sx * 1.45, sy * 1.45, 0.0), M["gold"], (1, 1, 0.4)) for sx in (-1, 1) for sy in (-1, 1)],  # feet
    cyl(0.1, 0.62, (-1.25, 2.03, BASE_H), M["gold"]),  # hinge knuckles
    cyl(0.1, 0.62, (1.25, 2.03, BASE_H), M["gold"]),
    cyl(0.16, 0.05, (0, -2.0, 0.33), M["gold"], "Y"),  # clasp catch plate
], (0, 0, 0))

lid = finish("Lid", [
    box((W, W, LID_H), (0, 0, BASE_H + LID_H / 2), M["lid"], rounded(0.22), 10),
    ring(1.72, 0.42, 0.035, (0, 0, top - 0.005), M["gold"]),  # inlay border
    cyl(0.1, 0.62, (0, 2.03, BASE_H), M["gold"]),  # middle hinge knuckle
], (0, 2.0, BASE_H))

clasp = finish("Clasp", [
    box((0.86, 0.14, 0.34), (0, -2.05, BASE_H + 0.12), M["gold"], 0.06, 6),  # clasp tongue
    cyl(0.11, 0.08, (0, -2.13, BASE_H + 0.02), M["base"], "Y"),  # clasp button
], (0, 2.0, BASE_H))

hearts = [] if args.no_heart else [finish("Heart", [heart(1.3, 0.2, (0, 0.5, top - 0.01), M["heart"])], (0, 2.0, BASE_H))]

drawer = finish("Drawer", [
    box((3.8, 3.8, 0.4), (0, 0, 0.35), M["drawer"], rounded(0.1), 8),
    cyl(0.2, 0.05, (0, -1.9, 0.35), M["gold"], "Y"),
    ball(0.13, (0, -2.0, 0.35), M["gold"]),
], (0, 0, 0))

wall = finish("Wall", [
    box((3.8, 0.12, 2.2), (0, 1.78, 0.55 + 1.1), M["wall"], 0.05, 5),
    box((3.92, 0.2, 0.1), (0, 1.78, 0.55 + 2.22), M["gold"], 0.045, 5),  # top rail
    ball(0.1, (-1.86, 1.78, 0.55 + 2.33), M["gold"]),
    ball(0.1, (1.86, 1.78, 0.55 + 2.33), M["gold"]),
], (0, 1.84, 0.55))

bpy.ops.object.select_all(action="DESELECT")
for o in (base, lid, drawer, wall, clasp, *hearts):
    o.select_set(True)
os.makedirs(os.path.dirname(out_glb), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=True, export_apply=True,
                          export_animations=False, export_cameras=False, export_lights=False)
print("EXPORTED", os.path.getsize(out_glb), "bytes;", sum(len(o.data.polygons) for o in (base, lid, drawer, wall, clasp, *hearts)), "faces")

if preview:  # optional posed renders for a visual check
    drawer.location = (-4.1, 0, 0)
    wall.location = (-4.1, 1.84, 0.55)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    tgt = bpy.data.objects.new("Tgt", None)
    scene.collection.objects.link(tgt)
    cam.constraints.new("TRACK_TO").target = tgt
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    scene.collection.objects.link(sun)
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(45), 0, math.radians(30))
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    scene.world = world
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (1.0, 0.6, 0.78, 1)
    bg.inputs[1].default_value = 0.45
    scene.view_settings.view_transform = "Standard"
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type != "CPU"
        scene.cycles.device = "GPU"
    except Exception as e:
        print("gpu", e)
    scene.cycles.samples = 64
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 760
    shots = (("open", -102, (5, -13, 8.5), (-1.6, 0.4, 1.5)), ("closed", 0, (3.4, -7.5, 4.2), (0, -0.2, 0.7)))
    for name, angle, loc, t in shots:
        lid.rotation_euler = (math.radians(angle), 0, 0)
        cam.location = loc
        tgt.location = t
        scene.render.filepath = preview.replace(".png", "_" + name + ".png")
        bpy.ops.render.render(write_still=True)
    print("RENDERED")
