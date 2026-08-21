// ---------------------------------------------------------------------------
// Needle-insertion markers — data access.
//
// A marker records where the needle goes in, which way it points, and how deep,
// for one muscle. It is clinical content: nothing here invents a coordinate,
// and nothing reaches a fellow until a director approves it (enforced by RLS in
// 0011_atlas3d_needle_markers.sql, not by this file).
//
// Coordinates are in the LOCAL space of `meshName` — see the migration's
// ANCHORING note for why world space would silently drift on re-export.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import type { ElectrodeKind } from '../components/atlas3d/MarkerShapes'

export type MarkerStatus = 'draft' | 'in_review' | 'approved'

export interface NeedleMarker {
  id: string
  /** EMG markers target a muscle; NCS markers target a study. Never both. */
  muscleId: string | null
  studyId: string | null
  kind: ElectrodeKind
  regionId: string
  meshName: string
  local: [number, number, number]
  /** Unit vector pointing INTO the tissue, in the mesh's local space. */
  direction: [number, number, number]
  /** Insertion depth for a needle; null for a surface electrode. */
  depthMm: number | null
  /** Rotation about the surface normal, degrees. Aims the stimulator cathode. */
  spinDeg: number
  /** Named approach this marker belongs to. Landmarks are always 'Standard'. */
  approach: string
  label: string | null
  note: string | null
  status: MarkerStatus
  authoredBy: string | null
  reviewedBy: string | null
}

export interface NewNeedleMarker {
  muscleId?: string | null
  studyId?: string | null
  kind: ElectrodeKind
  regionId: string
  meshName: string
  local: [number, number, number]
  direction: [number, number, number]
  depthMm?: number | null
  spinDeg?: number
  approach?: string
  label?: string | null
  note?: string | null
}

interface Row {
  id: string
  muscle_id: string | null
  study_id: string | null
  marker_kind: ElectrodeKind
  region_id: string
  mesh_name: string
  local_x: number
  local_y: number
  local_z: number
  dir_x: number
  dir_y: number
  dir_z: number
  depth_mm: number | string | null
  spin_deg: number | string
  approach: string
  label: string | null
  note: string | null
  status: MarkerStatus
  authored_by: string | null
  reviewed_by: string | null
}

function toMarker(r: Row): NeedleMarker {
  return {
    id: r.id,
    muscleId: r.muscle_id,
    studyId: r.study_id,
    kind: r.marker_kind,
    regionId: r.region_id,
    meshName: r.mesh_name,
    local: [r.local_x, r.local_y, r.local_z],
    direction: [r.dir_x, r.dir_y, r.dir_z],
    depthMm: r.depth_mm === null ? null : Number(r.depth_mm),
    spinDeg: Number(r.spin_deg ?? 0),
    approach: r.approach ?? 'Standard',
    label: r.label,
    note: r.note,
    status: r.status,
    authoredBy: r.authored_by,
    reviewedBy: r.reviewed_by,
  }
}

const COLUMNS =
  'id, muscle_id, study_id, marker_kind, region_id, mesh_name, local_x, local_y, local_z, dir_x, dir_y, dir_z, depth_mm, spin_deg, approach, label, note, status, authored_by, reviewed_by'

/**
 * Markers for one region. RLS decides what comes back: a fellow receives only
 * approved rows, a supervisor or director also sees drafts. The client never
 * filters on status for security — it only uses it for display.
 */
export async function listMarkers(regionId: string): Promise<NeedleMarker[]> {
  const { data, error } = await supabase
    .from('atlas3d_markers')
    .select(COLUMNS)
    .eq('region_id', regionId)
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as Row[]).map(toMarker)
}

export async function createMarker(m: NewNeedleMarker, authorId: string): Promise<NeedleMarker> {
  const { data, error } = await supabase
    .from('atlas3d_markers')
    .insert({
      muscle_id: m.muscleId ?? null,
      study_id: m.studyId ?? null,
      marker_kind: m.kind,
      region_id: m.regionId,
      mesh_name: m.meshName,
      local_x: m.local[0],
      local_y: m.local[1],
      local_z: m.local[2],
      dir_x: m.direction[0],
      dir_y: m.direction[1],
      dir_z: m.direction[2],
      depth_mm: m.depthMm ?? null,
      spin_deg: m.spinDeg ?? 0,
      approach: m.approach ?? 'Standard',
      label: m.label ?? null,
      note: m.note ?? null,
      status: 'draft',
      authored_by: authorId,
    })
    .select(COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return toMarker(data as unknown as Row)
}

export interface MarkerGeometryPatch {
  meshName: string
  local: [number, number, number]
  direction: [number, number, number]
}

export async function updateMarker(
  id: string,
  patch: Partial<Pick<NeedleMarker, 'depthMm' | 'spinDeg' | 'label' | 'note' | 'status'>> & {
    geometry?: MarkerGeometryPatch
  },
): Promise<NeedleMarker> {
  const row: Record<string, unknown> = {}
  if (patch.depthMm !== undefined) row.depth_mm = patch.depthMm
  if (patch.spinDeg !== undefined) row.spin_deg = patch.spinDeg
  if (patch.label !== undefined) row.label = patch.label
  if (patch.note !== undefined) row.note = patch.note
  if (patch.status !== undefined) row.status = patch.status
  if (patch.geometry) {
    // Moving an approved marker sends it back to draft — the database trigger
    // does that, deliberately, rather than trusting the client to.
    row.mesh_name = patch.geometry.meshName
    row.local_x = patch.geometry.local[0]
    row.local_y = patch.geometry.local[1]
    row.local_z = patch.geometry.local[2]
    row.dir_x = patch.geometry.direction[0]
    row.dir_y = patch.geometry.direction[1]
    row.dir_z = patch.geometry.direction[2]
  }

  const { data, error } = await supabase
    .from('atlas3d_markers')
    .update(row)
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return toMarker(data as unknown as Row)
}

export async function deleteMarker(id: string): Promise<void> {
  const { error } = await supabase.from('atlas3d_markers').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export function canAuthorMarkers(role?: string | null): boolean {
  return role === 'supervisor' || role === 'director'
}

export function canApproveMarkers(role?: string | null): boolean {
  return role === 'director'
}
