-- ---------------------------------------------------------------------------
-- 0029 — storage was the one place tenancy stopped at the database edge
--
-- Every table holding a file reference is site-isolated. storage.objects has no
-- site_id, and its policies asked only "are you signed in":
--
--   case-media   SELECT: bucket_id = 'case-media' AND auth.uid() IS NOT NULL
--   library      SELECT: bucket_id = 'library'    AND auth.uid() IS NOT NULL
--   case-consent SELECT: owner = auth.uid() OR is_director_or_admin()
--
-- So a member of one program could have listed and downloaded every other
-- program's waveforms, ultrasound clips, MRI and biopsy images and library
-- documents, and any director could have read any program's signed patient
-- consent forms — patient names and signature images — regardless of which
-- fellowship treated the patient. The rows describing those files were
-- correctly hidden. The files were not.
--
-- The write side had the same shape: a director of one program could delete
-- or overwrite another's library documents and requisition PDFs.
--
-- Access is now derived from the owning row. Those tables already enforce site
-- isolation and a policy subquery runs as the caller, so their RLS does the
-- scoping here too. Uploaders keep access to what they uploaded, because a file
-- lands in the bucket before the row describing it exists.
--
-- teaching-cases was already correct: its policies key on the first path
-- segment being the uploader's own user id.
--
-- Verified with a throwaway second program: from inside it, zero of Toronto's
-- case-media and library objects are visible; from Toronto, all 3 and all 7
-- still are; and an uploader keeps their own objects while sitting in the other
-- program.
-- ---------------------------------------------------------------------------

drop policy if exists case_media_files_select on storage.objects;
create policy case_media_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'case-media'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.case_media cm
        where cm.storage_path = storage.objects.name
           or cm.poster_path  = storage.objects.name
      )
    )
  );

drop policy if exists case_media_files_delete on storage.objects;
create policy case_media_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'case-media'
    and (
      owner = auth.uid()
      or (
        public.is_director_or_admin()
        and exists (
          select 1 from public.case_media cm
          where cm.storage_path = storage.objects.name
             or cm.poster_path  = storage.objects.name
        )
      )
    )
  );

drop policy if exists case_media_files_update on storage.objects;
create policy case_media_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'case-media'
    and (
      owner = auth.uid()
      or (
        public.is_director_or_admin()
        and exists (
          select 1 from public.case_media cm
          where cm.storage_path = storage.objects.name
             or cm.poster_path  = storage.objects.name
        )
      )
    )
  );

drop policy if exists library_files_select on storage.objects;
create policy library_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'library'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.library_documents d
        where d.storage_path = storage.objects.name
      )
    )
  );

drop policy if exists library_files_delete on storage.objects;
create policy library_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'library'
    and (
      owner = auth.uid()
      or (
        public.is_director_or_admin()
        and exists (
          select 1 from public.library_documents d
          where d.storage_path = storage.objects.name
        )
      )
    )
  );

drop policy if exists library_files_update on storage.objects;
create policy library_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'library'
    and (
      owner = auth.uid()
      or (
        public.is_director_or_admin()
        and exists (
          select 1 from public.library_documents d
          where d.storage_path = storage.objects.name
        )
      )
    )
  );

drop policy if exists case_consent_select on storage.objects;
create policy case_consent_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'case-consent'
    and (
      owner = auth.uid()
      or (
        public.is_director_or_admin()
        and exists (
          select 1 from public.case_media_consent c
          where c.signature_path = storage.objects.name
        )
      )
    )
  );

drop policy if exists case_consent_delete on storage.objects;
create policy case_consent_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'case-consent'
    and (
      owner = auth.uid()
      or (
        public.is_director_or_admin()
        and exists (
          select 1 from public.case_media_consent c
          where c.signature_path = storage.objects.name
        )
      )
    )
  );

-- A requisition PDF follows its directory entry: shared national ones are
-- readable by every program, a locally added one only by the program that
-- added it. neuro_test_directory_rows already draws that line.
drop policy if exists requisitions_read on storage.objects;
create policy requisitions_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'requisitions'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.neuro_test_directory_rows r
        where r.requisition_path = storage.objects.name
      )
    )
  );

drop policy if exists requisitions_delete on storage.objects;
create policy requisitions_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'requisitions'
    and (
      owner = auth.uid()
      or (
        public.current_app_role() = any (array['supervisor','director','admin']::user_role[])
        and exists (
          select 1 from public.neuro_test_directory_rows r
          where r.requisition_path = storage.objects.name
            and r.site_id = (select public.current_site_id())
        )
      )
    )
  );
