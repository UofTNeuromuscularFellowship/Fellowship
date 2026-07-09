// Keep-alive ping for the "Fellowship Website" Supabase project.
//
// Vercel calls this once a day (see vercel.json). It runs one tiny
// read query against the database, which counts as activity, so the
// free-tier Supabase project never pauses from inactivity.
//
// The key below is the project's public ANON key — the same key the
// website itself ships to every visitor's browser. It is safe to keep
// in the repo; the database is protected by Row Level Security.

const SUPABASE_URL = "https://joraxuxuzynyrfmtqghp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvcmF4dXh1enlueXJmbXRxZ2hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTM2MzYsImV4cCI6MjA5Nzc4OTYzNn0.qwPFeRc7U6DsZiiP1Yfj-LczCa-eAATpCnTnKvSjegk";

export default async function handler(req, res) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?select=key&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
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
