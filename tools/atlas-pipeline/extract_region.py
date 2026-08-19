#!/usr/bin/env python3
"""
Blender headless script: isolate one body region from the upstream Z-Anatomy
model, clean it up, and export a glTF binary for the 3D Atlas.

    blender --background source/z-anatomy.blend \
            --python tools/atlas-pipeline/extract_region.py -- \
            --region upper-limb --out tools/atlas-pipeline/work/upper-limb.glb

Upstream models are CC BY-SA (Z-Anatomy / BodyParts3D). Every change this
script makes must be reflected in the "Record of changes" table in
LICENSES-3D.md — see that file before shipping any output.

PHASE 0: the structure, argument handling and export settings are real and
runnable; the region-selection step is intentionally a stub, because the exact
collection and object names can only be pinned down against the actual source
.blend file. Phase 1 fills in `select_region_objects()` and removes the guard.
"""

import argparse
import json
import os
import sys

try:
    import bpy
except ImportError:  # pragma: no cover - only importable inside Blender
    sys.exit("This script must be run inside Blender (blender --background ... --python ...)")


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REGIONS_PATH = os.path.join(REPO_ROOT, "tools", "atlas-pipeline", "regions.json")


def parse_args(argv):
    """Blender passes script args after a bare '--'."""
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    p = argparse.ArgumentParser(description="Extract one region to .glb")
    p.add_argument("--region", required=True, help="region id, e.g. upper-limb")
    p.add_argument("--out", required=True, help="output .glb path")
    p.add_argument(
        "--allow-stub",
        action="store_true",
        help="run the export with no region filtering (Phase 0 smoke test only)",
    )
    return p.parse_args(argv)


def load_region_config(region_id):
    with open(REGIONS_PATH, "r", encoding="utf-8") as fh:
        config = json.load(fh)
    for region in config["regions"]:
        if region["id"] == region_id:
            return region, config["budgets"]
    raise SystemExit(f"Unknown region '{region_id}'. Check {REGIONS_PATH}.")


def select_region_objects(region):
    """
    Delete everything that is not part of this region.

    NOT IMPLEMENTED IN PHASE 0. Filling this in requires the real source file
    so that collection names, object names and the anatomical boundary of each
    region can be verified rather than guessed — getting this wrong produces a
    model that looks plausible and is anatomically wrong, which is the single
    failure mode this whole pipeline exists to prevent.

    Phase 1 implements it as:
      1. keep objects in region["collections"]
      2. restrict to those within/attached to region["boundingStructures"]
      3. delete the rest, then purge orphan data
    """
    raise NotImplementedError(
        f"Region selection for '{region['id']}' is not implemented yet. "
        "Implement select_region_objects() against the real source .blend "
        "(Phase 1), or pass --allow-stub to smoke-test the export path."
    )


def decimate_meshes(ratio):
    """Reduce polygon counts to hit the web budget."""
    for obj in bpy.data.objects:
        if obj.type != "MESH" or len(obj.data.polygons) < 500:
            continue
        modifier = obj.modifiers.new(name="atlas-decimate", type="DECIMATE")
        modifier.ratio = ratio
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier)


def normalise_transforms():
    """Consistent scale/orientation so cameras and clipping planes behave."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.select_all(action="DESELECT")


def export_glb(out_path):
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=True,          # bake modifiers
        export_yup=True,            # three.js convention
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        use_selection=False,
    )


def report(out_path, budgets):
    size = os.path.getsize(out_path)
    meshes = sum(1 for o in bpy.data.objects if o.type == "MESH")
    print(f"[atlas-pipeline] wrote {out_path}")
    print(f"[atlas-pipeline] {meshes} meshes, {size / 1024 / 1024:.2f} MB (pre-compression)")
    if meshes > budgets["maxMeshes"]:
        print(f"[atlas-pipeline] WARNING: {meshes} meshes exceeds budget of {budgets['maxMeshes']}")
    print("[atlas-pipeline] next: npx gltf-transform optimize ... --compress draco")
    print("[atlas-pipeline] then: record this asset + changes in LICENSES-3D.md")


def main():
    args = parse_args(sys.argv)
    region, budgets = load_region_config(args.region)

    if args.allow_stub:
        print(f"[atlas-pipeline] STUB MODE — exporting scene unfiltered for '{args.region}'")
    else:
        select_region_objects(region)

    decimate_meshes(region["decimateRatio"])
    normalise_transforms()
    export_glb(args.out)
    report(args.out, budgets)


if __name__ == "__main__":
    main()
