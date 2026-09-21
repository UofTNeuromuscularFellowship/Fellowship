-- ===========================================================================
-- 0033  Conference accounts, editable invitations, messages to attendees
--
--   1. New accounts no longer join a program by default, and a program role
--      can only come from app_metadata (which only the service role can
--      write). Before this, handle_new_user took role and program from
--      user_metadata - the part of a sign-up the person filling it in
--      controls - and put anyone with no program into Toronto as a fellow.
--   2. A person can only open a program they actually belong to. Directors
--      were exempt from the check on users.active_site_id, and nobody was
--      checked at all on a direct update of that column.
--   3. Attendee accounts: accepting an invitation creates (or signs in to) an
--      account, and joining details, slides, feedback and letters are then
--      shown only to that account. Someone who already has a portal account
--      is linked automatically by email.
--   4. The invitation email is editable per event, with preview and a test
--      send to yourself.
--   5. Messages to attendees - now or scheduled - by audience, also shown on
--      each attendee's event page.
--   6. An optional public registration link per event.
-- ===========================================================================

-- ------------------------------ 1. new accounts ----------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);  -- written by the person: name only
  a jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);   -- written by the service role only
  r public.user_role;
  s uuid;
begin
  begin r := coalesce((a->>'role')::public.user_role, 'fellow'); exception when others then r := 'fellow'; end;
  begin s := nullif(a->>'site_id', '')::uuid; exception when others then s := null; end;

  insert into public.users (id, email, full_name, role, cohort_year, must_change_password, active_site_id)
  values (new.id, new.email, coalesce(nullif(trim(m->>'full_name'), ''), split_part(new.email, '@', 1)), r,
          nullif(m->>'cohort_year', ''), coalesce((m->>'must_change_password')::boolean, false), s)
  on conflict (id) do update
    set email = excluded.email, full_name = excluded.full_name,
        cohort_year = excluded.cohort_year, must_change_password = excluded.must_change_password;

  -- A program membership only when the service role said which program. An
  -- account made any other way (a conference attendee, a sign-up) belongs to
  -- no program and can see no program's data.
  if s is not null then
    insert into public.site_memberships (site_id, user_id, role, status)
    values (s, new.id, r, 'active')
    on conflict (site_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();
  end if;
  return new;
end $$;

-- ------------------------- 2. which program is open ------------------------

create or replace function public.guard_users_privileged_columns()
returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  if public.current_uid() is null then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;

  -- Applies to everyone, directors included: current_site_id() comes from this
  -- column, so pointing it at a program you are not in would put that
  -- program's rows inside the site-isolation policy.
  if new.active_site_id is distinct from old.active_site_id and new.active_site_id is not null
     and not exists (select 1 from public.site_memberships m
                      where m.user_id = new.id and m.site_id = new.active_site_id and m.status = 'active') then
    raise exception 'You can only open a program you belong to.' using errcode = 'insufficient_privilege';
  end if;

  if public.is_director_or_admin() then return new; end if;
  if new.email is distinct from old.email
     or new.cohort_year is distinct from old.cohort_year
     or new.duration_years is distinct from old.duration_years
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.teaching_only is distinct from old.teaching_only
     or new.role is distinct from old.role
     or new.status is distinct from old.status then
    raise exception 'These profile fields can only be changed by the fellowship director or an admin.';
  end if;
  return new;
end;
$function$;

-- ------------------------------ 3. schema ----------------------------------

alter table public.conf_invitees
  add column if not exists user_id uuid references auth.users (id) on delete set null;
create index if not exists conf_invitees_user_idx on public.conf_invitees (user_id) where user_id is not null;

alter table public.conf_invitees drop constraint if exists conf_invitees_source_check;
alter table public.conf_invitees add constraint conf_invitees_source_check
  check (source in ('manual', 'csv', 'public'));

alter table public.conf_events
  add column if not exists invite_subject      text,
  add column if not exists invite_message      text,
  add column if not exists public_registration boolean not null default false,
  add column if not exists public_token        text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

create table if not exists public.conf_messages (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null default public.current_site_id() references public.sites (id),
  event_id      uuid not null references public.conf_events (id) on delete cascade,
  subject       text not null check (length(trim(subject)) > 0),
  body          text not null check (length(trim(body)) > 0),
  audience      text not null default 'going'
                check (audience in ('going', 'in_person', 'virtual', 'waitlist', 'pending', 'all')),
  status        text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'cancelled')),
  send_at       timestamptz,
  sent_at       timestamptz,
  recipients    integer,
  show_on_page  boolean not null default true,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint conf_messages_scheduled_has_time check (status <> 'scheduled' or send_at is not null)
);
create index if not exists conf_messages_event_idx on public.conf_messages (event_id);
create index if not exists conf_messages_due_idx on public.conf_messages (send_at) where status = 'scheduled';

alter table public.conf_messages enable row level security;
create policy conf_messages_site_isolation on public.conf_messages as restrictive for all
  using ((site_id = (select public.current_site_id())) or ((select public.current_site_id()) is null and public.current_uid() is null))
  with check ((site_id = (select public.current_site_id())) or ((select public.current_site_id()) is null and public.current_uid() is null));
create policy conf_messages_tool_gate on public.conf_messages as restrictive for all
  using (public.site_tool_enabled('conference')) with check (public.site_tool_enabled('conference'));
create policy conf_messages_manage on public.conf_messages for all to authenticated
  using (public.is_director_or_admin()) with check (public.is_director_or_admin());
create policy conf_messages_app_definer_all on public.conf_messages for all to app_definer using (true) with check (true);
revoke all on public.conf_messages from anon;
grant select, insert, update, delete on public.conf_messages to authenticated;
grant all on public.conf_messages to app_definer;

-- A sent message is a record of what people received.
create or replace function public.conf_messages_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if old.status = 'sent' and (
       new.subject is distinct from old.subject or new.body is distinct from old.body
    or new.audience is distinct from old.audience or new.status is distinct from old.status
    or new.sent_at is distinct from old.sent_at or new.recipients is distinct from old.recipients) then
    raise exception 'A sent message cannot be changed. Send a new one instead.';
  end if;
  return new;
end $$;
drop trigger if exists conf_messages_guard on public.conf_messages;
create trigger conf_messages_guard before update on public.conf_messages
  for each row execute function public.conf_messages_guard();

-- -------------------- helpers that see across programs ----------------------
-- Owned by postgres (BYPASSRLS) and executable only by app_definer, so they
-- can be called from inside the conference functions but not by anyone
-- directly. Each takes a secret (a token) or answers only about the caller.

-- Enter the program a token belongs to, so the site-isolation policy admits
-- that program's rows for the rest of this request - whoever is signed in.
-- Returns whether the invitee's email already has a portal account.
create or replace function public.conf_enter(p_kind text, p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_site uuid; v_exists boolean;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    perform set_config('app.site_id', '', true);
    return null;
  end if;
  if p_kind = 'invitee' then
    select e.site_id, exists (select 1 from public.users u where lower(u.email) = lower(i.email))
      into v_site, v_exists
      from public.conf_invitees i join public.conf_events e on e.id = i.event_id
     where i.token = p_token;
  elsif p_kind = 'speaker' then
    select s.site_id into v_site from public.conf_speakers s where s.token = p_token;
  elsif p_kind = 'public' then
    select e.site_id into v_site from public.conf_events e where e.public_token = p_token;
  end if;
  perform set_config('app.site_id', coalesce(v_site::text, ''), true);
  return v_exists;
end $$;

create or replace function public.conf_user_for_email(p_email text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.users where lower(email) = lower(trim(p_email)) limit 1
$$;

create or replace function public.conf_my_email()
returns text
language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users where id = auth.uid()
$$;

-- Everything the signed-in person is invited to or registered for, in every
-- program. Returns their own private tokens, which is how their pages open.
create or replace function public.conf_my_courses()
returns table (
  token text, event_id uuid, event_name text, starts_on date, ends_on date,
  venue_name text, online boolean, rsvp_status text, waitlist_for text,
  program text, organizer_name text, event_status text, checked_in boolean
)
language sql stable security definer set search_path = public as $$
  select i.token, e.id, e.name, e.starts_on, e.ends_on, e.venue_name, e.zoom_url is not null,
         i.rsvp_status, i.waitlist_for, coalesce(s.short_name, s.name), e.organizer_name, e.status,
         i.checked_in_at is not null
    from public.conf_invitees i
    join public.conf_events e on e.id = i.event_id
    join public.sites s on s.id = e.site_id
   where auth.uid() is not null and i.user_id = auth.uid() and e.status <> 'draft'
   order by e.starts_on desc, e.name
$$;

-- --------------------------- text and email --------------------------------

-- Fill the placeholders a coordinator can use. p_html escapes the values.
create or replace function public.conf_fill(p_text text, p_ev public.conf_events, p_first text, p_html boolean)
returns text
language sql stable set search_path = public as $$
  select replace(replace(replace(p_text,
           '{first_name}', case when p_html then public.conf_esc(coalesce(nullif(p_first, ''), 'there'))
                                 else coalesce(nullif(p_first, ''), 'there') end),
           '{event_name}', case when p_html then public.conf_esc(p_ev.name) else p_ev.name end),
           '{dates}',      public.conf_when(p_ev.starts_on, p_ev.ends_on))
$$;

-- Plain text to paragraphs: a blank line starts a paragraph, a line break
-- stays a line break. Expects text that is already escaped.
create or replace function public.conf_paragraphs(p_escaped text)
returns text
language sql immutable set search_path = public as $$
  select coalesce(string_agg('<p>' || replace(trim(both E'\n ' from para), E'\n', '<br>') || '</p>', ''), '')
    from regexp_split_to_table(replace(coalesce(p_escaped, ''), E'\r', ''), E'\n[ \t]*\n') as para
   where trim(both E'\n \t' from para) <> ''
$$;

create or replace function public.conf_default_invite_message(p_ev public.conf_events)
returns text
language sql stable set search_path = public as $$
  select 'Hi {first_name},' || E'\n\n'
      || 'You are invited to {event_name}.'
      || case when p_ev.description is not null then E'\n\n' || p_ev.description else '' end
      || E'\n\n' || 'Please let us know whether you can join us'
      || case when p_ev.zoom_url is not null and p_ev.venue_name is not null then ', in person or online' else '' end
      || '.'
$$;

-- {subject, html} for one invitation. When and where are always added under
-- the coordinator's message, with the RSVP button and the sender footer.
create or replace function public.conf_invitation_email(
  p_ev public.conf_events, p_first text, p_url text, p_token text
) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_subject text := coalesce(nullif(trim(p_ev.invite_subject), ''), 'You''re invited: {event_name}');
  v_body    text := coalesce(nullif(trim(p_ev.invite_message), ''), public.conf_default_invite_message(p_ev));
begin
  return jsonb_build_object(
    'subject', public.conf_fill(v_subject, p_ev, p_first, false),
    'html', public.conf_email_html(p_ev, 'You''re invited',
      public.conf_paragraphs(public.conf_fill(public.conf_esc(v_body), p_ev, p_first, true))
      || '<p style="background:#F7F8FA;border:1px solid #E2E6EC;border-radius:8px;padding:12px 16px">'
      || '<strong>When:</strong> ' || public.conf_when(p_ev.starts_on, p_ev.ends_on) || '<br>'
      || '<strong>Where:</strong> ' || public.conf_where(p_ev) || '</p>',
      'RSVP', p_url, p_token));
end $$;

create or replace function public.conf_message_email(
  p_ev public.conf_events, p_subject text, p_body text, p_first text, p_url text, p_token text
) returns jsonb
language plpgsql stable set search_path = public as $$
declare v_subject text := public.conf_fill(p_subject, p_ev, p_first, false);
begin
  return jsonb_build_object(
    'subject', v_subject,
    'html', public.conf_email_html(p_ev, v_subject,
      public.conf_paragraphs(public.conf_fill(public.conf_esc(p_body), p_ev, p_first, true)),
      'Open your event page', p_url, p_token));
end $$;

create or replace function public.conf_audience_match(p_audience text, p_status text)
returns boolean
language sql immutable set search_path = public as $$
  select case p_audience
    when 'going'     then p_status in ('in_person', 'virtual')
    when 'in_person' then p_status = 'in_person'
    when 'virtual'   then p_status = 'virtual'
    when 'waitlist'  then p_status = 'waitlist'
    when 'pending'   then p_status = 'pending'
    when 'all'       then p_status <> 'declined'
    else false end
$$;

-- --------------------------- invitations -----------------------------------

create or replace function public.conf_send_invitations(
  p_event uuid, p_invitee_ids uuid[] default null, p_only_new boolean default true
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ev   public.conf_events := public.conf_require_coordinator(p_event);
  v_inv  public.conf_invitees;
  v_mail jsonb;
  v_n    integer := 0;
begin
  if v_ev.status <> 'published' then
    raise exception 'Publish the event before sending invitations';
  end if;
  if v_ev.organizer_name is null or v_ev.organizer_email is null then
    raise exception 'Add the organizer name and email first - every invitation must say who it is from';
  end if;

  for v_inv in
    select * from public.conf_invitees
     where event_id = v_ev.id and unsubscribed_at is null
       and (p_invitee_ids is null or id = any (p_invitee_ids))
       and (not p_only_new or invite_count = 0)
     order by created_at
  loop
    update public.conf_invitees set invite_count = invite_count + 1, invited_at = now()
     where id = v_inv.id;
    v_mail := public.conf_invitation_email(v_ev, split_part(v_inv.full_name, ' ', 1),
                public.conf_portal_url() || '/e/' || v_inv.token, v_inv.token);
    perform public.enqueue_email(
      'confinv-' || v_inv.id || '-' || (v_inv.invite_count + 1),
      v_inv.email, v_mail->>'subject', v_mail->>'html');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Existing portal accounts are linked by email as people are added, so their
-- invitations appear under My courses straight away.
create or replace function public.conf_import_invitees(p_event uuid, p_rows jsonb, p_source text default 'csv')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ev      public.conf_events := public.conf_require_coordinator(p_event);
  r         jsonb;
  v_email   text;
  v_added   integer := 0;
  v_dupes   integer := 0;
  v_bad     text[]  := '{}';
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'expected a list of rows'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'import at most 5,000 people at a time'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_email := lower(trim(r->>'email'));
    if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      if coalesce(trim(r->>'email'), '') <> '' then v_bad := v_bad || trim(r->>'email'); end if;
      continue;
    end if;
    insert into public.conf_invitees (site_id, event_id, email, full_name, institution, role_title, source, user_id)
    values (v_ev.site_id, v_ev.id, v_email,
            nullif(trim(r->>'full_name'), ''), nullif(trim(r->>'institution'), ''),
            nullif(trim(r->>'role_title'), ''),
            case when p_source = 'manual' then 'manual' else 'csv' end,
            public.conf_user_for_email(v_email))
    on conflict do nothing;
    if found then v_added := v_added + 1; else v_dupes := v_dupes + 1; end if;
  end loop;

  return jsonb_build_object('added', v_added, 'duplicates', v_dupes,
                            'invalid', coalesce(array_length(v_bad, 1), 0),
                            'invalid_examples', to_jsonb(v_bad[1:10]));
end $$;

-- ------------------------ preview and test sends ---------------------------

-- What an invitation or a message will look like, with unsaved text, for the
-- coordinator's preview pane. Nothing is sent.
create or replace function public.conf_preview(
  p_event uuid, p_kind text, p_subject text default null, p_body text default null, p_audience text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ev   public.conf_events := public.conf_require_coordinator(p_event);
  v_url  text := public.conf_portal_url() || '/e/preview';
  v_mail jsonb;
  v_n    integer;
begin
  if p_kind = 'invitation' then
    v_ev.invite_subject := p_subject;
    v_ev.invite_message := p_body;
    -- 'preview' stands in for a token so the unsubscribe line shows as it will
    v_mail := public.conf_invitation_email(v_ev, 'Alex', v_url, 'preview');
    return v_mail || jsonb_build_object(
      'default_subject', 'You''re invited: {event_name}',
      'default_message', public.conf_default_invite_message(v_ev));
  elsif p_kind = 'message' then
    select count(*) into v_n from public.conf_invitees
     where event_id = v_ev.id and unsubscribed_at is null
       and public.conf_audience_match(coalesce(p_audience, 'going'), rsvp_status);
    v_mail := public.conf_message_email(v_ev, coalesce(nullif(trim(p_subject), ''), '(no subject)'),
                coalesce(p_body, ''), 'Alex', v_url, 'preview');
    return v_mail || jsonb_build_object('recipients', v_n);
  end if;
  raise exception 'unknown preview';
end $$;

-- The same email, sent to the coordinator's own address.
create or replace function public.conf_send_test(
  p_event uuid, p_kind text, p_subject text default null, p_body text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ev   public.conf_events := public.conf_require_coordinator(p_event);
  v_to   text := public.conf_my_email();
  v_mail jsonb;
begin
  if v_to is null then raise exception 'Your account has no email address'; end if;
  v_mail := public.conf_preview(p_event, p_kind, p_subject, p_body, null);
  perform set_config('app.site_id', v_ev.site_id::text, true);
  perform public.enqueue_email('conftest-' || gen_random_uuid(), v_to,
    '[Test] ' || (v_mail->>'subject'), v_mail->>'html');
  return v_to;
end $$;

-- ------------------------------ messages -----------------------------------

-- Internal: send one message now to everyone in its audience who has not
-- unsubscribed. Called by the coordinator (send now) and the schedule.
create or replace function public.conf_deliver_message(p_message uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_msg  public.conf_messages;
  v_ev   public.conf_events;
  v_inv  public.conf_invitees;
  v_mail jsonb;
  v_n    integer := 0;
begin
  -- Clear any program a previous call entered, so the message is found by
  -- the caller's own scope (the coordinator's program, or - for the
  -- schedule, which has no signed-in user - every program).
  perform set_config('app.site_id', '', true);
  select * into v_msg from public.conf_messages where id = p_message for update;
  if not found or v_msg.status in ('sent', 'cancelled') then return 0; end if;
  select * into v_ev from public.conf_events where id = v_msg.event_id;
  perform set_config('app.site_id', v_ev.site_id::text, true);

  for v_inv in
    select * from public.conf_invitees
     where event_id = v_ev.id and unsubscribed_at is null
       and public.conf_audience_match(v_msg.audience, rsvp_status)
  loop
    v_mail := public.conf_message_email(v_ev, v_msg.subject, v_msg.body, split_part(v_inv.full_name, ' ', 1),
                public.conf_portal_url() || '/e/' || v_inv.token, v_inv.token);
    perform public.enqueue_email('confmsg-' || v_msg.id || '-' || v_inv.id,
      v_inv.email, v_mail->>'subject', v_mail->>'html');
    v_n := v_n + 1;
  end loop;

  update public.conf_messages set status = 'sent', sent_at = now(), recipients = v_n where id = v_msg.id;
  return v_n;
end $$;

create or replace function public.conf_send_message(p_message uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_msg public.conf_messages; v_ev public.conf_events;
begin
  select * into v_msg from public.conf_messages where id = p_message;
  if not found then raise exception 'message not found'; end if;
  v_ev := public.conf_require_coordinator(v_msg.event_id);
  if v_ev.status = 'draft' then raise exception 'Publish the event before messaging attendees'; end if;
  if v_ev.organizer_name is null or v_ev.organizer_email is null then
    raise exception 'Add the organizer name and email first - every message must say who it is from';
  end if;
  if v_msg.status = 'sent' then raise exception 'This message has already been sent'; end if;
  return public.conf_deliver_message(v_msg.id);
end $$;

-- The schedule (every 15 minutes): reminders, feedback requests and any
-- messages that have come due.
create or replace function public.enqueue_conference_emails()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ev    public.conf_events;
  v_inv   public.conf_invitees;
  v_msgs  uuid[];
  v_msg   uuid;
  v_local timestamp;
  v_last  timestamp;
  v_n     integer := 0;
begin
  for v_ev in select * from public.conf_events where status = 'published' loop
    perform set_config('app.site_id', v_ev.site_id::text, true);
    v_local := now() at time zone v_ev.timezone;

    -- Reminder, the day before, to everyone confirmed.
    if v_ev.reminder_sent_at is null and v_local::date = v_ev.starts_on - 1 then
      for v_inv in
        select * from public.conf_invitees
         where event_id = v_ev.id and rsvp_status in ('in_person', 'virtual') and unsubscribed_at is null
      loop
        perform public.enqueue_email(
          'confrem-' || v_inv.id, v_inv.email, 'Tomorrow: ' || v_ev.name,
          public.conf_email_html(v_ev, 'See you tomorrow',
            '<p>Hi ' || public.conf_esc(coalesce(nullif(split_part(v_inv.full_name, ' ', 1), ''), 'there')) || ',</p>'
            || '<p>A reminder that <strong>' || public.conf_esc(v_ev.name) || '</strong> starts tomorrow, '
            || public.conf_when(v_ev.starts_on, v_ev.ends_on) || '.</p>'
            || case when v_inv.rsvp_status = 'in_person' then
                 '<p><strong>Where:</strong> ' || public.conf_esc(coalesce(v_ev.venue_name, 'see the itinerary'))
                 || case when v_ev.venue_address is not null then '<br>' || public.conf_esc(v_ev.venue_address) else '' end
                 || '</p>'
               else
                 '<p>Your Zoom link is on your event page - sign in with your account to see it.</p>'
               end
            || '<p>The full itinerary, and a calendar file for your phone, are on your event page.</p>',
            'Open your event page', public.conf_portal_url() || '/e/' || v_inv.token, v_inv.token));
        v_n := v_n + 1;
      end loop;
      update public.conf_events set reminder_sent_at = now() where id = v_ev.id;
    end if;

    -- Feedback, once the last session has finished.
    if v_ev.feedback_enabled and v_ev.feedback_sent_at is null then
      select max(s.session_date + s.end_time) into v_last
        from public.conf_sessions s where s.event_id = v_ev.id;
      if v_local > coalesce(v_last, (v_ev.ends_on + 1)::timestamp) then
        for v_inv in
          select * from public.conf_invitees
           where event_id = v_ev.id and unsubscribed_at is null
             and (rsvp_status in ('in_person', 'virtual') or checked_in_at is not null)
        loop
          perform public.enqueue_email(
            'conffb-' || v_inv.id, v_inv.email, 'How was ' || v_ev.name || '?',
            public.conf_email_html(v_ev, 'Thank you for coming',
              '<p>Hi ' || public.conf_esc(coalesce(nullif(split_part(v_inv.full_name, ' ', 1), ''), 'there')) || ',</p>'
              || '<p>Thank you for joining <strong>' || public.conf_esc(v_ev.name) || '</strong>. '
              || 'It takes a minute to tell us how the sessions went, and it shapes the next one.</p>',
              'Give feedback', public.conf_portal_url() || '/e/' || v_inv.token || '/feedback', v_inv.token));
          v_n := v_n + 1;
        end loop;
        update public.conf_events set feedback_sent_at = now() where id = v_ev.id;
      end if;
    end if;
  end loop;

  -- Scheduled messages that are due. Archived events too: "the slides are
  -- up" often goes out after the event is closed.
  -- Collected first, with no program entered, so every program's are seen.
  perform set_config('app.site_id', '', true);
  select array_agg(m.id order by m.send_at) into v_msgs
    from public.conf_messages m join public.conf_events e on e.id = m.event_id
   where m.status = 'scheduled' and m.send_at <= now() and e.status in ('published', 'archived')
     and e.organizer_name is not null and e.organizer_email is not null;
  foreach v_msg in array coalesce(v_msgs, '{}') loop
    v_n := v_n + public.conf_deliver_message(v_msg);
  end loop;

  perform set_config('app.site_id', '', true);
  return v_n;
end $$;

-- ------------------------ invitees: their own pages ------------------------

-- The event as one invitee sees it. Who is asking decides how much:
--   * signed in as the account this invitation belongs to: everything
--   * no account linked yet: the event, the itinerary and the RSVP form
--   * an account is linked but someone else (or nobody) is signed in: the
--     event and the itinerary only, and a prompt to sign in
-- Joining details, slides, feedback, letters and messages to attendees need
-- the first, so a forwarded link does not carry them.
create or replace function public.conf_public_event(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_exists  boolean := public.conf_enter('invitee', p_token);
  v_inv     public.conf_invitees;
  v_ev      public.conf_events;
  v_waitpos integer;
  v_going   boolean;
  v_me      boolean;
  v_locked  boolean;
  v_full    boolean;
  v_in      integer;
  v_virt    integer;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_inv from public.conf_invitees where token = p_token;
  if not found then return null; end if;
  select * into v_ev from public.conf_events where id = v_inv.event_id;
  if not found or v_ev.status = 'draft' then return null; end if;

  -- coalesce: signed out, current_uid() is null and the comparison would be
  -- null, which a later "not v_me" silently reads as not-false.
  v_me     := coalesce(v_inv.user_id = public.current_uid(), false);
  v_locked := v_inv.user_id is not null and not v_me;
  v_full   := v_me;
  v_going  := v_inv.rsvp_status in ('in_person', 'virtual');

  if v_inv.rsvp_status = 'waitlist' then
    select count(*) + 1 into v_waitpos from public.conf_invitees
     where event_id = v_ev.id and rsvp_status = 'waitlist' and waitlist_for = v_inv.waitlist_for
       and (waitlisted_at, created_at, id) < (v_inv.waitlisted_at, v_inv.created_at, v_inv.id);
  end if;
  select count(*) filter (where rsvp_status = 'in_person'),
         count(*) filter (where rsvp_status = 'virtual')
    into v_in, v_virt
    from public.conf_invitees where event_id = v_ev.id;

  return jsonb_build_object(
    'account', jsonb_build_object(
      'linked', v_inv.user_id is not null,
      'me', v_me,
      'exists', case when v_inv.user_id is null then coalesce(v_exists, false) end),
    'event', jsonb_build_object(
      'name', v_ev.name, 'description', v_ev.description,
      'starts_on', v_ev.starts_on, 'ends_on', v_ev.ends_on, 'timezone', v_ev.timezone,
      'venue_name', v_ev.venue_name, 'venue_address', v_ev.venue_address,
      'has_virtual', v_ev.zoom_url is not null,
      'zoom_url', case when v_full and v_going then v_ev.zoom_url end,
      'zoom_passcode', case when v_full and v_going then v_ev.zoom_passcode end,
      'status', v_ev.status,
      'open', v_ev.status = 'published',
      'in_person_full', v_ev.capacity_in_person is not null and v_in >= v_ev.capacity_in_person,
      'virtual_full', v_ev.capacity_virtual is not null and v_virt >= v_ev.capacity_virtual,
      'feedback_enabled', v_ev.feedback_enabled,
      'letters_enabled', v_ev.letters_enabled,
      'presentations_enabled', v_ev.presentations_enabled,
      'payment', case when v_ev.payment_enabled and v_ev.payment_url is not null then
        jsonb_build_object('url', v_ev.payment_url, 'label', v_ev.payment_label, 'note', v_ev.payment_note) end,
      'organizer_name', v_ev.organizer_name, 'organizer_email', v_ev.organizer_email),
    'invitee', jsonb_build_object(
      'full_name', v_inv.full_name, 'email', v_inv.email,
      'institution', case when not v_locked then v_inv.institution end,
      'role_title', case when not v_locked then v_inv.role_title end,
      'rsvp_status', v_inv.rsvp_status,
      'waitlist_for', v_inv.waitlist_for, 'waitlist_position', v_waitpos,
      'dietary', case when not v_locked then v_inv.dietary end,
      'accessibility', case when not v_locked then v_inv.accessibility end,
      'checked_in', v_inv.checked_in_at is not null,
      'unsubscribed', v_inv.unsubscribed_at is not null,
      'letter_available', v_full and v_ev.letters_enabled and v_inv.checked_in_at is not null),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'description', s.description,
        'session_date', s.session_date,
        'start_time', to_char(s.start_time, 'HH24:MI'), 'end_time', to_char(s.end_time, 'HH24:MI'),
        'format', s.format, 'room', r.name, 'credit_hours', s.credit_hours,
        'zoom_url', case when v_full and v_going then coalesce(s.zoom_url, v_ev.zoom_url) end,
        'speakers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', sp.full_name, 'affiliation', sp.affiliation, 'role', ss.role,
            -- accreditation standards generally expect learners to see speakers' disclosures
            'disclosure', case sp.disclosure_status
              when 'nothing_to_declare' then 'No relevant financial relationships to disclose.'
              when 'received' then sp.disclosure_text end)
            order by case ss.role when 'moderator' then 0 when 'speaker' then 1 else 2 end, sp.full_name)
          from public.conf_session_speakers ss
          join public.conf_speakers sp on sp.id = ss.speaker_id
          where ss.session_id = s.id), '[]'::jsonb))
        order by s.session_date, s.start_time, s.sort)
      from public.conf_sessions s
      left join public.conf_rooms r on r.id = s.room_id
      where s.event_id = v_ev.id), '[]'::jsonb),
    'accommodations', case when v_ev.accommodations_enabled then coalesce((
      select jsonb_agg(jsonb_build_object(
        'hotel_name', a.hotel_name, 'address', a.address, 'booking_url', a.booking_url,
        'group_code', a.group_code, 'nightly_rate', a.nightly_rate, 'cutoff_date', a.cutoff_date,
        'contact_phone', a.contact_phone) order by a.sort, a.hotel_name)
      from public.conf_accommodations a
      where a.event_id = v_ev.id and a.show_attendees), '[]'::jsonb) else '[]'::jsonb end,
    'sponsors', coalesce((
      select jsonb_agg(jsonb_build_object('name', sp.name, 'tier', sp.tier, 'kind', sp.kind)
        order by sp.kind, sp.tier nulls last, sp.name)
      from public.conf_sponsors sp where sp.event_id = v_ev.id and sp.acknowledged), '[]'::jsonb),
    'feedback_given', case when v_full then coalesce((
      select jsonb_agg(coalesce(f.session_id::text, 'event'))
      from public.conf_feedback f where f.invitee_id = v_inv.id), '[]'::jsonb) else '[]'::jsonb end,
    -- Messages the organizers sent that were meant for this person, newest
    -- first. Invitations still awaiting a reply can see the ones addressed
    -- to them without an account; everything else needs the account.
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('subject', public.conf_fill(m.subject, v_ev, split_part(v_inv.full_name, ' ', 1), false),
                                          'body', public.conf_fill(m.body, v_ev, split_part(v_inv.full_name, ' ', 1), false),
                                          'sent_at', m.sent_at) order by m.sent_at desc)
      from public.conf_messages m
      where m.event_id = v_ev.id and m.status = 'sent' and m.show_on_page
        and public.conf_audience_match(m.audience, v_inv.rsvp_status)
        and (v_full or (not v_locked and m.audience in ('pending', 'all')))), '[]'::jsonb)
  );
end $$;

-- Accepting needs the account. Declining never does, unless an account is
-- already linked, in which case only that account may change the answer.
create or replace function public.conf_public_rsvp(
  p_token text, p_status text,
  p_full_name text, p_institution text, p_role_title text,
  p_dietary text, p_accessibility text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_x     boolean := public.conf_enter('invitee', p_token);
  v_inv   public.conf_invitees;
  v_ev    public.conf_events;
  v_cap   integer;
  v_taken integer;
  v_new   text;
  v_wait  text;
  v_since timestamptz;
  v_me    boolean;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid link'; end if;
  if p_status not in ('in_person', 'virtual', 'declined') then raise exception 'invalid response'; end if;

  select * into v_inv from public.conf_invitees where token = p_token;
  if not found then raise exception 'invalid link'; end if;
  v_me := coalesce(v_inv.user_id = public.current_uid(), false);

  if v_inv.user_id is not null and not v_me then
    raise exception 'Sign in with your account to change your response' using errcode = 'insufficient_privilege';
  end if;
  if p_status in ('in_person', 'virtual') and not v_me then
    raise exception 'Create your account, or sign in, to confirm your place' using errcode = 'insufficient_privilege';
  end if;

  -- Serialise every RSVP for this event, so two people cannot both take the
  -- last seat.
  select * into v_ev from public.conf_events where id = v_inv.event_id for update;
  if v_ev.status <> 'published' then raise exception 'RSVPs for this event are closed'; end if;
  if p_status = 'virtual' and v_ev.zoom_url is null then
    raise exception 'This event is not offered online';
  end if;

  v_new := p_status; v_wait := null; v_since := null;
  if p_status in ('in_person', 'virtual') and v_inv.rsvp_status is distinct from p_status then
    v_cap := case p_status when 'in_person' then v_ev.capacity_in_person else v_ev.capacity_virtual end;
    select count(*) into v_taken from public.conf_invitees
     where event_id = v_ev.id and rsvp_status = p_status and id <> v_inv.id;
    if v_cap is not null and v_taken >= v_cap then
      v_new := 'waitlist';
      v_wait := p_status;
      -- keep your place if you were already waiting for this
      v_since := case when v_inv.rsvp_status = 'waitlist' and v_inv.waitlist_for = p_status
                      then v_inv.waitlisted_at else now() end;
    end if;
  elsif p_status = v_inv.rsvp_status then
    v_new := v_inv.rsvp_status;
    v_wait := v_inv.waitlist_for;
    v_since := v_inv.waitlisted_at;
  end if;

  update public.conf_invitees set
    rsvp_status   = v_new,
    waitlist_for  = v_wait,
    waitlisted_at = v_since,
    rsvp_at       = now(),
    full_name     = coalesce(nullif(trim(p_full_name), ''), full_name),
    institution   = nullif(trim(p_institution), ''),
    role_title    = nullif(trim(p_role_title), ''),
    dietary       = nullif(trim(p_dietary), ''),
    accessibility = nullif(trim(p_accessibility), '')
  where id = v_inv.id;

  return jsonb_build_object('rsvp_status', v_new, 'waitlist_for', v_wait);
end $$;

create or replace function public.conf_public_feedback(
  p_token text, p_session uuid, p_rating integer, p_comments text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_x   boolean := public.conf_enter('invitee', p_token);
  v_inv public.conf_invitees;
  v_ev  public.conf_events;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid link'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then raise exception 'rating must be 1 to 5'; end if;
  select * into v_inv from public.conf_invitees where token = p_token;
  if not found then raise exception 'invalid link'; end if;
  if v_inv.user_id is null or v_inv.user_id is distinct from public.current_uid() then
    raise exception 'Sign in with your account to give feedback' using errcode = 'insufficient_privilege';
  end if;
  select * into v_ev from public.conf_events where id = v_inv.event_id;
  if not v_ev.feedback_enabled or v_ev.status = 'draft' then raise exception 'feedback is not open for this event'; end if;
  if v_inv.rsvp_status not in ('in_person', 'virtual') and v_inv.checked_in_at is null then
    raise exception 'feedback is for people who attended';
  end if;
  if p_session is not null and not exists (
       select 1 from public.conf_sessions where id = p_session and event_id = v_ev.id) then
    raise exception 'that session is not part of this event';
  end if;

  insert into public.conf_feedback (site_id, event_id, session_id, invitee_id, rating, comments)
  values (v_ev.site_id, v_ev.id, p_session, v_inv.id, p_rating, nullif(trim(p_comments), ''))
  on conflict (invitee_id, coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set rating = excluded.rating, comments = excluded.comments, created_at = now();
  return true;
end $$;

-- Unsubscribing stays one click with no account (CASL).
create or replace function public.conf_public_unsubscribe(p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_x boolean := public.conf_enter('invitee', p_token);
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.conf_invitees set unsubscribed_at = coalesce(unsubscribed_at, now())
   where token = p_token;
  return found;
end $$;

create or replace function public.conf_public_letter(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_x   boolean := public.conf_enter('invitee', p_token);
  v_inv public.conf_invitees;
  v_ev  public.conf_events;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_inv from public.conf_invitees where token = p_token;
  if not found then return null; end if;
  if v_inv.user_id is null or v_inv.user_id is distinct from public.current_uid() then return null; end if;
  select * into v_ev from public.conf_events where id = v_inv.event_id;
  -- a letter certifies attendance, so it exists only for someone checked in
  if not v_ev.letters_enabled or v_inv.checked_in_at is null then return null; end if;
  return jsonb_build_object(
    'full_name', coalesce(v_inv.full_name, v_inv.email),
    'institution', v_inv.institution,
    'event_name', v_ev.name,
    'when', public.conf_when(v_ev.starts_on, v_ev.ends_on),
    'venue_name', v_ev.venue_name,
    'attended', case v_inv.rsvp_status when 'virtual' then 'online' else 'in person' end,
    'credit_hours', public.conf_credit_hours(v_inv),
    'credits_statement', v_ev.credits_statement,
    'organizer_name', v_ev.organizer_name,
    'issued_on', to_char(coalesce(v_inv.letter_sent_at, now()), 'FMMonth FMDD, YYYY'));
end $$;

-- Link an invitation to the signed-in account. Only when the account's email
-- is the one the invitation went to: the link may have been forwarded.
create or replace function public.conf_claim(p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_x     boolean := public.conf_enter('invitee', p_token);
  v_uid   uuid := public.current_uid();
  v_email text := public.conf_my_email();
  v_inv   public.conf_invitees;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  select * into v_inv from public.conf_invitees where token = p_token;
  if not found then raise exception 'invalid link'; end if;
  if v_inv.user_id = v_uid then return true; end if;
  if v_inv.user_id is not null then
    raise exception 'This invitation belongs to another account' using errcode = 'insufficient_privilege';
  end if;
  if lower(v_inv.email) is distinct from v_email then
    raise exception 'This invitation was sent to %. Sign in with that address.', v_inv.email
      using errcode = 'insufficient_privilege';
  end if;
  update public.conf_invitees set user_id = v_uid where id = v_inv.id;
  return true;
end $$;

-- ------------------------------ speakers -----------------------------------

create or replace function public.conf_public_disclosure(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_x  boolean := public.conf_enter('speaker', p_token);
  v_sp public.conf_speakers;
  v_ev public.conf_events;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_sp from public.conf_speakers where token = p_token;
  if not found then return null; end if;
  select * into v_ev from public.conf_events where id = v_sp.event_id;
  return jsonb_build_object(
    'speaker_name', v_sp.full_name,
    'event_name', v_ev.name,
    'when', public.conf_when(v_ev.starts_on, v_ev.ends_on),
    'organizer_name', v_ev.organizer_name,
    'organizer_email', v_ev.organizer_email,
    'status', v_sp.disclosure_status,
    'text', v_sp.disclosure_text,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('title', s.title, 'role', ss.role,
               'session_date', s.session_date, 'start_time', to_char(s.start_time, 'HH24:MI'))
             order by s.session_date, s.start_time)
      from public.conf_session_speakers ss join public.conf_sessions s on s.id = ss.session_id
      where ss.speaker_id = v_sp.id), '[]'::jsonb));
end $$;

create or replace function public.conf_public_disclosure_submit(
  p_token text, p_nothing_to_declare boolean, p_text text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_x boolean := public.conf_enter('speaker', p_token);
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid link'; end if;
  if not coalesce(p_nothing_to_declare, false) and nullif(trim(p_text), '') is null then
    raise exception 'Describe your relationships, or confirm you have none to declare';
  end if;
  update public.conf_speakers set
    disclosure_status      = case when p_nothing_to_declare then 'nothing_to_declare' else 'received' end,
    disclosure_text        = case when p_nothing_to_declare then null else trim(p_text) end,
    disclosure_received_at = now()
  where token = p_token;
  if not found then raise exception 'invalid link'; end if;
  return true;
end $$;

-- -------------------------- public registration ----------------------------

create or replace function public.conf_public_registration_info(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_x  boolean := public.conf_enter('public', p_token);
  v_ev public.conf_events;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_ev from public.conf_events where public_token = p_token;
  if not found or v_ev.status = 'draft' or not v_ev.public_registration then return null; end if;
  return jsonb_build_object(
    'name', v_ev.name, 'description', v_ev.description,
    'starts_on', v_ev.starts_on, 'ends_on', v_ev.ends_on,
    'venue_name', v_ev.venue_name, 'venue_address', v_ev.venue_address,
    'has_virtual', v_ev.zoom_url is not null,
    'open', v_ev.status = 'published',
    'organizer_name', v_ev.organizer_name, 'organizer_email', v_ev.organizer_email);
end $$;

-- Always answers true for a well-formed request, whether or not the address
-- was already on the list, so the form cannot be used to test who is
-- invited. The private link goes to the address given, which is what proves
-- the person owns it.
create or replace function public.conf_public_register(
  p_token text, p_email text, p_full_name text, p_institution text, p_role_title text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_x     boolean := public.conf_enter('public', p_token);
  v_ev    public.conf_events;
  v_email text := lower(trim(p_email));
  v_inv   public.conf_invitees;
  v_mail  text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid link'; end if;
  select * into v_ev from public.conf_events where public_token = p_token;
  if not found or not v_ev.public_registration or v_ev.status <> 'published' then
    raise exception 'Registration for this event is closed';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if nullif(trim(p_full_name), '') is null then raise exception 'Enter your name'; end if;
  if (select count(*) from public.conf_invitees
       where event_id = v_ev.id and source = 'public' and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Registration is busy right now. Please try again in a little while.';
  end if;

  -- Not linked to an existing account here, even when the address has one:
  -- anybody can type anybody's address into this form. It is linked when the
  -- owner of the address follows the emailed link and signs in (conf_claim).
  insert into public.conf_invitees (site_id, event_id, email, full_name, institution, role_title, source)
  values (v_ev.site_id, v_ev.id, v_email, trim(p_full_name), nullif(trim(p_institution), ''),
          nullif(trim(p_role_title), ''), 'public')
  on conflict do nothing;
  select * into v_inv from public.conf_invitees where event_id = v_ev.id and lower(email) = v_email;

  v_mail := public.conf_email_html(v_ev, 'Confirm your registration',
    '<p>Hi ' || public.conf_esc(coalesce(nullif(split_part(v_inv.full_name, ' ', 1), ''), 'there')) || ',</p>'
    || '<p>Thanks for registering for <strong>' || public.conf_esc(v_ev.name) || '</strong>, '
    || public.conf_when(v_ev.starts_on, v_ev.ends_on) || '.</p>'
    || '<p>Use the button below to choose how you will attend and set up your account. '
    || 'Didn''t register? You can ignore this email.</p>',
    'Continue your registration', public.conf_portal_url() || '/e/' || v_inv.token, v_inv.token);
  -- one of these per address per hour, however often the form is sent
  perform public.enqueue_email('confreg-' || v_inv.id || '-' || to_char(now(), 'YYYYMMDDHH24'),
    v_inv.email, 'Confirm your registration: ' || v_ev.name, v_mail);
  return true;
end $$;

-- ---------------------------- ownership & grants ----------------------------

do $$
declare f text;
begin
  -- see across programs; callable only from inside the conference functions
  foreach f in array array[
    'conf_enter(text,text)', 'conf_user_for_email(text)', 'conf_my_email()'
  ] loop
    execute format('alter function public.%s owner to postgres', f);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to app_definer', f);
  end loop;

  -- the signed-in person's own registrations, in every program
  execute 'alter function public.conf_my_courses() owner to postgres';
  execute 'revoke all on function public.conf_my_courses() from public, anon, authenticated';
  execute 'grant execute on function public.conf_my_courses() to authenticated';

  foreach f in array array[
    'conf_fill(text,public.conf_events,text,boolean)', 'conf_paragraphs(text)',
    'conf_default_invite_message(public.conf_events)',
    'conf_invitation_email(public.conf_events,text,text,text)',
    'conf_message_email(public.conf_events,text,text,text,text,text)',
    'conf_audience_match(text,text)', 'conf_deliver_message(uuid)',
    'conf_send_invitations(uuid,uuid[],boolean)', 'conf_import_invitees(uuid,jsonb,text)',
    'conf_preview(uuid,text,text,text,text)', 'conf_send_test(uuid,text,text,text)',
    'conf_send_message(uuid)', 'enqueue_conference_emails()',
    'conf_public_event(text)', 'conf_public_rsvp(text,text,text,text,text,text,text)',
    'conf_public_feedback(text,uuid,integer,text)', 'conf_public_unsubscribe(text)',
    'conf_public_letter(text)', 'conf_claim(text)',
    'conf_public_disclosure(text)', 'conf_public_disclosure_submit(text,boolean,text)',
    'conf_public_registration_info(text)', 'conf_public_register(text,text,text,text,text)'
  ] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;

  -- signed out or signed in
  foreach f in array array[
    'conf_public_event(text)', 'conf_public_rsvp(text,text,text,text,text,text,text)',
    'conf_public_feedback(text,uuid,integer,text)', 'conf_public_unsubscribe(text)',
    'conf_public_letter(text)', 'conf_public_disclosure(text)',
    'conf_public_disclosure_submit(text,boolean,text)',
    'conf_public_registration_info(text)', 'conf_public_register(text,text,text,text,text)'
  ] loop
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;

  -- signed in
  foreach f in array array[
    'conf_claim(text)', 'conf_import_invitees(uuid,jsonb,text)',
    'conf_send_invitations(uuid,uuid[],boolean)', 'conf_preview(uuid,text,text,text,text)',
    'conf_send_test(uuid,text,text,text)', 'conf_send_message(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ------------------------------ the schedule -------------------------------
-- Every 15 minutes, five minutes ahead of the email dispatcher, so a
-- scheduled message is out within about twenty minutes of its time.

select cron.unschedule('conference-emails-hourly')
 where exists (select 1 from cron.job where jobname = 'conference-emails-hourly');
select cron.schedule('conference-emails', '10,25,40,55 * * * *', 'select public.enqueue_conference_emails()')
 where not exists (select 1 from cron.job where jobname = 'conference-emails');
