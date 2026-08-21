"""
Build an approximate SKIN ENVELOPE for the upper limb.

Z-Anatomy has no skin, dermis or integument mesh — I checked every object in
the source. So this derives an envelope from the anatomy that IS there: join a
copy of every muscle and bone, voxel-remesh the union to get a single closed
outer surface, smooth it, and shrink it back slightly so it hugs the limb.

WHAT THIS IS AND IS NOT. It is the outer surface of the modelled anatomy,
inflated by the remesh and then smoothed — a stand-in for the body surface so a
needle marker can be seen relative to it. It is NOT a skin dataset, it carries
no subcutaneous fat, and its distance from any muscle is an artefact of the
voxel size, not an anatomical measurement. The viewer labels it as approximate
and it must never be used to read a depth off.

    blender --background --factory-startup --python skin_envelope.py
"""

import bpy, json, os, sys

BLEND = '/home/claude/zsrc/Z-Anatomy/Startup.blend'
OUT = '/home/claude/work/skin-envelope.glb'
VOXEL = 0.006      # 6 mm — coarse enough to bridge between muscles
SHRINK = -0.004    # pull the surface back in after the remesh inflates it

muscle_objs = [o for o in json.load(open('/home/claude/ul-objects.json')) if o.endswith('.r')]
BONES = ['Humerus', 'Radius', 'Ulna', 'Clavicle', 'Scapula',
         'Scaphoid bone', 'Lunate bone', 'Triquetrum bone', 'Pisiform bone',
         'Trapezium bone', 'Trapezoid bone', 'Capitate bone', 'Hamate bone',
         'First metacarpal bone', 'Second metacarpal bone', 'Third metacarpal bone',
         'Fourth metacarpal bone', 'Fifth metacarpal bone']
for finger in ['first', 'second', 'third', 'fourth', 'fifth']:
    for part in ['Proximal', 'Middle', 'Distal']:
        BONES.append(f'{part} phalanx of {finger} finger of hand')
want = muscle_objs + [b + '.r' for b in BONES]

bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(BLEND, link=False) as (src, dst):
    avail = set(src.objects)
    dst.objects = [n for n in want if n in avail]

wanted = set(want)
for o in list(bpy.data.objects):
    if o.name not in wanted:
        bpy.data.objects.remove(o, do_unlink=True)

scene = bpy.context.scene
meshes = []
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    try:
        scene.collection.objects.link(o)
    except RuntimeError:
        pass
    o.parent = None
    meshes.append(o)

print(f'ENVELOPE_INPUT {len(meshes)} meshes')

bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
joined = bpy.context.view_layer.objects.active
joined.name = 'Skin_envelope_r'
print(f'JOINED polys={len(joined.data.polygons)}')

# Voxel remesh: turns the union of many overlapping shells into one closed
# surface. This is the step that makes an "outside" exist at all.
mod = joined.modifiers.new(name='remesh', type='REMESH')
mod.mode = 'VOXEL'
mod.voxel_size = VOXEL
mod.use_smooth_shade = True
bpy.ops.object.modifier_apply(modifier='remesh')
print(f'REMESHED polys={len(joined.data.polygons)}')

smooth = joined.modifiers.new(name='smooth', type='SMOOTH')
smooth.factor = 0.8
smooth.iterations = 12
bpy.ops.object.modifier_apply(modifier='smooth')

shrink = joined.modifiers.new(name='offset', type='DISPLACE')
shrink.strength = SHRINK
shrink.mid_level = 0.0
bpy.ops.object.modifier_apply(modifier='offset')

dec = joined.modifiers.new(name='decimate', type='DECIMATE')
dec.ratio = 0.25
bpy.ops.object.modifier_apply(modifier='decimate')
print(f'FINAL polys={len(joined.data.polygons)}')

# Recentre exactly as export_ul.py does, so the envelope lines up with the
# limb model it will be loaded alongside.
report = json.load(open('/home/claude/work/export-report.json'))
lo = report['bbox']['min']
hi = report['bbox']['max']
centre = [(lo[i] + hi[i]) / 2 for i in range(3)]
joined.location = (joined.location[0] - centre[0],
                   joined.location[1] - centre[1],
                   joined.location[2] - centre[2])
bpy.context.view_layer.update()

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
    export_materials='EXPORT', export_cameras=False, export_lights=False,
    export_animations=False, use_visible=False, use_selection=False,
)
print(f'ENVELOPE_OK {OUT} {os.path.getsize(OUT)/1048576:.2f} MB')
