// Keep-alive ping for the "Fellowship Website" Supabase project.
//
// Vercel calls this once a day (see vercel.json). It runs one tiny
// read query against the database, which counts as activity, so the
// free-tier Supabase project never pauses from inactivity.
//
// Both keys below are PUBLIC client keys (the same ones a visitor's
// browser uses). Safe to keep in the repo; the database is protected
// by Row Level Security. The function tries each supported auth
// style in order and uses the first one that works, reporting
// Supabase's exact answer for any that fail.

const SUPABASE_URL = "https://joraxuxuzynyrfmtqghp.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_-0Fywty7bVfJetjWfDc8dA_M-B1DpNv";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvcmF4dXh1enlueXJmbXRxZ2hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTM2MzYsImV4cCI6MjA5Nzc4OTYzNn0.qwPFeRc7U6DsZiiP1Yfj-LczCa-eAATpCnTnKvSjegk";

const ATTEMPTS = [
  {
    name: "anon key, apikey + Authorization",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  },
  {
    name: "publishable key, apikey only",
    headers: { apikey: PUBLISHABLE_KEY },
  },
  {
    name: "anon key, apikey only",
    headers: { apikey: ANON_KEY },
  },
  {
    name: "no key (control)",
    headers: {},
  },
];

export default async function handler(req, res) {
  const results = [];

  for (const attempt of ATTEMPTS) {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/app_settings?select=key&limit=1`,
        { headers: attempt.headers }
      );
      const body = (await response.text()).slice(0, 200);
      results.push({ attempt: attempt.name, status: response.status, body });

      if (response.ok) {
        return res.status(200).json({
          ok: true,
          workedWith: attempt.name,
          supabaseStatus: response.status,
          pingedAt: new Date().toISOString(),
          results,
        });
      }
    } catch (error) {
      results.push({ attempt: attempt.name, error: String(error) });
    }
  }

  res.status(502).json({
    ok: false,
    pingedAt: new Date().toISOString(),
    results,
  });
}
