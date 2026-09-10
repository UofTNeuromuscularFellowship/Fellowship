-- 0025 — Remove every policy's direct dependency on auth.uid().
--
-- Found auditing 0024. SECURITY DEFINER functions now run as app_definer, and
-- RLS policy expressions are evaluated as the *calling* role. app_definer has
-- EXECUTE on auth.uid() but cannot get USAGE on the auth schema: that schema
-- is owned by supabase_admin and postgres holds USAGE *without* grant option,
-- so "grant usage on schema auth to app_definer" reports success and does
-- nothing. Calling auth.uid() as app_definer therefore raises
-- "permission denied for schema auth".
--
-- Until now that never fired only because each table also carries the
-- permissive "<table>_app_definer_all USING (true)" policy and the planner
-- short-circuited the OR before reaching auth.uid(). Evaluation order is not
-- contractual: a different plan would have failed at runtime, in production,
-- on a write path such as decide_vacation() or set_clinic_cell().
--
-- public.current_uid() is a postgres-owned SECURITY DEFINER wrapper returning
-- auth.uid(), executable by every role, so policy evaluation is correct for
-- all roles regardless of plan shape.
--
-- 82 policies were rewritten. WRITE NEW POLICIES WITH public.current_uid().
do $$
declare p record; sql text; n int := 0; left_over int;
begin
  for p in
    select tablename, policyname, cmd, permissive, roles, qual, with_check
    from pg_policies
    where schemaname='public'
      and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    sql := format('create policy %I on public.%I as %s for %s to %s',
                  p.policyname, p.tablename,
                  case when p.permissive = 'RESTRICTIVE' then 'restrictive' else 'permissive' end,
                  lower(p.cmd), array_to_string(p.roles, ', '));
    if p.qual is not null and p.cmd <> 'INSERT' then
      sql := sql || ' using (' || replace(p.qual, 'auth.uid()', 'public.current_uid()') || ')';
    end if;
    if p.with_check is not null then
      sql := sql || ' with check (' || replace(p.with_check, 'auth.uid()', 'public.current_uid()') || ')';
    end if;
    execute sql;
    n := n + 1;
  end loop;
  select count(*) into left_over from pg_policies
   where schemaname='public' and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%');
  if left_over <> 0 then raise exception 'aborting: % policies still reference auth.uid()', left_over; end if;
  raise notice 'rewrote % policies to public.current_uid()', n;
end $$;

comment on function public.current_uid() is
  'auth.uid() wrapper, owned by postgres. USE THIS IN RLS POLICIES INSTEAD OF auth.uid(): policies are evaluated as the calling role, and SECURITY DEFINER functions run as app_definer, which cannot resolve the auth schema.';
