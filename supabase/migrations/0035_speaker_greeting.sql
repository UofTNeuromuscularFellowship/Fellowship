-- ---------------------------------------------------------------------------
-- 0035 — greet speakers by name, not by title
--
-- Speaker emails opened "Hi Dr," because they took the first word of the
-- name. Speakers are usually entered as "Dr Jane Smith", so when the first
-- word is a title the greeting now uses the whole name ("Hi Dr Jane Smith,").
-- ---------------------------------------------------------------------------

create or replace function public.conf_greeting_name(p_name text)
returns text
language sql immutable set search_path = public as $$
  select case
    when nullif(trim(coalesce(p_name, '')), '') is null then 'there'
    when split_part(trim(p_name), ' ', 1) ~* '^(dr|prof|professor|mr|mrs|ms|mx|miss|sir|dame)\.?$' then trim(p_name)
    else split_part(trim(p_name), ' ', 1)
  end
$$;
revoke all on function public.conf_greeting_name(text) from public, anon, authenticated;
grant execute on function public.conf_greeting_name(text) to app_definer;

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
        '<p>Hi ' || public.conf_esc(public.conf_greeting_name(v_sp.full_name)) || ',</p>'
        || '<p>Thank you for speaking at <strong>' || public.conf_esc(v_ev.name) || '</strong>, '
        || public.conf_when(v_ev.starts_on, v_ev.ends_on) || '.</p>'
        || '<p>Please take a minute to disclose any financial relationships relevant to your talk. '
        || 'Attendees will see what you submit, or a note that you have none.</p>',
        'Complete your disclosure', public.conf_portal_url() || '/speaker/' || v_sp.token, null));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.conf_request_payment_details(p_event uuid, p_speaker_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ev public.conf_events := public.conf_require_coordinator(p_event);
  r    record;
  v_n  integer := 0;
begin
  if v_ev.organizer_name is null or v_ev.organizer_email is null then
    raise exception 'Add the organizer name and email first';
  end if;
  for r in
    select s.id as speaker_id, s.full_name, s.email, s.token, h.id as honorarium_id, h.amount, h.claims_allowed
      from public.conf_speakers s join public.conf_honoraria h on h.speaker_id = s.id
     where s.event_id = v_ev.id and s.email is not null and h.paid_at is null
       and (coalesce(h.amount, 0) > 0 or h.claims_allowed)
       and (p_speaker_ids is null or s.id = any (p_speaker_ids))
  loop
    update public.conf_honoraria set requested_at = now() where id = r.honorarium_id;
    perform public.enqueue_email(
      'confpay-' || r.honorarium_id || '-' || extract(epoch from now())::bigint,
      r.email,
      'Arranging your payment for ' || v_ev.name,
      public.conf_email_html(v_ev, 'Arranging your payment',
        '<p>Hi ' || public.conf_esc(public.conf_greeting_name(r.full_name)) || ',</p>'
        || '<p>Thank you for speaking at <strong>' || public.conf_esc(v_ev.name) || '</strong>, '
        || public.conf_when(v_ev.starts_on, v_ev.ends_on) || '.</p>'
        || case when coalesce(r.amount, 0) > 0 then
             '<p>We would like to arrange your honorarium of <strong>'
             || to_char(r.amount, 'FM$999,999,990.00') || '</strong>. Please confirm the amount and tell us '
             || 'who to make the payment out to, and whether you would like a cheque or an e-Transfer.</p>'
           else
             '<p>Please tell us who to make your payment out to, and whether you would like a cheque or an e-Transfer.</p>'
           end
        || case when r.claims_allowed then
             '<p>You can also submit your travel and other expenses there, with photos or scans of your receipts.</p>'
           else '' end
        || '<p>This link is private to you, so please don''t forward it.</p>',
        'Arrange your payment', public.conf_portal_url() || '/speaker/' || r.token, null));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

do $$
declare f text;
begin
  foreach f in array array['conf_request_disclosures(uuid,uuid[])', 'conf_request_payment_details(uuid,uuid[])'] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
