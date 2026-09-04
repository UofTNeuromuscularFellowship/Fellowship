-- ---------------------------------------------------------------------------
-- Who actually signed the consent.
--
-- Applied live 2026-09-04; this file is the repo's record of it.
--
-- A neuromuscular clinic is exactly where a patient may be unable to hold a
-- pen: severe hand weakness, bulbar disease, a ventilated patient. The consent
-- wording now allows a substitute decision-maker to sign, so the record has to
-- say that one did and on what authority — otherwise a signature in someone
-- else's name looks like a discrepancy rather than a documented arrangement.
--
-- Defaults keep the existing rows honest: everything signed so far was signed
-- by the patient.
--
-- No new RLS is needed. These columns sit inside case_media_consent, which is
-- already readable only by the clinician who obtained the consent, the case
-- author, and the director/admin (0019). A representative's name is exactly as
-- sensitive as the patient's and inherits the same protection.
-- ---------------------------------------------------------------------------

alter table public.case_media_consent
  add column if not exists signer_is_representative boolean not null default false,
  add column if not exists signer_name text,
  add column if not exists signer_authority text;

comment on column public.case_media_consent.signer_is_representative is
  'True when a substitute decision-maker signed instead of the patient.';
comment on column public.case_media_consent.signer_name is
  'Name of the representative who signed. Null when the patient signed themselves.';
comment on column public.case_media_consent.signer_authority is
  'The representative''s relationship to the patient and their authority to act (e.g. "spouse and substitute decision-maker").';

-- A representative signature is only meaningful with a name and an authority
-- behind it; a patient signature must not carry either, or the record no longer
-- says unambiguously who signed.
alter table public.case_media_consent
  drop constraint if exists case_media_consent_signer_check;

alter table public.case_media_consent
  add constraint case_media_consent_signer_check check (
    (signer_is_representative = false and signer_name is null and signer_authority is null)
    or (
      signer_is_representative = true
      and coalesce(btrim(signer_name), '') <> ''
      and coalesce(btrim(signer_authority), '') <> ''
    )
  );
