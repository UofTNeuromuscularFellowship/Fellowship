-- ---------------------------------------------------------------------------
-- 0043 — when rounds invitations go out: after the previous session
--
-- A session's invitation no longer goes out the moment it gets a topic. It is
-- due one week after the previous session in the series took place — or, when
-- that would land on or after the day of this session (weekly rounds), one
-- day after the previous session. If sessions are a day apart, it goes out as
-- soon as the previous one ends. The first session of a series (nothing
-- before it) is due straight away. Either way it still needs a topic: a
-- session without one waits, and goes out as soon as a topic is added.
-- Cancelled sessions don't count as "the previous session".
-- "Send invitations now" on the session still sends at once.
-- ---------------------------------------------------------------------------

create or replace function public.rounds_invite_due(p_session uuid)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare v_s rounds_sessions; v_prev timestamptz; v_due timestamptz;
begin
  select * into v_s from public.rounds_sessions where id = p_session;
  if not found then return null; end if;
  select p.ends_at into v_prev from public.rounds_sessions p
   where p.series_id = v_s.series_id and p.id <> v_s.id and p.status = 'scheduled' and p.starts_at < v_s.starts_at
   order by p.starts_at desc limit 1;
  if v_prev is null then return v_s.created_at; end if;
  v_due := v_prev + interval '7 days';
  if (v_due at time zone v_s.timezone)::date >= (v_s.starts_at at time zone v_s.timezone)::date then
    v_due := v_prev + interval '1 day';
  end if;
  if v_due >= v_s.starts_at then v_due := v_prev; end if;
  return v_due;
end $$;
alter function public.rounds_invite_due(uuid) owner to app_definer;
revoke all on function public.rounds_invite_due(uuid) from public, anon, authenticated;

do $$
declare
  v_def text; v_hits int;
  a text := $o$and (ser.invite_lead_days is null or s.starts_at <= now() + make_interval(days => ser.invite_lead_days))$o$;
  b text := $n$and public.rounds_invite_due(s.id) <= now()$n$;
begin
  v_def := pg_get_functiondef('public.enqueue_rounds_emails()'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_hits <> 1 then raise exception 'enqueue_rounds_emails: expected 1 match, found %', v_hits; end if;
  execute replace(v_def, a, b);
end $$;

comment on column public.rounds_series.invite_lead_days is 'Unused since 0043: invitations follow the previous session (rounds_invite_due).';

notify pgrst, 'reload schema';
