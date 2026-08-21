"""
Export one region model from the Z-Anatomy source.

Generalises the upper-limb script. Run as:

    blender --background --factory-startup --python export_region.py -- lower-limb

Reads /home/claude/region-objects.json, which lists the exact source object
names for that region (already verified to exist), and writes
/home/claude/work/<region>-raw.glb plus a kinds file for the app.

The upper-limb run taught this script three things, all of which bite silently:
  - nerves and vessels are CURVE objects and vanish unless converted to mesh;
  - libraries.load pulls in dependencies, so anything not asked for must be
    deleted or it inflates the bounding box and ships unreviewed geometry;
  - three.js sanitises node names, so names are pre-normalised to word
    characters that survive the trip.
"""

import bpy, json, os, sys, re
import mathutils

BLEND = '/home/claude/zsrc/Z-Anatomy/Startup.blend'

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not argv:
    raise SystemExit('usage: ... --python export_region.py -- <region-id>')
REGION = argv[0]

cfg = json.load(open('/home/claude/region-objects.json'))[REGION]
OUT = f'/home/claude/work/{REGION}-raw.glb'

muscle_objs = cfg['muscles']
bone_objs = cfg['bones']
nerve_objs = cfg['nerves']
vessel_objs = cfg['vessels']
want = muscle_objs + bone_objs + nerve_objs + vessel_objs

bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(BLEND, link=False) as (src, dst):
    avail = set(src.objects)
    dst.objects = [n for n in want if n in avail]

missing = [n for n in want if n not in avail]

wanted = set(want)
for o in list(bpy.data.objects):
    if o.name not in wanted:
        bpy.data.objects.remove(o, do_unlink=True)

scene = bpy.context.scene
for o in bpy.data.objects:
    try:
        scene.collection.objects.link(o)
    except RuntimeError:
        pass

curves = [o for o in bpy.data.objects if o.type in {'CURVE', 'SURFACE', 'FONT', 'META'}]
if curves:
    bpy.ops.object.select_all(action='DESELECT')
    for o in curves:
        o.select_set(True)
    bpy.context.view_layer.objects.active = curves[0]
    bpy.ops.object.convert(target='MESH')
    print(f'CONVERTED {len(curves)} curve objects to mesh')
    bpy.ops.object.select_all(action='DESELECT')

loaded = []
for o in bpy.data.objects:
    if o.type != 'MESH' or len(o.data.polygons) == 0:
        continue
    o.parent = None
    o.hide_set(False)
    o.hide_viewport = False
    o.hide_render = False
    loaded.append(o)

lo = mathutils.Vector((1e9,) * 3)
hi = mathutils.Vector((-1e9,) * 3)
for o in loaded:
    for corner in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(corner)
        lo = mathutils.Vector((min(lo[i], w[i]) for i in range(3)))
        hi = mathutils.Vector((max(hi[i], w[i]) for i in range(3)))

names_loaded = {o.name for o in loaded}
print(f'LOADED {len(loaded)} meshes: '
      f'{len(names_loaded & set(muscle_objs))} muscle, '
      f'{len(names_loaded & set(bone_objs))} bone, '
      f'{len(names_loaded & set(nerve_objs))} nerve, '
      f'{len(names_loaded & set(vessel_objs))} vessel')
print(f'MISSING {len(missing)}: {missing[:6]}')
dropped = [n for n in want if n in avail and n not in names_loaded]
print(f'NO_GEOMETRY {len(dropped)}: {dropped[:8]}')
print(f'SIZE  {hi.x-lo.x:.3f} x {hi.y-lo.y:.3f} x {hi.z-lo.z:.3f}')


def safe_name(n):
    n = re.sub(r'\.(r|l)$', r'__\1', n)
    n = re.sub(r'[^0-9A-Za-z_]+', '_', n)
    return re.sub(r'_+', '_', n).strip('_')


renames, kinds = {}, {}
for o in loaded:
    new = safe_name(o.name)
    renames[o.name] = new
    kinds[new] = ('nerve' if o.name in nerve_objs else
                  'vein' if (o.name in vessel_objs and 'vein' in o.name.lower()) else
                  'artery' if o.name in vessel_objs else
                  'bone' if o.name in bone_objs else 'muscle')
for old, new in renames.items():
    bpy.data.objects[old].name = new

os.makedirs('/home/claude/work', exist_ok=True)
json.dump(kinds, open(f'/home/claude/work/{REGION}-kinds.json', 'w'), indent=1)
json.dump(renames, open(f'/home/claude/work/{REGION}-renames.json', 'w'))

centre = (lo + hi) / 2.0
for o in loaded:
    o.location = o.location - centre
bpy.context.view_layer.update()
print(f'RECENTRED by ({-centre.x:.3f}, {-centre.y:.3f}, {-centre.z:.3f})')

bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
    export_materials='EXPORT', export_cameras=False, export_lights=False,
    export_animations=False, use_visible=False, use_selection=False,
)
print(f'EXPORT_OK {OUT} {os.path.getsize(OUT)/1048576:.2f} MB')
