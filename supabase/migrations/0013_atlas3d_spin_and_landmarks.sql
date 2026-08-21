-- Two additions.
--
-- spin_deg: rotation of a marker about the surface normal. It exists for the
-- stimulator, where which way the CATHODE points changes the study — the
-- surface normal fixes which way the probe faces into the limb but says
-- nothing about how it is turned on that surface.
--
-- 'landmark': a named anatomical reference point with no hardware attached —
-- medial epicondyle, biceps tendon — so technique notes can refer to something
-- visible on the model. Unlike the other kinds a landmark may hang off either
-- a muscle or a study, and a target may carry many of them.

alter table public.atlas3d_markers
  add column if not exists spin_deg numeric(5,1) not null default 0;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'atlas3d_markers_spin_chk') then
    alter table public.atlas3d_markers drop constraint atlas3d_markers_spin_chk;
  end if;
  alter table public.atlas3d_markers
    add constraint atlas3d_markers_spin_chk check (spin_deg >= -360 and spin_deg <= 360);
end $$;

alter table public.atlas3d_markers drop constraint if exists atlas3d_markers_kind_chk;
alter table public.atlas3d_markers
  add constraint atlas3d_markers_kind_chk
  check (marker_kind in ('needle', 'stim', 'g1', 'g2', 'ground', 'landmark'));

-- Targets: a needle belongs to a muscle, an electrode to a study, a landmark
-- to either — but always exactly one.
alter table public.atlas3d_markers drop constraint if exists atlas3d_markers_target_chk;
alter table public.atlas3d_markers
  add constraint atlas3d_markers_target_chk
  check (
    (muscle_id is not null) <> (study_id is not null)
    and (marker_kind <> 'needle' or muscle_id is not null)
    and (marker_kind not in ('stim', 'g1', 'g2', 'ground') or study_id is not null)
  );

-- "One approved per target per kind" must not apply to landmarks: a muscle can
-- legitimately have several named reference points.
drop index if exists atlas3d_markers_one_approved_per_target_kind;
create unique index if not exists atlas3d_markers_one_approved_per_target_kind
  on public.atlas3d_markers (coalesce(muscle_id, study_id), marker_kind)
  where status = 'approved' and marker_kind <> 'landmark';
