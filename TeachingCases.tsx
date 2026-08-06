import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// These two values are PUBLIC by design (they ship in the browser bundle
// regardless). All security is enforced by Row Level Security policies in
// Postgres. Hard-coding them as fallbacks means the app no longer depends
// on Vercel environment variables being configured correctly.
const FALLBACK_URL = 'https://joraxuxuzynyrfmtqghp.supabase.co'
const FALLBACK_ANON_KEY = 'sb_publishable_-0Fywty7bVfJetjWfDc8dA_M-B1DpNv'

const url = (import.meta.env.VITE_SUPABASE_URL as string) || FALLBACK_URL
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || FALLBACK_ANON_KEY

export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})
