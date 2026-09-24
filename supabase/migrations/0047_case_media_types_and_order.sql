-- ---------------------------------------------------------------------------
-- 0047 — a case's own types, and the order of its images
--
-- Types. media_kind + extra_kinds are now the CASE's designation — what the
-- case as a whole is filed under, set by whoever edits it, any combination.
-- What image 1 itself shows moves to main_kinds (images 2… already have their
-- own kinds). The library lists a case under its designation and under
-- anything any of its images is tagged with.
--
-- Order. case_media_reorder() puts a case's images in a new order, including
-- which one comes first. Image 1 lives on the case row, so choosing a new
-- first image swaps its file, annotations and tags onto the case row and the
-- old first image becomes one of the others. A clip stays first: it is
-- annotated through a frame captured from it, which only image 1 has.
-- It runs as the caller, so the same rules decide who may do it as for any
-- other edit to the case (its author, the director, the program admin).
-- ---------------------------------------------------------------------------

alter table public.case_media
  add column if not exists main_kinds text[] not null default '{}';
alter table public.case_media drop constraint if exists case_media_main_kinds_check;
alter table public.case_media add constraint case_media_main_kinds_check
  check (main_kinds <@ array['waveform', 'ultrasound', 'mri', 'biopsy', 'exam']::text[]);

-- Until now image 1's tags were the case's own.
update public.case_media set main_kinds = array[media_kind] || array(select unnest(extra_kinds) except select media_kind)
 where main_kinds = '{}';

-- The consent rule also covers image 1's tags.
create or replace function public.case_media_exam_needs_consent()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_consent timestamptz; v_case uuid; v_new text[]; v_old text[];
begin
  if tg_table_name = 'case_media' then
    v_case := new.id;
    v_new := new.extra_kinds || new.main_kinds || new.media_kind;
    v_old := old.extra_kinds || old.main_kinds || old.media_kind;
  else
    v_case := new.case_id; v_new := new.kinds;
    v_old := case when tg_op = 'UPDATE' then old.kinds else '{}'::text[] end;
  end if;
  if 'exam' = any(v_new) and not ('exam' = any(v_old)) then
    select consent_signed_at into v_consent from public.case_media where id = v_case;
    if v_consent is null then
      raise exception 'An examination photo needs the patient''s signed consent, and this case has none on file. Add it as a new case with consent.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists case_media_exam_consent_trg on public.case_media;
create trigger case_media_exam_consent_trg before update of media_kind, extra_kinds, main_kinds on public.case_media
  for each row execute function public.case_media_exam_needs_consent();

-- p_order: every image of the case exactly once — the case's id stands for
-- the current image 1, and image ids for the rest.
create or replace function public.case_media_reorder(p_case uuid, p_order uuid[])
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_case case_media;
  v_imgs case_media_image[];
  v_first uuid := p_order[1];
  v_new case_media_image;
  v_pos int := 0;
  v_id uuid;
begin
  select * into v_case from public.case_media where id = p_case;
  if not found then raise exception 'That case is not in this program'; end if;
  select coalesce(array_agg(i order by i.position, i.id), '{}') into v_imgs from public.case_media_image i where i.case_id = p_case;

  if array_length(p_order, 1) is distinct from 1 + coalesce(array_length(v_imgs, 1), 0)
     or not (p_case = any(p_order))
     or exists (select 1 from unnest(v_imgs) i where not (i.id = any(p_order))) then
    raise exception 'The new order must list every image of the case once';
  end if;
  if v_first <> p_case and (v_case.mime_type like 'video/%' or v_case.file_name ~* '\.(mp4|mov|webm|m4v|avi)$') then
    raise exception 'A clip has to stay first — it is annotated through a frame captured from it';
  end if;

  -- a new image 1: swap its file, drawing and tags with the case row's
  if v_first <> p_case then
    select * into v_new from unnest(v_imgs) i where i.id = v_first;
    update public.case_media_image set
      file_name = v_case.file_name, storage_path = v_case.storage_path || '#swap', mime_type = v_case.mime_type,
      size_bytes = v_case.size_bytes, annotations = coalesce(v_case.annotations, '[]'::jsonb),
      kinds = case when v_case.main_kinds = '{}' then array[v_case.media_kind] else v_case.main_kinds end
     where id = v_first;
    update public.case_media set
      file_name = v_new.file_name, storage_path = v_new.storage_path, mime_type = v_new.mime_type,
      size_bytes = v_new.size_bytes, annotations = v_new.annotations,
      main_kinds = case when v_new.kinds = '{}' then array[v_case.media_kind] else v_new.kinds end
     where id = p_case;
    update public.case_media_image set storage_path = v_case.storage_path where id = v_first;
  end if;

  -- positions for the rest, in the order given (the old image 1's file is now
  -- held by the row that was v_first, so the case id stands for that row)
  foreach v_id in array p_order[2:] loop
    v_pos := v_pos + 1;
    update public.case_media_image set position = v_pos
     where id = case when v_id = p_case then v_first else v_id end;
  end loop;
end $$;
revoke all on function public.case_media_reorder(uuid, uuid[]) from public, anon;
grant execute on function public.case_media_reorder(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
