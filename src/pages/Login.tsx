import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Waveform } from '../components/ui/Waveform'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit() {
    setBusy(true)
    setError(null)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setError(error)
    else navigate('/')
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Hero — the signature trace opens the page */}
      <div className="relative hidden flex-col justify-between bg-ink p-10 text-white md:flex">
        <div>
          <Waveform className="h-8 w-40 text-signal" />
          <p className="mt-2 text-xs uppercase tracking-widest text-signal/80">EMG · Nerve conduction</p>
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight">
            City Wide Neuromuscular Fellowship
          </h1>
          <p className="mt-3 max-w-sm text-sm text-white/70">
            Schedules, case logs, competency tracking, and program resources for fellows,
            supervisors, and directors.
          </p>
        </div>
        <p className="text-xs text-white/40">University of Toronto · Division of Neurology</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use your program account.</p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-ink">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                placeholder="you@hospital.ca"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                placeholder="••••••••"
              />
            </label>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <button
              onClick={onSubmit}
              disabled={busy || !email || !password}
              className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
