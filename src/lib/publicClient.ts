import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// A client with NO session, for the pages invitees and speakers open from an
// email.
//
// Those pages act only through the conf_public_* functions, which resolve a
// person from the token in their link. If the ordinary client were used, a
// portal member who happened to be signed in would send their own JWT, and
// the database would scope the call to THEIR program - so opening an
// invitation from a different program would find nothing. Signed out, the
// token alone decides, which is the whole design.
// ---------------------------------------------------------------------------

const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://joraxuxuzynyrfmtqghp.supabase.co'
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'sb_publishable_-0Fywty7bVfJetjWfDc8dA_M-B1DpNv'

export const publicClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'nmf-public' },
})

export const FUNCTIONS_URL = `${url}/functions/v1`
export const PUBLIC_ANON_KEY = anonKey
