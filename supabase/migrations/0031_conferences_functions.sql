-- ---------------------------------------------------------------------------
-- 0031 — conference management toolkit: functions
--
-- Three kinds of function, and the line between them is the security model.
--
--   conf_public_*   Called by invitees and speakers who are NOT portal users,
--                   through a 64-character token in their private link. Anon
--                   has no table access at all; these are the only way in, and
--                   each one resolves exactly one person's row from the token
--                   and returns nothing else. The public pages call them with
--                   a session-less client, so a signed-in portal user opening
--                   another program's invitation still resolves correctly.
--
--   conf_*          Called by the program's director or admin. They run as
--                   app_definer, which is NOBYPASSRLS, so the restrictive site
--                   isolation still confines them to the caller's program;
--                   each also checks is_director_or_admin() explicitly.
--
--   internal        Waitlist promotion, the scheduled reminder and feedback
--                   mail, the HTML helpers. No grants to anon or authenticated.
--
-- Every message identifies its sender and carries an unsubscribe link, which
-- Canada's anti-spam law requires of this kind of mail. Invitations, reminders
-- and feedback requests are withheld from anyone who has unsubscribed; a
-- participation letter, which confirms something the person did, is not.
-- ---------------------------------------------------------------------------

-- ============================ helpers ======================================

create or replace function public.conf_esc(p text) returns text
language sql immutable set search_path = public as $$
  select replace(replace(replace(replace(replace(coalesce(p, ''),
         '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

create or replace function public.conf_portal_url() returns text
language sql stable set search_path = public as $$
  select rtrim(coalesce(
    (select value #>> '{}' from public.app_settings
      where site_id = '00000000-0000-4000-8000-000000000000' and key = 'portal_url'),
    'https://app.neuromuscular.ca'), '/')
$$;

-- "Friday, October 16, 2026" or "October 16 – 17, 2026"
create or replace function public.conf_when(p_start date, p_end date) returns text
language sql immutable set search_path = public as $$
  select case
    when p_start = p_end then to_char(p_start, 'FMDay, FMMonth FMDD, YYYY')
    when date_trunc('month', p_start) = date_trunc('month', p_end)
      then to_char(p_start, 'FMMonth FMDD') || ' – ' || to_char(p_end, 'FMDD, YYYY')
    else to_char(p_start, 'FMMonth FMDD') || ' – ' || to_char(p_end, 'FMMonth FMDD, YYYY')
  end
$$;

create or replace function public.conf_email_html(
  p_ev public.conf_events, p_heading text, p_body text,
  p_button_label text, p_button_url text, p_unsub_token text
) returns text
language plpgsql stable set search_path = public as $$
begin
  return
    '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1B2D;line-height:1.55">'
    || '<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5B6677;margin:0 0 6px">'
    ||   public.conf_esc(p_ev.name) || '</p>'
    || '<h2 style="font-family:Georgia,serif;font-weight:500;margin:0 0 16px">' || public.conf_esc(p_heading) || '</h2>'
    || p_body
    || case when p_button_url is not null then
         '<p style="margin:28px 0"><a href="' || p_button_url || '" style="background:#0E7C86;color:#fff;'
         || 'padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">'
         || public.conf_esc(p_button_label) || '</a></p>'
         || '<p style="font-size:12px;color:#5B6677">Or paste this link into your browser:<br>' || p_button_url || '</p>'
       else '' end
    || '<hr style="border:none;border-top:1px solid #E2E6E2;margin:28px 0 14px">'
    || '<p style="font-size:12px;color:#5B6677;line-height:1.5">Sent by '
    ||   public.conf_esc(coalesce(p_ev.organizer_name, 'the event organizers'))
    ||   case when p_ev.organizer_address is not null then ', ' || public.conf_esc(p_ev.organizer_address) else '' end
    ||   case when p_ev.organizer_email is not null then
           '. Questions: <a href="mailto:' || public.conf_esc(p_ev.organizer_email) || '" style="color:#5B6677">'
           || public.conf_esc(p_ev.organizer_email) || '</a>' else '' end
    ||   '.'
    ||   case when p_unsub_token is not null then
           '<br><a href="' || public.conf_portal_url() || '/e/' || p_unsub_token
           || '/unsubscribe" style="color:#5B6677">Unsubscribe from emails about this event</a>' else '' end
    || '</p></div>';
end $$;

-- where the event is, in one line, for an email body
create or replace function public.conf_where(p_ev public.conf_events) returns text
language sql stable set search_path = public as $$
  select case
    when p_ev.venue_name is not null and p_ev.zoom_url is not null
      then public.conf_esc(p_ev.venue_name) || ', and online'
    when p_ev.venue_name is not null then public.conf_esc(p_ev.venue_name)
    when p_ev.zoom_url is not null then 'Online'
    else 'Details to follow'
  end
$$;

-- total credit hours a person is owed: the override, else every session's hours
create or replace function public.conf_credit_hours(p_invitee public.conf_invitees) returns numeric
language sql stable set search_path = public as $$
  select coalesce(p_invitee.credit_hours_override,
                  (select coalesce(sum(s.credit_hours), 0) from public.conf_sessions s
                    where s.event_id = p_invitee.event_id))
$$;

-- ======================== waitlist promotion ===============================

-- Fill free places in one attendance mode from the waitlist, oldest first, and
-- tell each person promoted. Runs whenever a confirmed place is released and
-- whenever the coordinator raises a capacity.
create or replace function public.conf_promote_waitlist(p_event uuid, p_mode text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ev    public.conf_events;
  v_cap   integer;
  v_taken integer;
  v_next  public.conf_invitees;
  v_n     integer := 0;
begin
  select * into v_ev from public.conf_events where id = p_event;
  if not found or v_ev.status <> 'published' then return 0; end if;
  v_cap := case p_mode when 'in_person' then v_ev.capacity_in_person else v_ev.capacity_virtual end;

  perform set_config('app.site_id', v_ev.site_id::text, true);

  loop
    select count(*) into v_taken from public.conf_invitees
     where event_id = p_event and rsvp_status = p_mode;
    exit when v_cap is not null and v_taken >= v_cap;

    select * into v_next from public.conf_invitees
     where event_id = p_event and rsvp_status = 'waitlist' and waitlist_for = p_mode
     order by waitlisted_at, created_at, id
     limit 1
     for update skip locked;
    exit when not found;

    update public.conf_invitees
       set rsvp_status = p_mode, waitlist_for = null, rsvp_at = now()
     where id = v_next.id;
    v_n := v_n + 1;

    if v_next.unsubscribed_at is null then
      perform public.enqueue_email(
        'confpromo-' || v_next.id || '-' || extract(epoch from now())::bigint,
        v_next.email,
        'A place has opened: ' || v_ev.name,
        public.conf_email_html(v_ev, 'You''re off the waitlist',
          '<p>Hi ' || public.conf_esc(coalesce(split_part(v_next.full_name, ' ', 1), 'there')) || ',</p>'
          || '<p>A place has opened and you are now confirmed to attend <strong>'
          || public.conf_esc(v_ev.name) || '</strong> '
          || case p_mode when 'in_person' then 'in person' else 'online' end
          || ', ' || public.conf_when(v_ev.starts_on, v_ev.ends_on) || '.</p>'
          || '<p>If you can no longer come, please update your RSVP so the place goes to someone else.</p>',
          'View the details', public.conf_portal_url() || '/e/' || v_next.token, v_next.token));
    end if;
  end loop;
  return v_n;
end $$;

-- A confirmed place freed by ANY route - the attendee, the coordinator editing
-- the list, a deletion - goes to the next person waiting.
create or replace function public.conf_invitees_release() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'DELETE' then
    if old.rsvp_status in ('in_person', 'virtual') then
      perform public.conf_promote_waitlist(old.event_id, old.rsvp_status);
    end if;
  elsif old.rsvp_status in ('in_person', 'virtual') and new.rsvp_status is distinct from old.rsvp_status then
    perform public.conf_promote_waitlist(old.event_id, old.rsvp_status);
  end if;
  return null;
end $$;

create trigger conf_invitees_release
  after update of rsvp_status or delete on public.conf_invitees
  for each row execute function public.conf_invitees_release();

-- Raising a capacity (or publishing) lets people in off the waitlist.
create or replace function public.conf_events_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (
       new.capacity_in_person is distinct from old.capacity_in_person
    or new.capacity_virtual   is distinct from old.capacity_virtual
    or old.status <> 'published') then
    perform public.conf_promote_waitlist(new.id, 'in_person');
    perform public.conf_promote_waitlist(new.id, 'virtual');
  end if;
  return null;
end $$;

create trigger conf_events_capacity
  after update of capacity_in_person, capacity_virtual, status on public.conf_events
  for each row execute function public.conf_events_capacity();

-- ========================== public: invitees ===============================

create or replace function public.conf_public_event(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_inv     public.conf_invitees;
  v_ev      public.conf_events;
  v_waitpos integer;
  v_going   boolean;
  v_in      integer;
  v_virt    integer;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_inv from public.conf_invitees where token = p_token;
  if not found then return null; end if;
  select * into v_ev from public.conf_events where id = v_inv.event_id;
  if not found or v_ev.status = 'draft' then return null; end if;

  v_going := v_inv.rsvp_status in ('in_person', 'virtual');
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
    'event', jsonb_build_object(
      'name', v_ev.name, 'description', v_ev.description,
      'starts_on', v_ev.starts_on, 'ends_on', v_ev.ends_on, 'timezone', v_ev.timezone,
      'venue_name', v_ev.venue_name, 'venue_address', v_ev.venue_address,
      'has_virtual', v_ev.zoom_url is not null,
      -- the meeting link only goes to people confirmed to attend, so a
      -- forwarded invitation does not hand out the Zoom room
      'zoom_url', case when v_going then v_ev.zoom_url end,
      'zoom_passcode', case when v_going then v_ev.zoom_passcode end,
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
      'full_name', v_inv.full_name, 'email', v_inv.email, 'institution', v_inv.institution,
      'role_title', v_inv.role_title, 'rsvp_status', v_inv.rsvp_status,
      'waitlist_for', v_inv.waitlist_for, 'waitlist_position', v_waitpos,
      'dietary', v_inv.dietary, 'accessibility', v_inv.accessibility,
      'checked_in', v_inv.checked_in_at is not null,
      'unsubscribed', v_inv.unsubscribed_at is not null,
      'letter_available', v_ev.letters_enabled and v_inv.checked_in_at is not null),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'description', s.description,
        'session_date', s.session_date,
        'start_time', to_char(s.start_time, 'HH24:MI'), 'end_time', to_char(s.end_time, 'HH24:MI'),
        'format', s.format, 'room', r.name, 'credit_hours', s.credit_hours,
        'zoom_url', case when v_going then coalesce(s.zoom_url, v_ev.zoom_url) end,
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
    'feedback_given', coalesce((
      select jsonb_agg(coalesce(f.session_id::text, 'event'))
      from public.conf_feedback f where f.invitee_id = v_inv.id), '[]'::jsonb)
  );
end $$;

create or replace function public.conf_public_rsvp(
  p_token text, p_status text,
  p_full_name text, p_institution text, p_role_title text,
  p_dietary text, p_accessibility text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_inv   public.conf_invitees;
  v_ev    public.conf_events;
  v_cap   integer;
  v_taken integer;
  v_new   text;
  v_wait  text;
  v_since timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid link'; end if;
  if p_status not in ('in_person', 'virtual', 'declined') then raise exception 'invalid response'; end if;

  select * into v_inv from public.conf_invitees where token = p_token;
  if not found then raise exception 'invalid link'; end if;

  -- Serialise every RSVP for this event, so two people cannot both take the
  -- last seat.
  select * into v_ev from public.conf_events where id = v_inv.event_id for update;
  if v_ev.status <> 'published' then raise exception 'RSVPs for this event are closed'; end if;
  if p_status = 'virtual' and v_ev.zoom_url is null then
    raise exception 'This event is not offered online';
  end if;

  perform set_config('app.site_id', v_ev.site_id::text, true);

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
declare v_inv public.conf_invitees; v_ev public.conf_events;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid link'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then raise exception 'rating must be 1 to 5'; end if;
  select * into v_inv from public.conf_invitees where token = p_token;
  if not found then raise exception 'invalid link'; end if;
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

create or replace function public.conf_public_unsubscribe(p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.conf_invitees set unsubscribed_at = coalesce(unsubscribed_at, now())
   where token = p_token;
  return found;
end $$;

create or replace function public.conf_public_letter(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_inv public.conf_invitees; v_ev public.conf_events;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_inv from public.conf_invitees where token = p_token;
  if not found then return null; end if;
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

-- ========================== public: speakers ===============================

create or replace function public.conf_public_disclosure(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sp public.conf_speakers; v_ev public.conf_events;
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

-- ======================== coordinator functions ============================

-- The caller must direct or administer the program that owns this event.
-- (Restrictive site isolation already hides other programs' events from the
-- lookup; this makes the refusal explicit and readable.)
create or replace function public.conf_require_coordinator(p_event uuid)
returns public.conf_events
language plpgsql stable security definer set search_path = public as $$
declare v_ev public.conf_events;
begin
  if not public.is_director_or_admin() then
    raise exception 'Only the program director or admin can manage events' using errcode = 'insufficient_privilege';
  end if;
  select * into v_ev from public.conf_events where id = p_event;
  if not found then raise exception 'event not found' using errcode = 'no_data_found'; end if;
  return v_ev;
end $$;

-- rows: [{"email":..,"full_name":..,"institution":..,"role_title":..}, ...]
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
    insert into public.conf_invitees (site_id, event_id, email, full_name, institution, role_title, source)
    values (v_ev.site_id, v_ev.id, v_email,
            nullif(trim(r->>'full_name'), ''), nullif(trim(r->>'institution'), ''),
            nullif(trim(r->>'role_title'), ''),
            case when p_source = 'manual' then 'manual' else 'csv' end)
    on conflict do nothing;
    if found then v_added := v_added + 1; else v_dupes := v_dupes + 1; end if;
  end loop;

  return jsonb_build_object('added', v_added, 'duplicates', v_dupes,
                            'invalid', coalesce(array_length(v_bad, 1), 0),
                            'invalid_examples', to_jsonb(v_bad[1:10]));
end $$;

create or replace function public.conf_send_invitations(
  p_event uuid, p_invitee_ids uuid[] default null, p_only_new boolean default true
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ev  public.conf_events := public.conf_require_coordinator(p_event);
  v_inv public.conf_invitees;
  v_url text;
  v_n   integer := 0;
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
    v_url := public.conf_portal_url() || '/e/' || v_inv.token;
    update public.conf_invitees set invite_count = invite_count + 1, invited_at = now()
     where id = v_inv.id;
    perform public.enqueue_email(
      'confinv-' || v_inv.id || '-' || (v_inv.invite_count + 1),
      v_inv.email,
      'You''re invited: ' || v_ev.name,
      public.conf_email_html(v_ev, 'You''re invited',
        '<p>Hi ' || public.conf_esc(coalesce(split_part(v_inv.full_name, ' ', 1), 'there')) || ',</p>'
        || '<p>You are invited to <strong>' || public.conf_esc(v_ev.name) || '</strong>.</p>'
        || '<p><strong>When:</strong> ' || public.conf_when(v_ev.starts_on, v_ev.ends_on) || '<br>'
        || '<strong>Where:</strong> ' || public.conf_where(v_ev) || '</p>'
        || case when v_ev.description is not null then
             '<p>' || replace(public.conf_esc(v_ev.description), E'\n', '<br>') || '</p>' else '' end
        || '<p>Please let us know whether you can join us'
        || case when v_ev.zoom_url is not null and v_ev.venue_name is not null
                then ', in person or online' else '' end || '.</p>',
        'RSVP', v_url, v_inv.token));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.conf_request_disclosures(p_event uuid, p_speaker_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ev public.conf_events := public.conf_require_coordinator(p_event);
  v_sp public.conf_speakers;
  v_n  integer := 0;
begin
  if v_ev.organizer_name is null or v_ev.organizer_email is null then
    raise exception 'Add the organizer name and email first';
  end if;
  for v_sp in
    select * from public.conf_speakers
     where event_id = v_ev.id and email is not null
       and disclosure_status in ('not_requested', 'requested')
       and (p_speaker_ids is null or id = any (p_speaker_ids))
  loop
    update public.conf_speakers set disclosure_status = 'requested', disclosure_requested_at = now()
     where id = v_sp.id;
    perform public.enqueue_email(
      'confdisc-' || v_sp.id || '-' || extract(epoch from now())::bigint,
      v_sp.email,
      'Your speaker disclosure for ' || v_ev.name,
      public.conf_email_html(v_ev, 'Your speaker disclosure',
        '<p>Hi ' || public.conf_esc(split_part(v_sp.full_name, ' ', 1)) || ',</p>'
        || '<p>Thank you for speaking at <strong>' || public.conf_esc(v_ev.name) || '</strong>, '
        || public.conf_when(v_ev.starts_on, v_ev.ends_on) || '.</p>'
        || '<p>Please take a minute to disclose any financial relationships relevant to your talk. '
        || 'Attendees will see what you submit, or a note that you have none.</p>',
        'Complete your disclosure', public.conf_portal_url() || '/speaker/' || v_sp.token, null));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.conf_send_letters(p_event uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ev  public.conf_events := public.conf_require_coordinator(p_event);
  v_inv public.conf_invitees;
  v_n   integer := 0;
begin
  if not v_ev.letters_enabled then raise exception 'Participation letters are turned off for this event'; end if;
  if v_ev.organizer_name is null then raise exception 'Add the organizer name first - it signs the letter'; end if;
  for v_inv in
    select * from public.conf_invitees
     where event_id = v_ev.id and checked_in_at is not null and letter_sent_at is null
  loop
    update public.conf_invitees set letter_sent_at = now() where id = v_inv.id;
    -- A letter confirms something the person did, so it goes even to someone
    -- who unsubscribed from invitations and reminders.
    perform public.enqueue_email(
      'conflet-' || v_inv.id,
      v_inv.email,
      'Your participation letter: ' || v_ev.name,
      public.conf_email_html(v_ev, 'Your participation letter',
        '<p>Hi ' || public.conf_esc(coalesce(split_part(v_inv.full_name, ' ', 1), 'there')) || ',</p>'
        || '<p>Thank you for attending <strong>' || public.conf_esc(v_ev.name) || '</strong>. '
        || 'Your participation letter is ready to download and print.</p>',
        'Download your letter', public.conf_portal_url() || '/e/' || v_inv.token || '/letter', v_inv.token));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Coordinator-facing wrapper, for after a capacity change or manual edits.
create or replace function public.conf_fill_from_waitlist(p_event uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_ev public.conf_events := public.conf_require_coordinator(p_event);
begin
  return public.conf_promote_waitlist(v_ev.id, 'in_person') + public.conf_promote_waitlist(v_ev.id, 'virtual');
end $$;

-- ======================== scheduled mail (hourly) ==========================

create or replace function public.enqueue_conference_emails()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ev    public.conf_events;
  v_inv   public.conf_invitees;
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
            '<p>Hi ' || public.conf_esc(coalesce(split_part(v_inv.full_name, ' ', 1), 'there')) || ',</p>'
            || '<p>A reminder that <strong>' || public.conf_esc(v_ev.name) || '</strong> starts tomorrow, '
            || public.conf_when(v_ev.starts_on, v_ev.ends_on) || '.</p>'
            || case when v_inv.rsvp_status = 'in_person' then
                 '<p><strong>Where:</strong> ' || public.conf_esc(coalesce(v_ev.venue_name, 'see the itinerary'))
                 || case when v_ev.venue_address is not null then '<br>' || public.conf_esc(v_ev.venue_address) else '' end
                 || '</p>'
               else
                 '<p><strong>Join online:</strong> <a href="' || public.conf_esc(v_ev.zoom_url) || '">'
                 || public.conf_esc(v_ev.zoom_url) || '</a>'
                 || case when v_ev.zoom_passcode is not null then '<br>Passcode: ' || public.conf_esc(v_ev.zoom_passcode) else '' end
                 || '</p>'
               end
            || '<p>The full itinerary, and a calendar file for your phone, are on your event page.</p>',
            'Open the itinerary', public.conf_portal_url() || '/e/' || v_inv.token, v_inv.token));
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
              '<p>Hi ' || public.conf_esc(coalesce(split_part(v_inv.full_name, ' ', 1), 'there')) || ',</p>'
              || '<p>Thank you for joining <strong>' || public.conf_esc(v_ev.name) || '</strong>. '
              || 'It takes a minute to tell us how the sessions went, and it shapes the next one.</p>',
              'Give feedback', public.conf_portal_url() || '/e/' || v_inv.token || '/feedback', v_inv.token));
          v_n := v_n + 1;
        end loop;
        update public.conf_events set feedback_sent_at = now() where id = v_ev.id;
      end if;
    end if;
  end loop;
  perform set_config('app.site_id', '', true);
  return v_n;
end $$;

-- Conference mail goes to people outside the portal. It must never be CC'd to
-- a portal provider's administrative assistant just because an invitee's
-- address happens to match a provider's.
create or replace function public.cc_assistant_emails()
returns trigger
language plpgsql security definer set search_path = public as $function$
declare u record; recipients text[]; a text; i int := 0;
begin
  if pg_trigger_depth() > 1 then return new; end if; -- never CC a CC
  if new.ref_key like 'conf%' then return new; end if; -- conference mail is not CC'd

  select id, full_name into u
  from public.site_users
  where lower(email) = lower(new.to_email) and status = 'active'
  limit 1;
  if u.id is null then return new; end if;

  select array_agg(distinct e) into recipients
  from (
    select lower(trim(x)) as e
    from unnest(coalesce((select assistant_emails from public.site_users where id = u.id), '{}')) as x
    union
    select lower(au.email) as e
    from public.provider_assistants pa
    join public.site_users au on au.id = pa.assistant_id
    where pa.provider_id = u.id and au.status = 'active' and au.email is not null
  ) s
  where e is not null and position('@' in e) > 0 and e <> lower(new.to_email);

  if recipients is null then return new; end if;

  foreach a in array recipients loop
    i := i + 1;
    perform public.enqueue_email(
      coalesce(new.ref_key, new.id::text) || '-cc' || i,
      a,
      new.subject,
      '<p style="color:#5B6677;font-size:12px;margin:0 0 12px">You are receiving a copy of this email as an administrative assistant for '
        || u.full_name || '. The original was sent to ' || new.to_email || '.</p>'
        || new.html
    );
  end loop;
  return new;
end;
$function$;

-- ============================ ownership & grants ===========================

do $$
declare f text;
begin
  foreach f in array array[
    'conf_esc(text)', 'conf_portal_url()', 'conf_when(date,date)',
    'conf_email_html(public.conf_events,text,text,text,text,text)',
    'conf_where(public.conf_events)', 'conf_credit_hours(public.conf_invitees)',
    'conf_promote_waitlist(uuid,text)', 'conf_invitees_release()', 'conf_events_capacity()',
    'conf_public_event(text)', 'conf_public_rsvp(text,text,text,text,text,text,text)',
    'conf_public_feedback(text,uuid,integer,text)', 'conf_public_unsubscribe(text)',
    'conf_public_letter(text)', 'conf_public_disclosure(text)',
    'conf_public_disclosure_submit(text,boolean,text)',
    'conf_require_coordinator(uuid)', 'conf_import_invitees(uuid,jsonb,text)',
    'conf_send_invitations(uuid,uuid[],boolean)', 'conf_request_disclosures(uuid,uuid[])',
    'conf_send_letters(uuid)', 'conf_fill_from_waitlist(uuid)', 'enqueue_conference_emails()'
  ] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;

  -- invitees and speakers, signed out
  foreach f in array array[
    'conf_public_event(text)', 'conf_public_rsvp(text,text,text,text,text,text,text)',
    'conf_public_feedback(text,uuid,integer,text)', 'conf_public_unsubscribe(text)',
    'conf_public_letter(text)', 'conf_public_disclosure(text)',
    'conf_public_disclosure_submit(text,boolean,text)'
  ] loop
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;

  -- the program's director or admin
  foreach f in array array[
    'conf_import_invitees(uuid,jsonb,text)', 'conf_send_invitations(uuid,uuid[],boolean)',
    'conf_request_disclosures(uuid,uuid[])', 'conf_send_letters(uuid)',
    'conf_fill_from_waitlist(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- The coordinator pages use conf_credit_hours() and conf_when() through
-- ordinary selects; everything else above stays private.
grant execute on function public.conf_when(date, date) to authenticated;

select cron.schedule('conference-emails-hourly', '20 * * * *', 'select public.enqueue_conference_emails()');
