-- ---------------------------------------------------------------------------
-- 0039 — logos on conference and course materials; rounds
--
-- Logos: each event (and each rounds series) can carry a logo. It is stored in
-- the public 'branding' bucket under the program's id, and shown on the
-- event's emails, public pages, badges, participation letters and money
-- reports. Only the program's director or admin (or, for rounds, someone
-- allowed to run rounds) can upload one.
--
-- Rounds: a series of sessions — one date, weekly, monthly or every few
-- weeks — each of which can be moved to any date, time and time zone. A
-- series is in person, by video, or both. Invitations go to the series'
-- mailing lists (and, if chosen, everyone in the program) once a session has
-- a topic; people RSVP from the email; those coming get a reminder the day
-- before, are asked for feedback afterwards, and can download a certificate
-- of attendance. The director runs rounds and can let supervisors run them.
-- ---------------------------------------------------------------------------

-- ================================================================== logos

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.conf_events add column if not exists logo_url text;
alter table public.conf_events drop constraint if exists conf_events_logo_url_https;
alter table public.conf_events add constraint conf_events_logo_url_https check (logo_url is null or logo_url ~ '^https://');

-- ================================================================ rounds

-- Supervisors the director has allowed to run rounds.
create table if not exists public.rounds_managers (
  site_id   uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  added_by  uuid references public.users(id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (site_id, user_id)
);

create or replace function public.can_manage_rounds()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_director_or_admin(), false)
      or exists (
        select 1 from public.rounds_managers rm
          join public.site_memberships m on m.user_id = rm.user_id and m.site_id = rm.site_id and m.status = 'active'
         where rm.site_id = public.current_site_id() and rm.user_id = auth.uid())
$$;

create table if not exists public.rounds_series (
  id                uuid primary key default gen_random_uuid(),
  site_id           uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  title             text not null check (length(trim(title)) > 0),
  description       text,
  format            text not null default 'in_person' check (format in ('in_person', 'virtual', 'hybrid')),
  location          text,
  video_url         text check (video_url is null or video_url ~ '^https?://'),
  video_passcode    text,
  timezone          text not null default 'America/Toronto',
  duration_min      integer not null default 60 check (duration_min between 5 and 720),
  recurrence        text not null default 'once' check (recurrence in ('once', 'weekly', 'monthly', 'interval')),
  recurrence_rule   jsonb not null default '{}'::jsonb,
  credit_hours      numeric(5,2) check (credit_hours is null or credit_hours >= 0),
  credits_statement text,
  organizer_name    text,
  organizer_email   text,
  logo_url          text check (logo_url is null or logo_url ~ '^https://'),
  invite_program    boolean not null default false,
  reminder_enabled  boolean not null default true,
  feedback_enabled  boolean not null default true,
  status            text not null default 'active' check (status in ('active', 'archived')),
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists rounds_series_site on public.rounds_series (site_id);

create table if not exists public.rounds_sessions (
  id               uuid primary key default gen_random_uuid(),
  site_id          uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  series_id        uuid not null references public.rounds_series(id) on delete cascade,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  timezone         text not null default 'America/Toronto',
  topic            text,
  speaker          text,
  details          text,
  format           text check (format is null or format in ('in_person', 'virtual', 'hybrid')),
  location         text,
  video_url        text check (video_url is null or video_url ~ '^https?://'),
  status           text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  cancel_reason    text,
  invite_sent_at   timestamptz,
  reminder_sent_at timestamptz,
  feedback_sent_at timestamptz,
  created_at       timestamptz not null default now(),
  constraint rounds_sessions_order check (ends_at > starts_at)
);
create index if not exists rounds_sessions_series on public.rounds_sessions (series_id, starts_at);
create index if not exists rounds_sessions_site_time on public.rounds_sessions (site_id, starts_at);

create table if not exists public.rounds_lists (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.rounds_list_members (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  list_id    uuid not null references public.rounds_lists(id) on delete cascade,
  email      text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name  text,
  created_at timestamptz not null default now()
);
create unique index if not exists rounds_list_members_unique on public.rounds_list_members (list_id, lower(email));

create table if not exists public.rounds_series_lists (
  series_id uuid not null references public.rounds_series(id) on delete cascade,
  list_id   uuid not null references public.rounds_lists(id) on delete cascade,
  site_id   uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  primary key (series_id, list_id)
);

-- People who asked not to get rounds emails from this program.
create table if not exists public.rounds_unsubscribes (
  site_id   uuid not null references public.sites(id) on delete cascade,
  email     text not null,
  at        timestamptz not null default now(),
  primary key (site_id, email)
);

-- One per person per session: the invitation, their RSVP, whether they came,
-- and their feedback.
create table if not exists public.rounds_invites (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  session_id    uuid not null references public.rounds_sessions(id) on delete cascade,
  email         text not null,
  full_name     text,
  token         text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  response      text check (response is null or response in ('in_person', 'virtual', 'declined')),
  responded_at  timestamptz,
  attended      boolean,
  rating        smallint check (rating is null or rating between 1 and 5),
  comments      text,
  feedback_at   timestamptz,
  invited_at    timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists rounds_invites_unique on public.rounds_invites (session_id, lower(email));

-- ------------------------------------------------------------------ RLS

do $$
declare t text;
begin
  foreach t in array array['rounds_managers', 'rounds_series', 'rounds_sessions', 'rounds_lists',
                           'rounds_list_members', 'rounds_series_lists', 'rounds_unsubscribes', 'rounds_invites'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_site_isolation', t);
    execute format($p$create policy %I on public.%I as restrictive for all
      using ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
      with check ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))$p$,
      t || '_site_isolation', t);
    execute format('drop policy if exists %I on public.%I', t || '_app_definer_all', t);
    execute format('create policy %I on public.%I for all to app_definer using (true) with check (true)', t || '_app_definer_all', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant all on public.%I to service_role, app_definer', t);
  end loop;
end $$;

-- people who run rounds manage the series, sessions, lists and see the RSVPs
do $$
declare t text;
begin
  foreach t in array array['rounds_series', 'rounds_sessions', 'rounds_lists', 'rounds_list_members', 'rounds_series_lists'] loop
    execute format('drop policy if exists %I on public.%I', t || '_manage', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.can_manage_rounds()) with check (public.can_manage_rounds())', t || '_manage', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists rounds_invites_manage on public.rounds_invites;
create policy rounds_invites_manage on public.rounds_invites for select to authenticated using (public.can_manage_rounds());
drop policy if exists rounds_invites_attendance on public.rounds_invites;
create policy rounds_invites_attendance on public.rounds_invites for update to authenticated
  using (public.can_manage_rounds()) with check (public.can_manage_rounds());
grant select, update (attended) on public.rounds_invites to authenticated;

drop policy if exists rounds_managers_read on public.rounds_managers;
create policy rounds_managers_read on public.rounds_managers for select to authenticated using (public.can_manage_rounds());
drop policy if exists rounds_managers_director on public.rounds_managers;
create policy rounds_managers_director on public.rounds_managers for all to authenticated
  using (public.current_app_role() = 'director') with check (public.current_app_role() = 'director');
grant select, insert, delete on public.rounds_managers to authenticated;

drop policy if exists rounds_unsubscribes_read on public.rounds_unsubscribes;
create policy rounds_unsubscribes_read on public.rounds_unsubscribes for select to authenticated using (public.can_manage_rounds());
grant select on public.rounds_unsubscribes to authenticated;

-- ------------------------------------------------------ branding storage

drop policy if exists branding_write on storage.objects;
create policy branding_write on storage.objects for insert to authenticated
  with check (bucket_id = 'branding'
              and (storage.foldername(name))[1] = (select public.current_site_id())::text
              and (public.is_director_or_admin() or public.can_manage_rounds()));
drop policy if exists branding_update on storage.objects;
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding'
         and (storage.foldername(name))[1] = (select public.current_site_id())::text
         and (public.is_director_or_admin() or public.can_manage_rounds()));
drop policy if exists branding_delete on storage.objects;
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding'
         and (storage.foldername(name))[1] = (select public.current_site_id())::text
         and (public.is_director_or_admin() or public.can_manage_rounds()));

-- --------------------------------------------------------------- helpers

create or replace function public.rounds_esc(p text)
returns text language sql immutable set search_path = public as $$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

-- "Thursday, October 15, 2026, 12:00–13:00 EDT" in the session's own time zone.
create or replace function public.rounds_when(p_start timestamptz, p_end timestamptz, p_tz text)
returns text language plpgsql volatile set search_path = public as $$
declare v_old text := current_setting('TimeZone'); v text;
begin
  perform set_config('TimeZone', coalesce(nullif(p_tz, ''), 'America/Toronto'), true);
  v := to_char(p_start, 'FMDay, FMMonth FMDD, YYYY, HH24:MI') || '–' || to_char(p_end, 'HH24:MI TZ');
  perform set_config('TimeZone', v_old, true);
  return v;
end $$;

create or replace function public.rounds_email_html(
  p_series public.rounds_series, p_heading text, p_body text, p_button_label text, p_button_url text, p_token text
) returns text language sql stable set search_path = public as $$
  select
    '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1B2D;line-height:1.55">'
    || case when p_series.logo_url is not null then
         '<img src="' || public.rounds_esc(p_series.logo_url) || '" alt="" style="display:block;max-height:56px;max-width:220px;margin:0 0 14px">'
       else '' end
    || '<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5B6677;margin:0 0 6px">'
    || public.rounds_esc(p_series.title) || '</p>'
    || '<h2 style="font-family:Georgia,serif;font-weight:500;margin:0 0 16px">' || public.rounds_esc(p_heading) || '</h2>'
    || p_body
    || case when p_button_url is not null then
         '<p style="margin:28px 0"><a href="' || p_button_url || '" style="background:#0E7C86;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">'
         || public.rounds_esc(p_button_label) || '</a></p>'
       else '' end
    || '<hr style="border:none;border-top:1px solid #E2E6E2;margin:28px 0 14px">'
    || '<p style="font-size:12px;color:#5B6677;line-height:1.5">Sent by '
    || public.rounds_esc(coalesce(p_series.organizer_name, 'the rounds organizers'))
    || case when p_series.organizer_email is not null then
         '. Questions: <a href="mailto:' || public.rounds_esc(p_series.organizer_email) || '" style="color:#5B6677">' || public.rounds_esc(p_series.organizer_email) || '</a>'
       else '' end
    || '.'
    || case when p_token is not null then
         '<br><a href="' || public.conf_portal_url() || '/rsvp/' || p_token || '/unsubscribe" style="color:#5B6677">Stop emails about rounds</a>'
       else '' end
    || '</p></div>'
$$;

-- Where and how, for an email: the room, the video link, or both.
create or replace function public.rounds_where_html(p_series public.rounds_series, p_session public.rounds_sessions, p_show_link boolean)
returns text language sql stable set search_path = public as $$
  select
    case when coalesce(p_session.format, p_series.format) in ('in_person', 'hybrid')
              and coalesce(p_session.location, p_series.location) is not null then
      '<p><strong>Where:</strong> ' || public.rounds_esc(coalesce(p_session.location, p_series.location)) || '</p>' else '' end
    || case when coalesce(p_session.format, p_series.format) in ('virtual', 'hybrid') then
      case when p_show_link and coalesce(p_session.video_url, p_series.video_url) is not null then
        '<p><strong>Join online:</strong> <a href="' || public.rounds_esc(coalesce(p_session.video_url, p_series.video_url)) || '">'
        || public.rounds_esc(coalesce(p_session.video_url, p_series.video_url)) || '</a>'
        || case when p_series.video_passcode is not null then ' · passcode ' || public.rounds_esc(p_series.video_passcode) else '' end || '</p>'
      else '<p><strong>Online:</strong> the joining link appears on your RSVP page once you say you’re coming.</p>' end
    else '' end
$$;

-- ------------------------------------------------------------- invitations

-- Invite everyone on the series' lists (and the program, if chosen) to one
-- session. Safe to run again: people already invited are not emailed twice,
-- so it also catches people added to a list later.
create or replace function public.rounds_send_invites(p_session uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_s   public.rounds_sessions;
  v_ser public.rounds_series;
  r     record;
  v_inv public.rounds_invites;
  v_n   integer := 0;
begin
  select * into v_s from public.rounds_sessions where id = p_session;
  if not found then raise exception 'That session is not in this program'; end if;
  -- the scheduled job has no user; people calling it must be allowed to run rounds
  if public.current_uid() is not null and not public.can_manage_rounds() then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;
  if v_s.status <> 'scheduled' then raise exception 'That session is cancelled'; end if;
  if v_s.starts_at < now() then raise exception 'That session has already started'; end if;
  if coalesce(trim(v_s.topic), '') = '' then raise exception 'Add a topic first — invitations go out once a session has one'; end if;
  select * into v_ser from public.rounds_series where id = v_s.series_id;

  for r in
    select distinct on (lower(email)) lower(email) as email, full_name from (
      select m.email, m.full_name from public.rounds_list_members m
        join public.rounds_series_lists sl on sl.list_id = m.list_id and sl.series_id = v_ser.id
      union all
      select u.email, u.full_name from public.site_users u
       where v_ser.invite_program and u.status = 'active' and u.email is not null
         and u.site_id = v_s.site_id
    ) x
    where not exists (select 1 from public.rounds_unsubscribes un where un.site_id = v_s.site_id and un.email = lower(x.email))
    order by lower(email), full_name nulls last
  loop
    insert into public.rounds_invites (site_id, session_id, email, full_name, invited_at)
    values (v_s.site_id, v_s.id, r.email, r.full_name, now())
    on conflict (session_id, lower(email)) do nothing
    returning * into v_inv;
    continue when v_inv.id is null;
    perform public.enqueue_email(
      'roundsinv-' || v_inv.id, v_inv.email,
      v_ser.title || ': ' || v_s.topic,
      public.rounds_email_html(v_ser, v_s.topic,
        '<p>Hi ' || public.rounds_esc(public.conf_greeting_name(v_inv.full_name)) || ',</p>'
        || '<p>You’re invited to <strong>' || public.rounds_esc(v_ser.title) || '</strong>'
        || case when v_s.speaker is not null then ' with <strong>' || public.rounds_esc(v_s.speaker) || '</strong>' else '' end || '.</p>'
        || '<p><strong>When:</strong> ' || public.rounds_when(v_s.starts_at, v_s.ends_at, v_s.timezone) || '</p>'
        || public.rounds_where_html(v_ser, v_s, false)
        || case when v_s.details is not null then '<p>' || replace(public.rounds_esc(v_s.details), E'\n', '<br>') || '</p>' else '' end
        || '<p>Please let us know if you can come.</p>',
        'RSVP', public.conf_portal_url() || '/rsvp/' || v_inv.token, v_inv.token));
    v_n := v_n + 1;
    v_inv := null;
  end loop;
  update public.rounds_sessions set invite_sent_at = coalesce(invite_sent_at, now()) where id = v_s.id;
  return v_n;
end $$;

-- Cancel a session and tell everyone who hasn't said no.
create or replace function public.rounds_cancel_session(p_session uuid, p_reason text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_s public.rounds_sessions; v_ser public.rounds_series; v_inv public.rounds_invites; v_n int := 0;
begin
  if not public.can_manage_rounds() then raise exception 'not authorized' using errcode = 'insufficient_privilege'; end if;
  select * into v_s from public.rounds_sessions where id = p_session;
  if not found then raise exception 'That session is not in this program'; end if;
  if v_s.status = 'cancelled' then raise exception 'That session is already cancelled'; end if;
  update public.rounds_sessions set status = 'cancelled', cancel_reason = nullif(trim(coalesce(p_reason, '')), '') where id = v_s.id;
  select * into v_ser from public.rounds_series where id = v_s.series_id;
  for v_inv in select * from public.rounds_invites where session_id = v_s.id and coalesce(response, '') <> 'declined' loop
    perform public.enqueue_email('roundscancel-' || v_inv.id, v_inv.email,
      'Cancelled: ' || v_ser.title || coalesce(': ' || v_s.topic, ''),
      public.rounds_email_html(v_ser, 'This session is cancelled',
        '<p>' || coalesce(public.rounds_esc(v_s.topic), 'The session') || ' on ' || public.rounds_when(v_s.starts_at, v_s.ends_at, v_s.timezone)
        || ' is cancelled.' || case when nullif(trim(coalesce(p_reason, '')), '') is not null then ' ' || public.rounds_esc(trim(p_reason)) else '' end || '</p>',
        null, null, v_inv.token));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- A session moved after invitations went out: tell the people invited.
create or replace function public.rounds_notify_change(p_session uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_s public.rounds_sessions; v_ser public.rounds_series; v_inv public.rounds_invites; v_n int := 0; v_stamp text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
begin
  if not public.can_manage_rounds() then raise exception 'not authorized' using errcode = 'insufficient_privilege'; end if;
  select * into v_s from public.rounds_sessions where id = p_session;
  if not found or v_s.status <> 'scheduled' then return 0; end if;
  select * into v_ser from public.rounds_series where id = v_s.series_id;
  for v_inv in select * from public.rounds_invites where session_id = v_s.id and coalesce(response, '') <> 'declined' loop
    perform public.enqueue_email('roundschange-' || v_stamp || '-' || v_inv.id, v_inv.email,
      'Updated: ' || v_ser.title || coalesce(': ' || v_s.topic, ''),
      public.rounds_email_html(v_ser, 'The details have changed',
        '<p><strong>' || coalesce(public.rounds_esc(v_s.topic), 'The session') || '</strong> is now:</p>'
        || '<p><strong>When:</strong> ' || public.rounds_when(v_s.starts_at, v_s.ends_at, v_s.timezone) || '</p>'
        || public.rounds_where_html(v_ser, v_s, v_inv.response in ('virtual', 'in_person')),
        'Update my RSVP', public.conf_portal_url() || '/rsvp/' || v_inv.token, v_inv.token));
    v_n := v_n + 1;
  end loop;
  -- a new time means a new reminder
  update public.rounds_sessions set reminder_sent_at = null where id = v_s.id and starts_at > now();
  return v_n;
end $$;

-- Every quarter hour: invitations for sessions that now have a topic,
-- reminders the day before, and feedback requests once a session ends.
create or replace function public.enqueue_rounds_emails()
returns integer language plpgsql security definer set search_path = public as $$
declare v_s public.rounds_sessions; v_ser public.rounds_series; v_inv public.rounds_invites; v_n int := 0;
begin
  -- invitations
  for v_s in
    select s.* from public.rounds_sessions s
     where s.status = 'scheduled' and s.invite_sent_at is null and coalesce(trim(s.topic), '') <> '' and s.starts_at > now()
  loop
    perform set_config('app.site_id', v_s.site_id::text, true);
    v_n := v_n + public.rounds_send_invites(v_s.id);
  end loop;

  -- reminders, the day before
  perform set_config('app.site_id', '', true);
  for v_s in
    select s.* from public.rounds_sessions s join public.rounds_series ser on ser.id = s.series_id
     where s.status = 'scheduled' and ser.reminder_enabled and s.reminder_sent_at is null
       and s.starts_at > now() and s.starts_at <= now() + interval '24 hours'
  loop
    perform set_config('app.site_id', v_s.site_id::text, true);
    select * into v_ser from public.rounds_series where id = v_s.series_id;
    for v_inv in select * from public.rounds_invites where session_id = v_s.id and response in ('in_person', 'virtual') loop
      perform public.enqueue_email('roundsrem-' || v_s.id || '-' || to_char(v_s.starts_at, 'YYYYMMDDHH24MI') || '-' || v_inv.id, v_inv.email,
        'Tomorrow: ' || v_ser.title || coalesce(': ' || v_s.topic, ''),
        public.rounds_email_html(v_ser, 'See you tomorrow',
          '<p>Hi ' || public.rounds_esc(public.conf_greeting_name(v_inv.full_name)) || ',</p>'
          || '<p>A reminder about <strong>' || coalesce(public.rounds_esc(v_s.topic), public.rounds_esc(v_ser.title)) || '</strong>.</p>'
          || '<p><strong>When:</strong> ' || public.rounds_when(v_s.starts_at, v_s.ends_at, v_s.timezone) || '</p>'
          || public.rounds_where_html(v_ser, v_s, true),
          'Change my RSVP', public.conf_portal_url() || '/rsvp/' || v_inv.token, v_inv.token));
      v_n := v_n + 1;
    end loop;
    update public.rounds_sessions set reminder_sent_at = now() where id = v_s.id;
  end loop;

  -- feedback, once it's over, from those who said they were coming
  perform set_config('app.site_id', '', true);
  for v_s in
    select s.* from public.rounds_sessions s join public.rounds_series ser on ser.id = s.series_id
     where s.status = 'scheduled' and ser.feedback_enabled and s.feedback_sent_at is null
       and s.ends_at <= now() and s.ends_at > now() - interval '3 days'
  loop
    perform set_config('app.site_id', v_s.site_id::text, true);
    select * into v_ser from public.rounds_series where id = v_s.series_id;
    for v_inv in select * from public.rounds_invites
                  where session_id = v_s.id and response in ('in_person', 'virtual') and coalesce(attended, true) loop
      perform public.enqueue_email('roundsfb-' || v_inv.id, v_inv.email,
        'How was it? ' || v_ser.title || coalesce(': ' || v_s.topic, ''),
        public.rounds_email_html(v_ser, 'Thank you for coming',
          '<p>Hi ' || public.rounds_esc(public.conf_greeting_name(v_inv.full_name)) || ',</p>'
          || '<p>Please take a minute to tell us how <strong>' || coalesce(public.rounds_esc(v_s.topic), 'the session') || '</strong> went.'
          || case when v_ser.credit_hours is not null then ' Once you have, you can download your certificate of attendance.' else '' end || '</p>',
          'Give feedback', public.conf_portal_url() || '/rsvp/' || v_inv.token, v_inv.token));
      v_n := v_n + 1;
    end loop;
    update public.rounds_sessions set feedback_sent_at = now() where id = v_s.id;
  end loop;

  perform set_config('app.site_id', '', true);
  return v_n;
end $$;

-- ---------------------------------------------------- the invitee's page

create or replace function public.rounds_public(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv public.rounds_invites; v_s public.rounds_sessions; v_ser public.rounds_series; v_coming boolean;
begin
  select * into v_inv from public.rounds_invites where token = p_token;
  if not found then raise exception 'invalid link'; end if;
  select * into v_s from public.rounds_sessions where id = v_inv.session_id;
  select * into v_ser from public.rounds_series where id = v_s.series_id;
  v_coming := v_inv.response in ('in_person', 'virtual');
  return jsonb_build_object(
    'series', jsonb_build_object('title', v_ser.title, 'description', v_ser.description, 'logo_url', v_ser.logo_url,
       'organizer_name', v_ser.organizer_name, 'organizer_email', v_ser.organizer_email,
       'feedback_enabled', v_ser.feedback_enabled, 'credit_hours', v_ser.credit_hours),
    'session', jsonb_build_object('topic', v_s.topic, 'speaker', v_s.speaker, 'details', v_s.details,
       'starts_at', v_s.starts_at, 'ends_at', v_s.ends_at, 'timezone', v_s.timezone,
       'when', public.rounds_when(v_s.starts_at, v_s.ends_at, v_s.timezone),
       'format', coalesce(v_s.format, v_ser.format), 'location', coalesce(v_s.location, v_ser.location),
       'video_url', case when v_coming then coalesce(v_s.video_url, v_ser.video_url) end,
       'video_passcode', case when v_coming then v_ser.video_passcode end,
       'status', v_s.status, 'cancel_reason', v_s.cancel_reason,
       'started', v_s.starts_at <= now(), 'ended', v_s.ends_at <= now()),
    'invite', jsonb_build_object('full_name', v_inv.full_name, 'email', v_inv.email, 'response', v_inv.response,
       'attended', v_inv.attended, 'rating', v_inv.rating, 'comments', v_inv.comments, 'feedback_at', v_inv.feedback_at,
       'certificate', v_coming and coalesce(v_inv.attended, true) and v_s.ends_at <= now() and v_s.status = 'scheduled'
                      and v_ser.credit_hours is not null and (not v_ser.feedback_enabled or v_inv.feedback_at is not null)),
    'unsubscribed', exists (select 1 from public.rounds_unsubscribes where site_id = v_inv.site_id and email = lower(v_inv.email)));
end $$;

create or replace function public.rounds_public_rsvp(p_token text, p_response text, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv public.rounds_invites; v_s public.rounds_sessions;
begin
  select * into v_inv from public.rounds_invites where token = p_token for update;
  if not found then raise exception 'invalid link'; end if;
  if p_response not in ('in_person', 'virtual', 'declined') then raise exception 'Choose an answer'; end if;
  select * into v_s from public.rounds_sessions where id = v_inv.session_id;
  if v_s.status <> 'scheduled' then raise exception 'This session is cancelled'; end if;
  if v_s.ends_at <= now() then raise exception 'This session has already happened'; end if;
  if p_response = 'in_person' and coalesce(v_s.format, (select format from public.rounds_series where id = v_s.series_id)) = 'virtual' then
    raise exception 'This session is online only';
  end if;
  if p_response = 'virtual' and coalesce(v_s.format, (select format from public.rounds_series where id = v_s.series_id)) = 'in_person' then
    raise exception 'This session is in person only';
  end if;
  update public.rounds_invites
     set response = p_response, responded_at = now(),
         full_name = coalesce(nullif(left(trim(coalesce(p_name, '')), 200), ''), full_name)
   where id = v_inv.id;
  return public.rounds_public(p_token);
end $$;

create or replace function public.rounds_public_feedback(p_token text, p_rating integer, p_comments text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inv public.rounds_invites; v_s public.rounds_sessions;
begin
  select * into v_inv from public.rounds_invites where token = p_token for update;
  if not found then raise exception 'invalid link'; end if;
  select * into v_s from public.rounds_sessions where id = v_inv.session_id;
  if v_s.starts_at > now() then raise exception 'Feedback opens once the session has started'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5'; end if;
  update public.rounds_invites
     set rating = p_rating, comments = nullif(left(trim(coalesce(p_comments, '')), 4000), ''), feedback_at = now(),
         response = coalesce(response, 'in_person')
   where id = v_inv.id;
  return public.rounds_public(p_token);
end $$;

-- What the certificate says. Only for people who came (and gave feedback,
-- when the series asks for it), after the session, when credit is offered.
create or replace function public.rounds_public_certificate(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_inv public.rounds_invites; v_s public.rounds_sessions; v_ser public.rounds_series; v_prog text;
begin
  v := public.rounds_public(p_token);
  if not coalesce((v #>> '{invite,certificate}')::boolean, false) then return null; end if;
  select * into v_inv from public.rounds_invites where token = p_token;
  select * into v_s from public.rounds_sessions where id = v_inv.session_id;
  select * into v_ser from public.rounds_series where id = v_s.series_id;
  select name into v_prog from public.sites where id = v_inv.site_id;
  return jsonb_build_object('full_name', coalesce(v_inv.full_name, v_inv.email), 'series', v_ser.title, 'topic', v_s.topic,
    'speaker', v_s.speaker, 'when', public.rounds_when(v_s.starts_at, v_s.ends_at, v_s.timezone),
    'attended', case v_inv.response when 'virtual' then 'online' else 'in person' end,
    'credit_hours', v_ser.credit_hours, 'credits_statement', v_ser.credits_statement,
    'organizer_name', coalesce(v_ser.organizer_name, v_prog), 'program', v_prog, 'logo_url', v_ser.logo_url,
    'issued_on', to_char(now(), 'FMMonth FMDD, YYYY'));
end $$;

create or replace function public.rounds_public_unsubscribe(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_inv public.rounds_invites;
begin
  select * into v_inv from public.rounds_invites where token = p_token;
  if not found then raise exception 'invalid link'; end if;
  insert into public.rounds_unsubscribes (site_id, email) values (v_inv.site_id, lower(v_inv.email)) on conflict do nothing;
  return true;
end $$;

-- who can run rounds, for the page to decide what to show
create or replace function public.rounds_my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('can_manage', public.can_manage_rounds(),
                            'is_director', coalesce(public.current_app_role() = 'director', false))
$$;

-- ============================================================ conference logos

do $$
declare
  v_patch record; v_def text; v_hits int;
begin
  for v_patch in
    select * from (values
      ('public.conf_email_html(public.conf_events,text,text,text,text,text)'::regprocedure,
       $o$line-height:1.55">'$o$,
       $n$line-height:1.55">'
    || case when p_ev.logo_url is not null then '<img src="' || public.conf_esc(p_ev.logo_url) || '" alt="" style="display:block;max-height:56px;max-width:220px;margin:0 0 14px">' else '' end$n$),
      ('public.conf_public_event(text)'::regprocedure,
       $o$'organizer_email', v_ev.organizer_email$o$, $n$'organizer_email', v_ev.organizer_email, 'logo_url', v_ev.logo_url$n$),
      ('public.conf_public_registration_info(text)'::regprocedure,
       $o$'organizer_email', v_ev.organizer_email$o$, $n$'organizer_email', v_ev.organizer_email, 'logo_url', v_ev.logo_url$n$),
      ('public.conf_public_disclosure(text)'::regprocedure,
       $o$'organizer_email', v_ev.organizer_email$o$, $n$'organizer_email', v_ev.organizer_email, 'logo_url', v_ev.logo_url$n$),
      ('public.conf_speaker_portal(text)'::regprocedure,
       $o$'organizer_email', v_ev.organizer_email$o$, $n$'organizer_email', v_ev.organizer_email, 'logo_url', v_ev.logo_url$n$)
    ) as t(fn, old_text, new_text)
  loop
    v_def := pg_get_functiondef(v_patch.fn);
    v_hits := (length(v_def) - length(replace(v_def, v_patch.old_text, ''))) / length(v_patch.old_text);
    if v_hits <> 1 then
      raise exception 'Expected the text to change exactly once in %, found it % times', v_patch.fn, v_hits;
    end if;
    execute replace(v_def, v_patch.old_text, v_patch.new_text);
  end loop;
end $$;

-- ------------------------------------------------------------------ grants

do $$
declare f text;
begin
  foreach f in array array[
    'rounds_send_invites(uuid)', 'rounds_cancel_session(uuid,text)', 'rounds_notify_change(uuid)',
    'enqueue_rounds_emails()', 'rounds_public(text)', 'rounds_public_rsvp(text,text,text)',
    'rounds_public_feedback(text,integer,text)', 'rounds_public_certificate(text)',
    'rounds_public_unsubscribe(text)', 'rounds_my_access()'
  ] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['rounds_send_invites(uuid)', 'rounds_cancel_session(uuid,text)', 'rounds_notify_change(uuid)', 'rounds_my_access()'] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- the invitee's page works without an account
  foreach f in array array['rounds_public(text)', 'rounds_public_rsvp(text,text,text)', 'rounds_public_feedback(text,integer,text)',
                           'rounds_public_certificate(text)', 'rounds_public_unsubscribe(text)'] loop
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  -- helpers
  execute 'revoke all on function public.can_manage_rounds() from public, anon';
  execute 'grant execute on function public.can_manage_rounds() to authenticated, app_definer, service_role';
  foreach f in array array['rounds_esc(text)', 'rounds_when(timestamptz,timestamptz,text)',
                           'rounds_email_html(public.rounds_series,text,text,text,text,text)',
                           'rounds_where_html(public.rounds_series,public.rounds_sessions,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to app_definer, service_role', f);
  end loop;
end $$;

-- every quarter hour, with the other scheduled emails
select cron.unschedule(jobid) from cron.job where jobname = 'rounds-and-learner-emails';
select cron.schedule('rounds-and-learner-emails', '5,20,35,50 * * * *', 'select public.enqueue_rounds_emails()');

notify pgrst, 'reload schema';
