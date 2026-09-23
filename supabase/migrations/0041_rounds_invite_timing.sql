-- ---------------------------------------------------------------------------
-- 0041 — when rounds invitations go out
--
-- By default a session's invitation goes out as soon as it has a topic. A
-- weekly series planned a term ahead would then send every session's
-- invitation on the same day, so a series can instead hold each invitation
-- until a set number of days before (it still needs a topic by then).
-- ---------------------------------------------------------------------------

alter table public.rounds_series
  add column if not exists invite_lead_days smallint check (invite_lead_days is null or invite_lead_days between 1 and 60);

do $$
declare
  v_def text; v_hits int;
  a text := $o$    select s.* from public.rounds_sessions s
     where s.status = 'scheduled' and s.invite_sent_at is null and coalesce(trim(s.topic), '') <> '' and s.starts_at > now()
  loop$o$;
  b text := $n$    select s.* from public.rounds_sessions s join public.rounds_series ser on ser.id = s.series_id
     where s.status = 'scheduled' and s.invite_sent_at is null and coalesce(trim(s.topic), '') <> '' and s.starts_at > now()
       and ser.status = 'active'
       and (ser.invite_lead_days is null or s.starts_at <= now() + make_interval(days => ser.invite_lead_days))
  loop$n$;
begin
  v_def := pg_get_functiondef('public.enqueue_rounds_emails()'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_hits <> 1 then raise exception 'enqueue_rounds_emails: expected 1 match, found %', v_hits; end if;
  execute replace(v_def, a, b);
end $$;

-- An archived series sends nothing more: no reminders or feedback requests either.
do $$
declare v_def text; v_hits int; a text; b text;
begin
  v_def := pg_get_functiondef('public.enqueue_rounds_emails()'::regprocedure);
  foreach a in array array['ser.reminder_enabled and s.reminder_sent_at is null', 'ser.feedback_enabled and s.feedback_sent_at is null'] loop
    v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
    if v_hits <> 1 then raise exception 'enqueue_rounds_emails: expected 1 match for %, found %', a, v_hits; end if;
    v_def := replace(v_def, a, 'ser.status = ''active'' and ' || a);
  end loop;
  execute v_def;
end $$;

notify pgrst, 'reload schema';
