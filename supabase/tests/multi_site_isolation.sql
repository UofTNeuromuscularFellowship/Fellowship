-- Isolation assertions for the multi-site schema. Run in ONE statement via the
-- SQL editor or MCP: everything it creates is rolled back because it ends by
-- raising. Expect the error text 'ALL ASSERTIONS PASSED'. Any 'FAIL ...' is a real problem.


-- ===================== DRY RUN ASSERTIONS =====================
do $$
declare
  toronto uuid := '00000000-0000-4000-8000-000000000001';
  siteb uuid;
  ub uuid := gen_random_uuid();
  padmin uuid := gen_random_uuid();
  director uuid := 'cea2dffc-dc46-4401-865f-795a1a3bfd54';   -- Aaron
  fellow uuid := 'd15c6edc-a0b7-4138-94da-f936a82c268b';     -- Manal
  n int; t text; r record;
  claims text;
begin
  insert into public.sites (slug, name) values ('testb', 'Test Program B') returning id into siteb;
  insert into public.site_tools (site_id, tool_key, enabled) values (siteb, 'atlas-3d', true), (siteb, 'test-directory', false);

  -- A brand new account at site B, created the way GoTrue would.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  values (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fellow-b@example.org', 'x',
          jsonb_build_object('full_name','Fellow B','role','fellow','site_id', siteb::text), '{"provider":"email","providers":["email"]}', now(), now(), now());
  -- A platform admin who is a member of nothing.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, email_confirmed_at)
  values (padmin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'padmin@example.org', 'x',
          jsonb_build_object('full_name','Platform Admin','role','fellow','site_id', siteb::text), '{"provider":"email","providers":["email"]}', now(), now(), now());
  delete from public.site_memberships where user_id = padmin;
  update public.users set active_site_id = null where id = padmin;
  insert into public.platform_admins (user_id) values (padmin);

  -- Sanity: trigger created the membership and mirrored the role.
  select count(*) into n from public.site_memberships where user_id = ub and site_id = siteb and role = 'fellow';
  if n <> 1 then raise exception 'FAIL membership for new user: %', n; end if;
  select role::text into t from public.users where id = ub;
  if t <> 'fellow' then raise exception 'FAIL mirrored role %', t; end if;

  -- Aaron is also made a supervisor at site B (dual membership, different role).
  insert into public.site_memberships (site_id, user_id, role) values (siteb, director, 'director');

  -- ---------- as the Toronto director ----------
  perform set_config('request.jwt.claims', json_build_object('sub', director, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if public.current_app_role() <> 'director' then raise exception 'FAIL director role: %', public.current_app_role(); end if;
  select count(*) into n from public.users; if n < 10 then raise exception 'FAIL director sees users %', n; end if;
  select count(*) into n from public.users where id = ub; if n <> 0 then raise exception 'FAIL director sees site B user'; end if;
  select count(*) into n from public.list_supervisors(); if n < 5 then raise exception 'FAIL list_supervisors %', n; end if;
  select count(*) into n from public.site_users where role = 'supervisor'; if n < 5 then raise exception 'FAIL site_users %', n; end if;
  select count(*) into n from public.teaching_sessions; if n < 40 then raise exception 'FAIL director sessions %', n; end if;
  select count(*) into n from public.app_settings where key = 'portal_url'; if n <> 1 then raise exception 'FAIL platform setting visible %', n; end if;
  select count(*) into n from public.app_settings where key = 'zoom_link'; if n <> 1 then raise exception 'FAIL site setting visible %', n; end if;
  select count(*) into n from public.away_people(); if n < 5 then raise exception 'FAIL away_people %', n; end if;
  select count(*) into n from public.my_sites(); if n <> 2 then raise exception 'FAIL my_sites director %', n; end if;
  -- switch Aaron to site B: he is a supervisor there and sees nothing of Toronto
  perform public.set_active_site(siteb);
  if public.current_app_role() <> 'director' then raise exception 'FAIL role at B: %', public.current_app_role(); end if;
  select count(*) into n from public.teaching_sessions; if n <> 0 then raise exception 'FAIL leak sessions to B %', n; end if;
  select count(*) into n from public.cases; if n <> 0 then raise exception 'FAIL leak cases to B %', n; end if;
  select count(*) into n from public.provider_away_dates; if n <> 0 then raise exception 'FAIL leak away dates to B %', n; end if;
  select count(*) into n from public.list_supervisors(); if n <> 1 then raise exception 'FAIL list_supervisors at B %', n; end if;
  select count(*) into n from public.users; if n <> 2 then raise exception 'FAIL users at B %', n; end if;
  select count(*) into n from public.neuro_test_directory; if n <> 0 then raise exception 'FAIL tool gate test-directory %', n; end if;
  select count(*) into n from public.atlas3d_markers; if n = 0 then raise exception 'FAIL tool gate atlas %', n; end if;
  select count(*) into n from public.app_settings; if n <> 7 then raise exception 'FAIL platform settings at B %', n; end if;
  -- writes land in site B
  insert into public.teaching_sessions (session_date, topic) values (current_date + 30, 'B session');
  select site_id into siteb from public.teaching_sessions where topic = 'B session';
  if siteb is null then raise exception 'FAIL site_id default'; end if;
  perform public.set_active_site(toronto);
  execute 'reset role';

  -- ---------- as the site B fellow ----------
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.teaching_sessions; if n <> 1 then raise exception 'FAIL fellow B sessions %', n; end if;
  select count(*) into n from public.users; if n <> 1 then raise exception 'FAIL fellow B users %', n; end if;
  select count(*) into n from public.cases; if n <> 0 then raise exception 'FAIL fellow B cases %', n; end if;
  select count(*) into n from public.competency_targets; if n <> 0 then raise exception 'FAIL fellow B targets %', n; end if;
  select count(*) into n from public.handbook_pages; if n <> 0 then raise exception 'FAIL fellow B handbook %', n; end if;
  select count(*) into n from public.library_documents; if n <> 0 then raise exception 'FAIL fellow B library %', n; end if;
  select count(*) into n from public.case_media; if n <> 0 then raise exception 'FAIL fellow B media %', n; end if;
  select count(*) into n from public.list_supervisors(); if n <> 1 then raise exception 'FAIL fellow B list_supervisors %', n; end if;
  select count(*) into n from public.profile_names(array[fellow]); if n <> 0 then raise exception 'FAIL profile_names leak %', n; end if;
  begin
    perform public.set_active_site(toronto);
    raise exception 'FAIL fellow B could switch to Toronto';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- a fellow's own case insert works and is stamped
  insert into public.cases (fellow_id, case_date, title) values (ub, current_date, 'B case');
  execute 'reset role';

  -- ---------- as the platform admin ----------
  perform set_config('request.jwt.claims', json_build_object('sub', padmin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not public.is_platform_admin() then raise exception 'FAIL is_platform_admin'; end if;
  if public.current_app_role() is not null then raise exception 'FAIL platform admin has a site role'; end if;
  select count(*) into n from public.cases; if n <> 0 then raise exception 'FAIL platform admin sees cases %', n; end if;
  select count(*) into n from public.teaching_sessions; if n <> 0 then raise exception 'FAIL platform admin sees sessions %', n; end if;
  select count(*) into n from public.case_feedback; if n <> 0 then raise exception 'FAIL platform admin sees feedback %', n; end if;
  select count(*) into n from public.users; if n <> 1 then raise exception 'FAIL platform admin sees users %', n; end if;
  select count(*) into n from public.sites where status = 'active'; if n <> 2 then raise exception 'FAIL platform admin sites %', n; end if;
  select count(*) into n from public.platform_site_directors(); if n < 1 then raise exception 'FAIL platform_site_directors'; end if;
  insert into public.sites (slug, name) values ('testc', 'Test C');
  update public.site_tools set enabled = false where tool_key = 'ultrasound';
  select count(*) into n from public.list_supervisors(); if n <> 0 then raise exception 'FAIL platform admin list_supervisors %', n; end if;
  execute 'reset role';

  -- ---------- as the Toronto fellow (regression) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', fellow, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.teaching_sessions; if n < 40 then raise exception 'FAIL toronto fellow sessions %', n; end if;
  select count(*) into n from public.cases where fellow_id = fellow; if n = 0 then raise exception 'FAIL toronto fellow own cases'; end if;
  select count(*) into n from public.list_supervisors(); if n < 5 then raise exception 'FAIL toronto fellow list_supervisors %', n; end if;
  select count(*) into n from public.my_sites(); if n <> 1 then raise exception 'FAIL my_sites fellow %', n; end if;
  select count(*) into n from public.competency_targets; if n = 0 then raise exception 'FAIL toronto fellow targets'; end if;
  select count(*) into n from public.site_users; if n <> 1 then raise exception 'FAIL site_users for fellow %', n; end if;
  -- cannot promote self
  update public.users set role = 'director' where id = fellow;
  select role::text into t from public.users where id = fellow; if t <> 'fellow' then raise exception 'FAIL self-promotion %', t; end if;
  execute 'reset role';

  -- ---------- cron context ----------
  perform set_config('request.jwt.claims', '', true);
  select public.enqueue_teaching_reminders_all_sites(false) into n;

  -- ---------- anon ----------
  execute 'set local role anon';
  select count(*) into n from public.list_sites(); if n < 2 then raise exception 'FAIL anon list_sites %', n; end if;
  select count(*) into n from public.teaching_sessions; if n <> 0 then raise exception 'FAIL anon sessions %', n; end if;
  execute 'reset role';

  raise exception 'ALL ASSERTIONS PASSED (rolled back on purpose)';
end $$;


-- ===================================================================
-- Shared-content write protection (added after the 0024 audit).
-- Run this block the same way: it ends by raising, so it rolls back.
-- ===================================================================
do $$
declare
  toronto uuid := '00000000-0000-4000-8000-000000000001';
  siteb uuid; director uuid := 'cea2dffc-dc46-4401-865f-795a1a3bfd54'; n int;
begin
  insert into public.sites (slug, name) values ('sharedtest', 'Shared Write Test') returning id into siteb;
  insert into public.site_tools (site_id, tool_key, enabled) values (siteb,'atlas-3d',true);
  insert into public.site_memberships (site_id, user_id, role) values (siteb, director, 'director');

  perform set_config('request.jwt.claims', json_build_object('sub',director,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_active_site(siteb);

  -- shared content is readable...
  select count(*) into n from public.atlas3d_markers;
  if n = 0 then raise exception 'FAIL atlas is not shared across programmes'; end if;

  -- ...but another programme cannot change it
  update public.atlas3d_markers set label = 'HIJACKED'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL cross-site write to atlas3d_markers (% rows)', n; end if;
  delete from public.atlas3d_markers; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL cross-site delete of atlas3d_markers (% rows)', n; end if;
  update public.publications set title = 'HIJACKED'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL cross-site write to publications (% rows)', n; end if;
  update public.case_finding set label = 'HIJACKED'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL cross-site write to case_finding (% rows)', n; end if;
  update public.gene_search_terms set full_name = 'HIJACKED'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL cross-site write to gene_search_terms (% rows)', n; end if;
  select count(*) into n from public.digest_settings;
  if n <> 0 then raise exception 'FAIL cross-site read of digest_settings (% rows)', n; end if;

  perform public.set_active_site(toronto);
  -- the owning programme can still edit its own markers
  update public.atlas3d_markers set updated_at = now(); get diagnostics n = row_count;
  if n = 0 then raise exception 'FAIL owning programme cannot edit its own atlas markers'; end if;
  execute 'reset role';

  -- ordinary users must not be able to send mail through the RPC surface
  begin
    execute 'set local role authenticated';
    perform public.enqueue_email('probe','a@b.c','x','y');
    execute 'reset role';
    raise exception 'FAIL enqueue_email is callable by signed-in users';
  exception when insufficient_privilege then execute 'reset role';
    when others then if sqlerrm like 'FAIL%' then raise; end if; execute 'reset role';
  end;

  raise exception 'SHARED-CONTENT ASSERTIONS PASSED (rolled back on purpose)';
end $$;
