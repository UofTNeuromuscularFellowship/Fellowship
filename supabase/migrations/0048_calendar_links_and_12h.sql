-- ---------------------------------------------------------------------------
-- 0048 — "Add to calendar" after an RSVP, and 12-hour times
--
-- Saying yes to a rounds session or a course now sends a confirmation email
-- with links to add it to Google Calendar, Outlook, or (as an .ics file
-- downloaded from the RSVP page) Apple Calendar and Outlook on the desktop.
-- Being moved off a course waitlist sends the same links.
--
-- Rounds times in emails are written on the 12-hour clock: "12:00 PM".
-- ---------------------------------------------------------------------------

-- Percent-encoding for links.
create or replace function public.cal_urlencode(p text)
returns text language sql immutable set search_path = public as $$
  select coalesce(string_agg(
           case when b between 48 and 57 or b between 65 and 90 or b between 97 and 122 or b in (45, 46, 95, 126)
                then chr(b) else '%' || upper(lpad(to_hex(b), 2, '0')) end, '' order by i), '')
    from (select i, get_byte(convert_to(coalesce(p, ''), 'UTF8'), i) as b
            from generate_series(0, octet_length(convert_to(coalesce(p, ''), 'UTF8')) - 1) as i) x
$$;

-- The three calendar links, as a block of email HTML. Either a timed entry
-- (p_start, p_end) or whole days (p_from, p_to, both inclusive).
create or replace function public.cal_links_html(
  p_title text, p_start timestamptz, p_end timestamptz, p_from date, p_to date,
  p_location text, p_details text, p_ics_url text
) returns text language plpgsql volatile set search_path = public as $$
declare v_g text; v_o text; v_old text := current_setting('TimeZone');
begin
  perform set_config('TimeZone', 'UTC', true);
  if p_start is not null then
    v_g := to_char(p_start, 'YYYYMMDD"T"HH24MISS"Z"') || '/' || to_char(p_end, 'YYYYMMDD"T"HH24MISS"Z"');
    v_o := '&startdt=' || to_char(p_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '&enddt=' || to_char(p_end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  else
    v_g := to_char(p_from, 'YYYYMMDD') || '/' || to_char(p_to + 1, 'YYYYMMDD');
    v_o := '&allday=true&startdt=' || to_char(p_from, 'YYYY-MM-DD') || '&enddt=' || to_char(p_to + 1, 'YYYY-MM-DD');
  end if;
  perform set_config('TimeZone', v_old, true);
  return '<p style="margin:22px 0 6px;font-weight:600">Add it to your calendar</p>'
    || '<p style="margin:0 0 6px">'
    || '<a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=' || public.cal_urlencode(p_title)
    ||   '&dates=' || v_g || '&details=' || public.cal_urlencode(p_details) || '&location=' || public.cal_urlencode(p_location)
    ||   '" style="color:#0E7C86;font-weight:600">Google Calendar</a>'
    || ' &nbsp;·&nbsp; <a href="https://outlook.office.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject='
    ||   public.cal_urlencode(p_title) || v_o || '&body=' || public.cal_urlencode(p_details) || '&location=' || public.cal_urlencode(p_location)
    ||   '" style="color:#0E7C86;font-weight:600">Outlook</a>'
    || ' &nbsp;·&nbsp; <a href="' || p_ics_url || '" style="color:#0E7C86;font-weight:600">Apple Calendar or other (.ics)</a>'
    || '</p>';
end $$;

-- ------------------------------------------------------------------ rounds

-- "Thursday, October 15, 2026, 12:00 PM – 1:00 PM EDT"
create or replace function public.rounds_when(p_start timestamptz, p_end timestamptz, p_tz text)
returns text language plpgsql volatile set search_path = public as $$
declare v_old text := current_setting('TimeZone'); v text;
begin
  perform set_config('TimeZone', coalesce(nullif(p_tz, ''), 'America/Toronto'), true);
  v := to_char(p_start, 'FMDay, FMMonth FMDD, YYYY, FMHH12:MI AM') || ' – ' || to_char(p_end, 'FMHH12:MI AM TZ');
  perform set_config('TimeZone', v_old, true);
  return v;
end $$;

create or replace function public.rounds_calendar_html(p_inv public.rounds_invites)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_s public.rounds_sessions; v_ser public.rounds_series; v_fmt text; v_loc text; v_video text; v_details text;
begin
  select * into v_s from public.rounds_sessions where id = p_inv.session_id;
  select * into v_ser from public.rounds_series where id = v_s.series_id;
  v_fmt := coalesce(v_s.format, v_ser.format);
  v_video := case when v_fmt in ('virtual', 'hybrid') then coalesce(v_s.video_url, v_ser.video_url) end;
  v_loc := case
    when v_fmt = 'virtual' then v_video
    when p_inv.response = 'virtual' and v_video is not null then v_video
    else coalesce(v_s.location, v_ser.location, v_video) end;
  v_details := concat_ws(E'\n',
    nullif(concat_ws(' — ', v_s.topic, v_s.speaker), ''),
    case when v_video is not null then 'Join online: ' || v_video
      || case when v_ser.video_passcode is not null then ' (passcode ' || v_ser.video_passcode || ')' else '' end end,
    'Details and RSVP: ' || public.conf_portal_url() || '/rsvp/' || p_inv.token);
  return public.cal_links_html(v_ser.title || coalesce(': ' || v_s.topic, ''), v_s.starts_at, v_s.ends_at, null, null,
    coalesce(v_loc, ''), v_details, public.conf_portal_url() || '/rsvp/' || p_inv.token || '/calendar');
end $$;

-- Saying yes sends the details and the calendar links.
do $$
declare v_def text; v_hits int;
  a text := $o$   where id = v_inv.id;
  return public.rounds_public(p_token);$o$;
  b text := $n$   where id = v_inv.id;
  if p_response in ('in_person', 'virtual') and v_inv.response is distinct from p_response
     and not exists (select 1 from public.rounds_unsubscribes un where un.site_id = v_inv.site_id and un.email = lower(v_inv.email)) then
    select * into v_inv from public.rounds_invites where id = v_inv.id;
    perform public.rounds_send_confirmation(v_inv);
  end if;
  return public.rounds_public(p_token);$n$;
begin
  v_def := pg_get_functiondef('public.rounds_public_rsvp(text,text,text)'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_hits <> 1 then raise exception 'rounds_public_rsvp: expected 1 match, found %', v_hits; end if;
  -- the new function must exist before the patched one is created
  execute $f$
    create or replace function public.rounds_send_confirmation(p_inv public.rounds_invites)
    returns void language plpgsql security definer set search_path = public as $b$
    declare v_s public.rounds_sessions; v_ser public.rounds_series;
    begin
      select * into v_s from public.rounds_sessions where id = p_inv.session_id;
      select * into v_ser from public.rounds_series where id = v_s.series_id;
      if v_s.status <> 'scheduled' or v_s.starts_at <= now() then return; end if;
      perform public.enqueue_email('roundsrsvp-' || p_inv.id || '-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), p_inv.email,
        'You''re on the list: ' || v_ser.title || coalesce(': ' || v_s.topic, ''),
        public.rounds_email_html(v_ser, 'You''re on the list',
          '<p>Hi ' || public.rounds_esc(public.conf_greeting_name(p_inv.full_name)) || ',</p>'
          || '<p>Thanks — you''re down as ' || case p_inv.response when 'virtual' then 'joining online' else 'coming in person' end
          || ' to <strong>' || coalesce(public.rounds_esc(v_s.topic), public.rounds_esc(v_ser.title)) || '</strong>'
          || case when v_s.speaker is not null then ' with ' || public.rounds_esc(v_s.speaker) else '' end || '.</p>'
          || '<p><strong>When:</strong> ' || public.rounds_when(v_s.starts_at, v_s.ends_at, v_s.timezone) || '</p>'
          || public.rounds_where_html(v_ser, v_s, true)
          || public.rounds_calendar_html(p_inv)
          || case when v_ser.reminder_enabled then '<p>We''ll also send a reminder the day before.</p>' else '' end,
          'View or change your RSVP', public.conf_portal_url() || '/rsvp/' || p_inv.token, p_inv.token));
    end $b$;
  $f$;
  execute replace(v_def, a, b);
end $$;

-- ----------------------------------------------------------------- courses

create or replace function public.conf_calendar_html(p_ev public.conf_events, p_inv public.conf_invitees, p_mode text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_days int; v_first timestamptz; v_last timestamptz; v_loc text; v_zoom text; v_details text; v_tz text;
begin
  v_tz := coalesce(nullif(p_ev.timezone, ''), 'America/Toronto');
  v_zoom := p_ev.zoom_url;
  v_loc := case when p_mode = 'virtual' and v_zoom is not null then v_zoom
                else coalesce(nullif(concat_ws(', ', p_ev.venue_name, p_ev.venue_address), ''), v_zoom, '') end;
  v_details := concat_ws(E'\n',
    nullif(left(coalesce(p_ev.description, ''), 600), ''),
    case when v_zoom is not null then 'Zoom: ' || v_zoom
      || case when p_ev.zoom_passcode is not null then ' (passcode ' || p_ev.zoom_passcode || ')' else '' end end,
    'Itinerary and details: ' || public.conf_portal_url() || '/e/' || p_inv.token);
  select count(distinct session_date), min((session_date + start_time) at time zone v_tz), max((session_date + end_time) at time zone v_tz)
    into v_days, v_first, v_last
    from public.conf_sessions where event_id = p_ev.id;
  if v_days = 1 then
    return public.cal_links_html(p_ev.name, v_first, v_last, null, null, v_loc, v_details,
      public.conf_portal_url() || '/e/' || p_inv.token || '/calendar');
  end if;
  -- several days: whole days in Google and Outlook; the .ics has each day's hours
  return public.cal_links_html(p_ev.name, null, null, p_ev.starts_on, p_ev.ends_on, v_loc, v_details,
    public.conf_portal_url() || '/e/' || p_inv.token || '/calendar');
end $$;

create or replace function public.conf_send_confirmation(p_ev public.conf_events, p_inv public.conf_invitees, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_inv.unsubscribed_at is not null then return; end if;
  perform public.enqueue_email('confyes-' || p_inv.id || '-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), p_inv.email,
    'You''re registered: ' || p_ev.name,
    public.conf_email_html(p_ev, 'You''re registered',
      '<p>Hi ' || public.conf_esc(public.conf_greeting_name(p_inv.full_name)) || ',</p>'
      || '<p>Thanks — you''re confirmed to attend <strong>' || public.conf_esc(p_ev.name) || '</strong> '
      || case p_mode when 'virtual' then 'online' else 'in person' end
      || ', ' || public.conf_when(p_ev.starts_on, p_ev.ends_on) || '.</p>'
      || public.conf_calendar_html(p_ev, p_inv, p_mode)
      || '<p>Your event page has the itinerary and joining details. If you can no longer come, please update your RSVP there.</p>',
      'View the details', public.conf_portal_url() || '/e/' || p_inv.token, p_inv.token));
end $$;

do $$
declare v_def text; v_hits int;
  a text := $o$  where id = v_inv.id;

  return jsonb_build_object('rsvp_status', v_new, 'waitlist_for', v_wait);$o$;
  b text := $n$  where id = v_inv.id;

  if v_new in ('in_person', 'virtual') and v_inv.rsvp_status is distinct from v_new then
    select * into v_inv from public.conf_invitees where id = v_inv.id;
    perform public.conf_send_confirmation(v_ev, v_inv, v_new);
  end if;

  return jsonb_build_object('rsvp_status', v_new, 'waitlist_for', v_wait);$n$;
begin
  v_def := pg_get_functiondef('public.conf_public_rsvp(text,text,text,text,text,text,text)'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_hits <> 1 then raise exception 'conf_public_rsvp: expected 1 match, found %', v_hits; end if;
  execute replace(v_def, a, b);
end $$;

do $$
declare v_def text; v_hits int;
  a text := $o$          || '<p>If you can no longer come, please update your RSVP so the place goes to someone else.</p>',$o$;
  b text := $n$          || public.conf_calendar_html(v_ev, v_next, p_mode)
          || '<p>If you can no longer come, please update your RSVP so the place goes to someone else.</p>',$n$;
begin
  v_def := pg_get_functiondef('public.conf_promote_waitlist(uuid,text)'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_hits <> 1 then raise exception 'conf_promote_waitlist: expected 1 match, found %', v_hits; end if;
  execute replace(v_def, a, b);
end $$;

do $$
declare f text;
begin
  foreach f in array array['cal_links_html(text,timestamp with time zone,timestamp with time zone,date,date,text,text,text)',
    'rounds_calendar_html(public.rounds_invites)', 'rounds_send_confirmation(public.rounds_invites)',
    'conf_calendar_html(public.conf_events,public.conf_invitees,text)', 'conf_send_confirmation(public.conf_events,public.conf_invitees,text)'] loop
    -- owned like the functions that call them, so they run with the same rights
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
