# City Wide Neuromuscular Fellowship Portal

Internal portal for the University of Toronto Division of Neurology City Wide
Neuromuscular Fellowship. Schedules, EMG/NCS case logging, competency tracking,
and program resources for fellows, supervisors, directors, and admins.

**Stack:** Vite + React + TypeScript + Tailwind, Supabase (Postgres + Auth + RLS),
deployed on Vercel.

---

## What's in this Phase 1 build

- Full database schema with row-level security (`supabase/migrations/0001_initial_schema.sql`)
  - Four roles: fellow / supervisor / director / admin
  - **Admin is walled off from clinical case content at the database level**
  - Competency targets: cohort default + per-fellow override
  - Teaching + clinic trades require director/admin approval
- Seed data from the program PDFs (`supabase/seed.sql`)
  - 2026–27 teaching grid (51 Thursday sessions incl. breaks)
  - July–August 2026 clinic rotations for both fellows
- React app shell with role-aware navigation and Supabase email/password auth
- Working, data-driven **Teaching schedule** and **Clinic rotations** pages
- Stubs for Cases, Competency, and Handbook (Phase 2+)

---

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

### Environment variables

This app uses **Vite**, which only exposes vars prefixed with `VITE_`:

| Variable | Where to get it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon/publishable) |
| `VITE_PORTAL_URL` | Your deployed URL |

> **Migrating from the earlier CRA plan:** the Vercel env vars previously set as
> `REACT_APP_*` are not read by Vite. Re-add them with the `VITE_` prefix
> (Vercel → Settings → Environment Variables).

> **Security:** the Supabase `service_role` secret must never appear in this repo,
> in any `VITE_` var, or in frontend code. It belongs only in Supabase Edge Function
> secrets. If it was ever pasted into a shared/committed location, rotate it in the
> Supabase dashboard.

---

## Database setup

In the Supabase dashboard → SQL Editor, run in order:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/seed.sql`

A trigger auto-creates a profile row (defaulting to the `fellow` role) whenever a
new auth user signs up. Promote directors/admins by editing `users.role`.

### Create your first director

```sql
-- after the user has signed up once via the login screen
update users set role = 'director' where email = 'aaron.izenberg@sunnybrook.ca';
```

---

## Deploy (Vercel)

The repo includes `vercel.json` (SPA rewrite). Push to `main`; Vercel auto-builds
with `npm run build`. Set the three `VITE_` env vars in the Vercel project first.

---

## Notes / open items carried from planning

- **Clinic site codes** (`AI SHSC`, `CK SMH`, `CTB TGH`, `SMA - SHSC`, `SICK KIDS`,
  `PROTECTED`) are stored exactly as written on the program calendar. Their expansion
  to physician + site is intentionally left for a director to configure under site
  settings — not guessed here.
- **Competency target values** are not seeded. A director sets procedural and
  disease-specific minimums per cohort before the Competency page populates.
- **Handbook content** is a placeholder; import from the program handbook
  (neuromuscularto.ca) in Phase 5.
- Any program facts not yet confirmed (exact application dates, stipend, etc.)
  should be confirmed with the fellowship director rather than filled in.

## Roadmap

- **Phase 2** — Case logging + competency dashboard
- **Phase 3** — Teaching session detail, materials, manual Zoom links
- **Phase 4** — Attendance + clinic trades + away dates
- **Phase 5** — Handbook with versioning
- **Phase 6** — Weekly PubMed digest (Edge Function + cron)
- **Phase 7** — Polish, full data import, launch
