import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../types/database'

export interface Provider { id: string; full_name: string }

// For assistant accounts: fetch the providers they're linked to and remember
// which one they're currently acting for (persisted across pages/reloads).
// For every other role the "effective provider" is simply the user themselves.
export function useActingProvider(role: UserRole | undefined, selfId: string | undefined) {
  const isAssistant = role === 'assistant'
  const [providers, setProviders] = useState<Provider[]>([])
  const [providerId, setProviderIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(isAssistant)

  useEffect(() => {
    if (!isAssistant) { setLoading(false); return }
    let cancelled = false
    supabase.rpc('my_providers').then(({ data }) => {
      if (cancelled) return
      const list = (data as Provider[]) ?? []
      setProviders(list)
      const saved = localStorage.getItem('acting_provider')
      const initial = list.find((p) => p.id === saved)?.id ?? list[0]?.id ?? null
      setProviderIdState(initial)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [isAssistant])

  function setProviderId(id: string) {
    setProviderIdState(id)
    localStorage.setItem('acting_provider', id)
  }

  const effectiveId = isAssistant ? providerId : (selfId ?? null)
  return { isAssistant, providers, providerId, setProviderId, effectiveId, loading }
}

export function ActingForBar({ providers, providerId, onChange }: {
  providers: Provider[]; providerId: string | null; onChange: (id: string) => void
}) {
  if (providers.length === 0) {
    return (
      <div className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-ink">
        You aren't linked to any provider yet. Ask the fellowship director (or the provider) to add you as their
        administrative assistant, then you'll be able to manage their schedule here.
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent bg-accent-soft px-4 py-2.5 text-sm">
      <span className="font-medium text-ink">Managing schedule for</span>
      {providers.length === 1 ? (
        <span className="font-semibold text-accent">{providers[0].full_name}</span>
      ) : (
        <select value={providerId ?? ''} onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink">
          {providers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      )}
      <span className="text-xs text-muted">— changes you make are on their behalf.</span>
    </div>
  )
}
