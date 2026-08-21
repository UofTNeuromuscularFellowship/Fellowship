# 3D Atlas — asset pipeline

Turns the upstream open-licensed anatomy models into the compressed, correctly
named `.glb` files the 3D Atlas loads, one body region at a time.

**Read `../../LICENSES-3D.md` before adding any asset.** Every model file in
`public/models/` must be recorded there, along with the changes made to it —
that record is a licence obligation, not bookkeeping.

---

## Layout

```
tools/atlas-pipeline/
  README.md          this file
  regions.json       what each region model must contain
  extract_region.py  Blender script: isolate a region, clean, export glTF
  validate.mjs       CI check — assets vs. mesh map vs. clinical data
  source/            (git-ignored) upstream Z-Anatomy .blend files
  work/              (git-ignored) intermediate exports
```

Output lands in `public/models/<region-id>.glb` and is served as a static file.

## Prerequisites

- **Blender 3.6 LTS or newer** on the PATH as `blender`
- **Node 18+** (the repo's toolchain) — `@gltf-transform/cli` is already a
  devDependency, so `npx gltf-transform` works without a global install

## Getting the source

Download the Z-Anatomy Blender template into `source/` (git-ignored — it is
large, and we redistribute only our processed derivatives):

- https://github.com/Z-Anatomy/The-blend
- https://github.com/Z-Anatomy/Models-of-human-anatomy

## Running a region

```bash
# 1. Extract + clean + export from Blender (headless)
blender --background source/z-anatomy.blend \
        --python tools/atlas-pipeline/extract_region.py -- \
        --region upper-limb \
        --out tools/atlas-pipeline/work/upper-limb.glb

# 2. Compress for the web
npx gltf-transform optimize \
    tools/atlas-pipeline/work/upper-limb.glb \
    public/models/upper-limb.glb \
    --compress draco --texture-compress webp

# 3. Skin envelope (optional layer) — the source has NO skin mesh, so this
#    derives one from the outer surface of the anatomy itself
blender --background --factory-startup --python tools/atlas-pipeline/skin_envelope.py
npx gltf-transform merge work/upper-limb.glb work/skin-envelope.glb work/with-skin.glb

# 4. Flatten to ONE scene. `merge` keeps each input as its own glTF scene and
#    three.js only mounts the default one, so without this the envelope loads
#    and is then silently never drawn.
python3 tools/atlas-pipeline/flatten_scenes.py work/with-skin.glb work/flat.glb

# 5. Compress. --join false is REQUIRED: the default join pass merges every
#    mesh into a handful of unnamed nodes and breaks every mesh-map lookup.
npx gltf-transform optimize work/flat.glb public/models/upper-limb.glb \
    --compress draco --texture-compress webp --join false --simplify false

# 6. Validate against the mesh map and the clinical data
node tools/atlas-pipeline/validate.mjs
```

### About the skin envelope

Z-Anatomy has no skin, dermis or integument mesh — every object in the source
was checked. The envelope is built by joining a copy of the muscles and bones,
voxel-remeshing the union into one closed outer surface, smoothing it and
pulling it back slightly. It is a stand-in for the body surface so a needle can
be seen relative to it. It is **not** a skin dataset, carries no subcutaneous
fat, and its distance from any muscle is an artefact of the voxel size. The
viewer labels it as approximate and says not to read depth off it.

Then update, in the same commit:

1. `src/data/atlas3d.ts` — set the region's `glbPath` and `ready: true`, and add
   its `MESH_MAP` entries
2. `LICENSES-3D.md` — add rows to the "Assets in use" and "Record of changes"
   tables

## Budgets

`validate.mjs` fails the build if these are exceeded:

| | Limit |
|---|---|
| Per-region `.glb` | 8 MB (target 4–6 MB) |
| Draw calls per region | ~150 (roughly one per selectable structure) |

If a region busts the budget, turn the decimation ratio up in
`extract_region.py` before splitting the region — fewer, simpler meshes beat
more files.

## Mesh naming contract

`validate.mjs` enforces this, because a silent naming drift is how a user ends
up looking at the wrong muscle:

- Every mesh name in `MESH_MAP` must exist in the region's `.glb`
- Every EMG muscle in a `ready` region's `emgRegions` must map to at least one
  mesh, **or** be listed in `regions.json` under `knownUnmapped` with a reason
- No mesh may be mapped to two different clinical targets

`knownUnmapped` is the honest escape hatch: some small structures are not
separable in the source data. Those show "3D view not available" in the UI. It
is always better to declare a gap than to point at an approximate neighbour.

## Anatomical review

Before a region flips to `ready: true` in production, a faculty member should
open it and confirm the highlighted structures are what they claim to be. The
pipeline can only check that names match — not that the mesh labelled
`flexor-carpi-ulnaris` is actually flexor carpi ulnaris.
