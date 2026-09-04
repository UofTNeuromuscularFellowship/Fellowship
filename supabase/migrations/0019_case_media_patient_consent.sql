-- ---------------------------------------------------------------------------
-- Patient consent for teaching images.
--
-- Applied live 2026-09-03; this file is the repo's record of it.
--
-- Split deliberately in two:
--
--   case_media.consent_signed_at   a DATE ONLY, readable by everyone, so the
--                                  page can attest "consent on file, signed
--                                  3 Sep" without naming anybody.
--   case_media_consent             the record itself — the patient's typed
--                                  name, their drawn signature, the wording
--                                  they agreed to — readable ONLY by the
--                                  clinician who obtained it and the
--                                  director/admin.
--
-- A signature is a person's name in their own hand. Showing it to the whole
-- fellowship beneath their clinical photograph would identify the patient in
-- the one place the rest of this design works hardest not to, so the proof is
-- kept and the identity is not published.
--
-- The wording is stored WITH each signature rather than referenced, so editing
-- the default later cannot retrospectively change what somebody agreed to.
-- ---------------------------------------------------------------------------

alter table public.case_media
  add column if not exists consent_signed_at timestamptz;

comment on column public.case_media.consent_signed_at is
  'When patient consent was signed. Visible to all readers as an attestation; the consent record itself is in case_media_consent and is not.';

create table if not exists public.case_media_consent (
  case_id             uuid primary key references public.case_media (id) on delete cascade,
  patient_name        text not null,
  signature_path      text not null,
  wording             text not null,
  signed_at           timestamptz not null default now(),
  obtained_by         uuid not null references public.users (id),
  created_at          timestamptz not null default now()
);

comment on table public.case_media_consent is
  'Signed patient consent for a teaching image. Contains identifiers by necessity; readable only by the uploading clinician and the director/admin.';

alter table public.case_media_consent enable row level security;

-- coalesce() throughout: is_director_or_admin() returns NULL, not false, for a
-- JWT with no matching users row. See claude/feedback-review-page.md.
drop policy if exists case_media_consent_read on public.case_media_consent;
create policy case_media_consent_read on public.case_media_consent
  for select to authenticated
  using (
    obtained_by = auth.uid()
    or exists (select 1 from public.case_media m where m.id = case_id and m.author_id = auth.uid())
    or coalesce(public.is_director_or_admin(), false)
  );

drop policy if exists case_media_consent_write on public.case_media_consent;
create policy case_media_consent_write on public.case_media_consent
  for insert to authenticated
  with check (
    obtained_by = auth.uid()
    and exists (select 1 from public.case_media m where m.id = case_id and m.author_id = auth.uid())
  );

drop policy if exists case_media_consent_update on public.case_media_consent;
create policy case_media_consent_update on public.case_media_consent
  for update to authenticated
  using (obtained_by = auth.uid() or coalesce(public.is_director_or_admin(), false))
  with check (obtained_by = auth.uid() or coalesce(public.is_director_or_admin(), false));

drop policy if exists case_media_consent_delete on public.case_media_consent;
create policy case_media_consent_delete on public.case_media_consent
  for delete to authenticated
  using (obtained_by = auth.uid() or coalesce(public.is_director_or_admin(), false));

grant select, insert, update, delete on public.case_media_consent to authenticated;

-- Signatures live in their own private bucket, not beside the teaching images,
-- so "everyone can read the images" and "almost nobody can read the signatures"
-- are two separate policies rather than one policy with an exception.
insert into storage.buckets (id, name, public, file_size_limit)
values ('case-consent', 'case-consent', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;

drop policy if exists case_consent_select on storage.objects;
create policy case_consent_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'case-consent'
    and (owner = auth.uid() or coalesce(public.is_director_or_admin(), false))
  );

drop policy if exists case_consent_insert on storage.objects;
create policy case_consent_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'case-consent' and auth.uid() is not null);

drop policy if exists case_consent_delete on storage.objects;
create policy case_consent_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'case-consent'
    and (owner = auth.uid() or coalesce(public.is_director_or_admin(), false))
  );
