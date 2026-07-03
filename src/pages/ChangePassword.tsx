import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Waveform } from '../components/ui/Waveform'

export default function ChangePassword() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    setError(null)
    if (pw1.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (pw1 !== pw2) { setError('Passwords do not match.'); return }
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password: pw1 })
    if (err) { setBusy(false); setError(err.message); return }
    await supabase.rpc('clear_must_change_password')
    await refreshProfile()
    setBusy(false)
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <Waveform className="mx-auto h-6 w-32 text-accent" />
          <h1 className="mt-4 font-display text-xl font-bold text-ink">Set a new password</h1>
          <p className="mt-1 text-sm text-muted">
            {profile?.must_change_password
              ? 'Your account was created with a temporary password. Choose your own to continue.'
              : 'Update your account password.'}
          </p>
        </div>

        <div className="mt-8 rounded-lg border border-line bg-surface p-6">
          {error && (
            <div className="mb-4 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink">
              {error}
            </div>
          )}
          <label className="mb-1 block text-xs font-medium text-muted">New password</label>
          <input
            type="password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            autoComplete="new-password"
            className="mb-4 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
          <label className="mb-1 block text-xs font-medium text-muted">Confirm new password</label>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            className="mb-6 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
          <button
            onClick={handleSubmit}
            disabled={busy || !pw1 || !pw2}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </div>
      </div>
    </div>
  )
}
