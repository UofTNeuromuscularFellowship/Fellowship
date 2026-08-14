import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Waveform } from '../components/ui/Waveform'

// Reset links arrive as /change-password?token_hash=...&type=recovery and are
// exchanged for a session here, in the browser. They deliberately do NOT point
// at Supabase's /verify endpoint: hospital mail systems pre-open every link in
// an incoming message to scan it, which consumes a one-time token before the
// recipient ever clicks. A scanner fetching this page gets HTML and no more —
// the token is only spent once this code runs.
type Phase = 'ready' | 'verifying' | 'expired'

export default function ChangePassword() {
  const { session, profile, loading, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Read once and hold it: the token is stripped from the URL after a
  // successful exchange, and re-reading would make it vanish mid-flow.
  const [tokenHash] = useState(() => new URLSearchParams(window.location.search).get('token_hash'))
  const [phase, setPhase] = useState<Phase>(tokenHash ? 'verifying' : 'ready')
  const [resent, setResent] = useState(false)

  useEffect(() => {
    if (!tokenHash) return
    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      .then(({ error: err }: { error: { message: string } | null }) => {
        if (err) { setPhase('expired'); return }
        // Drop the token from the address bar so it isn't left in history.
        window.history.replaceState({}, '', '/change-password')
        setPhase('ready')
      })
  }, [tokenHash])

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

  // This route is deliberately outside ProtectedRoute so a reset link can reach
  // it without a session. Anyone else still needs one.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    )
  }
  if (!session && !tokenHash && phase !== 'expired') return <Navigate to="/login" replace />

  async function requestFresh() {
    const email = window.prompt('Enter your email address and we will send a new reset link.')
    if (!email) return
    await supabase.functions.invoke('forgot-password', { body: { email } })
    setResent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <Waveform className="mx-auto h-6 w-32 text-accent" />
          <h1 className="mt-4 font-display text-xl font-bold text-ink">
            {phase === 'expired' ? 'This link has expired' : 'Set a new password'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {phase === 'verifying'
              ? 'Checking your reset link…'
              : phase === 'expired'
              ? 'Reset links can only be used once, and they expire after a while.'
              : profile?.must_change_password
              ? 'Your account was created with a temporary password. Choose your own to continue.'
              : 'Update your account password.'}
          </p>
        </div>

        {phase === 'expired' ? (
          <div className="mt-8 rounded-lg border border-line bg-surface p-6 text-center">
            {resent ? (
              <p className="text-sm text-ink">
                If that address has an account, a new link is on its way. It is good for one use.
              </p>
            ) : (
              <>
                <button
                  onClick={requestFresh}
                  className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                  Send me a new link
                </button>
                <button
                  onClick={() => navigate('/login')}
                  className="mt-3 text-sm font-medium text-accent hover:underline">
                  Back to sign in
                </button>
              </>
            )}
          </div>
        ) : phase === 'verifying' ? (
          <div className="mt-8 rounded-lg border border-line bg-surface p-6 text-center text-sm text-muted">
            One moment…
          </div>
        ) : (
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
        )}
      </div>
    </div>
  )
}
