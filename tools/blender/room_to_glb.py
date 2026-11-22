"""
Turn a modelled cutaway room (.blend) into a Popfold "diorama" GLB: a floor, walls that fold, and pieces that pop in.

Usage (Blender 4.2+, tested 5.3; --disable-autoexec so scripts inside the .blend never run):
  blender -b --disable-autoexec <room>.blend --python room_to_glb.py -- --config <room>.json --out <site>/public/models/room.glb [--tex 512]

The room is described by a JSON file (see "the room's description" below): which objects form which piece, what
hangs on which wall, where the zones are, and which materials the site paints. A site keeps it beside the
model's source, e.g. tools/room.json.

What it expects of the .blend: a cutaway room with the floor at z = 0, and the floor and its walls in one mesh. The
walls are any of back (along +y), front (-y), right (+x) and left (-x), each at a line the config gives; a room
modelled facing another way is turned first ("turn").

What it writes (glTF Y-up; Blender x stays x, Blender +y becomes -z, so the back wall ends up at -z):
  room                  root (metres, as modelled)
    floor               the floor mesh
    wall_<side>         for each wall: an empty on its bottom edge (the hinge) + the wall mesh and what hangs on it
    piece_<name>        one empty per piece (on the floor under its centre) with its meshes; extras: zone, wall
  Every piece carries glTF extras {"zone": "<zone>", "piece": "<name>"} -> three.js userData.

Textures: only those named in keepTextures are kept, resized to --tex px; every other image is replaced by a flat
colour, so no third-party texture images ship unless you say so.
The art materials (screens, posters) are renamed art_* and emptied: the site paints them.
"""
import argparse, json, os, sys
import bpy, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
ap.add_argument('--config', required=True)
ap.add_argument('--tex', type=int, default=512)
a = ap.parse_args(argv)

# ---------------- the room's description ----------------
# Everything specific to one .blend comes from --config (JSON):
#   shell         the object holding the floor and its walls in one mesh
#   walls         { back?, front?, right?, left? }: where each wall stands, in Blender units after the turn (back and
#                 front are y values, right and left x values). A room has the walls it names: two, three or four
#   turn          degrees to turn the whole room about z first (default 0), so its back wall faces +y
#   drop          objects to leave out
#   pieces        { "<piece>": { "objects": [names], "wall"?: "back" | "front" | "right" | "left" } }; objects not listed join the nearest piece
#   zones         rules tried in order on each piece's centre: { zone, xMin?, xMax?, yMin?, yMax? }; the last one is the default
#   art           rename: { material: "art_<name>" } handed to the site to paint;
#                 sliced: [{ piece, material, facing? }] one image shared across a piece's objects, a slice each (a bank of
#                         monitors), left to right as seen by someone looking at the wall it faces (default right);
#                 each:   [{ piece, material, prefix }] one material per object, its room-facing side showing the whole image (posters)
#   keepTextures  image-name fragments of textures that may ship (others become a flat colour)
#   flat          { image-name fragment: [r, g, b] } the flat colour to use (linear RGB); others get a muted default
with open(a.config, encoding='utf-8') as fh:
    CFG = json.load(fh)
DROP = CFG.get('drop', [])
SHELL = CFG['shell']
GROUPS = {k: v['objects'] for k, v in CFG['pieces'].items()}
ON_WALL = {k: v['wall'] for k, v in CFG['pieces'].items() if v.get('wall')}
def ZONE(name, c):
    for r in CFG['zones']:
        if r.get('xMin', -1e9) < c.x < r.get('xMax', 1e9) and r.get('yMin', -1e9) < c.y < r.get('yMax', 1e9):
            return r['zone']
    return CFG['zones'][-1]['zone']
ART = CFG.get('art', {})
KEEP_TEX = tuple(CFG.get('keepTextures', []))
FLAT = CFG.get('flat', {})
WALLS = CFG['walls']  # { side: where it stands }
for side in WALLS:
    if side not in ('back', 'front', 'right', 'left'): sys.exit(f'walls: "{side}" is not a wall (back, front, right, left)')
# each wall: the way out of the room through it, and the way to the right for someone looking at it from inside
OUT = {'back': Vector((0, 1, 0)), 'front': Vector((0, -1, 0)), 'right': Vector((1, 0, 0)), 'left': Vector((-1, 0, 0))}
RIGHT_OF = {'back': Vector((1, 0, 0)), 'front': Vector((-1, 0, 0)), 'right': Vector((0, -1, 0)), 'left': Vector((0, 1, 0))}
def past(side, c):
    """how far inside the room a point is from a wall (small: at the wall)"""
    return (WALLS[side] - c.y) if side == 'back' else (c.y - WALLS[side]) if side == 'front' else (WALLS[side] - c.x) if side == 'right' else (c.x - WALLS[side])

# ---------------- helpers ----------------
def world_bounds(objs):
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z))); hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi

def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()
    return e

def reparent(o, parent):
    mw = o.matrix_world.copy()
    o.parent = parent
    o.matrix_world = mw
    bpy.context.view_layer.update()

def flat_colour(image_name):
    """A stand-in colour (linear RGB) for a texture that is not shipped."""
    n = image_name.lower()
    for key, col in FLAT.items():
        if key in n: return col
    h = sum(map(ord, n))  # anything else: a muted colour picked from the name
    return [(0.25, 0.18, 0.12), (0.12, 0.16, 0.24), (0.28, 0.12, 0.12), (0.16, 0.22, 0.16)][h % 4]

def average_colour(img):
    try:
        small = img.copy(); small.scale(16, 16)
        px = list(small.pixels); n = len(px) // 4
        col = [sum(px[i::4]) / n for i in range(3)]
        bpy.data.images.remove(small)
        return col
    except Exception:
        return [0.5, 0.5, 0.5]

# ---------------- 1. drop, convert, split the shell ----------------
for name in DROP:
    o = bpy.data.objects.get(name)
    if o: bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.context.scene.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
curves = [o for o in bpy.context.scene.objects if o.type == 'CURVE']
for o in curves: o.select_set(True)
if curves:
    bpy.context.view_layer.objects.active = curves[0]
    bpy.ops.object.convert(target='MESH')
for o in bpy.context.scene.objects:
    o.select_set(False)
# web budget: at most one level of subdivision, and decimate anything still over MAX_VERTS once modifiers apply
MAX_VERTS = 2000
dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.context.scene.objects:
    if o.type != 'MESH': continue
    for md in o.modifiers:
        if md.type == 'SUBSURF':
            md.levels = min(md.levels, 1); md.render_levels = min(md.render_levels, 1)
    dg.update()
    n = len(o.evaluated_get(dg).data.vertices)
    if n > MAX_VERTS:
        dec = o.modifiers.new('web_decimate', 'DECIMATE'); dec.ratio = MAX_VERTS / n
        print('DECIMATE', o.name, n, '->', MAX_VERTS)

# a room modelled facing another way: turn everything about z first, so its back wall faces +y
TURN = CFG.get('turn', 0)
if TURN:
    from mathutils import Matrix
    import math
    rz = Matrix.Rotation(math.radians(TURN), 4, 'Z')
    for o in bpy.context.scene.objects:
        if not o.parent: o.matrix_world = rz @ o.matrix_world
    bpy.context.view_layer.update()

shell = bpy.data.objects[SHELL]
def split(obj, test, name):
    """Copy obj keeping only the faces whose world-space centre passes test."""
    me = obj.data.copy(); ob = obj.copy(); ob.data = me; ob.name = name
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(me)
    mw = obj.matrix_world
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not test(mw @ f.calc_center_median(), (mw.to_3x3() @ f.normal).normalized())], context='FACES')
    bm.to_mesh(me); bm.free()
    return ob
# every face goes with the wall it is closest to (wall faces, their edges and tops), the rest is floor
def side_of(c, n):
    near = [side for side in WALLS if past(side, c) < 0.35]
    if c.z > 0.05 and near:
        return min(near, key=lambda side: past(side, c))
    return 'floor' if c.z <= 0.05 else 'drop'  # tall faces away from every wall are the cutaway's outer edges
floor = split(shell, lambda c, n: side_of(c, n) == 'floor', 'floor')
wall_mesh = {side: split(shell, lambda c, n, side=side: side_of(c, n) == side, f'wall_{side}_mesh') for side in WALLS}
leftover = split(shell, lambda c, n: False, 'shell_rest')
print('SHELL faces floor', len(floor.data.polygons), {k: len(v.data.polygons) for k, v in wall_mesh.items()}, 'rest', len(leftover.data.polygons))
bpy.data.objects.remove(shell, do_unlink=True)
if not leftover.data.polygons: bpy.data.objects.remove(leftover, do_unlink=True)

# ---------------- 2. hierarchy ----------------
room = empty('room', (0, 0, 0))
reparent(floor, room)
hinge = {}
for side, at in WALLS.items():
    hinge[side] = empty(f'wall_{side}', (0, at, 0) if side in ('back', 'front') else (at, 0, 0), room)
    reparent(wall_mesh[side], hinge[side])
if bpy.data.objects.get('shell_rest'): reparent(bpy.data.objects['shell_rest'], room)

members = {k: [bpy.data.objects[n] for n in v if bpy.data.objects.get(n)] for k, v in GROUPS.items()}
listed = {o.name for v in members.values() for o in v}
skip = {room.name, floor.name, 'shell_rest', *(h.name for h in hinge.values()), *(m.name for m in wall_mesh.values())}
centres = {k: (world_bounds(v)[0] + world_bounds(v)[1]) / 2 for k, v in members.items() if v}
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH' or o.name in listed or o.name in skip or o.parent: continue
    lo, hi = world_bounds([o]); c = (lo + hi) / 2
    best = min(centres, key=lambda k: (centres[k] - c).length)
    members[best].append(o)
    print('JOIN', o.name, '->', best)

for name, objs in members.items():
    if not objs: continue
    lo, hi = world_bounds(objs); c = (lo + hi) / 2
    wall = ON_WALL.get(name)
    if wall and wall not in hinge: sys.exit(f'piece "{name}" hangs on the {wall} wall, which "walls" does not name')
    parent = hinge[wall] if wall else room
    base = Vector((c.x, c.y, lo.z)) if not wall else c
    p = empty(f'piece_{name}', base, parent)
    p['zone'] = ZONE(name, c); p['piece'] = name
    if wall: p['wall'] = wall
    for o in objs: reparent(o, p)
    print('PIECE', name, p['zone'], wall or '-', len(objs))

# ---------------- 3a. art UVs: each monitor gets its own third of the dashboard, each poster's face the whole image
def faces_with(obj, mat_name):
    idx = [i for i, sl in enumerate(obj.material_slots) if sl.material and sl.material.name == mat_name]
    return [f for f in obj.data.polygons if f.material_index in idx]
for rule in ART.get('sliced', []):
    mons = [o for o in members.get(rule['piece'], []) if faces_with(o, rule['material'])]
    across = RIGHT_OF[rule.get('facing', 'right')]  # left to right, as seen looking at the wall they face
    mons.sort(key=lambda o: (o.matrix_world @ Vector(o.bound_box[0])).dot(across))
    for i, o in enumerate(mons):
        uv = o.data.uv_layers.active.data
        fs = faces_with(o, rule['material'])
        us = [uv[li].uv.x for f in fs for li in f.loop_indices]
        lo, hi = min(us), max(us)
        for f in fs:
            for li in f.loop_indices: uv[li].uv.x = (i + (uv[li].uv.x - lo) / max(hi - lo, 1e-6)) / len(mons)
    print('ART sliced', rule['piece'], [o.name for o in mons])
for rule in ART.get('each', []):
    for o in members.get(rule['piece'], []):
        uv = o.data.uv_layers.active.data
        fs = faces_with(o, rule['material'])
        mw = o.matrix_world
        # the face looking into the room from the wall the piece hangs on (back, if it names none)
        wall = ON_WALL.get(rule['piece'], 'back')
        front = min(fs, key=lambda f: (mw.to_3x3() @ f.normal).dot(OUT[wall]))
        pts = [mw @ o.data.vertices[v].co for v in front.vertices]
        across = [p.dot(RIGHT_OF[wall]) for p in pts]
        x0, x1 = min(across), max(across); z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
        for f in fs:
            for li, v in zip(f.loop_indices, f.vertices):
                if f is front:
                    p = mw @ o.data.vertices[v].co
                    uv[li].uv = ((p.dot(RIGHT_OF[wall]) - x0) / (x1 - x0), (p.z - z0) / (z1 - z0))
                else:
                    uv[li].uv = (0.02, 0.02)  # sides and back take the poster's dark corner
    print('ART each', rule['piece'], [o.name for o in members.get(rule['piece'], [])])

# ---------------- 3. materials and textures ----------------
for rule in ART.get('each', []):  # one material per object so each can get its own art
    for i, o in enumerate(members.get(rule['piece'], []), 1):
        for slot in o.material_slots:
            if slot.material and slot.material.name == rule['material']:
                m = slot.material.copy(); m.name = f"{rule['prefix']}{i}"; slot.material = m
for old, new in ART.get('rename', {}).items():
    m = bpy.data.materials.get(old)
    if m: m.name = new

for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    for n in list(nt.nodes):
        if n.type != 'TEX_IMAGE' or not n.image: continue
        img = n.image
        keep = m.name.startswith('art_') is False and any(k in img.name for k in KEEP_TEX)
        is_colour = any(l.to_socket.name in ('Base Color', 'Color') for l in n.outputs['Color'].links)
        is_normal = any(l.to_node.type == 'NORMAL_MAP' for l in n.outputs['Color'].links)
        if keep and (is_colour or is_normal or 'Roughness' in img.name):
            if max(img.size) > a.tex: img.scale(a.tex, a.tex)
            continue
        if bsdf and is_colour and not m.name.startswith('art_'):
            bsdf.inputs['Base Color'].default_value = (*flat_colour(img.name), 1)
        nt.nodes.remove(n)
    if m.name.startswith('art_') and bsdf:  # blank screen/poster, painted by the site
        bsdf.inputs['Base Color'].default_value = (0.05, 0.06, 0.09, 1)
for img in list(bpy.data.images):
    if img.users == 0: bpy.data.images.remove(img)
print('IMAGES kept', [(i.name, i.size[:]) for i in bpy.data.images if i.users])

# ---------------- 4. export ----------------
out = os.path.abspath(a.out)
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
room.select_set(True)
for o in room.children_recursive: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_extras=True, export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=82,
                          export_animations=False, export_cameras=False, export_lights=False)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in room.children_recursive if o.type == 'MESH')
print('ROOM_TO_GLB_OK', out, os.path.getsize(out), 'bytes', tris, 'triangles')
