-- Provider-owned "teaching cases" for case-based teaching, private to the author,
-- with attachments (NCS/EMG reports, images, video) stored in a PRIVATE bucket.
--
-- Security posture:
--   * Both tables have RLS; every row is visible only to its provider
--     (provider_id = auth.uid()). No shared/library access.
--   * The storage bucket is NOT public, so files have no public URL and cannot
--     be found by search engines or guessed. The app reads them only through
--     short-lived signed URLs, and object policies restrict every provider to
--     files under their own uid/ folder.
--   * Cases and their files can be permanently deleted (hard delete + remove
--     objects from storage).

create table if not exists teaching_cases (
  id             uuid primary key default gen_random_uuid(),
  provider_id    uuid not null references users(id) on delete cascade,
  patient_name   text,        -- optional; redaction encouraged (use initials)
  mrn            text,        -- optional; redaction encouraged
  hospital_site  text,
  age            text,
  sex            text,
  description    text,
  teaching_points text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists teaching_cases_provider_idx on teaching_cases(provider_id, created_at desc);
alter table teaching_cases enable row level security;
create policy teaching_cases_self on teaching_cases
  for all using (provider_id = auth.uid()) with check (provider_id = auth.uid());

create table if not exists teaching_case_files (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references teaching_cases(id) on delete cascade,
  provider_id   uuid not null references users(id) on delete cascade,
  storage_path  text not null,
  file_name     text not null,
  mime_type     text,
  kind          text,        -- 'report' | 'image' | 'video' | 'other'
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);
create index if not exists teaching_case_files_case_idx on teaching_case_files(case_id, created_at);
alter table teaching_case_files enable row level security;
create policy teaching_case_files_self on teaching_case_files
  for all using (provider_id = auth.uid()) with check (provider_id = auth.uid());

-- Private storage bucket for attachments (200 MB/file cap).
insert into storage.buckets (id, name, public, file_size_limit)
values ('teaching-cases', 'teaching-cases', false, 209715200)
on conflict (id) do nothing;

-- Object policies: a provider can only touch files under their own uid folder.
create policy "teaching_cases_files_select" on storage.objects for select
  using (bucket_id = 'teaching-cases' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "teaching_cases_files_insert" on storage.objects for insert
  with check (bucket_id = 'teaching-cases' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "teaching_cases_files_update" on storage.objects for update
  using (bucket_id = 'teaching-cases' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "teaching_cases_files_delete" on storage.objects for delete
  using (bucket_id = 'teaching-cases' and (storage.foldername(name))[1] = auth.uid()::text);
