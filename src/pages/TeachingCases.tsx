import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { formatDate } from '../lib/format'

// ---------------------------------------------------------------------------
// Teaching cases — a provider-only, private case-based teaching logbook.
// Each case belongs to its author (RLS: provider_id = auth.uid()); attachments
// live in a PRIVATE storage bucket and are reached only via short-lived signed
// URLs. Cases and files can be permanently deleted.
// ---------------------------------------------------------------------------

const BUCKET = 'teaching-cases'
const SIGNED_URL_TTL = 3600 // 1 hour

interface TeachingCase {
  id: string
  patient_name: string | null
  mrn: string | null
  hospital_site: string | null
  age: string | null
  sex: string | null
  description: string | null
  teaching_points: string | null
  created_at: string
}

interface CaseFile {
  id: string
  storage_path: string
  file_name: string
  mime_type: string | null
  kind: string | null
  size_bytes: number | null
}

const SELECT = 'id, patient_name, mrn, hospital_site, age, sex, description, teaching_points, created_at'

function fileKind(f: File): string {
  const t = f.type || ''
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('video/')) return 'video'
  if (t === 'application/pdf' || t.includes('word') || /\.(docx?|pdf)$/i.test(f.name)) return 'report'
  return 'other'
}

function humanSize(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function TeachingCases() {
  const { profile } = useAuth()
  const [cases, setCases] = useState<TeachingCase[]>([])
  const [editing, setEditing] = useState<TeachingCase | null>(null)
  const [creating, setCreating] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('teaching_cases')
      .select(SELECT)
      .order('created_at', { ascending: false })
    if (error) setMsg(error.message)
    setCases((data as TeachingCase[]) ?? [])
  }

  useEffect(() => {
    if (profile) load()
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return null
  const userId = profile.id

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Teaching cases</h1>
          <p className="mt-1 text-sm text-muted">
            Your private case-based teaching logbook with report, image and video attachments
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null)
            setCreating((v) => !v)
          }}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {creating ? 'Close form' : '+ New teaching case'}
        </button>
      </div>

      <div className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-ink">
        <span className="font-semibold">Confidentiality — please de-identify.</span> Use initials rather than a full
        name, and a non-identifying reference (or only the last few digits) rather than a full MRN. Before uploading,
        redact patient identifiers from reports and crop names/MRNs out of screenshots and video. These cases are{' '}
        <span className="font-semibold">private to you</span> — no one else can see them, files are stored in a private
        bucket with no public link, and you can delete any case or file permanently. Follow your institution's privacy
        policy for anything you store here.
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {(creating || editing) && (
        <CaseEditor
          userId={userId}
          existing={editing}
          onError={setMsg}
          onSaved={(saved) => {
            setCreating(false)
            setEditing(saved) // keep the editor open on the saved case so attachments can be added
            load()
          }}
          onDeleted={() => {
            setCreating(false)
            setEditing(null)
            load()
          }}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}

      <Card>
        <CardHeader title="Your teaching cases" sub={`${cases.length} saved`} />
        {cases.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No teaching cases yet. Use "+ New teaching case" to start one.</p>
        ) : (
          <ul className="divide-y divide-line">
            {cases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{c.patient_name?.trim() || 'Untitled teaching case'}</span>
                  <span className="ml-2 text-muted">
                    {[c.hospital_site, c.age ? `age ${c.age}` : null, c.sex].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted">{formatDate(c.created_at)}</span>
                  <button
                    className="font-medium text-accent hover:underline"
                    onClick={() => {
                      setCreating(false)
                      setEditing(c)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    Open
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function CaseEditor({
  userId,
  existing,
  onSaved,
  onDeleted,
  onClose,
  onError,
}: {
  userId: string
  existing: TeachingCase | null
  onSaved: (c: TeachingCase) => void
  onDeleted: () => void
  onClose: () => void
  onError: (m: string) => void
}) {
  const [patientName, setPatientName] = useState(existing?.patient_name ?? '')
  const [mrn, setMrn] = useState(existing?.mrn ?? '')
  const [site, setSite] = useState(existing?.hospital_site ?? '')
  const [age, setAge] = useState(existing?.age ?? '')
  const [sex, setSex] = useState(existing?.sex ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [teaching, setTeaching] = useState(existing?.teaching_points ?? '')
  const [busy, setBusy] = useState(false)

  // Reset fields when the target case changes.
  useEffect(() => {
    setPatientName(existing?.patient_name ?? '')
    setMrn(existing?.mrn ?? '')
    setSite(existing?.hospital_site ?? '')
    setAge(existing?.age ?? '')
    setSex(existing?.sex ?? '')
    setDescription(existing?.description ?? '')
    setTeaching(existing?.teaching_points ?? '')
  }, [existing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true)
    const payload = {
      provider_id: userId,
      patient_name: patientName.trim() || null,
      mrn: mrn.trim() || null,
      hospital_site: site.trim() || null,
      age: age.trim() || null,
      sex: sex.trim() || null,
      description: description.trim() || null,
      teaching_points: teaching.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const res = existing
      ? await supabase.from('teaching_cases').update(payload).eq('id', existing.id).select(SELECT).single()
      : await supabase.from('teaching_cases').insert(payload).select(SELECT).single()
    setBusy(false)
    if (res.error) {
      onError(res.error.message)
      return
    }
    onSaved(res.data as TeachingCase)
  }

  async function deleteCase() {
    if (!existing) return
    if (!window.confirm('Permanently delete this teaching case and all of its attachments? This cannot be undone.')) return
    setBusy(true)
    // Remove attachments from storage first, then the case row (files rows cascade).
    const { data: files } = await supabase.from('teaching_case_files').select('storage_path').eq('case_id', existing.id)
    const paths = (files as { storage_path: string }[] | null)?.map((f) => f.storage_path) ?? []
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    const { error } = await supabase.from('teaching_cases').delete().eq('id', existing.id)
    setBusy(false)
    if (error) {
      onError(error.message)
      return
    }
    onDeleted()
  }

  return (
    <Card>
      <CardHeader
        title={existing ? 'Edit teaching case' : 'New teaching case'}
        sub="De-identify where you can — initials over full names, partial over full MRNs"
        action={
          <button onClick={onClose} className="text-sm font-medium text-muted hover:text-ink">
            Close
          </button>
        }
      />
      <div className="space-y-5 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Patient (use initials)">
            <input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="e.g., J.D."
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </Field>
          <Field label="MRN (redacted / partial)">
            <input value={mrn} onChange={(e) => setMrn(e.target.value)} placeholder="e.g., …4821 or a study ref"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </Field>
          <Field label="Hospital site">
            <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g., SHSC / TGH / SMH"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age">
              <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g., 54"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
            </Field>
            <Field label="Gender">
              <input value={sex} onChange={(e) => setSex(e.target.value)} placeholder="e.g., F"
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
            </Field>
          </div>
        </div>

        <Field label="Brief case description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="Presentation, referral question, and key findings — no identifiers"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </Field>

        <Field label="Key teaching points">
          <textarea value={teaching} onChange={(e) => setTeaching(e.target.value)} rows={3}
            placeholder="What makes this case instructive; pitfalls; take-home points"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Working…' : existing ? 'Save changes' : 'Save case'}
          </button>
          {existing && (
            <button onClick={deleteCase} disabled={busy}
              className="rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              Delete case permanently
            </button>
          )}
        </div>

        {existing ? (
          <Attachments caseId={existing.id} userId={userId} onError={onError} />
        ) : (
          <p className="border-t border-line pt-4 text-sm text-muted">
            Save the case first, then you can attach NCS/EMG reports (PDF or Word) and images or video of the recording.
          </p>
        )}
      </div>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

function Attachments({ caseId, userId, onError }: { caseId: string; userId: string; onError: (m: string) => void }) {
  const [files, setFiles] = useState<CaseFile[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('teaching_case_files')
      .select('id, storage_path, file_name, mime_type, kind, size_bytes')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true })
    if (error) {
      onError(error.message)
      return
    }
    const list = (data as CaseFile[]) ?? []
    setFiles(list)
    // Sign every file for viewing/download.
    const map: Record<string, string> = {}
    for (const f of list) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, SIGNED_URL_TTL)
      if (signed?.signedUrl) map[f.id] = signed.signedUrl
    }
    setUrls(map)
  }

  useEffect(() => {
    load()
  }, [caseId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setBusy(true)
    for (const file of Array.from(fileList)) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `${userId}/${caseId}/${crypto.randomUUID()}-${safe}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      })
      if (upErr) {
        onError(upErr.message)
        continue
      }
      const { error: rowErr } = await supabase.from('teaching_case_files').insert({
        case_id: caseId,
        provider_id: userId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        kind: fileKind(file),
        size_bytes: file.size,
      })
      if (rowErr) onError(rowErr.message)
    }
    setBusy(false)
    load()
  }

  async function removeFile(f: CaseFile) {
    if (!window.confirm(`Permanently delete "${f.file_name}"?`)) return
    await supabase.storage.from(BUCKET).remove([f.storage_path])
    await supabase.from('teaching_case_files').delete().eq('id', f.id)
    load()
  }

  return (
    <div className="border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Attachments</p>
        <label className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft/40">
          {busy ? 'Uploading…' : '+ Upload files'}
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx,image/*,video/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              upload(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-muted">
        NCS/EMG reports (PDF or Word), screenshots/images, or video of the recording. Up to 200 MB per file. Redact
        identifiers before uploading.
      </p>

      {files.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No attachments yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {files.map((f) => (
            <li key={f.id} className="rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-ink">{f.file_name}</span>
                  <span className="ml-2 text-xs text-muted">
                    {[f.kind, humanSize(f.size_bytes)].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {urls[f.id] && (
                    <a href={urls[f.id]} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                      Open
                    </a>
                  )}
                  <button onClick={() => removeFile(f)} className="font-medium text-rose-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
              {urls[f.id] && f.kind === 'image' && (
                <img src={urls[f.id]} alt={f.file_name} className="mt-2 max-h-72 rounded border border-line" />
              )}
              {urls[f.id] && f.kind === 'video' && (
                <video src={urls[f.id]} controls className="mt-2 max-h-72 w-full rounded border border-line" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
