-- Fellows pick a supervisor per case; that supervisor (and only they) can see
-- the case and leave feedback the fellow can read.
--
--   * cases.supervisor_id is the supervisor<->case link. Faculty read is
--     retargeted from "any shared case" to "cases where I am the supervisor".
--   * case_feedback: the linked supervisor writes; the owning fellow and that
--     supervisor read.
--   * list_supervisors() lets fellows populate the "share with" dropdown.
--   * supervisor_shared_cases() returns a supervisor's shared cases with the
--     fellow's name for the faculty list.

alter table cases add column if not exists supervisor_id uuid references users(id) on delete set null;
create index if not exists cases_supervisor_idx on cases(supervisor_id);

drop policy if exists cases_clinical_read_shared on cases;
create policy cases_supervisor_linked_read on cases for select
  using (
    current_app_role() = any (array['supervisor'::user_role, 'director'::user_role])
    and supervisor_id = auth.uid()
  );

drop policy if exists case_feedback_read on case_feedback;
drop policy if exists case_feedback_write on case_feedback;

create policy case_feedback_read on case_feedback for select
  using (exists (
    select 1 from cases c
    where c.id = case_feedback.case_id
      and (
        (current_app_role() = 'fellow'::user_role and c.fellow_id = auth.uid())
        or (current_app_role() = any (array['supervisor'::user_role, 'director'::user_role]) and c.supervisor_id = auth.uid())
      )
  ));

create policy case_feedback_write on case_feedback for insert
  with check (
    current_app_role() = any (array['supervisor'::user_role, 'director'::user_role])
    and author_id = auth.uid()
    and exists (select 1 from cases c where c.id = case_feedback.case_id and c.supervisor_id = auth.uid())
  );

create or replace function public.list_supervisors()
returns table(id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select u.id, u.full_name
  from public.users u
  where u.role in ('supervisor', 'director') and u.status = 'active'
  order by u.full_name;
$$;
revoke all on function public.list_supervisors() from public;
grant execute on function public.list_supervisors() to authenticated;

create or replace function public.supervisor_shared_cases()
returns table(
  id uuid, fellow_id uuid, fellow_name text, case_date date, title text,
  nerves_tested jsonb, muscles_tested jsonb, diagnoses jsonb, summary text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, c.fellow_id, f.full_name, c.case_date, c.title,
         c.nerves_tested, c.muscles_tested, c.diagnoses, c.summary, c.created_at
  from public.cases c
  join public.users f on f.id = c.fellow_id
  where c.supervisor_id = auth.uid()
    and (select u.role from public.users u where u.id = auth.uid()) in ('supervisor', 'director')
  order by c.created_at desc;
$$;
revoke all on function public.supervisor_shared_cases() from public;
grant execute on function public.supervisor_shared_cases() to authenticated;
