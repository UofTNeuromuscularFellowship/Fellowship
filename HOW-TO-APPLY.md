# How to apply these changes

The **database side is already live** on the Fellowship Website Supabase project
(new columns, the `submit_session_report` / `topic_requests` functions, the
rewritten `enqueue_teaching_reminders`, the `library_documents` table, and the
private `library` storage bucket). Nothing further is needed there.

What is left is the **front-end**, which has to reach GitHub so Vercel rebuilds
the site. I could not push directly — the proxy for this session is not
authorized for `UofTNeuromuscularFellowship/Fellowship`.

## Option A — upload the files through GitHub (no tools needed)

Drop each file into the repo at exactly this path, replacing what is there:

| File in this folder | Goes to |
| --- | --- |
| `src/App.tsx` | `src/App.tsx` |
| `src/components/AppShell.tsx` | `src/components/AppShell.tsx` |
| `src/pages/MyTeaching.tsx` | `src/pages/MyTeaching.tsx` |
| `src/pages/RateTeaching.tsx` | `src/pages/RateTeaching.tsx` |
| `src/pages/Library.tsx` | **new file** |
| `supabase/migrations/0014_session_reports_and_library.sql` | **new file** (record only — already applied) |
| `supabase/migrations/0015_same_day_post_session_emails.sql` | **new file** (record only — already applied) |

Commit to `main`; Vercel deploys automatically.

## Option B — apply the patch with git

```
git checkout -b post-session-loop-and-library
git am post-session-loop-and-library.patch
git push -u origin post-session-loop-and-library
```

## Timing

Post-session emails now go out **the same day at 9:00 AM Toronto time**, which
is the minute an 08:00–09:00 session ends. The pg_cron job runs hourly and the
function checks the local clock, so it stays at 9:00 through daylight saving
rather than slipping to 8:00 each winter.

Waveform Rounds on Aug 20 finished before this change went in, so its emails go
out at the **Aug 21, 9:00 AM** run instead. Everything from Aug 27 onward is
same-day. If the front-end has not deployed by then, the emails still send but
the "Complete session report" form will not be on the page yet.

## Before uploading library PDFs

Only add material the program is licensed to distribute — publisher-provided
copies, open-access texts, institutional subscriptions that permit it, or
documents the fellowship owns. Files sit behind portal login with no public
URL, but that is an access control, not a licence. The U of T libraries can
confirm what any given title allows.
