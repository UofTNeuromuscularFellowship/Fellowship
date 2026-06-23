-- =====================================================================
-- City Wide Neuromuscular Fellowship Portal
-- Migration 0001 — Initial schema
-- University of Toronto, Division of Neurology
-- =====================================================================
-- Locked decisions reflected here:
--   * Four roles: fellow / supervisor / director / admin
--   * Admin is walled off from clinical case content (RLS deny)
--   * Competency targets: cohort default (fellow_id NULL) + per-fellow override
--   * Attendance: provider-marked AND optional self-check-in
--   * Cohorts: mixed 1-year / 2-year (cohort_year text + duration on user)
--   * Teaching + clinic trades require director OR admin approval
--   * Zoom links: manual text entry (no API)
-- =====================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type user_role             as enum ('fellow','supervisor','director','admin');
create type user_status           as enum ('active','alumni','inactive');
create type case_visibility       as enum ('private','shared');
create type teaching_status       as enum ('confirmed','pending_confirmation','rescheduled','cancelled');
create type clinic_rotation_status as enum ('confirmed','pending','cancelled');
create type trade_status          as enum ('pending','approved','denied');
create type check_in_method       as enum ('self','marked_by_provider','marked_by_admin');
create type attendance_status     as enum ('attended','absent','excused','session_cancelled');
create type session_material_type as enum ('upload','link','resource');

-- ---------------------------------------------------------------------
-- users  (profile rows, 1:1 with auth.users)
-- ---------------------------------------------------------------------
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  full_name     text not null,
  role          user_role not null default 'fellow',
  status        user_status not null default 'active',
  -- cohort metadata (only meaningful for fellows)
  cohort_year   text,            -- e.g. '2026-27'
  duration_years smallint,       -- 1 or 2; null for non-fellows
  start_date    date,
  end_date      date,
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- SECURITY DEFINER helper so RLS policies can read a user's role
-- without recursing into the users table's own policies.
create or replace function current_app_role()
returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function is_director_or_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select current_app_role() in ('director','admin');
$$;

-- ---------------------------------------------------------------------
-- Clinical cases  (Admin is excluded by RLS)
-- ---------------------------------------------------------------------
create table cases (
  id              uuid primary key default uuid_generate_v4(),
  fellow_id       uuid not null references users(id) on delete cascade,
  rotation_id     uuid,                       -- FK added after clinic_rotations
  case_date       date not null,
  title           text not null,
  age             integer,
  sex             text,
  presentation    text,
  -- EMG / NCS structured detail stored as JSONB multi-selects
  nerves_tested   jsonb default '[]'::jsonb,
  muscles_tested  jsonb default '[]'::jsonb,
  diagnoses       jsonb default '[]'::jsonb,   -- for disease-specific targets
  ncs_count       integer default 0,
  emg_count       integer default 0,
  rns_count       integer default 0,
  sfemg_count     integer default 0,
  summary         text,
  teaching_points text,
  visibility      case_visibility not null default 'private',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index cases_fellow_idx on cases(fellow_id);
create index cases_date_idx on cases(case_date);

create table case_feedback (
  id          uuid primary key default uuid_generate_v4(),
  case_id     uuid not null references cases(id) on delete cascade,
  author_id   uuid not null references users(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index case_feedback_case_idx on case_feedback(case_id);

-- ---------------------------------------------------------------------
-- Competency targets
--   fellow_id NULL  => cohort-wide default for cohort_year
--   fellow_id set   => per-fellow override
-- ---------------------------------------------------------------------
create table competency_targets (
  id            uuid primary key default uuid_generate_v4(),
  cohort_year   text not null,
  fellow_id     uuid references users(id) on delete cascade,
  metric_key    text not null,        -- e.g. 'emg', 'ncs', 'als_cases'
  metric_label  text not null,        -- display label
  metric_kind   text not null default 'procedural', -- 'procedural' | 'disease'
  target_value  integer not null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
-- one target per metric per cohort (NULL fellow_id = cohort default) and one per override
create unique index competency_targets_unique_idx on competency_targets (
  cohort_year,
  coalesce(fellow_id, '00000000-0000-0000-0000-000000000000'::uuid),
  metric_key
);

-- ---------------------------------------------------------------------
-- Teaching schedule
-- ---------------------------------------------------------------------
create table topic_provider_defaults (
  id            uuid primary key default uuid_generate_v4(),
  topic         text not null unique,
  default_provider_name text,         -- free text until users are linked
  default_provider_id   uuid references users(id) on delete set null
);

create table teaching_sessions (
  id            uuid primary key default uuid_generate_v4(),
  session_date  date not null,
  start_time    time not null default '08:00',
  end_time      time not null default '09:00',
  topic         text,
  provider_name text,                  -- as it appears on the grid (e.g. 'Fellow')
  provider_id   uuid references users(id) on delete set null,
  status        teaching_status not null default 'confirmed',
  is_break      boolean not null default false,  -- WINTER BREAK / MARCH BREAK / AANEM
  break_label   text,
  zoom_link     text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index teaching_date_idx on teaching_sessions(session_date);

create table session_materials (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references teaching_sessions(id) on delete cascade,
  kind          session_material_type not null,
  title         text not null,
  url           text,
  uploaded_by   uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table session_attendance (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references teaching_sessions(id) on delete cascade,
  fellow_id       uuid not null references users(id) on delete cascade,
  status          attendance_status not null default 'attended',
  check_in_method check_in_method not null default 'marked_by_provider',
  recorded_by     uuid references users(id) on delete set null,
  recorded_at     timestamptz not null default now(),
  unique (session_id, fellow_id)
);

create table provider_away_dates (
  id            uuid primary key default uuid_generate_v4(),
  provider_id   uuid not null references users(id) on delete cascade,
  away_date     date not null,
  reason        text,
  created_at    timestamptz not null default now()
);

create table teaching_trades (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid not null references teaching_sessions(id) on delete cascade,
  requested_by  uuid not null references users(id) on delete cascade,
  counterparty  uuid references users(id) on delete set null,
  reason        text,
  status        trade_status not null default 'pending',
  decided_by    uuid references users(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Clinic rotations
-- ---------------------------------------------------------------------
-- Site/supervisor mapping is left for directors to configure post-launch.
create table site_supervisors (
  id              uuid primary key default uuid_generate_v4(),
  site_code       text not null,         -- verbatim code, legend TBC by program
  site_label      text,                  -- optional human label (director-entered)
  weekday         smallint,              -- 0=Sun .. 6=Sat; null = any
  supervisor_id   uuid references users(id) on delete set null,
  supervisor_name text,
  created_at      timestamptz not null default now()
);

create table clinic_rotations (
  id            uuid primary key default uuid_generate_v4(),
  fellow_id     uuid references users(id) on delete cascade,
  fellow_label  text,                    -- raw name from grid until linked (e.g. 'Paula')
  rotation_date date not null,
  site_code     text,                    -- verbatim cell value (e.g. 'AI SHSC', 'PROTECTED')
  supervisor_id uuid references users(id) on delete set null,
  status        clinic_rotation_status not null default 'confirmed',
  is_protected  boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now()
);
create index clinic_rotations_date_idx on clinic_rotations(rotation_date);
create index clinic_rotations_fellow_idx on clinic_rotations(fellow_id);

-- now that clinic_rotations exists, link cases.rotation_id
alter table cases
  add constraint cases_rotation_fk
  foreign key (rotation_id) references clinic_rotations(id) on delete set null;

create table fellow_away_dates (
  id            uuid primary key default uuid_generate_v4(),
  fellow_id     uuid not null references users(id) on delete cascade,
  away_date     date not null,
  reason        text,
  created_at    timestamptz not null default now()
);

create table clinic_trades (
  id            uuid primary key default uuid_generate_v4(),
  rotation_id   uuid not null references clinic_rotations(id) on delete cascade,
  requested_by  uuid not null references users(id) on delete cascade,
  counterparty  uuid references users(id) on delete set null,
  reason        text,
  status        trade_status not null default 'pending',
  decided_by    uuid references users(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Handbook, resources, publications, settings, notifications
-- ---------------------------------------------------------------------
create table handbook_pages (
  id            uuid primary key default uuid_generate_v4(),
  slug          text not null unique,
  title         text not null,
  body_md       text,
  sort_order    integer not null default 0,
  updated_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now()
);

create table handbook_versions (
  id            uuid primary key default uuid_generate_v4(),
  page_id       uuid not null references handbook_pages(id) on delete cascade,
  body_md       text,
  change_note   text,
  is_major      boolean not null default false,
  edited_by     uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table resources (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  url           text,
  category      text,
  description   text,
  added_by      uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table publications (
  id            uuid primary key default uuid_generate_v4(),
  pubmed_id     text unique,
  title         text not null,
  journal       text,
  authors       text,
  published_on  date,
  url           text,
  fetched_at    timestamptz not null default now()
);

create table digest_settings (
  user_id       uuid primary key references users(id) on delete cascade,
  enabled       boolean not null default true,
  frequency     text not null default 'weekly',   -- locked: weekly Monday 7am
  created_at    timestamptz not null default now()
);

create table notifications (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null,
  title         text not null,
  body          text,
  link          text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read_at);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table users                  enable row level security;
alter table cases                  enable row level security;
alter table case_feedback          enable row level security;
alter table competency_targets     enable row level security;
alter table topic_provider_defaults enable row level security;
alter table teaching_sessions      enable row level security;
alter table session_materials      enable row level security;
alter table session_attendance     enable row level security;
alter table provider_away_dates    enable row level security;
alter table teaching_trades        enable row level security;
alter table site_supervisors       enable row level security;
alter table clinic_rotations       enable row level security;
alter table fellow_away_dates      enable row level security;
alter table clinic_trades          enable row level security;
alter table handbook_pages         enable row level security;
alter table handbook_versions      enable row level security;
alter table resources              enable row level security;
alter table publications           enable row level security;
alter table digest_settings        enable row level security;
alter table notifications          enable row level security;

-- ---- users ----------------------------------------------------------
create policy users_self_read on users
  for select using (id = auth.uid() or is_director_or_admin());
create policy users_self_update on users
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy users_admin_manage on users
  for all using (is_director_or_admin()) with check (is_director_or_admin());

-- ---- cases (ADMIN WALLED OFF) --------------------------------------
-- Fellows see/manage own cases; supervisors & directors see shared cases.
-- Admin role is intentionally excluded from every case policy.
create policy cases_fellow_rw on cases
  for all
  using (current_app_role() = 'fellow' and fellow_id = auth.uid())
  with check (current_app_role() = 'fellow' and fellow_id = auth.uid());

create policy cases_clinical_read_shared on cases
  for select
  using (current_app_role() in ('supervisor','director') and visibility = 'shared');

-- ---- case_feedback (ADMIN WALLED OFF) ------------------------------
create policy case_feedback_read on case_feedback
  for select using (
    exists (
      select 1 from cases c
      where c.id = case_feedback.case_id
        and (
          (current_app_role() = 'fellow' and c.fellow_id = auth.uid())
          or (current_app_role() in ('supervisor','director') and c.visibility = 'shared')
        )
    )
  );
create policy case_feedback_write on case_feedback
  for insert with check (
    current_app_role() in ('supervisor','director')
    and author_id = auth.uid()
    and exists (select 1 from cases c where c.id = case_id and c.visibility = 'shared')
  );

-- ---- competency_targets --------------------------------------------
create policy targets_read on competency_targets
  for select using (
    is_director_or_admin()
    or fellow_id = auth.uid()
    or (fellow_id is null and current_app_role() = 'fellow')
  );
create policy targets_manage on competency_targets
  for all using (is_director_or_admin()) with check (is_director_or_admin());

-- ---- reference tables: read for all authenticated, write for dir/admin
create policy topics_read on topic_provider_defaults for select using (auth.uid() is not null);
create policy topics_manage on topic_provider_defaults for all using (is_director_or_admin()) with check (is_director_or_admin());

create policy teaching_read on teaching_sessions for select using (auth.uid() is not null);
create policy teaching_manage on teaching_sessions for all using (is_director_or_admin()) with check (is_director_or_admin());

create policy materials_read on session_materials for select using (auth.uid() is not null);
create policy materials_write on session_materials for insert with check (auth.uid() is not null and uploaded_by = auth.uid());
create policy materials_manage on session_materials for all using (is_director_or_admin()) with check (is_director_or_admin());

create policy attendance_read on session_attendance
  for select using (is_director_or_admin() or current_app_role() = 'supervisor' or fellow_id = auth.uid());
create policy attendance_self on session_attendance
  for insert with check (fellow_id = auth.uid() and check_in_method = 'self');
create policy attendance_manage on session_attendance
  for all using (is_director_or_admin() or current_app_role() = 'supervisor')
  with check (is_director_or_admin() or current_app_role() = 'supervisor');

create policy provider_away_read on provider_away_dates for select using (auth.uid() is not null);
create policy provider_away_self on provider_away_dates
  for all using (provider_id = auth.uid() or is_director_or_admin())
  with check (provider_id = auth.uid() or is_director_or_admin());

create policy teaching_trades_read on teaching_trades
  for select using (auth.uid() is not null);
create policy teaching_trades_create on teaching_trades
  for insert with check (requested_by = auth.uid());
create policy teaching_trades_decide on teaching_trades
  for update using (is_director_or_admin()) with check (is_director_or_admin());

create policy site_sup_read on site_supervisors for select using (auth.uid() is not null);
create policy site_sup_manage on site_supervisors for all using (is_director_or_admin()) with check (is_director_or_admin());

create policy clinic_read on clinic_rotations
  for select using (is_director_or_admin() or current_app_role() = 'supervisor' or fellow_id = auth.uid());
create policy clinic_manage on clinic_rotations
  for all using (is_director_or_admin()) with check (is_director_or_admin());

create policy fellow_away_self on fellow_away_dates
  for all using (fellow_id = auth.uid() or is_director_or_admin())
  with check (fellow_id = auth.uid() or is_director_or_admin());

create policy clinic_trades_read on clinic_trades for select using (auth.uid() is not null);
create policy clinic_trades_create on clinic_trades for insert with check (requested_by = auth.uid());
create policy clinic_trades_decide on clinic_trades for update using (is_director_or_admin()) with check (is_director_or_admin());

create policy handbook_read on handbook_pages for select using (auth.uid() is not null);
create policy handbook_manage on handbook_pages for all using (is_director_or_admin()) with check (is_director_or_admin());
create policy handbook_ver_read on handbook_versions for select using (auth.uid() is not null);
create policy handbook_ver_manage on handbook_versions for all using (is_director_or_admin()) with check (is_director_or_admin());

create policy resources_read on resources for select using (auth.uid() is not null);
create policy resources_manage on resources for all using (is_director_or_admin()) with check (is_director_or_admin());

create policy publications_read on publications for select using (auth.uid() is not null);
create policy publications_manage on publications for all using (is_director_or_admin()) with check (is_director_or_admin());

create policy digest_self on digest_settings
  for all using (user_id = auth.uid() or is_director_or_admin())
  with check (user_id = auth.uid() or is_director_or_admin());

create policy notifications_self on notifications
  for select using (user_id = auth.uid());
create policy notifications_update_self on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- Auto-provision a profile row when a new auth user signs up
-- =====================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    'fellow'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
