-- Add MRI to the kinds a case image can be tagged with.
--
-- MRI sits with ultrasound and biopsy as an investigation image rather than a
-- photograph of the patient, so it does NOT join 'exam' in consentRequired():
-- a de-identified sequence carries no face. The check is widened, nothing else
-- about the table changes.
alter table public.case_media drop constraint case_media_media_kind_check;

alter table public.case_media
  add constraint case_media_media_kind_check
  check (media_kind in ('waveform', 'ultrasound', 'mri', 'biopsy', 'exam'));
