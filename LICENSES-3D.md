# 3D model assets — licensing and attribution

This file records the licence position for every 3D anatomy asset served by the
**3D Atlas** (`/atlas-3d`). It is the Phase 0 deliverable of the 3D atlas build
plan and must be kept accurate as assets are added.

**Nothing may be added to `public/models/` unless it is recorded in the
"Assets in use" table below.**

Last verified against the upstream sources: **19 August 2026.**

---

## 1. Upstream sources

### Z-Anatomy (direct source of our meshes)

| | |
|---|---|
| Project | Z-Anatomy — open-source 3D atlas of human anatomy |
| Repositories | https://github.com/Z-Anatomy/The-blend (Blender template) · https://github.com/Z-Anatomy/Models-of-human-anatomy |
| Source commit verified | `4169f1e58a645d72798bccebcbdef7ae4f715ea1` (master, 19 Aug 2026) |
| Source file | `Z-Anatomy.zip` → `Z-Anatomy/Startup.blend` (83 MB archive, 293 MB blend) |
| Licence | **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)** |
| Licence text | https://creativecommons.org/licenses/by-sa/4.0/legalcode |

Confirmed by reading `License.txt` in the upstream repository directly
(not from a summary), on the commit noted in §3.

#### ⚠ Not all Z-Anatomy content is CC BY-SA — some is NonCommercial

Z-Anatomy is CC BY-SA 4.0 overall, but its `License.txt` credits several
adapted reference models under **different and incompatible** licences:

| Included model | Licence | Usable by us? |
|---|---|---|
| BodyParts3D (the bulk of the anatomy) | CC BY-SA 2.1 JP | ✅ Yes |
| Cranial Nerves and Foramina — Univ. of Dundee, CAHID | CC BY 4.0 | ✅ Yes |
| Brainder / White matter — Univ. of Washington | not stated upstream | ⚠ Unknown — avoid |
| **Anatomy of the Inner Ear — Univ. of Dundee School of Medicine** | **CC BY-NC-SA 4.0** | ❌ **No** |
| **Kidney — Lissie Cowley** | **CC BY-NC 4.0** | ❌ **No** |

The NonCommercial models cannot be redistributed under CC BY-SA 4.0, so they
must never enter our `.glb` files. This is not a constraint in practice — the
inner ear, kidney and white-matter models have nothing to do with EMG or nerve
conduction — but the head & neck region build must actively exclude the inner
ear, and the trunk build the kidney, rather than sweeping up a whole collection.

**This is enforced in the pipeline**: `tools/atlas-pipeline/regions.json` lists
these under `excludeStructures` per region, and any structure whose licence we
cannot confirm is excluded by default. Adding a structure to a region build is
a decision that requires checking this table.

Z-Anatomy's text *definitions* are adapted from Wikipedia (CC BY-SA 3.0). We do
not use them — all clinical text in this atlas is our own — so they are out of
scope.

### BodyParts3D / Anatomography (upstream of Z-Anatomy)

| | |
|---|---|
| Project | BodyParts3D, The Database Center for Life Science (DBCLS), Japan |
| Mirror used for reference | https://github.com/Kevin-Mattheus-Moerman/BodyParts3D |
| Licence (model files) | **Creative Commons Attribution-Share Alike 2.1 Japan (CC BY-SA 2.1 JP)** |
| Licence text | https://creativecommons.org/licenses/by-sa/2.1/jp/ |
| Required credit line (verbatim, as specified upstream) | `BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan` |

Note: the Moerman mirror repository applies the MIT licence to its *code*; the
3D model files carry CC BY-SA 2.1 JP. Only the model files concern us.

---

## 2. What this means for this project

**We may:** use, modify (decimate, re-mesh, rename, recolour, split by region),
and serve the models from this site, including on a publicly accessible page.

**We must:**

1. **Attribute** both Z-Anatomy and BodyParts3D/DBCLS visibly wherever the
   models are shown. In this app that is the "Model sources & licence" dialog
   reachable from the 3D Atlas toolbar, which is present on every viewer screen.
2. **Share alike** — our processed `.glb` files are a derivative work and are
   distributed under **CC BY-SA 4.0**, the same licence Z-Anatomy uses. The
   `public/models/README.md` file states this alongside the assets.
3. **Indicate changes** — §4 below is that record.
4. **Not add restrictions** — no DRM, no "do not download" terms on the model
   files themselves.

**Scope of the copyleft.** Share-alike attaches to the *model files* and other
derivatives of the licensed work. It does **not** attach to:

- this repository's application code (React/TypeScript components, the viewer,
  the pipeline scripts) — these are separate works that merely display the
  models;
- the clinical text in `src/data/emgAtlas.ts` and `src/data/nerveGuide.ts`,
  which is independently authored;
- the mesh-name mapping in `src/data/atlas3d.ts`, which contains our own
  identifiers.

This is the standard "mere aggregation / separate work" position for CC BY-SA
media displayed by unrelated software. **This is our reading, not legal advice.**
If the atlas is ever made publicly accessible or is used beyond internal
education, have someone qualified confirm it — see §5.

**On the 2.1 JP → 4.0 step.** Z-Anatomy distributes its BodyParts3D-derived work
under CC BY-SA 4.0. We take our meshes from Z-Anatomy and follow Z-Anatomy's
licence, while also carrying the BodyParts3D credit line required upstream. We
have not independently adjudicated the version-compatibility question between
CC BY-SA 2.1 JP and 4.0; we simply preserve both attributions, which satisfies
the attribution requirement of either. Flagged in §5.

---

## 3. Assets in use

No model assets are in the repository yet. Phase 1 adds the first entry.

| File | Region | Derived from | Licence | Added | Pipeline commit |
|---|---|---|---|---|---|
| _(none yet)_ | | | | | |

---

## 4. Record of changes made to the upstream models

Required by the "indicate changes" term. Every pipeline run appends a row.

| Date | Asset | Changes made |
|---|---|---|
| _(none yet)_ | | |

Anticipated change types: isolation of a body region, deletion of unused
structures, polygon decimation, normal/orientation repair, mesh renaming to
match our atlas identifiers, format conversion to glTF/GLB, Draco/meshopt
compression.

---

## 5. Open items to confirm before any public launch

1. **Public exposure.** The atlas ships behind the portal login first. Whether
   it becomes publicly accessible is a program decision (Dr. Izenberg) — the
   licence permits it, but confirm before flipping it.
2. **Legal read.** Have someone qualified confirm the §2 scope-of-copyleft
   reading and the 2.1 JP → 4.0 position before public release. This file is
   the artifact to hand them.
3. **Re-verify upstream.** Re-check both repositories' licence statements at the
   time of launch and update the "last verified" date and source commit above.
   Licences can change between now and then.
4. **NonCommercial components.** Confirm the §1 exclusions are actually absent
   from every shipped `.glb` before launch — not just excluded by config. The
   check is: open the region file and confirm no mesh from the ❌ or ⚠ rows is
   present. Most relevant to head & neck (Phase 3); the limb regions cannot
   contain them.

---

## 6. Attribution copy used in the app

Rendered by `src/components/atlas3d/AttributionDialog.tsx`. Keep the two credit
lines in sync with this file.

> **Model sources.** The 3D anatomy in this atlas is adapted from
> [Z-Anatomy](https://github.com/Z-Anatomy), an open-source 3D atlas of human
> anatomy, licensed under
> [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
> Z-Anatomy derives from BodyParts3D, (c) The Database Center for Life Science,
> licensed under
> [CC Attribution-Share Alike 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/).
>
> The meshes have been modified for this site: regions isolated, polygon counts
> reduced, and structures renamed to match this atlas. The modified models are
> distributed under CC BY-SA 4.0.
