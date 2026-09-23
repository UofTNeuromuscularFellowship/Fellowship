-- ---------------------------------------------------------------------------
-- 0042 — rounds: the video link goes in every email
--
-- The joining link used to be held back until someone RSVP'd yes. Now it is
-- in the invitation (and every other rounds email), so people who don't RSVP
-- can still join, and the RSVP page shows it to everyone invited.
-- ---------------------------------------------------------------------------

create or replace function public.rounds_where_html(p_series public.rounds_series, p_session public.rounds_sessions, p_show_link boolean)
returns text language sql stable set search_path = public as $$
  -- p_show_link is kept for the callers' signature; the link is always shown.
  select
    case when coalesce(p_session.format, p_series.format) in ('in_person', 'hybrid')
              and coalesce(p_session.location, p_series.location) is not null then
      '<p><strong>Where:</strong> ' || public.rounds_esc(coalesce(p_session.location, p_series.location)) || '</p>' else '' end
    || case when coalesce(p_session.format, p_series.format) in ('virtual', 'hybrid') then
      case when coalesce(p_session.video_url, p_series.video_url) is not null then
        '<p><strong>Join online:</strong> <a href="' || public.rounds_esc(coalesce(p_session.video_url, p_series.video_url)) || '">'
        || public.rounds_esc(coalesce(p_session.video_url, p_series.video_url)) || '</a>'
        || case when p_series.video_passcode is not null then ' · passcode ' || public.rounds_esc(p_series.video_passcode) else '' end || '</p>'
      else '<p><strong>Online:</strong> the organizer will share the joining link.</p>' end
    else '' end
$$;

-- The RSVP page shows the link and passcode to everyone invited.
do $$
declare v_def text; v_hits int; a text; b text;
begin
  v_def := pg_get_functiondef('public.rounds_public(text)'::regprocedure);
  foreach a in array array[
    $o$'video_url', case when v_coming then coalesce(v_s.video_url, v_ser.video_url) end$o$,
    $o$'video_passcode', case when v_coming then v_ser.video_passcode end$o$
  ] loop
    v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
    if v_hits <> 1 then raise exception 'rounds_public: expected 1 match for %, found %', a, v_hits; end if;
  end loop;
  v_def := replace(v_def, $o$'video_url', case when v_coming then coalesce(v_s.video_url, v_ser.video_url) end$o$,
                          $n$'video_url', coalesce(v_s.video_url, v_ser.video_url)$n$);
  v_def := replace(v_def, $o$'video_passcode', case when v_coming then v_ser.video_passcode end$o$,
                          $n$'video_passcode', v_ser.video_passcode$n$);
  execute v_def;
end $$;

-- The day-before reminder goes to everyone invited who hasn't said no —
-- people who haven't RSVP'd too — unless they've since unsubscribed.
do $$
declare v_def text; v_hits int; a text; b text;
begin
  v_def := pg_get_functiondef('public.enqueue_rounds_emails()'::regprocedure);
  for a, b in
    select * from (values
      ($o$for v_inv in select * from public.rounds_invites where session_id = v_s.id and response in ('in_person', 'virtual') loop
      perform public.enqueue_email('roundsrem-'$o$,
       $n$for v_inv in select * from public.rounds_invites i where i.session_id = v_s.id and coalesce(i.response, '') <> 'declined'
                      and not exists (select 1 from public.rounds_unsubscribes un where un.site_id = i.site_id and un.email = lower(i.email)) loop
      perform public.enqueue_email('roundsrem-'$n$),
      ($o$public.rounds_email_html(v_ser, 'See you tomorrow',$o$,
       $n$public.rounds_email_html(v_ser, case when v_inv.response is null then 'Tomorrow — can you come?' else 'See you tomorrow' end,$n$),
      ($o$'Change my RSVP', public.conf_portal_url() || '/rsvp/' || v_inv.token, v_inv.token));
      v_n := v_n + 1;$o$,
       $n$case when v_inv.response is null then 'RSVP' else 'Change my RSVP' end, public.conf_portal_url() || '/rsvp/' || v_inv.token, v_inv.token));
      v_n := v_n + 1;$n$)
    ) t(a, b)
  loop
    v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
    if v_hits <> 1 then raise exception 'enqueue_rounds_emails: expected 1 match, found % for %', v_hits, left(a, 60); end if;
    v_def := replace(v_def, a, b);
  end loop;
  execute v_def;
end $$;

notify pgrst, 'reload schema';
