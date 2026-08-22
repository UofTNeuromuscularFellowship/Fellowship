-- ---------------------------------------------------------------------------
-- Let a supervisor publish the markers they authored.
--
-- 0011 kept every supervisor-authored marker in draft: only a director could
-- set 'approved', so nothing a supervisor placed reached a fellow until the
-- director came back to it. At the fellowship's request, a supervisor may now
-- approve their own work.
--
-- What this does NOT change:
--   * A supervisor still cannot touch a marker somebody else authored — every
--     policy below is keyed on authored_by = auth.uid().
--   * A fellow still sees approved markers only.
--   * The director keeps blanket rights over everything, including editing,
--     unpublishing and deleting a supervisor's approved marker.
--   * atlas3d_markers_touch() still reverts an approved marker to draft when
--     its geometry changes, and still stamps reviewed_by/reviewed_at on
--     whoever approves. A self-approval is therefore recorded as such, and a
--     moved marker has to be approved again.
-- ---------------------------------------------------------------------------

-- The old policy's USING clause carried `status <> 'approved'`, which was
-- correct while supervisors could not approve at all. Kept as-is it would trap
-- them: they could publish a marker and then no longer edit or unpublish it.
drop policy if exists atlas3d_markers_update_own_draft on public.atlas3d_markers;
drop policy if exists atlas3d_markers_update_own on public.atlas3d_markers;
create policy atlas3d_markers_update_own
  on public.atlas3d_markers for update
  to authenticated
  using (
    authored_by = auth.uid()
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('supervisor', 'director')
    )
  )
  -- Authorship cannot be reassigned: a row must still be the author's own
  -- after the update, so nobody can hand their marker to someone else or
  -- claim another author's row by rewriting the column.
  with check (
    authored_by = auth.uid()
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('supervisor', 'director')
    )
  );

-- 0011 defined no DELETE policy for supervisors, so the panel's Delete button
-- matched zero rows and returned no error — it looked like it worked and the
-- marker came back on reload. Someone who may publish their own marker may
-- certainly remove it.
drop policy if exists atlas3d_markers_delete_own on public.atlas3d_markers;
create policy atlas3d_markers_delete_own
  on public.atlas3d_markers for delete
  to authenticated
  using (
    authored_by = auth.uid()
    and exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('supervisor', 'director')
    )
  );

comment on table public.atlas3d_markers is
  'Needle-EMG and NCS electrode markers. Fellows see approved markers only. '
  'Supervisors and directors author; a supervisor may publish, edit and remove '
  'their own markers, and a director may do so for anyone''s.';
