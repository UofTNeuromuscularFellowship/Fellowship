-- ---------------------------------------------------------------------------
-- 0044 — more than one image per case in the waveform & image library
--
-- The case's own file (case_media.storage_path) stays image 1. Further images
-- live here, each with its own annotations, in the order they were added.
-- Whoever may edit the case (its author, the director, the program admin) may
-- add or remove its images; everyone signed in to the program may see them,
-- exactly as for the case itself.
-- ---------------------------------------------------------------------------

create table if not exists public.case_media_image (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  case_id       uuid not null references public.case_media(id) on delete cascade,
  position      integer not null default 0,
  file_name     text not null,
  storage_path  text not null unique,
  mime_type     text,
  size_bytes    bigint,
  annotations   jsonb not null default '[]'::jsonb,
  created_by    uuid references public.users(id) on delete set null default public.current_uid(),
  created_at    timestamptz not null default now()
);
create index if not exists case_media_image_case on public.case_media_image (case_id, position);

alter table public.case_media_image enable row level security;

drop policy if exists case_media_image_site_isolation on public.case_media_image;
create policy case_media_image_site_isolation on public.case_media_image as restrictive for all
  using ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
  with check ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)));
drop policy if exists case_media_image_app_definer_all on public.case_media_image;
create policy case_media_image_app_definer_all on public.case_media_image for all to app_definer using (true) with check (true);

drop policy if exists case_media_image_read on public.case_media_image;
create policy case_media_image_read on public.case_media_image for select to authenticated
  using (public.current_uid() is not null);

drop policy if exists case_media_image_write on public.case_media_image;
create policy case_media_image_write on public.case_media_image for all to authenticated
  using (exists (select 1 from public.case_media m where m.id = case_media_image.case_id
                  and (m.author_id = public.current_uid() or coalesce(public.is_director_or_admin(), false))))
  with check (exists (select 1 from public.case_media m where m.id = case_media_image.case_id
                  and (m.author_id = public.current_uid() or coalesce(public.is_director_or_admin(), false))));

revoke all on public.case_media_image from anon;
grant select, insert, update, delete on public.case_media_image to authenticated;
grant all on public.case_media_image to service_role, app_definer;

-- The files: readable by anyone who can see the case, and removable by the
-- director or admin as well as by whoever uploaded them.
drop policy if exists case_media_files_select on storage.objects;
create policy case_media_files_select on storage.objects for select to authenticated
  using (bucket_id = 'case-media' and (owner = auth.uid()
    or exists (select 1 from public.case_media cm where cm.storage_path = objects.name or cm.poster_path = objects.name)
    or exists (select 1 from public.case_media_image ci where ci.storage_path = objects.name)));

drop policy if exists case_media_files_delete on storage.objects;
create policy case_media_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'case-media' and (owner = auth.uid() or (public.is_director_or_admin() and (
    exists (select 1 from public.case_media cm where cm.storage_path = objects.name or cm.poster_path = objects.name)
    or exists (select 1 from public.case_media_image ci where ci.storage_path = objects.name)))));

drop policy if exists case_media_files_update on storage.objects;
create policy case_media_files_update on storage.objects for update to authenticated
  using (bucket_id = 'case-media' and (owner = auth.uid() or (public.is_director_or_admin() and (
    exists (select 1 from public.case_media cm where cm.storage_path = objects.name or cm.poster_path = objects.name)
    or exists (select 1 from public.case_media_image ci where ci.storage_path = objects.name)))));

notify pgrst, 'reload schema';
