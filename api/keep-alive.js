// Keep-alive ping for the "Fellowship Website" Supabase project.
//
// Vercel calls this once a day (see vercel.json). It runs one tiny
// read query against the database, which counts as activity, so the
// free-tier Supabase project never pauses from inactivity.
//
// The key below is the project's PUBLISHABLE key — the same public
// key the website ships to every visitor's browser. Safe to keep in
// the repo; the database is protected by Row Level Security.
//
// Note: per Supabase docs, sb_publishable_ keys go in the "apikey"
// header ONLY — never in "Authorization: Bearer".

const SUPABASE_URL = "https://joraxuxuzynyrfmtqghp.supabase.co";
const SUPABASE_KEY = "sb_publishable_-0Fywty7bVfJetjWfDc8dA_M-B1DpNv";

export default async function handler(req, res) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?select=key&limit=1`,
      { headers: { apikey: SUPABASE_KEY } }
    );

    res.status(response.ok ? 200 : 502).json({
      ok: response.ok,
      supabaseStatus: response.status,
      pingedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
}
