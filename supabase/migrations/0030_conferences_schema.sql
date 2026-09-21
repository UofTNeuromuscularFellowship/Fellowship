-- ---------------------------------------------------------------------------
-- 0030 — conference management toolkit: schema
--
-- A program's director or admin (the site coordinator) runs events from the
-- portal: an itinerary of sessions in rooms with speakers or moderated panels,
-- a Zoom link, invitations from a CSV or typed list, a public RSVP with a
-- capacity-driven waitlist, day-of check-in, post-event feedback, participation
-- letters, presentations, accommodations, catering, course materials, sponsors
-- and exhibitors, a budget and to-do lists.
--
-- Every table is per-program, with the same restrictive site isolation as the
-- rest of the schema, and gated on the 'conference' toolkit entitlement so it
-- can be sold per program. Only the director and admin can read or write any
-- of it: a fellow or supervisor has no business in a registration list.
--
-- Invitees and external speakers are not portal users. They never touch these
-- tables; they reach their own row through an unguessable per-person token and
-- the security-definer functions in 0031.
-- ---------------------------------------------------------------------------

create table public.conf_events (
  id                     uuid primary key default gen_random_uuid(),
  site_id                uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  name                   text not null,
  description            text,
  starts_on              date not null,
  ends_on                date not null,
  timezone               text not null default 'America/Toronto',
  venue_name             text,
  venue_address          text,
  zoom_url               text,
  zoom_passcode          text,
  capacity_in_person     integer check (capacity_in_person is null or capacity_in_person >= 0),
  capacity_virtual       integer check (capacity_virtual   is null or capacity_virtual   >= 0),
  status                 text not null default 'draft' check (status in ('draft','published','archived')),
  -- feature toggles
  feedback_enabled       boolean not null default true,
  letters_enabled        boolean not null default false,
  presentations_enabled  boolean not null default false,
  accommodations_enabled boolean not null default false,
  catering_enabled       boolean not null default false,
  payment_enabled        boolean not null default false,
  payment_url            text,
  payment_label          text,
  payment_note           text,
  -- participation letters: the accreditation wording is the coordinator's to
  -- supply. The software records attendance; it does not grant credit.
  credits_statement      text,
  -- who the invitations come from. Canada's anti-spam law requires a sender to
  -- be identified with a mailing address and a way to reach them.
  organizer_name         text,
  organizer_email        text,
  organizer_address      text,
  reminder_sent_at       timestamptz,
  feedback_sent_at       timestamptz,
  created_by             uuid references public.users(id) on delete set null default public.current_uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint conf_events_dates check (ends_on >= starts_on)
);

create table public.conf_rooms (
  id        uuid primary key default gen_random_uuid(),
  site_id   uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id  uuid not null references public.conf_events(id) on delete cascade,
  name      text not null,
  capacity  integer check (capacity is null or capacity >= 0),
  notes     text,
  sort      integer not null default 0
);

create table public.conf_sessions (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id      uuid not null references public.conf_events(id) on delete cascade,
  room_id       uuid references public.conf_rooms(id) on delete set null,
  title         text not null,
  description   text,
  session_date  date not null,
  start_time    time not null,
  end_time      time not null,
  format        text not null default 'talk'
                check (format in ('talk','keynote','panel','workshop','break','meal','other')),
  zoom_url      text,
  credit_hours  numeric(4,2) not null default 0 check (credit_hours >= 0),
  sort          integer not null default 0,
  constraint conf_sessions_times check (end_time > start_time)
);

create table public.conf_speakers (
  id                      uuid primary key default gen_random_uuid(),
  site_id                 uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id                uuid not null references public.conf_events(id) on delete cascade,
  full_name               text not null,
  email                   text,
  affiliation             text,
  bio                     text,
  -- speakers are usually external, so they get the same kind of private link
  -- invitees do, to submit their own conflict-of-interest disclosure
  token                   text not null unique default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  disclosure_status       text not null default 'not_requested'
                          check (disclosure_status in ('not_requested','requested','received','nothing_to_declare')),
  disclosure_text         text,
  disclosure_requested_at timestamptz,
  disclosure_received_at  timestamptz,
  notes                   text
);

create table public.conf_session_speakers (
  session_id uuid not null references public.conf_sessions(id) on delete cascade,
  speaker_id uuid not null references public.conf_speakers(id) on delete cascade,
  site_id    uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  role       text not null default 'speaker' check (role in ('speaker','moderator','panelist')),
  primary key (session_id, speaker_id)
);

create table public.conf_invitees (
  id                    uuid primary key default gen_random_uuid(),
  site_id               uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id              uuid not null references public.conf_events(id) on delete cascade,
  email                 text not null check (position('@' in email) > 1),
  full_name             text,
  institution           text,
  role_title            text,
  -- 64 hex characters from two v4 UUIDs: 244 bits of randomness, URL-safe
  token                 text not null unique default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  invited_at            timestamptz,
  invite_count          integer not null default 0,
  rsvp_status           text not null default 'pending'
                        check (rsvp_status in ('pending','in_person','virtual','declined','waitlist')),
  waitlist_for          text check (waitlist_for in ('in_person','virtual')),
  rsvp_at               timestamptz,
  waitlisted_at         timestamptz,
  dietary               text,
  accessibility         text,
  checked_in_at         timestamptz,
  credit_hours_override numeric(5,2) check (credit_hours_override is null or credit_hours_override >= 0),
  letter_sent_at        timestamptz,
  unsubscribed_at       timestamptz,
  source                text not null default 'manual' check (source in ('manual','csv')),
  notes                 text,
  created_at            timestamptz not null default now(),
  constraint conf_invitees_waitlist check ((rsvp_status = 'waitlist') = (waitlist_for is not null))
);
create unique index conf_invitees_event_email on public.conf_invitees (event_id, lower(email));

create table public.conf_feedback (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id    uuid not null references public.conf_events(id) on delete cascade,
  session_id  uuid references public.conf_sessions(id) on delete cascade,
  invitee_id  uuid not null references public.conf_invitees(id) on delete cascade,
  rating      integer check (rating between 1 and 5),
  comments    text,
  created_at  timestamptz not null default now()
);
-- one response per person per session, and one for the event overall (null session)
create unique index conf_feedback_one on public.conf_feedback
  (invitee_id, coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.conf_presentations (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id      uuid not null references public.conf_events(id) on delete cascade,
  session_id    uuid references public.conf_sessions(id) on delete set null,
  title         text not null,
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);

create table public.conf_accommodations (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id       uuid not null references public.conf_events(id) on delete cascade,
  hotel_name     text not null,
  address        text,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  booking_url    text,
  group_code     text,
  nightly_rate   text,
  rooms_blocked  integer check (rooms_blocked is null or rooms_blocked >= 0),
  cutoff_date    date,
  -- whether attendees see this hotel on their RSVP page
  show_attendees boolean not null default true,
  notes          text,
  sort           integer not null default 0
);

create table public.conf_vendors (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id      uuid not null references public.conf_events(id) on delete cascade,
  name          text not null,
  service       text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  cost          numeric(10,2),
  status        text not null default 'considering'
                check (status in ('considering','booked','confirmed','paid','cancelled')),
  notes         text
);

create table public.conf_materials (
  id        uuid primary key default gen_random_uuid(),
  site_id   uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id  uuid not null references public.conf_events(id) on delete cascade,
  kind      text not null default 'printed'
            check (kind in ('printed','badges','signage','swag','av','other')),
  item      text not null,
  quantity  integer check (quantity is null or quantity >= 0),
  supplier  text,
  cost      numeric(10,2),
  status    text not null default 'todo' check (status in ('todo','ordered','received','done')),
  due_on    date,
  notes     text
);

create table public.conf_sponsors (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id      uuid not null references public.conf_events(id) on delete cascade,
  kind          text not null default 'sponsor' check (kind in ('sponsor','exhibitor')),
  name          text not null,
  tier          text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  amount        numeric(10,2),
  table_no      text,
  -- acknowledged on the public itinerary
  acknowledged  boolean not null default false,
  notes         text
);

create table public.conf_budget (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id    uuid not null references public.conf_events(id) on delete cascade,
  kind        text not null default 'expense' check (kind in ('expense','income')),
  category    text not null,
  description text,
  estimated   numeric(10,2),
  actual      numeric(10,2),
  notes       text
);

create table public.conf_tasks (
  id        uuid primary key default gen_random_uuid(),
  site_id   uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id  uuid not null references public.conf_events(id) on delete cascade,
  area      text not null default 'general'
            check (area in ('general','catering','accommodations','materials','sponsors','speakers')),
  title     text not null,
  due_on    date,
  done_at   timestamptz,
  assignee  text,
  notes     text,
  sort      integer not null default 0
);

-- indexes for the common per-event reads
create index conf_rooms_event          on public.conf_rooms (event_id);
create index conf_sessions_event       on public.conf_sessions (event_id, session_date, start_time);
create index conf_speakers_event       on public.conf_speakers (event_id);
create index conf_invitees_event       on public.conf_invitees (event_id, rsvp_status);
create index conf_feedback_event       on public.conf_feedback (event_id);
create index conf_presentations_event  on public.conf_presentations (event_id);
create index conf_accommodations_event on public.conf_accommodations (event_id);
create index conf_vendors_event        on public.conf_vendors (event_id);
create index conf_materials_event      on public.conf_materials (event_id);
create index conf_sponsors_event       on public.conf_sponsors (event_id);
create index conf_budget_event         on public.conf_budget (event_id);
create index conf_tasks_event          on public.conf_tasks (event_id, done_at);

-- ---------------------------------------------------------------------------
-- The same four policies on every table, and the grants to match.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'conf_events','conf_rooms','conf_sessions','conf_speakers','conf_session_speakers',
    'conf_invitees','conf_feedback','conf_presentations','conf_accommodations',
    'conf_vendors','conf_materials','conf_sponsors','conf_budget','conf_tasks'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    -- one program's rows only
    execute format($p$
      create policy %I on public.%I as restrictive for all
        using ((site_id = (select public.current_site_id()))
               or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
        with check ((site_id = (select public.current_site_id()))
               or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
    $p$, t || '_site_isolation', t);

    -- sold per program
    execute format($p$
      create policy %I on public.%I as restrictive for all
        using (public.site_tool_enabled('conference'))
        with check (public.site_tool_enabled('conference'))
    $p$, t || '_tool_gate', t);

    -- the director or admin coordinates; nobody else sees any of it
    execute format($p$
      create policy %I on public.%I for all to authenticated
        using (public.is_director_or_admin())
        with check (public.is_director_or_admin())
    $p$, t || '_manage', t);

    -- security-definer functions run as app_definer and do their own scoping
    execute format($p$
      create policy %I on public.%I for all to app_definer using (true) with check (true)
    $p$, t || '_app_definer_all', t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role, app_definer', t);
  end loop;
end $$;

-- keep updated_at honest on the one table people edit repeatedly
create or replace function public.conf_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger conf_events_touch before update on public.conf_events
  for each row execute function public.conf_touch_updated_at();

-- ---------------------------------------------------------------------------
-- The toolkit entitlement, on for Toronto.
-- ---------------------------------------------------------------------------
insert into public.site_tools (site_id, tool_key, enabled)
select id, 'conference', (id = '00000000-0000-4000-8000-000000000001'::uuid)
from public.sites where id <> '00000000-0000-4000-8000-000000000000'::uuid
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Presentations bucket. Private; the coordinator reaches files through their
-- own program's rows, attendees through a token-checked edge function.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('conference', 'conference', false)
on conflict (id) do nothing;

create policy conference_files_select on storage.objects for select to authenticated
  using (bucket_id = 'conference' and (
    owner = auth.uid()
    or (public.is_director_or_admin() and exists (
          select 1 from public.conf_presentations p where p.storage_path = storage.objects.name))));

create policy conference_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'conference' and public.is_director_or_admin());

create policy conference_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'conference' and (
    owner = auth.uid()
    or (public.is_director_or_admin() and exists (
          select 1 from public.conf_presentations p where p.storage_path = storage.objects.name))));

-- ---------------------------------------------------------------------------
-- Supabase's default privileges grant anon full table rights on anything new
-- in public, and RLS is what then refuses it: with no permissive policy for
-- anon these tables already return zero rows to a signed-out caller. But they
-- hold the email addresses, dietary and accessibility needs of people outside
-- the portal, so the refusal should not rest on one layer. Signed-out access
-- goes only through the conf_public_* functions in 0031.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'conf_events','conf_rooms','conf_sessions','conf_speakers','conf_session_speakers',
    'conf_invitees','conf_feedback','conf_presentations','conf_accommodations',
    'conf_vendors','conf_materials','conf_sponsors','conf_budget','conf_tasks'
  ] loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
