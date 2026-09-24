-- ---------------------------------------------------------------------------
-- 0046 — a case can mix modalities
--
-- Each image in a case says what it shows, and can show more than one thing
-- (a screen with the needle EMG and the ultrasound side by side). Image 1 is
-- the case's own file: media_kind is its first kind, extra_kinds the rest.
-- Images 2, 3… carry their own kinds. A case is found under every kind any of
-- its images shows.
--
-- An examination photograph needs the patient's signed consent. Consent is
-- recorded against the case, just after the case is created, so the rule is
-- checked when a LATER image or tag adds "exam": it is refused unless consent
-- is already on file.
-- ---------------------------------------------------------------------------

alter table public.case_media
  add column if not exists extra_kinds text[] not null default '{}';
alter table public.case_media drop constraint if exists case_media_extra_kinds_check;
alter table public.case_media add constraint case_media_extra_kinds_check
  check (extra_kinds <@ array['waveform', 'ultrasound', 'mri', 'biopsy', 'exam']::text[]);

alter table public.case_media_image
  add column if not exists kinds text[] not null default '{}';
alter table public.case_media_image drop constraint if exists case_media_image_kinds_check;
alter table public.case_media_image add constraint case_media_image_kinds_check
  check (kinds <@ array['waveform', 'ultrasound', 'mri', 'biopsy', 'exam']::text[]);

-- Images added before this: they show what the case shows.
update public.case_media_image i set kinds = array[m.media_kind]
  from public.case_media m where m.id = i.case_id and i.kinds = '{}';

create or replace function public.case_media_exam_needs_consent()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_consent timestamptz; v_case uuid; v_new text[]; v_old text[];
begin
  if tg_table_name = 'case_media' then
    v_case := new.id; v_new := new.extra_kinds || new.media_kind; v_old := old.extra_kinds || old.media_kind;
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
alter function public.case_media_exam_needs_consent() owner to app_definer;
revoke all on function public.case_media_exam_needs_consent() from public, anon, authenticated;

drop trigger if exists case_media_exam_consent_trg on public.case_media;
create trigger case_media_exam_consent_trg before update of media_kind, extra_kinds on public.case_media
  for each row execute function public.case_media_exam_needs_consent();
drop trigger if exists case_media_image_exam_consent_trg on public.case_media_image;
create trigger case_media_image_exam_consent_trg before insert or update of kinds on public.case_media_image
  for each row execute function public.case_media_exam_needs_consent();

notify pgrst, 'reload schema';
