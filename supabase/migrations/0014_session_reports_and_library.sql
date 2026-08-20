-- Post-session loop + the resource library.
--
-- Three things land here:
--
--   1. A session report the teacher fills in after teaching: which fellows
--      were there, what was actually covered, what gaps showed up, and what
--      should be taught next. Requested by email the morning after.
--
--   2. A feedback request to every active fellow the morning after a session,
--      pointing at Rate Teaching, which now also asks what they want taught.
--      Deliberately NOT limited to fellows marked present: attendance is often
--      recorded late or not at all, and a request that silently never sends is
--      worse than one an absent fellow ignores.
--
--   3. library_documents — a shelf of reference PDFs the director uploads and
--      everyone signed in can download through short-lived signed URLs.
--
-- Both emails ride the existing rails: enqueue_teaching_reminders() runs at
-- 13:00 UTC daily (cron job "teaching-reminders-daily"), enqueue_email is
-- idempotent on ref_key, and email-dispatch drains the queue every 15 min.

-- ---------------------------------------------------------------------------
-- 1. Session report columns
-- ---------------------------------------------------------------------------

alter table public.teaching_sessions
  add column if not exists topics_covered      text,
  add column if not exists learning_gaps       text,
  add column if not exists suggested_topics    text,
  add column if not exists report_submitted_at timestamptz,
  add column if not exists report_requested    boolean not null default false,
  add column if not exists feedback_requested  boolean not null default false;

comment on column public.teaching_sessions.topics_covered is
  'What the teacher actually covered, entered by them after the session.';
comment on column public.teaching_sessions.learning_gaps is
  'Learning gaps the teacher noticed in the fellows during the session.';
comment on column public.teaching_sessions.suggested_topics is
  'Topics the teacher suggests for future sessions, usually flowing from the gaps above.';
comment on column public.teaching_sessions.report_requested is
  'The morning-after report request has been queued for the teacher. Mirrors reminded_week/reminded_day.';
comment on column public.teaching_sessions.feedback_requested is
  'The morning-after feedback request has been queued for the fellows.';

-- ---------------------------------------------------------------------------
-- 2. submit_session_report — the teacher's side of the loop
-- ---------------------------------------------------------------------------
-- Authorized through acts_for(), so an administrative assistant linked to the
-- teacher can file it on their behalf, exactly like confirm_teaching. Filing a
-- report also marks the session delivered: you cannot report on a session that
-- did not happen, and this saves the teacher a second click.
--
-- Submitting emails the fellowship director a copy, so suggested topics and
-- observed gaps reach the person who builds next year's curriculum instead of
-- sitting in a column nobody reads.

create or replace function public.submit_session_report(
  p_session   uuid,
  p_topics    text,
  p_gaps      text,
  p_suggested text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  d record;
  portal text;
  tname text;
  first_submission boolean;
begin
  select * into s from public.teaching_sessions where id = p_session;
  if s.id is null then raise exception 'session not found'; end if;

  if not (public.acts_for(s.provider_id) or public.is_director_or_admin()) then
    raise exception 'not authorized to file a report for this session';
  end if;

  first_submission := s.report_submitted_at is null;

  update public.teaching_sessions
  set topics_covered      = nullif(btrim(coalesce(p_topics, '')), ''),
      learning_gaps       = nullif(btrim(coalesce(p_gaps, '')), ''),
      suggested_topics    = nullif(btrim(coalesce(p_suggested, '')), ''),
      report_submitted_at = coalesce(report_submitted_at, now()),
      delivered_at        = coalesce(delivered_at, now()),
      delivered_by        = coalesce(delivered_by, auth.uid()),
      updated_at          = now()
  where id = p_session;

  -- Only the first submission notifies; later edits are silent so the director
  -- is not pinged every time a teacher fixes a typo.
  if not first_submission then return; end if;

  select value #>> '{}' into portal from public.app_settings where key = 'portal_url';
  select coalesce(u.full_name, s.provider_name) into tname
  from public.users u where u.id = s.provider_id;

  for d in
    select id, email, full_name from public.users
    where role = 'director' and status = 'active' and email is not null
  loop
    perform public.enqueue_email(
      'sessrepdir-' || p_session || '-' || d.id,
      d.email,
      'Session report: ' || coalesce(s.topic, 'teaching session') || ' — ' || to_char(s.session_date, 'FMMon DD, YYYY'),
      '<p>Hi ' || coalesce(d.full_name, 'there') || ',</p>' ||
      '<p><strong>' || coalesce(tname, s.provider_name, 'The teacher') || '</strong> has filed a report for <strong>' ||
        coalesce(s.topic, 'a session') || '</strong> on ' || to_char(s.session_date, 'FMDay, Mon DD, YYYY') || '.</p>' ||
      '<p><strong>Topics discussed</strong><br>' ||
        coalesce(replace(nullif(btrim(coalesce(p_topics, '')), ''), E'\n', '<br>'), '<em>Not provided</em>') || '</p>' ||
      '<p><strong>Learning gaps identified</strong><br>' ||
        coalesce(replace(nullif(btrim(coalesce(p_gaps, '')), ''), E'\n', '<br>'), '<em>Not provided</em>') || '</p>' ||
      '<p><strong>Suggested topics for future sessions</strong><br>' ||
        coalesce(replace(nullif(btrim(coalesce(p_suggested, '')), ''), E'\n', '<br>'), '<em>Not provided</em>') || '</p>' ||
      '<p><a href="' || coalesce(portal, '') || '/my-teaching">Open the session in the portal</a></p>'
    );
  end loop;
end;
$function$;

revoke all on function public.submit_session_report(uuid, text, text, text) from public, anon;
grant execute on function public.submit_session_report(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fellows' suggested topics on the feedback form
-- ---------------------------------------------------------------------------

alter table public.teaching_feedback
  add column if not exists suggested_topics text;

comment on column public.teaching_feedback.suggested_topics is
  'Topics this fellow would like taught in future sessions. Shown to the teacher without a name, and to the director with one.';

-- provider_session_feedback gains a column, so it has to be dropped and
-- recreated rather than replaced. Same authorization as before: the session's
-- own teacher, or the director.
drop function if exists public.provider_session_feedback(uuid);

create function public.provider_session_feedback(p_session uuid)
returns table(rating smallint, comments text, suggested_topics text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(
    (select ts.provider_id = auth.uid()
       or exists (select 1 from public.users u
                  where u.id = auth.uid() and u.role = 'director')
     from public.teaching_sessions ts
     where ts.id = p_session),
    false
  ) then
    raise exception 'not authorized for this session''s feedback';
  end if;

  return query
    select tf.rating, tf.comments, tf.suggested_topics, tf.created_at
    from public.teaching_feedback tf
    where tf.session_id = p_session
    order by tf.created_at;
end;
$function$;

revoke all on function public.provider_session_feedback(uuid) from public, anon;
grant execute on function public.provider_session_feedback(uuid) to authenticated;

-- Everything the fellows have asked to be taught, newest first, for the
-- director's curriculum planning. Director/admin only — these carry names.
create or replace function public.topic_requests(p_limit int default 100)
returns table(
  session_id uuid,
  session_date date,
  topic text,
  fellow_name text,
  suggested_topics text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_director_or_admin() then
    raise exception 'not authorized to view topic requests';
  end if;

  return query
    select tf.session_id, ts.session_date, ts.topic, u.full_name,
           tf.suggested_topics, tf.created_at
    from public.teaching_feedback tf
    join public.teaching_sessions ts on ts.id = tf.session_id
    left join public.users u on u.id = tf.fellow_id
    where tf.suggested_topics is not null and btrim(tf.suggested_topics) <> ''
    order by tf.created_at desc
    limit greatest(coalesce(p_limit, 100), 1);
end;
$function$;

revoke all on function public.topic_requests(int) from public, anon;
grant execute on function public.topic_requests(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The two morning-after emails
-- ---------------------------------------------------------------------------
-- Appended as sections 3 and 4 of the existing daily job. Sections 1 and 2
-- (presenter reminder, Journal Club announcement) are carried over verbatim.

create or replace function public.enqueue_teaching_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record; r record; c record;
  portal text; zlink text; zpass text; zid text;
  n int := 0; pname text; cadence text;
  jc_subject text; jc_body text;
  fb_subject text; fb_body text;
begin
  select value #>> '{}' into portal from public.app_settings where key = 'portal_url';
  select value #>> '{}' into zlink from public.app_settings where key = 'zoom_link';
  select value #>> '{}' into zpass from public.app_settings where key = 'zoom_passcode';
  select value #>> '{}' into zid   from public.app_settings where key = 'zoom_meeting_id';

  -- 1) Presenter reminder (unchanged): the assigned teacher confirms / flags.
  for s in
    select ts.*, (ts.session_date - current_date) as days_out
    from public.teaching_sessions ts
    where ts.is_break = false and ts.assignment_draft = false
      and ts.status <> 'cancelled'
      and ts.provider_id is not null
      and ts.session_date in (current_date + 7, current_date + 1)
      and ((ts.session_date = current_date + 7 and ts.reminded_week = false)
        or (ts.session_date = current_date + 1 and ts.reminded_day = false))
  loop
    select full_name into pname from public.users where id = s.provider_id;
    perform public.enqueue_email(
      'teachrem-' || s.id || '-' || (case when s.days_out = 7 then 'w' else 'd' end),
      (select email from public.users where id = s.provider_id),
      'Teaching reminder: ' || coalesce(s.topic, 'session') || ' on ' || to_char(s.session_date, 'FMDay, Mon DD'),
      '<p>Hi ' || coalesce(pname, 'there') || ',</p>' ||
      '<p>This is a reminder that <strong>' || coalesce(pname, 'the provider') || '</strong> is scheduled to teach <strong>' || coalesce(s.topic, 'a session') || '</strong>.</p>' ||
      '<p><strong>Date:</strong> ' || to_char(s.session_date, 'FMDay, Mon DD, YYYY') || '<br>' ||
      '<strong>Time:</strong> ' || to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI') || '<br>' ||
      '<strong>Zoom:</strong> <a href="' || coalesce(zlink, '') || '">Join here</a><br>' ||
      '<strong>Meeting ID:</strong> ' || coalesce(zid, '') || '<br>' ||
      '<strong>Passcode:</strong> ' || coalesce(zpass, '') || '</p>' ||
      '<p>Please <a href="' || coalesce(portal, '') || '/my-teaching">confirm this session in the portal</a>, or flag a conflict there if it needs to be covered or rescheduled.</p>'
    );
    if s.days_out = 7 then update public.teaching_sessions set reminded_week = true where id = s.id;
    else update public.teaching_sessions set reminded_day = true where id = s.id; end if;
    n := n + 1;
  end loop;

  -- 2) Journal Club: notify every active fellow / supervisor / director, plus the
  --    teaching CC mailing list, one week and one day before. Matched by topic,
  --    so no special record type is needed.
  for s in
    select ts.*, (ts.session_date - current_date) as days_out
    from public.teaching_sessions ts
    where ts.is_break = false and ts.assignment_draft = false
      and ts.status <> 'cancelled'
      and ts.topic ilike '%journal club%'
      and ts.session_date in (current_date + 7, current_date + 1)
  loop
    cadence := case when s.days_out = 7 then 'w' else 'd' end;
    select full_name into pname from public.users where id = s.provider_id;

    jc_subject := 'Journal Club — ' || to_char(s.session_date, 'FMDay, Mon DD')
      || (case when s.days_out = 1 then ' (tomorrow)' else '' end);

    jc_body :=
      '<p>This is a reminder that <strong>Journal Club</strong> is coming up'
        || (case when s.days_out = 1 then ' <strong>tomorrow</strong>' else ' in one week' end) || '.</p>' ||
      (case when pname is not null then '<p><strong>Presenter:</strong> ' || pname || '</p>' else '' end) ||
      '<p><strong>Date:</strong> ' || to_char(s.session_date, 'FMDay, Mon DD, YYYY') || '<br>' ||
      '<strong>Time:</strong> ' || to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI') || '<br>' ||
      '<strong>Zoom:</strong> <a href="' || coalesce(zlink, '') || '">Join here</a><br>' ||
      '<strong>Meeting ID:</strong> ' || coalesce(zid, '') || '<br>' ||
      '<strong>Passcode:</strong> ' || coalesce(zpass, '') || '</p>' ||
      '<p>See the <a href="' || coalesce(portal, '') || '/teaching">teaching schedule</a> for details.</p>';

    -- 2a) Portal users by role.
    for r in
      select id, email, full_name from public.users
      where role in ('fellow', 'supervisor', 'director') and status = 'active' and email is not null
    loop
      perform public.enqueue_email(
        'jcann-' || s.id || '-' || cadence || '-' || r.id,
        r.email,
        jc_subject,
        '<p>Hi ' || coalesce(r.full_name, 'there') || ',</p>' || jc_body
      );
      n := n + 1;
    end loop;

    -- 2b) Teaching CC mailing list, skipping anyone already emailed above.
    for c in
      select distinct lower(trim(addr)) as email
      from public.app_settings st,
           lateral jsonb_array_elements_text(st.value) as addr
      where st.key = 'teaching_cc_emails'
        and jsonb_typeof(st.value) = 'array'
        and trim(addr) <> ''
        and lower(trim(addr)) not in (
          select lower(u.email) from public.users u
          where u.role in ('fellow', 'supervisor', 'director')
            and u.status = 'active' and u.email is not null
        )
    loop
      perform public.enqueue_email(
        'jccc-' || s.id || '-' || cadence || '-' || md5(c.email),
        c.email,
        jc_subject,
        '<p>Hi there,</p>' || jc_body
      );
      n := n + 1;
    end loop;
  end loop;

  -- 3) Morning after: ask the teacher for the session report. Only sessions
  --    with a portal account behind them — a name-only guest teacher has no
  --    inbox we know and no page to land on.
  for s in
    select ts.*
    from public.teaching_sessions ts
    where ts.is_break = false and ts.assignment_draft = false
      and ts.status <> 'cancelled'
      and ts.provider_id is not null
      and ts.session_date = current_date - 1
      and ts.report_requested = false
      and ts.report_submitted_at is null
  loop
    select full_name into pname from public.users where id = s.provider_id;
    perform public.enqueue_email(
      'sessrep-' || s.id,
      (select email from public.users where id = s.provider_id),
      'Session report: ' || coalesce(s.topic, 'teaching session') || ' — ' || to_char(s.session_date, 'FMMon DD'),
      '<p>Hi ' || coalesce(pname, 'there') || ',</p>' ||
      '<p>Thank you for teaching <strong>' || coalesce(s.topic, 'yesterday''s session') || '</strong> on ' ||
        to_char(s.session_date, 'FMDay, Mon DD, YYYY') || '.</p>' ||
      '<p>When you have a moment, please open the session in the portal and complete the short report:</p>' ||
      '<ul>' ||
      '<li>Confirm which fellows attended</li>' ||
      '<li>Record the topics you discussed</li>' ||
      '<li>Note any learning gaps you identified, and suggest topics for future sessions</li>' ||
      '</ul>' ||
      '<p><a href="' || coalesce(portal, '') || '/my-teaching">Complete the session report</a></p>' ||
      '<p>This takes about a minute and feeds directly into curriculum planning. Once filed, you can also ' ||
      'download a teaching completion letter for your CPD records from the same page.</p>'
    );
    update public.teaching_sessions set report_requested = true where id = s.id;
    n := n + 1;
  end loop;

  -- 4) Morning after: ask every active fellow to rate the session and say what
  --    they want taught next. Sent to the whole roster on purpose — attendance
  --    is frequently marked late, and gating on it would drop the request.
  for s in
    select ts.*
    from public.teaching_sessions ts
    where ts.is_break = false and ts.assignment_draft = false
      and ts.status <> 'cancelled'
      and ts.session_date = current_date - 1
      and ts.feedback_requested = false
      and (ts.provider_id is not null or ts.provider_name is not null)
  loop
    select coalesce(u.full_name, s.provider_name) into pname
    from public.users u where u.id = s.provider_id;
    pname := coalesce(pname, s.provider_name);

    fb_subject := 'Your feedback: ' || coalesce(s.topic, 'teaching session') || ' — ' || to_char(s.session_date, 'FMMon DD');

    fb_body :=
      '<p>Yesterday''s teaching session was <strong>' || coalesce(s.topic, 'a didactic session') || '</strong>' ||
        (case when pname is not null then ', taught by <strong>' || pname || '</strong>' else '' end) || '.</p>' ||
      '<p>Please take a minute to rate it and tell us what you would like covered in future sessions.</p>' ||
      '<p><a href="' || coalesce(portal, '') || '/rate-teaching">Give feedback</a></p>' ||
      '<p>Ratings and comments are shown to the teacher <strong>without your name</strong>; only the fellowship ' ||
      'director can see who submitted what. If you were not at this session, you can ignore this email.</p>';

    for r in
      select id, email, full_name from public.users
      where role = 'fellow' and status = 'active' and email is not null
    loop
      perform public.enqueue_email(
        'sesfb-' || s.id || '-' || r.id,
        r.email,
        fb_subject,
        '<p>Hi ' || coalesce(r.full_name, 'there') || ',</p>' || fb_body
      );
      n := n + 1;
    end loop;

    update public.teaching_sessions set feedback_requested = true where id = s.id;
  end loop;

  return n;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Resource library
-- ---------------------------------------------------------------------------
-- Reference PDFs the director uploads. The bucket is PRIVATE: nothing is
-- reachable without a signed URL minted for a signed-in user, and there is no
-- public path to any file. Uploading is director/admin only; downloading is
-- open to any active portal account (fellows, supervisors, the director).

create table if not exists public.library_documents (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  authors      text,
  category     text,
  edition      text,
  description  text,
  file_name    text not null,
  storage_path text not null unique,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.library_documents is
  'Reference texts and documents on the fellowship shelf. Files live in the private "library" storage bucket.';

create index if not exists library_documents_category_idx on public.library_documents (category, title);

alter table public.library_documents enable row level security;

drop policy if exists library_read on public.library_documents;
create policy library_read on public.library_documents
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists library_manage on public.library_documents;
create policy library_manage on public.library_documents
  for all to authenticated
  using (public.is_director_or_admin())
  with check (public.is_director_or_admin());

grant select on public.library_documents to authenticated;
grant insert, update, delete on public.library_documents to authenticated;

-- Private bucket, 200 MB per file to match teaching-cases.
insert into storage.buckets (id, name, public, file_size_limit)
values ('library', 'library', false, 209715200)
on conflict (id) do update set public = false, file_size_limit = 209715200;

drop policy if exists library_files_select on storage.objects;
create policy library_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'library' and auth.uid() is not null);

drop policy if exists library_files_insert on storage.objects;
create policy library_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'library' and public.is_director_or_admin());

drop policy if exists library_files_update on storage.objects;
create policy library_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'library' and public.is_director_or_admin());

drop policy if exists library_files_delete on storage.objects;
create policy library_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'library' and public.is_director_or_admin());
