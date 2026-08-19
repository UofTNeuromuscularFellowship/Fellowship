#!/usr/bin/env node
/**
 * 3D Atlas asset validation — runs in CI.
 *
 * Checks that what the app believes about its 3D models is actually true:
 *
 *   1. Every region marked `ready` has a .glb that exists and is within budget
 *   2. Every mesh name in MESH_MAP exists inside that region's .glb
 *   3. Every EMG muscle in a ready region maps to a mesh, or is declared in
 *      regions.json -> knownUnmapped with a reason
 *   4. No mesh is claimed by two different clinical targets
 *   5. Every asset in public/models/ is recorded in LICENSES-3D.md
 *
 * Check 3 is the one that matters clinically: it is what stops a muscle from
 * silently pointing at the wrong mesh, or at nothing, after a source update.
 *
 *   node tools/atlas-pipeline/validate.mjs
 *
 * Exits non-zero on any error. Passes cleanly when no region is ready yet.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')
const MODELS_DIR = path.join(REPO_ROOT, 'public', 'models')
const LICENSES = path.join(REPO_ROOT, 'LICENSES-3D.md')

const errors = []
const warnings = []
const notes = []

const fail = (m) => errors.push(m)
const warn = (m) => warnings.push(m)

// ---------------------------------------------------------------------------
// Load the TypeScript data files by bundling them with the esbuild binary that
// ships with vite. The data modules are dependency-free, so this is a plain
// transpile — no app code is executed.
// ---------------------------------------------------------------------------

function loadTsModule(relPath, tmp) {
  const esbuild = path.join(
    REPO_ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild',
  )
  if (!existsSync(esbuild)) {
    throw new Error('esbuild not found — run `npm install` first.')
  }
  const out = path.join(tmp, relPath.replace(/[\\/]/g, '_').replace(/\.ts$/, '.mjs'))
  execFileSync(esbuild, [
    path.join(REPO_ROOT, relPath),
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${out}`,
  ], { stdio: 'pipe' })
  return import(pathToFileURL(out).href)
}

// ---------------------------------------------------------------------------
// Minimal GLB reader: pull the mesh/node names out of the JSON chunk.
// Spec: 12-byte header, then chunks of [uint32 length, uint32 type, data].
// ---------------------------------------------------------------------------

function glbNodeNames(glbPath) {
  const buf = readFileSync(glbPath)
  if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`${path.basename(glbPath)} is not a valid GLB (bad magic).`)
  }
  let offset = 12
  while (offset + 8 <= buf.length) {
    const chunkLength = buf.readUInt32LE(offset)
    const chunkType = buf.readUInt32LE(offset + 4)
    const start = offset + 8
    if (chunkType === 0x4e4f534a) {
      const json = JSON.parse(buf.subarray(start, start + chunkLength).toString('utf8'))
      const names = new Set()
      for (const n of json.nodes ?? []) if (n.name) names.add(n.name)
      for (const m of json.meshes ?? []) if (m.name) names.add(m.name)
      return names
    }
    offset = start + chunkLength + ((4 - (chunkLength % 4)) % 4)
  }
  throw new Error(`${path.basename(glbPath)} has no JSON chunk.`)
}

// ---------------------------------------------------------------------------

async function main() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'atlas-validate-'))
  try {
    const config = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'tools', 'atlas-pipeline', 'regions.json'), 'utf8'),
    )
    const budgets = config.budgets
    const recipeById = new Map(config.regions.map((r) => [r.id, r]))

    const atlas3d = await loadTsModule(path.join('src', 'data', 'atlas3d.ts'), tmp)
    const emg = await loadTsModule(path.join('src', 'data', 'emgAtlas.ts'), tmp)

    const regions = atlas3d.REGION_MODELS ?? []
    const meshMap = atlas3d.MESH_MAP ?? []
    const muscles = emg.EMG_MUSCLES ?? []

    notes.push(`${regions.length} regions declared, ${muscles.length} EMG muscles in the atlas`)

    // -- check 4: no mesh claimed twice ------------------------------------
    const claimedBy = new Map()
    for (const entry of meshMap) {
      for (const mesh of entry.meshNames) {
        const key = `${entry.regionId}::${mesh}`
        if (claimedBy.has(key) && claimedBy.get(key) !== entry.targetId) {
          fail(`Mesh "${mesh}" (${entry.regionId}) is claimed by both "${claimedBy.get(key)}" and "${entry.targetId}".`)
        }
        claimedBy.set(key, entry.targetId)
      }
    }

    const readyRegions = regions.filter((r) => r.ready)
    if (readyRegions.length === 0) {
      notes.push('No region is marked ready yet — asset checks skipped (expected in Phase 0).')
    }

    for (const region of readyRegions) {
      const recipe = recipeById.get(region.id)
      if (!recipe) {
        fail(`Region "${region.id}" is ready but has no recipe in regions.json.`)
        continue
      }
      if (!region.glbPath) {
        fail(`Region "${region.id}" is ready but has an empty glbPath.`)
        continue
      }

      // -- check 1: asset exists and fits the budget -----------------------
      const glbPath = path.join(REPO_ROOT, 'public', region.glbPath.replace(/^\/+/, ''))
      if (!existsSync(glbPath)) {
        fail(`Region "${region.id}" is ready but ${region.glbPath} does not exist.`)
        continue
      }
      const bytes = statSync(glbPath).size
      if (bytes > budgets.maxGlbBytes) {
        fail(`${region.glbPath} is ${(bytes / 1048576).toFixed(2)} MB, over the ${(budgets.maxGlbBytes / 1048576).toFixed(0)} MB budget.`)
      } else if (bytes > budgets.targetGlbBytes) {
        warn(`${region.glbPath} is ${(bytes / 1048576).toFixed(2)} MB, over the ${(budgets.targetGlbBytes / 1048576).toFixed(0)} MB target.`)
      }

      // -- check 2: mapped meshes actually exist ---------------------------
      const present = glbNodeNames(glbPath)
      const regionEntries = meshMap.filter((m) => m.regionId === region.id)
      for (const entry of regionEntries) {
        for (const mesh of entry.meshNames) {
          if (!present.has(mesh)) {
            fail(`"${entry.targetId}" maps to mesh "${mesh}", which is not in ${region.glbPath}.`)
          }
        }
      }

      // -- check 3: no muscle silently unmapped ----------------------------
      const mapped = new Set(regionEntries.filter((m) => m.kind === 'muscle').map((m) => m.targetId))
      const declaredGaps = new Set((recipe.knownUnmapped ?? []).map((g) => (typeof g === 'string' ? g : g.id)))
      for (const muscle of muscles) {
        if (!region.emgRegions.includes(muscle.region)) continue
        if (mapped.has(muscle.id) || declaredGaps.has(muscle.id)) continue
        fail(
          `"${muscle.name}" (${muscle.region}) has no mesh in ready region "${region.id}". ` +
          'Map it, or declare it in regions.json -> knownUnmapped with a reason.',
        )
      }
    }

    // -- check 5: every shipped asset is recorded in LICENSES-3D.md --------
    if (existsSync(MODELS_DIR)) {
      const licenceText = existsSync(LICENSES) ? readFileSync(LICENSES, 'utf8') : ''
      for (const file of readdirSync(MODELS_DIR)) {
        if (!file.endsWith('.glb') && !file.endsWith('.gltf')) continue
        if (!licenceText.includes(file)) {
          fail(`public/models/${file} is not recorded in LICENSES-3D.md. Attribution and the record of changes are licence obligations — add it before shipping.`)
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main()
  .catch((err) => fail(err.message))
  .finally(() => {
    for (const n of notes) console.log(`  · ${n}`)
    for (const w of warnings) console.warn(`  ! ${w}`)
    for (const e of errors) console.error(`  ✗ ${e}`)
    if (errors.length) {
      console.error(`\natlas-pipeline: ${errors.length} error(s).`)
      process.exit(1)
    }
    console.log(`\natlas-pipeline: OK${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`)
  })
