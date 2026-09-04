-- ---------------------------------------------------------------------------
-- Waveform / ultrasound / biopsy / examination image library.
--
-- A teaching library of images and clips, each with a descriptive title, a
-- description shown under the media, and drawn annotations that double as a
-- numbered legend.
--
-- DELIBERATELY DE-IDENTIFIED. Unlike public.teaching_cases — which carries
-- patient_name and mrn and is restricted to supervisors and the director —
-- this table has no identifier columns at all, because everything in it is
-- visible to every signed-in member of the fellowship including fellows. There
-- is nowhere to put a name here, which is the point: the schema cannot hold
-- what the page must not show.
--
-- That does not de-identify the PIXELS. EMG and ultrasound exports routinely
-- burn the patient's name, MRN and date of birth into the image header, and a
-- photograph of an examination finding can be identifiable on its own. The
-- upload form requires an explicit confirmation and says so; this comment is
-- here so the next person changing the schema knows the risk sits in the file,
-- not in the columns.
-- ---------------------------------------------------------------------------

create table if not exists public.case_media (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  -- What kind of image this is. Drives the filter chips and the badge.
  media_kind    text not null check (media_kind in ('waveform', 'ultrasound', 'biopsy', 'exam')),
  description   text,
  file_name     text not null,
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint,
  -- A still captured from a clip, so a video can carry annotations without
  -- pretending each shape knows what frame it belongs to.
  poster_path   text,
  -- Drawn shapes. One array of
  --   { id, kind: 'arrow'|'ellipse'|'freehand', colour, label, points: [[x,y]...] }
  -- with coordinates normalised 0..1 against the media's own box, so an
  -- annotation drawn on a laptop lands in the same place on a phone.
  annotations   jsonb not null default '[]'::jsonb,
  author_id     uuid not null references public.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.case_media is
  'Teaching images and clips: waveforms, ultrasound, biopsy and examination findings. '
  'De-identified by design — no patient identifier columns exist here. Readable by '
  'every signed-in user; authored and edited by whoever uploaded it, or the director.';

create index if not exists case_media_kind_idx on public.case_media (media_kind, created_at desc);
create index if not exists case_media_created_idx on public.case_media (created_at desc);

alter table public.case_media enable row level security;

-- Everyone signed in reads the library: the fellows are the audience.
drop policy if exists case_media_read on public.case_media;
create policy case_media_read on public.case_media
  for select to authenticated
  using (auth.uid() is not null);

-- Anyone signed in may contribute, always as themselves. Authorship cannot be
-- assigned to someone else on the way in.
drop policy if exists case_media_insert on public.case_media;
create policy case_media_insert on public.case_media
  for insert to authenticated
  with check (author_id = auth.uid());

-- Edit and remove your own; the director and program admin may edit anyone's,
-- which is the route for taking something down that should not be up.
-- coalesce() because is_director_or_admin() returns NULL — not false — for a
-- JWT with no matching users row, and `using (NULL)` silently denies while
-- `if not NULL` silently passes. See claude/feedback-review-page.md.
drop policy if exists case_media_write_own on public.case_media;
create policy case_media_write_own on public.case_media
  for update to authenticated
  using (author_id = auth.uid() or coalesce(public.is_director_or_admin(), false))
  with check (author_id = auth.uid() or coalesce(public.is_director_or_admin(), false));

drop policy if exists case_media_delete_own on public.case_media;
create policy case_media_delete_own on public.case_media
  for delete to authenticated
  using (author_id = auth.uid() or coalesce(public.is_director_or_admin(), false));

grant select, insert, update, delete on public.case_media to authenticated;

-- updated_at, so "recently edited" is truthful.
create or replace function public.case_media_touch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- PostgREST exposes SECURITY DEFINER functions at /rest/v1/rpc/<name>. This one
-- is only ever meant to run from its trigger.
revoke execute on function public.case_media_touch() from public;
revoke execute on function public.case_media_touch() from anon;
revoke execute on function public.case_media_touch() from authenticated;

drop trigger if exists case_media_touch_trg on public.case_media;
create trigger case_media_touch_trg
  before update on public.case_media
  for each row execute function public.case_media_touch();

-- ---------------------------------------------------------------------------
-- Storage. Private bucket, 200 MB per file to match teaching-cases and library
-- (an ultrasound clip is much larger than a waveform screenshot).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('case-media', 'case-media', false, 209715200)
on conflict (id) do update set public = false, file_size_limit = 209715200;

drop policy if exists case_media_files_select on storage.objects;
create policy case_media_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'case-media' and auth.uid() is not null);

drop policy if exists case_media_files_insert on storage.objects;
create policy case_media_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'case-media' and auth.uid() is not null);

-- storage.objects.owner is the uploader's uid, so "your own file" is checkable
-- here even though the case row lives in another table.
drop policy if exists case_media_files_update on storage.objects;
create policy case_media_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'case-media'
    and (owner = auth.uid() or coalesce(public.is_director_or_admin(), false))
  );

drop policy if exists case_media_files_delete on storage.objects;
create policy case_media_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'case-media'
    and (owner = auth.uid() or coalesce(public.is_director_or_admin(), false))
  );
