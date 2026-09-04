import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card'
import { useAuth } from '../context/AuthContext'
import { AnnotatedMedia, AnnotationEditor, COLOURS, TOOLS } from '../components/caseMedia/Annotator'
import { SignaturePad } from '../components/caseMedia/SignaturePad'
import { InstallImagesApp } from '../components/caseMedia/InstallImagesApp'
import {
  canEditCase,
  consentRequired,
  createCase,
  DEFAULT_CONSENT_WORDING,
  deleteCase,
  getConsent,
  saveConsent,
  signConsentUrl,
  isVideo,
  kindLabel,
  listCases,
  matchesQuery,
  MEDIA_KINDS,
  savePoster,
  signPaths,
  updateCase,
  type Annotation,
  type CaseMedia as Case,
  type ConsentRecord,
  type MediaKind,
  type ShapeKind,
} from '../lib/caseMedia'

// ---------------------------------------------------------------------------
// Waveform, ultrasound, biopsy and examination image library.
//
// List and search on the left, one case open on the right. Anyone signed in can
// add a case and annotate their own; the director can edit anyone's.
//
// NOTHING HERE HOLDS A PATIENT IDENTIFIER. The table has no column for one and
// this page offers no field for one — but the risk lives in the pixels, not the
// schema: EMG and ultrasound exports normally have the name and MRN printed
// across the top of the image, and a photograph of a sign can identify someone
// by itself. The upload form says so and requires it to be confirmed, because
// the person uploading is the only one who can actually check.
// ---------------------------------------------------------------------------

const KIND_BADGE: Record<MediaKind, string> = {
  waveform: 'bg-accent-soft text-accent',
  ultrasound: 'bg-blue-100 text-blue-800',
  mri: 'bg-indigo-100 text-indigo-800',
  biopsy: 'bg-purple-100 text-purple-800',
  exam: 'bg-amber-100 text-amber-800',
}

function Badge({ kind }: { kind: MediaKind }) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_BADGE[kind]}`}>
      {kindLabel(kind)}
    </span>
  )
}

// ---------------------------------------------------------------------------

function UploadForm({
  authorId,
  onDone,
  onError,
}: {
  authorId: string
  onDone: (c: Case) => void
  onError: (m: string) => void
}) {
  const [title, setTitle] = useState('')
  const [mediaKind, setMediaKind] = useState<MediaKind>('waveform')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // Remounts the file inputs after a successful upload. They are uncontrolled,
  // so without this their value survives the reset and picking the same file
  // again fires no change event.
  const [fileKey, setFileKey] = useState(0)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  // Consent, captured at upload for anything a patient could be recognised in.
  const [patientName, setPatientName] = useState('')
  const [wording, setWording] = useState(DEFAULT_CONSENT_WORDING)
  const [signature, setSignature] = useState<Blob | null>(null)
  const [byRepresentative, setByRepresentative] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [signerAuthority, setSignerAuthority] = useState('')

  const needsConsent = consentRequired(mediaKind)
  // A representative signature is incomplete without both a name and an
  // authority — the database refuses one without the other, so the button is
  // disabled rather than letting the upload fail after the file is already up.
  const representativeReady =
    !byRepresentative || (signerName.trim().length > 0 && signerAuthority.trim().length > 0)
  const consentReady =
    !needsConsent ||
    (patientName.trim().length > 0 && signature !== null && representativeReady)
  const ready = title.trim().length > 0 && file !== null && confirmed && consentReady

  async function submit() {
    if (!ready || !file) return
    setBusy(true)
    try {
      const created = await createCase({ title, mediaKind, description, file }, authorId)
      // The case exists first, because the consent row references it. If the
      // consent write fails the case is removed again rather than left standing
      // without the permission it requires.
      if (needsConsent && signature) {
        try {
          await saveConsent(
            created.id,
            {
              patientName,
              wording,
              signature,
              signerIsRepresentative: byRepresentative,
              signerName,
              signerAuthority,
            },
            authorId,
          )
        } catch (e) {
          await deleteCase(created)
          throw e
        }
      }
      onDone(created)
      setTitle('')
      setDescription('')
      setFile(null)
      setFileKey((n) => n + 1)
      setConfirmed(false)
      setPatientName('')
      setSignature(null)
      setByRepresentative(false)
      setSignerName('')
      setSignerAuthority('')
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Case title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Myotonic discharges in the tibialis anterior"
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </label>

      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">What is it</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {MEDIA_KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setMediaKind(k.id)}
              title={k.hint}
              className={`min-h-[40px] rounded-md border px-3 py-2 text-sm font-semibold sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-xs ${
                mediaKind === k.id
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Description <span className="font-normal normal-case">— appears under the image</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="What is being shown, what to look for, and why it matters."
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
      </label>

      {/* Two ways in, because the phone is where this now gets used: the camera
          straight from the clinic room, or a file already on the device. A bare
          <input type=file> renders as a tiny, unlabelled control on iOS, which
          is why these are full-width labelled buttons with the input hidden
          inside them. */}
      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Image or clip</span>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink hover:border-accent">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-1.7A1.5 1.5 0 0 1 9.05 4.6h5.9a1.5 1.5 0 0 1 1.25.7L17.3 7h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
              <circle cx="12" cy="12.8" r="3.4" />
            </svg>
            Take a photo or video
            <input
              key={`cam-${fileKey}`}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink hover:border-accent">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 17.5V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
              <path d="M4 15.5 8.8 11l3.4 3.2 2.5-2.2L20 16" />
            </svg>
            Choose a file
            <input
              key={`pick-${fileKey}`}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted">
          {file
            ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`
            : 'Nothing chosen yet. The camera option opens straight into the camera on a phone or tablet.'}
        </p>
      </div>

      {needsConsent && (
        <div className="rounded-md border border-accent/40 bg-accent-soft/20 px-4 py-3">
          <p className="text-sm font-semibold text-ink">Patient consent</p>
          <p className="mt-1 text-sm text-ink">
            A photograph or recording of a patient goes up only with signed permission. Read the
            wording below aloud to {byRepresentative ? 'the representative' : 'the patient'}, then
            have {byRepresentative ? 'them' : 'the patient'} sign.
          </p>

          <label className="mt-3 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Patient name, as they give it
            </span>
            <input
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
            <span className="mt-1 block text-xs text-muted">
              Kept with the consent record, which only you and the fellowship director can open. It
              is never shown with the image.
            </span>
          </label>

          {/* Who is holding the pen. A neuromuscular clinic is exactly where the
              patient may not be able to: severe hand weakness, bulbar disease, a
              ventilated patient. The consent allows a substitute decision-maker,
              so the record has to say when one signed and on what authority. */}
          <div className="mt-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Who is signing
            </span>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {[
                { rep: false, label: 'The patient' },
                { rep: true, label: 'A representative' },
              ].map((o) => (
                <button
                  key={String(o.rep)}
                  onClick={() => setByRepresentative(o.rep)}
                  className={`min-h-[40px] rounded-md border px-3 py-2 text-sm font-semibold ${
                    byRepresentative === o.rep
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {byRepresentative && (
            <div className="mt-3 space-y-3 rounded-md border border-line bg-surface px-3 py-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Name of the person signing
                </span>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Their authority to act for the patient
                </span>
                <input
                  value={signerAuthority}
                  onChange={(e) => setSignerAuthority(e.target.value)}
                  placeholder="e.g. spouse and substitute decision-maker"
                  className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
                <span className="mt-1 block text-xs text-muted">
                  Both are required. The signature below is theirs, not the patient&apos;s.
                </span>
              </label>
            </div>
          )}

          <label className="mt-3 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              What they are agreeing to
            </span>
            {/* Tall, because it is now a full consent rather than a sentence,
                and this is the text that gets read aloud to the patient. */}
            <textarea
              value={wording}
              onChange={(e) => setWording(e.target.value)}
              rows={14}
              className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-ink focus:border-accent focus:outline-none"
            />
            <span className="mt-1 block text-xs text-muted">
              Editable, and a copy of exactly this text is stored with the signature — so changing
              it later cannot alter what someone has already agreed to.
            </span>
          </label>

          <div className="mt-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Signature {byRepresentative ? 'of the representative' : 'of the patient'}
            </span>
            <div className="mt-1">
              <SignaturePad onChange={setSignature} />
            </div>
          </div>
        </div>
      )}

      {/* The one thing software cannot check for them. */}
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
        <p className="text-sm text-ink">
          <span className="font-semibold text-amber-800">Before you upload. </span>
          Everyone in the fellowship can see this library. EMG and ultrasound machines normally
          print the patient&apos;s name, MRN and date of birth along the top of the image, and a
          photograph or clip of an examination finding can identify someone on its own. Crop the
          header off and check the frame before choosing the file.
        </p>
        <label className="mt-2 flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line text-accent focus:ring-accent"
          />
          <span>
            I have checked this file and it contains no patient identifiers — no name, MRN, date of
            birth, or recognisable face.
          </span>
        </label>
      </div>

      <button
        onClick={() => void submit()}
        disabled={!ready || busy}
        className="min-h-[44px] w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {busy ? 'Uploading…' : 'Add case'}
      </button>
      {!ready && !busy && (
        <p className="text-xs text-muted">
          Needs a title, a file, the confirmation above
          {needsConsent
            ? byRepresentative
              ? ', the patient\u2019s name, the representative\u2019s name and authority, and a signature'
              : ', and the patient\u2019s name and signature'
            : ''}
          .
        </p>
      )}
    </div>
  )
}

/**
 * What is shown under the image about consent.
 *
 * Everyone sees the attestation — that consent exists and when it was signed.
 * Only the clinician who obtained it and the director can open the record
 * itself, because the signature is the patient's name in their own hand and
 * publishing it beside their clinical photograph would identify them.
 */
function ConsentBlock({ c }: { c: Case }) {
  const [record, setRecord] = useState<ConsentRecord | null>(null)
  const [sigUrl, setSigUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRecord(null)
    setSigUrl(null)
    setOpen(false)
    setChecked(false)
    if (!c.consentSignedAt) return
    // RLS decides: a reader who may not see it simply gets null back, and the
    // attestation stands on its own.
    getConsent(c.id).then((r) => {
      if (cancelled) return
      setRecord(r)
      setChecked(true)
      if (r) void signConsentUrl(r.signaturePath).then((u) => !cancelled && setSigUrl(u))
    })
    return () => {
      cancelled = true
    }
  }, [c.id, c.consentSignedAt])

  if (!c.consentSignedAt) {
    if (!consentRequired(c.mediaKind)) return null
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3">
        <p className="text-sm text-ink">
          <span className="font-semibold text-red-700">No consent on file. </span>
          This is a patient photograph or clip and no signed consent is recorded against it. It
          should not be shown until that is resolved.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-line bg-paper/60 px-4 py-3">
      <p className="text-sm text-ink">
        <span className="font-semibold">Patient consent on file. </span>
        Signed {new Date(c.consentSignedAt).toLocaleDateString()} for use in medical teaching.
      </p>
      {checked && record && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-1 text-xs font-semibold text-accent hover:underline"
          >
            {open ? 'Hide the signed consent' : 'View the signed consent'}
          </button>
          {open && (
            <div className="mt-3 space-y-2 rounded-md border border-line bg-surface px-4 py-3">
              <p className="text-xs text-muted">
                Visible to you because you obtained this consent or you are the fellowship director.
                It is not shown to other readers.
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                {record.wording}
              </p>
              <p className="text-sm text-ink">
                <span className="font-semibold">Patient: </span>
                {record.patientName}
              </p>
              {record.signerIsRepresentative ? (
                <p className="text-sm text-ink">
                  <span className="font-semibold">Signed by: </span>
                  {record.signerName}
                  {record.signerAuthority ? ` — ${record.signerAuthority}` : ''}
                  <span className="text-muted"> (on the patient&apos;s behalf)</span>
                </p>
              ) : (
                <p className="text-sm text-ink">
                  <span className="font-semibold">Signed by: </span>
                  the patient
                </p>
              )}
              {sigUrl && (
                <img
                  src={sigUrl}
                  alt="Patient signature"
                  className="max-w-sm rounded-md border border-line bg-white"
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function CaseView({
  c,
  url,
  posterUrl,
  mayEdit,
  onSaved,
  onDeleted,
  onError,
}: {
  c: Case
  url: string | null
  posterUrl: string | null
  mayEdit: boolean
  onSaved: (c: Case) => void
  onDeleted: (id: string) => void
  onError: (m: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Annotation[]>(c.annotations)
  const [tool, setTool] = useState<ShapeKind>('arrow')
  const [colour, setColour] = useState(COLOURS[0].id)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    setDraft(c.annotations)
    setEditing(false)
    setActiveId(null)
  }, [c.id, c.annotations])

  const video = isVideo(c)
  // A clip is annotated through a still captured from it; the still is what the
  // shapes are anchored to, so the drawing surface only ever shows an image.
  const annotationSurface = video ? posterUrl : url
  const shown = editing ? draft : c.annotations

  async function save() {
    setBusy(true)
    try {
      onSaved(await updateCase(c.id, { annotations: draft }))
      setEditing(false)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** Grab the frame currently showing and keep it as the annotation still. */
  async function captureFrame() {
    const v = videoRef.current
    if (!v) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not read the video frame.')
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92))
      if (!blob) throw new Error('Could not encode the frame.')
      onSaved(await savePoster(c, blob))
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${c.title}"? The file is permanently removed.`)) return
    try {
      await deleteCase(c)
      onDeleted(c.id)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Card>
      <CardHeader
        title={c.title}
        sub={`${kindLabel(c.mediaKind)} · added ${new Date(c.createdAt).toLocaleDateString()}`}
        action={
          mayEdit ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {!editing ? (
                <button
                  onClick={() => setEditing(true)}
                  disabled={!annotationSurface}
                  title={
                    annotationSurface
                      ? 'Draw on this image'
                      : 'Capture a frame from the clip first'
                  }
                  className="min-h-[38px] rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Annotate
                </button>
              ) : (
                <>
                  <button
                    onClick={() => void save()}
                    disabled={busy}
                    className="min-h-[38px] rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setDraft(c.annotations)
                      setEditing(false)
                    }}
                    className="min-h-[38px] rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                </>
              )}
              <button onClick={() => void remove()} className="min-h-[38px] px-1 text-xs font-semibold text-red-600 hover:underline">
                Delete
              </button>
            </div>
          ) : undefined
        }
      />

      {/* ---- drawing toolbar ---- */}
      {editing && (
        <div className="space-y-2 border-b border-line bg-paper/60 px-4 py-2.5 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:space-y-0 sm:px-5">
          {/* Tools fill the width on a phone so each one is a real tap target,
              and collapse back to a compact row from sm up. */}
          <div className="grid grid-cols-3 gap-1 sm:flex sm:gap-1">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                title={t.hint}
                className={`min-h-[40px] rounded-md border px-2.5 text-sm font-semibold sm:min-h-0 sm:py-1.5 sm:text-xs ${
                  tool === t.id ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:block" />

          <div className="flex items-center justify-between gap-1.5 sm:justify-start" role="group" aria-label="Colour">
            {COLOURS.map((col) => (
              <button
                key={col.id}
                onClick={() => setColour(col.id)}
                title={col.name}
                aria-label={col.name}
                aria-pressed={colour === col.id}
                style={{ backgroundColor: col.id }}
                className={`h-8 w-8 rounded-full border sm:h-5 sm:w-5 ${
                  colour === col.id ? 'border-ink ring-2 ring-accent ring-offset-1' : 'border-line'
                }`}
              />
            ))}
          </div>

          <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:block" />

          <div className="grid grid-cols-2 gap-1 sm:flex sm:gap-2">
            <button
              onClick={() => setDraft((d) => d.slice(0, -1))}
              disabled={draft.length === 0}
              className="min-h-[40px] rounded-md border border-line px-2.5 text-sm font-semibold text-muted hover:text-ink disabled:opacity-40 sm:min-h-0 sm:py-1.5 sm:text-xs"
            >
              Undo
            </button>
            <button
              onClick={() => setDraft([])}
              disabled={draft.length === 0}
              className="min-h-[40px] rounded-md border border-line px-2.5 text-sm font-semibold text-muted hover:text-ink disabled:opacity-40 sm:min-h-0 sm:py-1.5 sm:text-xs"
            >
              Clear all
            </button>
          </div>
          <p className="text-xs text-muted sm:ml-auto">
            <span className="sm:hidden">Draw on the image with a finger · name each shape below</span>
            <span className="hidden sm:inline">
              Drag on the image to draw · name each shape in the list below
            </span>
          </p>
        </div>
      )}

      <div className="space-y-4 px-5 py-4">
        {/* ---- the media ---- */}
        {!url ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : video && !editing ? (
          <div className="space-y-2">
            <video
              ref={videoRef}
              src={url}
              controls
              playsInline
              crossOrigin="anonymous"
              className="w-full rounded-md border border-line bg-black"
            />
            {mayEdit && (
              <button
                onClick={() => void captureFrame()}
                disabled={busy}
                className="min-h-[40px] w-full rounded-md border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-40 sm:w-auto sm:py-1.5 sm:text-xs"
              >
                {c.posterPath ? 'Replace the annotation frame with this one' : 'Annotate this frame'}
              </button>
            )}
            {c.posterPath && posterUrl && (
              <div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  Captured frame
                </p>
                <AnnotatedMedia annotations={c.annotations} activeId={activeId}>
                  <img src={posterUrl} alt={c.title} className="block w-full" />
                </AnnotatedMedia>
              </div>
            )}
          </div>
        ) : editing && annotationSurface ? (
          <AnnotationEditor
            annotations={draft}
            onChange={setDraft}
            tool={tool}
            colour={colour}
            activeId={activeId}
            onActive={setActiveId}
          >
            <img src={annotationSurface} alt={c.title} className="block w-full" draggable={false} />
          </AnnotationEditor>
        ) : (
          <AnnotatedMedia annotations={shown} activeId={activeId}>
            <img src={url} alt={c.title} className="block w-full" />
          </AnnotatedMedia>
        )}

        {/* ---- description ---- */}
        {c.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{c.description}</p>
        )}

        {/* ---- consent, under the photo ---- */}
        <ConsentBlock c={c} />

        {/* ---- legend / appendix ---- */}
        {(shown.length > 0 || editing) && (
          <div className="rounded-md border border-line">
            <p className="border-b border-line bg-paper/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Legend
            </p>
            {shown.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">
                Nothing drawn yet. Pick a tool above and drag on the image.
              </p>
            ) : (
              <ol className="divide-y divide-line/60">
                {shown.map((a, i) => (
                  <li
                    key={a.id}
                    onMouseEnter={() => setActiveId(a.id)}
                    onMouseLeave={() => setActiveId(null)}
                    className="flex items-center gap-3 px-4 py-2"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: a.colour,
                        color: a.colour === '#FFFFFF' ? '#111827' : '#FFFFFF',
                      }}
                    >
                      {i + 1}
                    </span>
                    {editing ? (
                      <>
                        <input
                          value={a.label}
                          onChange={(e) =>
                            setDraft((d) =>
                              d.map((x) => (x.id === a.id ? { ...x, label: e.target.value } : x)),
                            )
                          }
                          placeholder={`What does ${a.kind === 'arrow' ? 'this arrow' : a.kind === 'ellipse' ? 'this circle' : 'this outline'} point out?`}
                          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none"
                        />
                        <button
                          onClick={() => setDraft((d) => d.filter((x) => x.id !== a.id))}
                          className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="text-sm text-ink">
                        {a.label || <span className="text-muted">Unlabelled</span>}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------

export default function CaseMediaLibrary() {
  const { profile } = useAuth()
  const [cases, setCases] = useState<Case[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<MediaKind | 'all'>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  // ?add=1 opens the form straight away. That is what the home-screen app's
  // "Add a teaching image" shortcut points at, so a photo taken in clinic lands
  // on the upload form rather than on a list to be navigated.
  const [adding, setAdding] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('add'),
  )
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const rows = await listCases()
      setCases(rows)
      setUrls(await signPaths(rows.flatMap((r) => [r.storagePath, r.posterPath ?? ''])))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (profile) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const shown = useMemo(
    () =>
      cases.filter(
        (c) => (kindFilter === 'all' || c.mediaKind === kindFilter) && matchesQuery(c, query),
      ),
    [cases, kindFilter, query],
  )

  const open = useMemo(() => cases.find((c) => c.id === openId) ?? null, [cases, openId])

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Waveforms &amp; images</h1>
        <p className="mt-1 text-sm text-muted">
          Teaching images and clips — waveforms, ultrasound, MRI, biopsy and examination findings —
          with annotations and a legend
        </p>
      </div>

      <InstallImagesApp />

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg}
          <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>
            dismiss
          </button>
        </div>
      )}

      {adding && (
        <Card>
          <CardHeader
            title="Add a case"
            sub="Visible to everyone in the fellowship"
            action={
              <button
                onClick={() => setAdding(false)}
                className="min-h-[36px] shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
              >
                Close
              </button>
            }
          />
          <div className="px-5 py-4">
            <UploadForm
              authorId={profile.id}
              onDone={(c) => {
                setCases((all) => [c, ...all])
                setOpenId(c.id)
                setAdding(false)
                void load()
              }}
              onError={setMsg}
            />
          </div>
        </Card>
      )}

      {/* On a phone the two panes become one: the list until a case is opened,
          then the case with a way back. Stacking them instead would put the
          whole list between the reader and the image they just tapped. */}
      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* ---------------- list ---------------- */}
        <Card className={`self-start ${openId ? 'hidden lg:block' : ''}`}>
          <CardHeader
            title="Cases"
            sub={`${shown.length} of ${cases.length}`}
            action={
              !adding ? (
                <button
                  onClick={() => setAdding(true)}
                  className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Add case
                </button>
              ) : undefined
            }
          />

          <div className="space-y-3 border-b border-line px-5 py-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('')
              }}
              placeholder="Search title, description or labels"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setKindFilter('all')}
                className={`min-h-[36px] rounded-md border px-3 py-1.5 text-xs font-semibold sm:min-h-0 sm:px-2 sm:py-1 ${
                  kindFilter === 'all' ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'
                }`}
              >
                All
              </button>
              {MEDIA_KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKindFilter(k.id)}
                  className={`min-h-[36px] rounded-md border px-3 py-1.5 text-xs font-semibold sm:min-h-0 sm:px-2 sm:py-1 ${
                    kindFilter === k.id ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="px-5 py-4 text-sm text-muted">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">
              {cases.length === 0
                ? 'Nothing here yet. Use “Add case” to put up the first waveform or image.'
                : 'No case matches that search.'}
            </p>
          ) : (
            <ul className="divide-y divide-line lg:max-h-[32rem] lg:overflow-y-auto">
              {shown.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setOpenId(c.id)}
                    className={`flex w-full items-start gap-2 px-5 py-3 text-left ${
                      c.id === openId ? 'bg-accent-soft/60' : 'hover:bg-paper'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{c.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {c.annotations.length > 0
                          ? `${c.annotations.length} annotation${c.annotations.length === 1 ? '' : 's'}`
                          : 'No annotations yet'}
                        {isVideo(c) ? ' · clip' : ''}
                      </p>
                    </div>
                    <Badge kind={c.mediaKind} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------- open case ---------------- */}
        <div className={openId ? '' : 'hidden lg:block'}>
          {open ? (
            <div className="space-y-3">
              <button
                onClick={() => setOpenId(null)}
                className="flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-accent lg:hidden"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 6l-6 6 6 6" />
                </svg>
                All cases
              </button>
              <CaseView
                c={open}
                url={urls.get(open.storagePath) ?? null}
                posterUrl={open.posterPath ? urls.get(open.posterPath) ?? null : null}
                mayEdit={canEditCase(profile.role, profile.id, open)}
                onSaved={(next) => {
                  setCases((all) => all.map((x) => (x.id === next.id ? next : x)))
                  if (next.posterPath && !urls.has(next.posterPath)) void load()
                }}
                onDeleted={(id) => {
                  setCases((all) => all.filter((x) => x.id !== id))
                  setOpenId(null)
                }}
                onError={setMsg}
              />
            </div>
          ) : (
            <Card>
              <p className="px-5 py-8 text-center text-sm text-muted">
                Choose a case from the list to see the image, its description and its legend.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
