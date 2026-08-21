-- Extend needle markers to cover nerve conduction electrodes.
--
-- An EMG marker targets a MUSCLE and is a needle. An NCS marker targets a
-- STUDY and is one of four things on the surface: the stimulator, G1 (active),
-- G2 (reference) or the ground. Same review workflow, same anchoring, so this
-- extends the table rather than adding a second one.

alter table public.atlas3d_markers
  add column if not exists marker_kind text not null default 'needle',
  add column if not exists study_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'atlas3d_markers_kind_chk') then
    alter table public.atlas3d_markers
      add constraint atlas3d_markers_kind_chk
      check (marker_kind in ('needle', 'stim', 'g1', 'g2', 'ground'));
  end if;
end $$;

-- muscle_id was NOT NULL because every marker used to be an EMG needle.
alter table public.atlas3d_markers alter column muscle_id drop not null;

-- Exactly one target, and the kind has to match it: a needle goes in a muscle,
-- an electrode belongs to a study. Both wrong combinations verified rejected.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'atlas3d_markers_target_chk') then
    alter table public.atlas3d_markers
      add constraint atlas3d_markers_target_chk
      check (
        (muscle_id is not null and study_id is null and marker_kind = 'needle')
        or
        (study_id is not null and muscle_id is null and marker_kind <> 'needle')
      );
  end if;
end $$;

-- One approved marker per target PER KIND: one needle per muscle, but a study
-- legitimately has an approved stimulator, G1, G2 and ground all at once.
drop index if exists atlas3d_markers_one_approved_per_muscle;
create unique index if not exists atlas3d_markers_one_approved_per_target_kind
  on public.atlas3d_markers (coalesce(muscle_id, study_id), marker_kind)
  where status = 'approved';

create index if not exists atlas3d_markers_study_idx
  on public.atlas3d_markers (study_id, status);

-- depth_mm is meaningless for a surface electrode, so allow it to be absent
-- rather than forcing a fake number in.
alter table public.atlas3d_markers alter column depth_mm drop not null;
