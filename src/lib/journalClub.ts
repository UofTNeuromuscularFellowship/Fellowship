import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Journal Club. Members read the tables directly; every write goes through a
// database function (jc_*), which checks membership, the conduct policy and,
// for removals, that the caller is the director/admin. See
// supabase/migrations/0050_journal_club.sql.
// ---------------------------------------------------------------------------

export interface JcArticle {
  id: string
  title: string
  authors: string | null
  journal: string | null
  year: number | null
  url: string | null
  doi: string | null
  pmid: string | null
  why: string | null
  recommended_by: string | null
  created_at: string
  summary_outcome: string | null
  summary_limitations: string | null
  summary_by: string | null
  summary_at: string | null
  removed_at: string | null
  comment_count?: number
}

export interface JcComment {
  id: string
  article_id: string
  author_id: string | null
  body: string | null
  is_question: boolean
  created_at: string
  edited_at: string | null
  removed_at: string | null
  removed_kind: 'author' | 'moderator' | null
}

export interface JcReport {
  id: string
  comment_id: string
  reason: string | null
  created_at: string
}

export interface JcPerson { id: string; full_name: string | null; role: string }

export interface ArticleDraft {
  title: string; authors: string; journal: string; year: string; url: string; doi: string; pmid: string; why: string
}

export const EMPTY_DRAFT: ArticleDraft = { title: '', authors: '', journal: '', year: '', url: '', doi: '', pmid: '', why: '' }

/** The conduct policy, shown before anyone posts for the first time. */
export const POLICY_TITLE = 'Journal Club conduct policy'
export const POLICY_POINTS = [
  'Be respectful. Critique the article and the ideas, never the person.',
  'No verbal abuse, harassment, bullying, threats, or discriminatory remarks of any kind — in comments, summaries or recommendations.',
  'Do not post anything that could identify a patient.',
  'Questions are welcome at every level of training.',
  'The program director can remove any post that breaks this policy. If you see one, use “Report” and the director will be told.',
]

function err(e: { message: string } | null): void {
  if (e) throw new Error(e.message)
}

export function articleLink(a: Pick<JcArticle, 'url' | 'doi' | 'pmid'>): string | null {
  if (a.url && /^https?:\/\//.test(a.url)) return a.url
  if (a.doi) return `https://doi.org/${a.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`
  if (a.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`
  return null
}

export function citation(a: Pick<JcArticle, 'authors' | 'journal' | 'year'>): string {
  return [a.authors, a.journal, a.year].filter(Boolean).join(' · ')
}

export async function loadArticles(): Promise<JcArticle[]> {
  const { data, error } = await supabase.from('jc_articles').select('*, jc_comments(count)')
    .is('removed_at', null).order('created_at', { ascending: false })
  err(error)
  return ((data ?? []) as (JcArticle & { jc_comments?: { count: number }[] })[]).map((r) => {
    const { jc_comments, ...rest } = r
    return { ...rest, comment_count: jc_comments?.[0]?.count ?? 0 }
  })
}

export async function loadArticle(id: string): Promise<JcArticle | null> {
  const { data, error } = await supabase.from('jc_articles').select('*').eq('id', id).maybeSingle()
  err(error)
  return (data as JcArticle | null) ?? null
}

export async function loadComments(articleId: string): Promise<JcComment[]> {
  const { data, error } = await supabase.from('jc_comments').select('*').eq('article_id', articleId).order('created_at')
  err(error)
  return (data as JcComment[]) ?? []
}

/** Unresolved reports: the director sees all; others only their own. */
export async function loadOpenReports(): Promise<(JcReport & { jc_comments?: { article_id: string; body: string | null } | null })[]> {
  const { data, error } = await supabase.from('jc_reports').select('id, comment_id, reason, created_at, jc_comments(article_id, body)')
    .is('resolved_at', null).order('created_at', { ascending: false })
  err(error)
  return (data as never) ?? []
}

export async function loadPeople(): Promise<Map<string, JcPerson>> {
  const { data } = await supabase.rpc('jc_people')
  return new Map(((data as JcPerson[]) ?? []).map((p) => [p.id, p]))
}

export async function hasAcceptedPolicy(uid: string): Promise<boolean> {
  const { data } = await supabase.from('jc_policy_acks').select('user_id').eq('user_id', uid).maybeSingle()
  return !!data
}

export async function acceptPolicy() { err((await supabase.rpc('jc_accept_policy')).error) }

function draftArgs(d: ArticleDraft) {
  const year = d.year.trim() ? Number(d.year) : null
  if (year !== null && (!Number.isInteger(year) || year < 1800 || year > 2200)) throw new Error('The year doesn’t look right.')
  const pmid = d.pmid.trim().replace(/^PMID:?\s*/i, '')
  if (pmid && !/^\d{1,10}$/.test(pmid)) throw new Error('A PubMed ID is a number, e.g. 34146511.')
  const url = d.url.trim()
  if (url && !/^https?:\/\//.test(url)) throw new Error('The link should start with https://')
  return {
    p_title: d.title, p_authors: d.authors, p_journal: d.journal, p_year: year,
    p_url: url, p_doi: d.doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, ''), p_pmid: pmid, p_why: d.why,
  }
}

export async function recommend(d: ArticleDraft): Promise<string> {
  const { data, error } = await supabase.rpc('jc_recommend', draftArgs(d))
  err(error)
  return data as string
}

export async function updateArticle(id: string, d: ArticleDraft) {
  err((await supabase.rpc('jc_update_article', { p_article: id, ...draftArgs(d) })).error)
}

export async function saveSummary(id: string, outcome: string, limitations: string) {
  err((await supabase.rpc('jc_save_summary', { p_article: id, p_outcome: outcome, p_limitations: limitations })).error)
}

export async function postComment(articleId: string, body: string, question: boolean) {
  err((await supabase.rpc('jc_post_comment', { p_article: articleId, p_body: body, p_question: question })).error)
}
export async function editComment(id: string, body: string) { err((await supabase.rpc('jc_edit_comment', { p_comment: id, p_body: body })).error) }
export async function deleteComment(id: string) { err((await supabase.rpc('jc_delete_comment', { p_comment: id })).error) }
export async function reportComment(id: string, reason: string) { err((await supabase.rpc('jc_report_comment', { p_comment: id, p_reason: reason })).error) }
export async function removeComment(id: string, reason: string) { err((await supabase.rpc('jc_remove_comment', { p_comment: id, p_reason: reason })).error) }
export async function dismissReports(id: string) { err((await supabase.rpc('jc_dismiss_reports', { p_comment: id })).error) }
export async function removeArticle(id: string, reason: string) { err((await supabase.rpc('jc_remove_article', { p_article: id, p_reason: reason })).error) }
