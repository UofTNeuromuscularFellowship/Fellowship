-- Several approaches to the same target.
--
-- A muscle often has more than one accepted needle approach, and a study can
-- be run with different montages. Each set of markers belongs to a named
-- approach, and the viewer shows one approach at a time.
--
-- Landmarks are deliberately EXEMPT: the medial epicondyle is the medial
-- epicondyle whichever approach you are describing, so a landmark carries no
-- approach and is shown alongside all of them.

alter table public.atlas3d_markers
  add column if not exists approach text not null default 'Standard';

alter table public.atlas3d_markers drop constraint if exists atlas3d_markers_approach_chk;
alter table public.atlas3d_markers
  add constraint atlas3d_markers_approach_chk
  check (
    length(btrim(approach)) between 1 and 60
    and (marker_kind <> 'landmark' or approach = 'Standard')
  );

-- Approved uniqueness is now per approach: one approved needle per muscle PER
-- APPROACH, one approved G1 per study per approach.
drop index if exists atlas3d_markers_one_approved_per_target_kind;
create unique index if not exists atlas3d_markers_one_approved_per_approach_kind
  on public.atlas3d_markers (coalesce(muscle_id, study_id), approach, marker_kind)
  where status = 'approved' and marker_kind <> 'landmark';

create index if not exists atlas3d_markers_approach_idx
  on public.atlas3d_markers (coalesce(muscle_id, study_id), approach);
