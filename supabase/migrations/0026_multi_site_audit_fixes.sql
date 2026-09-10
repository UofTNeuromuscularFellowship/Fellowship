-- 0026 — fixes found auditing 0024.
--
--  1. pubmed_terms was misfiled as platform state. Settings.tsx reads it with
--     .maybeSingle() and upserts it as the director: with the row under the
--     platform pseudo-site the upsert created a SECOND (site-scoped) row and
--     the next read returned two, breaking the page. It is per-programme
--     curation, so it belongs to the site.
--  2. digest_settings let ANY director read/write EVERY site's rows.
--  3-4. Shared reference data (case_finding vocabulary, gene/muscle tables,
--     publications) was writable by any site's director — one programme could
--     edit or delete content every other programme depends on.
--  5. atlas3d_markers had no site column: a second programme's director could
--     edit or delete Toronto's curated markers. Reading stays shared (that is
--     the point of the atlas); writing is confined to the authoring site.
--  6. auto_assign_teaching has been broken since long before multi-site:
--     "column reference key is ambiguous" (app_settings.key vs the key column
--     produced by jsonb_each_text). Aliased.

update public.app_settings set site_id = '00000000-0000-4000-8000-000000000001'
where key = 'pubmed_terms' and site_id = '00000000-0000-4000-8000-000000000000';

drop policy if exists digest_self on public.digest_settings;
create policy digest_self on public.digest_settings for all to public
  using (
    user_id = public.current_uid()
    or (public.is_director_or_admin() and exists (
          select 1 from public.site_memberships m
          where m.user_id = digest_settings.user_id and m.site_id = public.current_site_id()))
  )
  with check (
    user_id = public.current_uid()
    or (public.is_director_or_admin() and exists (
          select 1 from public.site_memberships m
          where m.user_id = digest_settings.user_id and m.site_id = public.current_site_id()))
  );

-- Extending a shared vocabulary is additive and stays with directors; editing
-- or removing a code retags other programmes' media, so that is platform-only.
drop policy if exists case_finding_write on public.case_finding;
create policy case_finding_insert on public.case_finding for insert to authenticated
  with check (coalesce(public.is_director_or_admin(), false) or public.is_platform_admin());
create policy case_finding_amend on public.case_finding for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy case_finding_remove on public.case_finding for delete to authenticated
  using (public.is_platform_admin());

drop policy if exists gene_search_terms_manage on public.gene_search_terms;
create policy gene_search_terms_manage on public.gene_search_terms for all to public
  using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists muscle_gene_table_manage on public.muscle_gene_table;
create policy muscle_gene_table_manage on public.muscle_gene_table for all to public
  using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists publications_manage on public.publications;
create policy publications_manage on public.publications for all to public
  using (public.is_platform_admin()) with check (public.is_platform_admin());

alter table public.atlas3d_markers add column if not exists site_id uuid
  references public.sites(id) on delete cascade default public.current_site_id();
update public.atlas3d_markers set site_id = '00000000-0000-4000-8000-000000000001' where site_id is null;
alter table public.atlas3d_markers alter column site_id set not null;
create index if not exists atlas3d_markers_site_idx on public.atlas3d_markers(site_id);
comment on column public.atlas3d_markers.site_id is
  'Authoring programme. Approved markers are readable by every programme (the atlas is shared); only the authoring programme may edit or remove its own.';

drop policy if exists atlas3d_markers_director_all on public.atlas3d_markers;
drop policy if exists atlas3d_markers_insert on public.atlas3d_markers;
drop policy if exists atlas3d_markers_update_own on public.atlas3d_markers;
drop policy if exists atlas3d_markers_delete_own on public.atlas3d_markers;
drop policy if exists atlas3d_markers_read_drafts on public.atlas3d_markers;
create policy atlas3d_markers_read_drafts on public.atlas3d_markers for select to authenticated
  using (site_id = public.current_site_id()
         and public.current_app_role() = any (array['supervisor'::user_role,'director'::user_role]));
create policy atlas3d_markers_insert on public.atlas3d_markers for insert to authenticated
  with check (site_id = public.current_site_id() and authored_by = public.current_uid()
              and status = 'draft'
              and public.current_app_role() = any (array['supervisor'::user_role,'director'::user_role]));
create policy atlas3d_markers_update_own on public.atlas3d_markers for update to authenticated
  using (site_id = public.current_site_id() and authored_by = public.current_uid()
         and public.current_app_role() = any (array['supervisor'::user_role,'director'::user_role]))
  with check (site_id = public.current_site_id() and authored_by = public.current_uid());
create policy atlas3d_markers_delete_own on public.atlas3d_markers for delete to authenticated
  using (site_id = public.current_site_id() and authored_by = public.current_uid()
         and public.current_app_role() = any (array['supervisor'::user_role,'director'::user_role]));
create policy atlas3d_markers_director_all on public.atlas3d_markers for all to authenticated
  using (site_id = public.current_site_id() and public.current_app_role() = 'director')
  with check (site_id = public.current_site_id() and public.current_app_role() = 'director');

create or replace function public.auto_assign_teaching(p_from date, p_to date)
returns integer language plpgsql security definer set search_path to 'public' as $body$
declare
  wf_names text[]; wf_len int; wf_counter int := 0; s record; cand text; cand_id uuid;
  is_away boolean; tries int; assigned int := 0;
begin
  if not coalesce((select role = 'director' from public.site_users where id = public.current_uid()), false) then
    raise exception 'not authorized';
  end if;
  select array_agg(name order by ord) into wf_names from (
    select w.name, (gs::float / w.weight) as ord
    from (
      select e.key as name, greatest((e.value)::int, 0) as weight
      from public.app_settings a, jsonb_each_text(a.value) e
      where a.key = 'waveform_allocation'
    ) w, generate_series(1, w.weight) gs
  ) x;
  wf_len := coalesce(array_length(wf_names, 1), 0);
  for s in
    select id, session_date, topic from public.teaching_sessions
    where session_date between p_from and p_to and is_break = false
      and (provider_name is null or provider_name = '')
    order by session_date
  loop
    cand := null; cand_id := null;
    if s.topic = 'Waveform Rounds' and wf_len > 0 then
      tries := 0;
      while tries < wf_len loop
        cand := wf_names[((wf_counter + tries) % wf_len) + 1];
        select exists (select 1 from public.provider_away_dates pad
                       join public.site_users u on u.id = pad.provider_id
                       where u.full_name = cand and pad.away_date = s.session_date) into is_away;
        exit when not is_away;
        tries := tries + 1;
      end loop;
      if tries >= wf_len then cand := null; end if;
      wf_counter := wf_counter + 1;
    else
      select d.default_provider_name into cand from public.topic_provider_defaults d
      where d.topic = s.topic and d.default_provider_name is not null;
      if cand is not null then
        select exists (select 1 from public.provider_away_dates pad
                       join public.site_users u on u.id = pad.provider_id
                       where u.full_name = cand and pad.away_date = s.session_date) into is_away;
        if is_away then cand := null; end if;
      end if;
    end if;
    if cand is not null then
      select u.id into cand_id from public.site_users u
      where u.full_name = cand and u.role in ('supervisor','director') and u.status = 'active';
      update public.teaching_sessions set provider_name = cand, provider_id = cand_id,
             assignment_draft = true, updated_at = now() where id = s.id;
      assigned := assigned + 1;
    end if;
  end loop;
  return assigned;
end;
$body$;
alter function public.auto_assign_teaching(date,date) owner to app_definer;
