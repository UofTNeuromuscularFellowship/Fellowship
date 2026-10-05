-- ---------------------------------------------------------------------------
-- 0051 — case rounds
--
-- A rounds series can be set up as case rounds. Each session of a case-rounds
-- series then carries a list of the cases discussed — several per session —
-- each with who presented it, the disease state, and the key learning point,
-- so the organizer has a running record of what the rounds have covered.
--
-- Only the people who run rounds see or edit the cases. Nothing here is sent
-- to invitees.
-- ---------------------------------------------------------------------------

alter table public.rounds_series
  add column if not exists kind text not null default 'standard';
alter table public.rounds_series drop constraint if exists rounds_series_kind_check;
alter table public.rounds_series
  add constraint rounds_series_kind_check check (kind in ('standard', 'case'));

create table if not exists public.rounds_cases (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  session_id     uuid not null references public.rounds_sessions(id) on delete cascade,
  position       integer not null default 0,
  presenter      text,
  disease_state  text,
  learning_point text,
  created_by     uuid references public.users(id) on delete set null default public.current_uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint rounds_cases_not_empty check (
    coalesce(trim(presenter), '') <> '' or coalesce(trim(disease_state), '') <> '' or coalesce(trim(learning_point), '') <> '')
);
create index if not exists rounds_cases_session on public.rounds_cases (session_id, position);

alter table public.rounds_cases enable row level security;
drop policy if exists rounds_cases_site_isolation on public.rounds_cases;
create policy rounds_cases_site_isolation on public.rounds_cases as restrictive for all
  using ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
  with check ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)));
drop policy if exists rounds_cases_app_definer_all on public.rounds_cases;
create policy rounds_cases_app_definer_all on public.rounds_cases for all to app_definer using (true) with check (true);
drop policy if exists rounds_cases_manage on public.rounds_cases;
create policy rounds_cases_manage on public.rounds_cases for all to authenticated
  using (public.can_manage_rounds()) with check (public.can_manage_rounds());
revoke all on public.rounds_cases from anon;
grant all on public.rounds_cases to service_role, app_definer;
grant select, insert, update, delete on public.rounds_cases to authenticated;
