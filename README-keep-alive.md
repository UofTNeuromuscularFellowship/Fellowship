# Supabase keep-alive — where these files go

Add both files to your website's GitHub repo, keeping the folder structure exactly as it is in this zip:

```
your-repo/
├── index.html          (your existing site — unchanged)
├── vercel.json         ← add at the ROOT of the repo
└── api/
    └── keep-alive.js   ← add inside a folder named "api"
```

Two notes:

- If your repo **already has a `vercel.json`**, don't replace it — just add the `"crons"` section from this one into your existing file.
- Don't rename the `api` folder or the file; the path in `vercel.json` (`/api/keep-alive`) has to match.

## What happens after you push

1. Push (or upload) the files to GitHub on your main branch.
2. If the repo isn't connected to Vercel yet: go to vercel.com → **Add New → Project** → import your GitHub repo → Deploy. This is a one-time step.
3. Once there's a production deployment, Vercel runs `/api/keep-alive` **once a day at 12:00 UTC** (8:00 AM Toronto). Each run does one tiny read query against the Supabase database, which counts as activity, so the free-tier project never hits the 7-day inactivity pause.

## How to check it's working

- Visit `https://YOUR-SITE.vercel.app/api/keep-alive` in a browser. You should see something like `{"ok":true,"supabaseStatus":200,...}`.
- In the Vercel dashboard, the cron appears under your project → **Settings → Cron Jobs**, with a log of past runs.

## Security note

The key inside `keep-alive.js` is the Supabase **publishable** key — the same public key any visitor's browser uses. It's safe to have in the repo. It is *not* the secret/service key, and the database is protected by Row Level Security.
