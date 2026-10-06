import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// NMDx suggestions: corrections to a topic and requests for new topics, each
// with optional source material. Members read the table directly; writes go
// through database functions (nmdx_*). See
// supabase/migrations/0052_nmdx_suggestions.sql.
// ---------------------------------------------------------------------------

export type SuggestionKind = 'correction' | 'new_topic'
export type SuggestionStatus = 'open' | 'accepted' | 'declined' | 'done' | 'withdrawn'
export type SuggestionSection = 'summary' | 'clinical' | 'investigations' | 'differential' | 'management' | 'sources' | 'other'

export interface Suggestion {
  id: string
  kind: SuggestionKind
  entry_id: string | null
  entry_name: string | null
  section: SuggestionSection | null
  quote: string | null
  topic_name: string | null
  body: string
  sources: string | null
  created_by: string | null
  created_at: string
  status: SuggestionStatus
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: string | null
}

export interface SuggestionDraft {
  kind: SuggestionKind
  entryId: string
  entryName: string
  section: SuggestionSection
  quote: string
  topicName: string
  body: string
  sources: string
}

export const SECTION_LABEL: Record<SuggestionSection, string> = {
  summary: 'Summary',
  clinical: 'Clinical features',
  investigations: 'Investigations',
  differential: 'Differential diagnosis',
  management: 'Management',
  sources: 'Sources',
  other: 'Other or whole topic',
}

export const STATUS_LABEL: Record<SuggestionStatus, string> = {
  open: 'Open',
  accepted: 'Accepted',
  declined: 'Declined',
  done: 'Done',
  withdrawn: 'Withdrawn',
}

/** What the NMDx frame sends when someone clicks a suggest link. */
export interface FrameRequest {
  type: 'nmdx-suggest'
  kind: SuggestionKind
  entryId?: string
  entryName?: string
  section?: SuggestionSection
  quote?: string
  topicName?: string
}

export function isFrameRequest(d: unknown): d is FrameRequest {
  if (!d || typeof d !== 'object') return false
  const r = d as Record<string, unknown>
  return r.type === 'nmdx-suggest' && (r.kind === 'correction' || r.kind === 'new_topic')
}

function err(e: { message: string } | null): void {
  if (e) throw new Error(e.message)
}

export async function loadSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await supabase.from('nmdx_suggestions').select('*').order('created_at', { ascending: false })
  err(error)
  return (data as Suggestion[]) ?? []
}

export async function loadPeopleNames(): Promise<Map<string, string>> {
  const { data } = await supabase.rpc('nmdx_people')
  return new Map(((data as { id: string; full_name: string | null }[]) ?? []).map((p) => [p.id, p.full_name ?? 'A member']))
}

export async function submitSuggestion(d: SuggestionDraft): Promise<string> {
  const { data, error } = await supabase.rpc('nmdx_suggest', {
    p_kind: d.kind,
    p_entry_id: d.kind === 'correction' ? d.entryId : null,
    p_entry_name: d.kind === 'correction' ? d.entryName : null,
    p_section: d.kind === 'correction' ? d.section : null,
    p_quote: d.kind === 'correction' ? d.quote : null,
    p_topic_name: d.kind === 'new_topic' ? d.topicName : null,
    p_body: d.body,
    p_sources: d.sources,
  })
  err(error)
  return data as string
}

export async function withdrawSuggestion(id: string) {
  err((await supabase.rpc('nmdx_withdraw', { p_id: id })).error)
}

export async function resolveSuggestion(id: string, status: Exclude<SuggestionStatus, 'withdrawn'>, note: string) {
  err((await supabase.rpc('nmdx_resolve', { p_id: id, p_status: status, p_note: note })).error)
}

/** Open suggestions per NMDx entry, for the counts shown in the frame. */
export function openCounts(list: Suggestion[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of list) if (s.kind === 'correction' && s.status === 'open' && s.entry_id) out[s.entry_id] = (out[s.entry_id] ?? 0) + 1
  return out
}
