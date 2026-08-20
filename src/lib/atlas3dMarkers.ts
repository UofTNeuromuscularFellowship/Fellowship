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

export type MarkerStatus = 'draft' | 'in_review' | 'approved'

export interface NeedleMarker {
  id: string
  muscleId: string
  regionId: string
  meshName: string
  local: [number, number, number]
  /** Unit vector pointing INTO the tissue, in the mesh's local space. */
  direction: [number, number, number]
  depthMm: number
  label: string | null
  note: string | null
  status: MarkerStatus
  authoredBy: string | null
  reviewedBy: string | null
}

export interface NewNeedleMarker {
  muscleId: string
  regionId: string
  meshName: string
  local: [number, number, number]
  direction: [number, number, number]
  depthMm: number
  label?: string | null
  note?: string | null
}

interface Row {
  id: string
  muscle_id: string
  region_id: string
  mesh_name: string
  local_x: number
  local_y: number
  local_z: number
  dir_x: number
  dir_y: number
  dir_z: number
  depth_mm: number | string
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
    regionId: r.region_id,
    meshName: r.mesh_name,
    local: [r.local_x, r.local_y, r.local_z],
    direction: [r.dir_x, r.dir_y, r.dir_z],
    depthMm: Number(r.depth_mm),
    label: r.label,
    note: r.note,
    status: r.status,
    authoredBy: r.authored_by,
    reviewedBy: r.reviewed_by,
  }
}

const COLUMNS =
  'id, muscle_id, region_id, mesh_name, local_x, local_y, local_z, dir_x, dir_y, dir_z, depth_mm, label, note, status, authored_by, reviewed_by'

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
      muscle_id: m.muscleId,
      region_id: m.regionId,
      mesh_name: m.meshName,
      local_x: m.local[0],
      local_y: m.local[1],
      local_z: m.local[2],
      dir_x: m.direction[0],
      dir_y: m.direction[1],
      dir_z: m.direction[2],
      depth_mm: m.depthMm,
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

export async function updateMarker(
  id: string,
  patch: Partial<Pick<NeedleMarker, 'depthMm' | 'label' | 'note' | 'status'>>,
): Promise<NeedleMarker> {
  const row: Record<string, unknown> = {}
  if (patch.depthMm !== undefined) row.depth_mm = patch.depthMm
  if (patch.label !== undefined) row.label = patch.label
  if (patch.note !== undefined) row.note = patch.note
  if (patch.status !== undefined) row.status = patch.status

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
