import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Waveform } from '../components/ui/Waveform'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit() {
    setError(null)
    setBusy(true)
    const { error: err } = await signIn(email.trim(), password)
    if (err) {
      setBusy(false)
      setError(err)
      return
    }
    // Route based on the forced-password-change flag
    const { data: sess } = await supabase.auth.getSession()
    let mustChange = false
    if (sess.session?.user) {
      const { data: row } = await supabase
        .from('users')
        .select('must_change_password')
        .eq('id', sess.session.user.id)
        .single()
      mustChange = Boolean(row?.must_change_password)
    }
    setBusy(false)
    navigate(mustChange ? '/change-password' : '/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <Waveform className="mx-auto h-6 w-32 text-accent" />
          <h1 className="mt-4 font-display text-xl font-bold text-ink">Fellowship Portal</h1>
          <p className="mt-1 text-sm text-muted">City Wide Neuromuscular Fellowship</p>
        </div>

        <div className="mt-8 rounded-lg border border-line bg-surface p-6">
          {error && (
            <div className="mb-4 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink">
              {error}
            </div>
          )}
          <label className="mb-1 block text-xs font-medium text-muted">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mb-4 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
          <label className="mb-1 block text-xs font-medium text-muted">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            className="mb-6 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
          <button
            onClick={handleSubmit}
            disabled={busy || !email || !password}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          <Link to="/" className="text-accent hover:underline">← Back to program page</Link>
        </p>
      </div>
    </div>
  )
}
