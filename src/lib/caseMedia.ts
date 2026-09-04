// ---------------------------------------------------------------------------
// Waveform / ultrasound / biopsy / examination image library — data access.
//
// The table holds NO patient identifiers by design (see
// 0018_case_media_library.sql). Everything here is visible to every signed-in
// member of the fellowship, fellows included, so nothing in this module should
// ever start carrying a name, an MRN or a date of birth.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'

export const BUCKET = 'case-media'
/** Signatures live apart from the images: different bucket, different policy. */
export const CONSENT_BUCKET = 'case-consent'

/**
 * Default consent wording. NOT legal text — it is a starting point that the
 * fellowship must have reviewed against its hospitals' own consent process
 * before it is used with a patient, and it is stored WITH each signature so
 * changing it later cannot alter what someone already agreed to.
 */
export const DEFAULT_CONSENT_WORDING =
  'I agree that the photograph, image or video recording taken of me may be used for ' +
  'medical teaching and education. I understand it will be shown to doctors and trainees ' +
  'in the University of Toronto neuromuscular fellowship, that identifying details will be ' +
  'removed, and that I may withdraw this permission at any time by contacting the ' +
  'fellowship. [Wording pending review by the program and the hospitals\' privacy office.]'

/** Long enough to read a case and annotate it without the link dying mid-edit. */
export const MEDIA_URL_TTL = 4 * 3600

export type MediaKind = 'waveform' | 'ultrasound' | 'biopsy' | 'exam'

export const MEDIA_KINDS: Array<{ id: MediaKind; label: string; hint: string }> = [
  { id: 'waveform', label: 'Waveform', hint: 'EMG or nerve conduction trace' },
  { id: 'ultrasound', label: 'Ultrasound', hint: 'Nerve, muscle or diaphragm imaging' },
  { id: 'biopsy', label: 'Muscle biopsy', hint: 'Histology' },
  { id: 'exam', label: 'Examination finding', hint: 'Photograph or clip of a sign' },
]

export function kindLabel(k: string): string {
  return MEDIA_KINDS.find((m) => m.id === k)?.label ?? k
}

export type ShapeKind = 'arrow' | 'ellipse' | 'freehand'

/**
 * One drawn shape.
 *
 * Points are normalised 0..1 against the media's own box, never pixels: the
 * same annotation has to land on the same anatomy whether it is being read on
 * a 27-inch monitor or a phone.
 *
 *   arrow     [tail, head]
 *   ellipse   [corner, opposite corner] of the bounding box
 *   freehand  every sampled point along the path
 */
export interface Annotation {
  id: string
  kind: ShapeKind
  colour: string
  /** Shown in the legend under the image. Empty is allowed while drawing. */
  label: string
  points: Array<[number, number]>
}

export interface CaseMedia {
  id: string
  title: string
  mediaKind: MediaKind
  description: string | null
  fileName: string
  storagePath: string
  mimeType: string | null
  sizeBytes: number | null
  /** Still captured from a clip, so a video can carry annotations. */
  posterPath: string | null
  /** When consent was signed. Null means none is recorded. No identity here. */
  consentSignedAt: string | null
  annotations: Annotation[]
  authorId: string
  authorName?: string | null
  createdAt: string
  updatedAt: string
}

const COLUMNS =
  'id, title, media_kind, description, file_name, storage_path, mime_type, size_bytes, poster_path, consent_signed_at, annotations, author_id, created_at, updated_at'

interface Row {
  id: string
  title: string
  media_kind: MediaKind
  description: string | null
  file_name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  poster_path: string | null
  consent_signed_at: string | null
  annotations: Annotation[] | null
  author_id: string
  created_at: string
  updated_at: string
}

function toCase(r: Row): CaseMedia {
  return {
    id: r.id,
    title: r.title,
    mediaKind: r.media_kind,
    description: r.description,
    fileName: r.file_name,
    storagePath: r.storage_path,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    posterPath: r.poster_path,
    consentSignedAt: r.consent_signed_at,
    annotations: Array.isArray(r.annotations) ? r.annotations : [],
    authorId: r.author_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function isVideo(c: Pick<CaseMedia, 'mimeType' | 'fileName'>): boolean {
  if (c.mimeType?.startsWith('video/')) return true
  return /\.(mp4|mov|webm|m4v|avi)$/i.test(c.fileName)
}

export async function listCases(): Promise<CaseMedia[]> {
  const { data, error } = await supabase
    .from('case_media')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as Row[]).map(toCase)
}

/** One signed link per storage path, in a single round trip. */
export async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return out
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, MEDIA_URL_TTL)
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl)
  }
  return out
}

export interface NewCase {
  title: string
  mediaKind: MediaKind
  description: string
  file: File
}

/**
 * The signed consent behind a case.
 *
 * Held in its own table with its own policy: readable by the clinician who
 * obtained it and by the director, and by nobody else. Everyone else sees only
 * that consent exists and when it was signed.
 */
export interface ConsentRecord {
  caseId: string
  patientName: string
  signaturePath: string
  wording: string
  signedAt: string
  obtainedBy: string
}

export interface NewConsent {
  patientName: string
  wording: string
  signature: Blob
}

/**
 * Kinds where a patient is potentially recognisable from the media itself, and
 * a signed consent is therefore required rather than optional.
 */
export function consentRequired(kind: MediaKind): boolean {
  return kind === 'exam'
}

/** Store the signature, then the record, then stamp the date on the case. */
export async function saveConsent(
  caseId: string,
  input: NewConsent,
  obtainedBy: string,
): Promise<string> {
  const path = `${obtainedBy}/${caseId}-signature.png`
  const { error: upErr } = await supabase.storage
    .from(CONSENT_BUCKET)
    .upload(path, input.signature, { contentType: 'image/png', upsert: true })
  if (upErr) throw new Error(upErr.message)

  const signedAt = new Date().toISOString()
  const { error } = await supabase.from('case_media_consent').upsert(
    {
      case_id: caseId,
      patient_name: input.patientName.trim(),
      signature_path: path,
      wording: input.wording,
      signed_at: signedAt,
      obtained_by: obtainedBy,
    },
    { onConflict: 'case_id' },
  )
  if (error) {
    await supabase.storage.from(CONSENT_BUCKET).remove([path])
    throw new Error(error.message)
  }

  const { error: stampErr } = await supabase
    .from('case_media')
    .update({ consent_signed_at: signedAt })
    .eq('id', caseId)
  if (stampErr) throw new Error(stampErr.message)

  return signedAt
}

/** Null when this reader is not allowed to see it — that is not an error. */
export async function getConsent(caseId: string): Promise<ConsentRecord | null> {
  const { data, error } = await supabase
    .from('case_media_consent')
    .select('case_id, patient_name, signature_path, wording, signed_at, obtained_by')
    .eq('case_id', caseId)
    .maybeSingle()
  if (error || !data) return null
  const r = data as {
    case_id: string
    patient_name: string
    signature_path: string
    wording: string
    signed_at: string
    obtained_by: string
  }
  return {
    caseId: r.case_id,
    patientName: r.patient_name,
    signaturePath: r.signature_path,
    wording: r.wording,
    signedAt: r.signed_at,
    obtainedBy: r.obtained_by,
  }
}

export async function signConsentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(CONSENT_BUCKET).createSignedUrl(path, 600)
  return data?.signedUrl ?? null
}

/**
 * Upload the file, then record the case.
 *
 * If the metadata insert is refused the blob is removed again — an orphaned
 * object in a private bucket is invisible and unreachable, so it would just
 * sit there consuming quota. Same pattern as the library upload.
 */
export async function createCase(input: NewCase, authorId: string): Promise<CaseMedia> {
  const ext = input.file.name.includes('.') ? input.file.name.split('.').pop() : 'bin'
  const path = `${authorId}/${crypto.randomUUID()}.${ext}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file, { contentType: input.file.type || undefined, upsert: false })
  if (upErr) throw new Error(upErr.message)

  const { data, error } = await supabase
    .from('case_media')
    .insert({
      title: input.title.trim(),
      media_kind: input.mediaKind,
      description: input.description.trim() || null,
      file_name: input.file.name,
      storage_path: path,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      author_id: authorId,
    })
    .select(COLUMNS)
    .single()

  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(error.message)
  }
  return toCase(data as unknown as Row)
}

export async function updateCase(
  id: string,
  patch: Partial<Pick<CaseMedia, 'title' | 'description' | 'mediaKind' | 'annotations'>>,
): Promise<CaseMedia> {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) row.title = patch.title
  if (patch.description !== undefined) row.description = patch.description
  if (patch.mediaKind !== undefined) row.media_kind = patch.mediaKind
  if (patch.annotations !== undefined) row.annotations = patch.annotations

  const { data, error } = await supabase
    .from('case_media')
    .update(row)
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return toCase(data as unknown as Row)
}

/** Store a frame grabbed from a clip, so the clip can be annotated. */
export async function savePoster(c: CaseMedia, blob: Blob): Promise<CaseMedia> {
  const path = `${c.authorId}/${c.id}-poster.jpg`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (upErr) throw new Error(upErr.message)

  const { data, error } = await supabase
    .from('case_media')
    .update({ poster_path: path })
    .eq('id', c.id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return toCase(data as unknown as Row)
}

export async function deleteCase(c: CaseMedia): Promise<void> {
  const paths = [c.storagePath, c.posterPath].filter(Boolean) as string[]
  await supabase.storage.from(BUCKET).remove(paths)
  const { error } = await supabase.from('case_media').delete().eq('id', c.id)
  if (error) throw new Error(error.message)
}

/** Whoever uploaded it, plus the director and program admin. */
export function canEditCase(
  role: string | null | undefined,
  userId: string | null | undefined,
  c: Pick<CaseMedia, 'authorId'>,
): boolean {
  if (role === 'director' || role === 'admin') return true
  return !!userId && c.authorId === userId
}

/**
 * Free-text search across everything a reader might remember about a case —
 * its title, its description, what kind of image it is, and the text of its
 * annotation labels, which is often where the actual finding is named.
 */
export function matchesQuery(c: CaseMedia, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const hay = [
    c.title,
    c.description ?? '',
    kindLabel(c.mediaKind),
    c.authorName ?? '',
    ...c.annotations.map((a) => a.label),
  ]
    .join('  ')
    .toLowerCase()
  return hay.includes(needle)
}
