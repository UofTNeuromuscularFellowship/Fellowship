import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ---------------------------------------------------------------------------
// Choose the logo printed on a conference's or a rounds series' materials:
// its emails, public pages, badges, letters and certificates.
//
// Logos go in the public 'branding' bucket under the program's id (the
// storage policy refuses any other folder). Logos already used on another
// event or series are offered again, so a program uploads its logo once.
// ---------------------------------------------------------------------------

const BUCKET = 'branding'
const MAX_BYTES = 2 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function LogoPicker({ value, onChange, label = 'Logo', help }: {
  value: string | null
  onChange: (url: string | null) => void
  label?: string
  help?: string
}) {
  const { site } = useAuth()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [used, setUsed] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)

  // Logos already in use in this program, newest first, to pick again.
  useEffect(() => {
    ;(async () => {
      const [ev, rs] = await Promise.all([
        supabase.from('conf_events').select('logo_url, created_at').not('logo_url', 'is', null).order('created_at', { ascending: false }).limit(20),
        supabase.from('rounds_series').select('logo_url, created_at').not('logo_url', 'is', null).order('created_at', { ascending: false }).limit(20),
      ])
      const urls = [...((ev.data as { logo_url: string }[]) ?? []), ...((rs.data as { logo_url: string }[]) ?? [])].map((r) => r.logo_url)
      setUsed(Array.from(new Set(urls)).slice(0, 8))
    })()
  }, [])

  async function upload(file: File) {
    setErr(null)
    if (!TYPES.includes(file.type)) { setErr('Use a PNG, JPEG or WebP image.'); return }
    if (file.size > MAX_BYTES) { setErr('That image is over 2 MB. A logo this size is plenty at 600 pixels wide.'); return }
    if (!site?.id) { setErr('No program is selected.'); return }
    setBusy(true)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${site.id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    setBusy(false)
    if (error) { setErr('The logo couldn’t be uploaded. ' + error.message); return }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
    onChange(data.publicUrl)
    setUsed((u) => [data.publicUrl, ...u.filter((x) => x !== data.publicUrl)].slice(0, 8))
  }

  const others = used.filter((u) => u !== value)
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border border-dashed border-line bg-white p-2">
          {value
            ? <img src={value} alt="Current logo" className="max-h-full max-w-full object-contain" />
            : <span className="text-xs text-muted">No logo</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:border-accent disabled:opacity-50">
            {busy ? 'Uploading…' : value ? 'Replace' : 'Upload a logo'}
          </button>
          {value && (
            <button type="button" disabled={busy} onClick={() => onChange(null)}
              className="px-2 py-2 text-sm font-medium text-muted hover:text-ink">Remove</button>
          )}
        </div>
        <input ref={input} type="file" accept={TYPES.join(',')} className="hidden" aria-label="Logo file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
      </div>
      {others.length > 0 && (
        <div className="mt-3">
          <span className="block text-xs text-muted">Or use one you’ve used before:</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {others.map((u) => (
              <button key={u} type="button" onClick={() => onChange(u)} title="Use this logo"
                className="flex h-10 w-24 items-center justify-center rounded border border-line bg-white p-1 hover:border-accent">
                <img src={u} alt="" className="max-h-full max-w-full object-contain" />
              </button>
            ))}
          </div>
        </div>
      )}
      <span className="mt-1 block text-xs text-muted">
        {help ?? 'PNG, JPEG or WebP, up to 2 MB. A wide logo on a white or transparent background works best.'}
      </span>
      {err && <span role="alert" className="mt-1 block text-xs font-medium text-rose-700 dark:text-rose-300">{err}</span>}
    </div>
  )
}

/** The logo at the top of a printed page or public page. */
export function LogoMark({ url, className = 'max-h-14 max-w-[220px]' }: { url?: string | null; className?: string }) {
  if (!url) return null
  return <img src={url} alt="" className={`block object-contain ${className}`} />
}
