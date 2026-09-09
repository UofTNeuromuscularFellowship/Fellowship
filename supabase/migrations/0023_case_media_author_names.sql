-- ---------------------------------------------------------------------------
-- Who uploaded a case.
--
-- Applied live 2026-09-09; this file is the repo's record of it.
--
-- case_media.author_id is a users.id, but public.users is readable only by the
-- owner of the row and by the director (users_self_read, see 0001). A fellow
-- joining users would therefore get their own name and NULL for everybody
-- else, which is worse than showing nothing at all.
--
-- So: a function returning ONLY id and full_name, and only for people who have
-- actually uploaded a case. SECURITY DEFINER because it has to see past the
-- RLS on users, and deliberately the narrowest thing that answers the question
-- — no email, no role, no status, and no row for a member who has never
-- uploaded anything.
--
-- Staff names are not sensitive here; the teaching schedule already shows who
-- is presenting. Nothing about case_media_consent changes — the patient-facing
-- protections there are untouched.
-- ---------------------------------------------------------------------------

create or replace function public.case_media_authors()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.full_name
  from public.users u
  where exists (select 1 from public.case_media m where m.author_id = u.id)
$$;

-- PostgREST exposes functions at /rest/v1/rpc/<name>, so a SECURITY DEFINER
-- function is callable by anyone the grant allows. Signed-in members only.
revoke execute on function public.case_media_authors() from public, anon;
grant execute on function public.case_media_authors() to authenticated;

comment on function public.case_media_authors() is
  'id -> full_name for members who have uploaded a teaching case. SECURITY DEFINER to see past RLS on users; returns no other column.';
