// Keep-alive ping for the "Fellowship Website" Supabase project.
//
// Vercel calls this once a day (see vercel.json). It runs one tiny
// read query against the database, which counts as activity, so the
// free-tier Supabase project never pauses from inactivity.
//
// The key below is the project's PUBLISHABLE key. It is safe to keep
// in the repo — it's the same public key a visitor's browser would
// use, and the database is protected by Row Level Security.

const SUPABASE_URL = "https://joraxuxuzynyrfmtqghp.supabase.co";
const SUPABASE_KEY = "sb_publishable_-0Fywty7bVfJetjWfDc8dA_M-B1DpNv";

module.exports = async (req, res) => {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?select=*&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
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
};
