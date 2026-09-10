import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: 'fellow' | 'supervisor' | 'director' | 'admin' | 'assistant'
  status: string
  cohort_year: string | null
  must_change_password: boolean
  teaching_only: boolean
  active_site_id: string | null
}

/** A program the signed-in person belongs to, with the role they hold there. */
export interface SiteMembership {
  id: string
  slug: string
  name: string
  short_name: string | null
  role: Profile['role']
  status: string
  is_active: boolean
}

export interface Site {
  id: string
  slug: string
  name: string
  short_name: string | null
  institution: string | null
}

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  /** The program currently open. Null for a platform admin who belongs to none. */
  site: Site | null
  /** Every program this login belongs to. Length > 1 is what makes "Switch program" appear. */
  sites: SiteMembership[]
  /** EMG Toolkit items switched on for the current program. */
  tools: Set<string>
  isPlatformAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  switchSite: (siteId: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  site: null,
  sites: [],
  tools: new Set(),
  isPlatformAdmin: false,
  loading: true,
  signIn: async () => ({ error: 'not ready' }),
  signOut: async () => {},
  refreshProfile: async () => {},
  switchSite: async () => ({ error: 'not ready' }),
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [site, setSite] = useState<Site | null>(null)
  const [sites, setSites] = useState<SiteMembership[]>([])
  const [tools, setTools] = useState<Set<string>>(new Set())
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  // Everything about "who am I, where am I" in one pass. Order matters:
  // memberships first, because someone whose only membership is not yet the
  // active one (a new second-site login, a membership removed elsewhere) is
  // pointed at it here — silently, with no picker, when there is exactly one.
  const loadProfile = useCallback(async (userId: string) => {
    const [{ data: mine }, { data: pa }] = await Promise.all([
      supabase.rpc('my_sites'),
      supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ])
    let memberships = ((mine as SiteMembership[] | null) ?? []).filter((m) => m.status === 'active')
    if (memberships.length === 1 && !memberships[0].is_active) {
      await supabase.rpc('set_active_site', { p_site: memberships[0].id })
      memberships = memberships.map((m) => ({ ...m, is_active: true }))
    }
    setSites(memberships)
    setIsPlatformAdmin(!!pa)

    const { data } = await supabase
      .from('users')
      .select('id, email, full_name, role, status, cohort_year, must_change_password, teaching_only, active_site_id')
      .eq('id', userId)
      .single()
    const p = (data as Profile) ?? null
    setProfile(p)

    if (p?.active_site_id) {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from('sites').select('id, slug, name, short_name, institution').eq('id', p.active_site_id).maybeSingle(),
        supabase.from('site_tools').select('tool_key, enabled').eq('site_id', p.active_site_id),
      ])
      setSite((s as Site) ?? null)
      setTools(new Set(((t as { tool_key: string; enabled: boolean }[] | null) ?? []).filter((r) => r.enabled).map((r) => r.tool_key)))
    } else {
      setSite(null)
      setTools(new Set())
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user) loadProfile(s.user.id)
      else { setProfile(null); setSite(null); setSites([]); setTools(new Set()); setIsPlatformAdmin(false) }
      // Arriving via a password-reset email link: take them straight to
      // the change-password screen, wherever the link landed.
      if (_event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/change-password') {
        window.location.assign('/change-password')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null); setSite(null); setSites([]); setTools(new Set()); setIsPlatformAdmin(false)
  }

  async function refreshProfile() {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) await loadProfile(data.session.user.id)
  }

  // Switching programs changes role, data and toolkit all at once, so the
  // simplest correct thing is a full reload from the dashboard.
  async function switchSite(siteId: string) {
    const { error } = await supabase.rpc('set_active_site', { p_site: siteId })
    if (error) return { error: error.message }
    window.location.assign('/dashboard')
    return { error: null }
  }

  return (
    <AuthContext.Provider value={{ session, profile, site, sites, tools, isPlatformAdmin, loading, signIn, signOut, refreshProfile, switchSite }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
