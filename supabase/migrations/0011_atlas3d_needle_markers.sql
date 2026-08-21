-- Needle-insertion markers for the 3D Atlas.
--
-- These are CLINICAL CONTENT. A marker says "put the needle here, at this
-- angle, this deep", so the table is built around review rather than around
-- storage: a marker is invisible to fellows until a director has approved it,
-- and any edit to an approved marker sends it back to draft.
--
-- ANCHORING. Coordinates are stored in the LOCAL space of the named mesh, not
-- in world space. The pipeline recentres each region model on export, so a
-- world-space point would silently drift the next time the .glb is rebuilt —
-- markers would still render, just in the wrong place, which is the worst
-- possible failure for this data. Local coordinates survive recentring and
-- rescaling. They do NOT survive retopology of the mesh itself; if a region is
-- re-exported with different decimation, its markers must be re-reviewed, and
-- source_mesh_sha records which build they were placed against.
--
-- Depth is millimetres of needle insertion from the entry point along
-- `direction`, matching how the localization text in emgAtlas.ts is written.

create table if not exists public.atlas3d_markers (
  id uuid primary key default gen_random_uuid(),

  -- What this marker is for. muscle_id is EMG_MUSCLES.id in emgAtlas.ts;
  -- there is no FK because that data lives in the repo, not the database.
  muscle_id   text not null,
  region_id   text not null,

  -- Where it sits. mesh_name is the glTF node the point is anchored to.
  mesh_name   text not null,
  local_x     double precision not null,
  local_y     double precision not null,
  local_z     double precision not null,

  -- Needle trajectory: unit vector in the same local space, pointing INTO the
  -- tissue, plus how far along it to travel.
  dir_x       double precision not null,
  dir_y       double precision not null,
  dir_z       double precision not null,
  depth_mm    numeric(5,1) not null check (depth_mm > 0 and depth_mm <= 150),

  label       text,
  note        text,

  -- Review state. Only 'approved' is ever shown to a fellow.
  status      text not null default 'draft'
              check (status in ('draft', 'in_review', 'approved')),

  -- Which model build this was placed against (see ANCHORING above).
  source_mesh_sha text,

  authored_by uuid references public.users(id),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists atlas3d_markers_muscle_idx
  on public.atlas3d_markers (muscle_id, status);

-- One approved marker per muscle keeps the fellow-facing view unambiguous.
-- Drafts are unconstrained so several people can propose alternatives.
create unique index if not exists atlas3d_markers_one_approved_per_muscle
  on public.atlas3d_markers (muscle_id)
  where status = 'approved';

alter table public.atlas3d_markers enable row level security;

-- Everyone signed in can read APPROVED markers.
drop policy if exists atlas3d_markers_read_approved on public.atlas3d_markers;
create policy atlas3d_markers_read_approved
  on public.atlas3d_markers for select
  to authenticated
  using (status = 'approved');

-- Supervisors and directors additionally see drafts, so they can review.
drop policy if exists atlas3d_markers_read_drafts on public.atlas3d_markers;
create policy atlas3d_markers_read_drafts
  on public.atlas3d_markers for select
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('supervisor', 'director')
    )
  );

-- Supervisors and directors may propose markers, always as their own drafts.
drop policy if exists atlas3d_markers_insert on public.atlas3d_markers;
create policy atlas3d_markers_insert
  on public.atlas3d_markers for insert
  to authenticated
  with check (
    authored_by = auth.uid()
    and status = 'draft'
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('supervisor', 'director')
    )
  );

-- A supervisor may edit their own drafts. A director may edit anything.
-- Note what this policy does NOT allow: a supervisor cannot set 'approved',
-- because the WITH CHECK keeps their rows in draft.
drop policy if exists atlas3d_markers_update_own_draft on public.atlas3d_markers;
create policy atlas3d_markers_update_own_draft
  on public.atlas3d_markers for update
  to authenticated
  using (
    authored_by = auth.uid()
    and status <> 'approved'
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('supervisor', 'director')
    )
  )
  with check (authored_by = auth.uid() and status in ('draft', 'in_review'));

drop policy if exists atlas3d_markers_director_all on public.atlas3d_markers;
create policy atlas3d_markers_director_all
  on public.atlas3d_markers for all
  to authenticated
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'director')
  )
  with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'director')
  );

-- Editing the geometry of an approved marker must re-open review: an approved
-- marker is a statement a director signed off on, and moving the point or
-- changing the depth makes it a different statement.
create or replace function public.atlas3d_markers_touch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and old.status = 'approved' then
    if new.local_x is distinct from old.local_x
       or new.local_y is distinct from old.local_y
       or new.local_z is distinct from old.local_z
       or new.dir_x  is distinct from old.dir_x
       or new.dir_y  is distinct from old.dir_y
       or new.dir_z  is distinct from old.dir_z
       or new.depth_mm is distinct from old.depth_mm
       or new.mesh_name is distinct from old.mesh_name
    then
      new.status := 'draft';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status = 'approved' and old.status <> 'approved' then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists atlas3d_markers_touch_trg on public.atlas3d_markers;
create trigger atlas3d_markers_touch_trg
  before update or insert on public.atlas3d_markers
  for each row execute function public.atlas3d_markers_touch();

-- PostgREST exposes SECURITY DEFINER functions at /rest/v1/rpc/<name>, so this
-- trigger function would otherwise be callable by any signed-in client (and by
-- anon). It is only ever meant to run from its trigger.
revoke execute on function public.atlas3d_markers_touch() from public;
revoke execute on function public.atlas3d_markers_touch() from anon;
revoke execute on function public.atlas3d_markers_touch() from authenticated;
