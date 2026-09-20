-- ---------------------------------------------------------------------------
-- 0028 — tenant hardening
--
-- Three things the multi-site migration left behind, all of which only bite
-- once a second programme exists, plus the consent attestation for teaching
-- cases.
--
--   1. neuro_test_directory had no site_id at all. Every row was visible to
--      every programme, a test one programme added in the portal would have
--      appeared in the other's directory, and its single hidden_at/hidden_by/
--      hidden_reason columns meant one programme's curation decisions hid rows
--      for everybody. Worse, neuro_test_directory_manage granted ALL to anyone
--      passing is_director_or_admin() with no site test, so the director of
--      programme B could edit or delete programme A's locally added tests and
--      the shared national rows alike.
--
--      The table is split: rows keep their own site_id (null = shared national
--      mirror), hiding moves to a per-site table, and the name
--      neuro_test_directory becomes a view so the portal keeps working
--      unchanged while reading and writing only its own programme's view of
--      the directory.
--
--   2. list_sites() was executable by anon, so the roster of subscribing
--      programmes could be read from the public internet without signing in.
--
--   3. teaching_cases had no record that the patient agreed to their case
--      being used for teaching, and nothing in the database stopped a fellow
--      creating one — the restriction existed only in the router.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Per-site ownership of directory rows
-- ===========================================================================

alter table public.neuro_test_directory
  add column if not exists site_id uuid references public.sites(id) on delete cascade;

comment on column public.neuro_test_directory.site_id is
  'Null = shared national mirror, visible to every programme. Non-null = a test this programme added itself.';

-- Every row today is origin='mirror', i.e. shared, so site_id stays null.

-- ===========================================================================
-- 2. Hiding becomes a per-programme decision
-- ===========================================================================

create table if not exists public.neuro_test_hidden (
  site_id       uuid not null references public.sites(id) on delete cascade,
  test_id       text not null,
  hidden_at     timestamptz not null default now(),
  hidden_by     uuid references public.users(id) on delete set null,
  hidden_reason text,
  primary key (site_id, test_id)
);

comment on table public.neuro_test_hidden is
  'One programme taking a test out of its own directory. Never affects another programme.';

-- The 17 tests Toronto had hidden become Toronto''s hides, not everyone''s.
insert into public.neuro_test_hidden (site_id, test_id, hidden_at, hidden_by, hidden_reason)
select '00000000-0000-4000-8000-000000000001'::uuid, id, coalesce(hidden_at, now()), hidden_by, hidden_reason
from public.neuro_test_directory
where hidden_at is not null
on conflict (site_id, test_id) do nothing;

alter table public.neuro_test_directory
  drop column hidden_at,
  drop column hidden_by,
  drop column hidden_reason;

alter table public.neuro_test_hidden enable row level security;

create policy neuro_test_hidden_app_definer_all on public.neuro_test_hidden
  to app_definer using (true) with check (true);

create policy neuro_test_hidden_read on public.neuro_test_hidden
  for select using (
    public.current_uid() is not null
    and site_id = (select public.current_site_id())
  );

create policy neuro_test_hidden_manage on public.neuro_test_hidden
  for all to authenticated
  using (site_id = (select public.current_site_id()) and public.is_director_or_admin())
  with check (site_id = (select public.current_site_id()) and public.is_director_or_admin());

grant select, insert, update, delete on public.neuro_test_hidden to authenticated;
grant all on public.neuro_test_hidden to service_role;

-- ===========================================================================
-- 3. The table becomes the base; the old name becomes a per-site view
-- ===========================================================================

alter table public.neuro_test_directory rename to neuro_test_directory_rows;

-- Replace the blanket "any director may do anything" policy.
drop policy if exists neuro_test_directory_manage        on public.neuro_test_directory_rows;
drop policy if exists neuro_test_directory_read          on public.neuro_test_directory_rows;
drop policy if exists neuro_test_directory_local_insert  on public.neuro_test_directory_rows;
drop policy if exists neuro_test_directory_local_update  on public.neuro_test_directory_rows;
drop policy if exists neuro_test_directory_local_delete  on public.neuro_test_directory_rows;

-- Shared rows, plus this programme's own additions. Nothing else.
create policy ntd_read on public.neuro_test_directory_rows
  for select using (
    public.current_uid() is not null
    and (site_id is null or site_id = (select public.current_site_id()))
  );

-- The shared national mirror is platform content: a site director must not be
-- able to rewrite what every other programme sees.
create policy ntd_shared_manage on public.neuro_test_directory_rows
  for all to authenticated
  using (site_id is null and public.is_platform_admin())
  with check (site_id is null and public.is_platform_admin());

create policy ntd_local_insert on public.neuro_test_directory_rows
  for insert to authenticated
  with check (
    origin = 'local'
    and site_id = (select public.current_site_id())
    and added_by = public.current_uid()
    and public.current_app_role() = any (array['supervisor','director','admin']::user_role[])
  );

create policy ntd_local_update on public.neuro_test_directory_rows
  for update to authenticated
  using (
    origin = 'local' and site_id = (select public.current_site_id())
    and (added_by = public.current_uid() or public.is_director_or_admin())
  )
  with check (origin = 'local' and site_id = (select public.current_site_id()));

create policy ntd_local_delete on public.neuro_test_directory_rows
  for delete to authenticated
  using (
    origin = 'local' and site_id = (select public.current_site_id())
    and (added_by = public.current_uid() or public.is_director_or_admin())
  );

create view public.neuro_test_directory with (security_invoker = true) as
select r.id, r.primary_section, r.subsection, r.test_name, r.conditions,
       r.genes_or_antibodies, r.test_type, r.lab_name, r.lab_city_province,
       r.age_group, r.ontario_vs_out_of_province, r.funding_or_cost,
       r.requisition_pdf_url, r.lab_page_url, r.notes, r.sort_order,
       r.synced_at, r.modality, r.origin, r.added_by, r.added_at,
       r.requisition_path, r.site_id,
       h.hidden_at, h.hidden_by, h.hidden_reason
from public.neuro_test_directory_rows r
left join public.neuro_test_hidden h
  on h.test_id = r.id and h.site_id = (select public.current_site_id())
where r.site_id is null or r.site_id = (select public.current_site_id());

comment on view public.neuro_test_directory is
  'The directory as one programme sees it: shared national tests plus its own, with its own hides applied.';

grant select, insert, update, delete on public.neuro_test_directory to authenticated;
grant all on public.neuro_test_directory to service_role;

-- ---------------------------------------------------------------------------
-- Writes through the view. These are SECURITY INVOKER on purpose: the policies
-- above are the access control, and a definer function here would bypass every
-- one of them.
-- ---------------------------------------------------------------------------

create or replace function public.neuro_test_directory_ins() returns trigger
language plpgsql as $$
begin
  insert into public.neuro_test_directory_rows (
    id, primary_section, subsection, test_name, conditions, genes_or_antibodies,
    test_type, lab_name, lab_city_province, age_group, ontario_vs_out_of_province,
    funding_or_cost, requisition_pdf_url, lab_page_url, notes, sort_order,
    synced_at, origin, added_by, added_at, requisition_path, site_id
  ) values (
    new.id, new.primary_section, new.subsection, new.test_name,
    coalesce(new.conditions, '{}'), coalesce(new.genes_or_antibodies, '{}'),
    new.test_type, new.lab_name, new.lab_city_province, new.age_group,
    new.ontario_vs_out_of_province, new.funding_or_cost, new.requisition_pdf_url,
    new.lab_page_url, new.notes, coalesce(new.sort_order, 0),
    coalesce(new.synced_at, now()), coalesce(new.origin, 'local'),
    coalesce(new.added_by, public.current_uid()), coalesce(new.added_at, now()),
    new.requisition_path,
    -- A test added in the portal belongs to the programme that added it. The
    -- caller does not get to choose, so a crafted request cannot plant a row
    -- in another programme's directory.
    (select public.current_site_id())
  );
  return new;
end $$;

create or replace function public.neuro_test_directory_upd() returns trigger
language plpgsql as $$
declare
  v_site uuid := (select public.current_site_id());
  v_base_changed boolean;
begin
  if v_site is null then
    raise exception 'no active programme for this session';
  end if;

  -- Hiding is per programme and never touches the row itself.
  if new.hidden_at is distinct from old.hidden_at
     or new.hidden_reason is distinct from old.hidden_reason then
    if new.hidden_at is null then
      delete from public.neuro_test_hidden where site_id = v_site and test_id = old.id;
    else
      insert into public.neuro_test_hidden (site_id, test_id, hidden_at, hidden_by, hidden_reason)
      values (v_site, old.id, new.hidden_at,
              coalesce(new.hidden_by, public.current_uid()), new.hidden_reason)
      on conflict (site_id, test_id) do update
        set hidden_at     = excluded.hidden_at,
            hidden_by     = excluded.hidden_by,
            hidden_reason = excluded.hidden_reason;
    end if;
  end if;

  -- Only touch the underlying row if the edit actually changed it. Without
  -- this, hiding a shared national test would attempt to update a row the
  -- policies (correctly) refuse, and the hide would fail.
  v_base_changed :=
       new.primary_section            is distinct from old.primary_section
    or new.subsection                 is distinct from old.subsection
    or new.test_name                  is distinct from old.test_name
    or new.conditions                 is distinct from old.conditions
    or new.genes_or_antibodies        is distinct from old.genes_or_antibodies
    or new.test_type                  is distinct from old.test_type
    or new.lab_name                   is distinct from old.lab_name
    or new.lab_city_province          is distinct from old.lab_city_province
    or new.age_group                  is distinct from old.age_group
    or new.ontario_vs_out_of_province is distinct from old.ontario_vs_out_of_province
    or new.funding_or_cost            is distinct from old.funding_or_cost
    or new.requisition_pdf_url        is distinct from old.requisition_pdf_url
    or new.lab_page_url               is distinct from old.lab_page_url
    or new.notes                      is distinct from old.notes
    or new.sort_order                 is distinct from old.sort_order
    or new.requisition_path           is distinct from old.requisition_path;

  if v_base_changed then
    update public.neuro_test_directory_rows set
      primary_section            = new.primary_section,
      subsection                 = new.subsection,
      test_name                  = new.test_name,
      conditions                 = coalesce(new.conditions, '{}'),
      genes_or_antibodies        = coalesce(new.genes_or_antibodies, '{}'),
      test_type                  = new.test_type,
      lab_name                   = new.lab_name,
      lab_city_province          = new.lab_city_province,
      age_group                  = new.age_group,
      ontario_vs_out_of_province = new.ontario_vs_out_of_province,
      funding_or_cost            = new.funding_or_cost,
      requisition_pdf_url        = new.requisition_pdf_url,
      lab_page_url               = new.lab_page_url,
      notes                      = new.notes,
      sort_order                 = coalesce(new.sort_order, 0),
      requisition_path           = new.requisition_path
    where id = old.id;
  end if;

  return new;
end $$;

create or replace function public.neuro_test_directory_del() returns trigger
language plpgsql as $$
begin
  delete from public.neuro_test_directory_rows where id = old.id;
  return old;
end $$;

create trigger neuro_test_directory_ins instead of insert on public.neuro_test_directory
  for each row execute function public.neuro_test_directory_ins();
create trigger neuro_test_directory_upd instead of update on public.neuro_test_directory
  for each row execute function public.neuro_test_directory_upd();
create trigger neuro_test_directory_del instead of delete on public.neuro_test_directory
  for each row execute function public.neuro_test_directory_del();

-- ===========================================================================
-- 4. Stop anon enumerating the tenant list
-- ===========================================================================

revoke execute on function public.list_sites() from anon;

-- ===========================================================================
-- 5. Verbal consent attestation for teaching cases
-- ===========================================================================

alter table public.teaching_cases
  add column if not exists consent_attested_at timestamptz,
  add column if not exists consent_attested_by uuid references public.users(id) on delete set null,
  add column if not exists consent_wording text;

comment on column public.teaching_cases.consent_wording is
  'The exact text attested to, stored with the case so that changing the default later cannot alter what was agreed.';

-- Teaching cases are a supervisor and director logbook. Until now that was
-- enforced only by the router, so any signed-in fellow could have created one
-- through the API.
drop policy if exists teaching_cases_self on public.teaching_cases;

create policy teaching_cases_own_read on public.teaching_cases
  for select using (provider_id = public.current_uid());

create policy teaching_cases_own_insert on public.teaching_cases
  for insert to authenticated
  with check (
    provider_id = public.current_uid()
    and public.current_app_role() = any (array['supervisor','director','admin']::user_role[])
  );

create policy teaching_cases_own_update on public.teaching_cases
  for update to authenticated
  using (provider_id = public.current_uid())
  with check (provider_id = public.current_uid());

create policy teaching_cases_own_delete on public.teaching_cases
  for delete to authenticated
  using (provider_id = public.current_uid());

-- ---------------------------------------------------------------------------
-- Applied as follow-ups in the same session, kept here so the file matches
-- production.
-- ---------------------------------------------------------------------------

-- A test withdrawn upstream is pruned by neuro-directory-sync. Without this the
-- hide rows pointing at it would linger as orphans, and a future test reusing
-- that id would come back already hidden.
alter table public.neuro_test_hidden
  add constraint neuro_test_hidden_test_fk
  foreign key (test_id) references public.neuro_test_directory_rows(id) on delete cascade;

-- Row-level security filters rows, it does not raise. An edit or delete the
-- policies refuse therefore came back as "0 rows" inside the INSTEAD OF trigger
-- while the statement reported success, and the portal would have told a
-- director their change was saved when nothing had changed. The trigger bodies
-- now check row_count and raise insufficient_privilege with a message a
-- clinician can act on. See neuro_test_directory_upd / _del in production.

-- Pin the schema the trigger bodies resolve against.
alter function public.neuro_test_directory_ins() set search_path = public;
alter function public.neuro_test_directory_upd() set search_path = public;
alter function public.neuro_test_directory_del() set search_path = public;
