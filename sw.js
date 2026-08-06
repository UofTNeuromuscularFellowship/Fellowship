// Keep-alive ping for the "Fellowship Website" Supabase project.
//
// Vercel calls this once a day (see vercel.json). It reads one row
// from the dedicated public.keep_alive table — a tiny table created
// just for this, containing a single dummy row. That read counts as
// database activity, so the free-tier project never pauses.
//
// The key below is the project's PUBLISHABLE key — the same public
// key the website ships to every visitor's browser. Safe to keep in
// the repo. Per Supabase docs it goes in the "apikey" header only.

const SUPABASE_URL = "https://joraxuxuzynyrfmtqghp.supabase.co";
const SUPABASE_KEY = "sb_publishable_-0Fywty7bVfJetjWfDc8dA_M-B1DpNv";

export default async function handler(req, res) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/keep_alive?select=id&limit=1`,
      { headers: { apikey: SUPABASE_KEY } }
    );
    const body = (await response.text()).slice(0, 200);

    res.status(response.ok ? 200 : 502).json({
      ok: response.ok,
      supabaseStatus: response.status,
      body,
      pingedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
}
