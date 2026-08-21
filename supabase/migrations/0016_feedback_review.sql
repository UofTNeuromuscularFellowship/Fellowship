-- Feedback review for the fellowship director.
--
-- Ratings and comments already existed, but only one session at a time: you had
-- to open each session on My Teaching to see them. Nothing answered "how is this
-- supervisor doing across the year", "which fellows are actually responding", or
-- "what have people asked us to teach". This adds:
--
--   1. normalize_topic()          — the shared grouping key for free-text topics
--   2. feedback_review_responses  — every rating, with teacher and fellow names
--   3. feedback_review_sessions   — one row per session, including those with
--                                   no feedback at all (so gaps are visible)
--   4. suggested_topic_summary    — requested topics ranked by demand
--   5. topic_status + set_topic_status — marking a request covered / not planned
--
-- Everything here is director/admin only. Teachers keep seeing their own
-- feedback without names through provider_session_feedback(); nothing in this
-- migration widens what they can read.

--
-- A note on the guard used throughout. is_director_or_admin() returns NULL --
-- not false -- when auth.uid() has no row in public.users, and `if not NULL
-- then raise` never fires, so a bare guard silently passes. anon is revoked
-- from every function here, so the exposure would be an authenticated JWT whose
-- user row is missing, but the fix is one coalesce and it is applied below.
-- The same pattern exists in older RPCs in this project and is worth a sweep.

-- ---------------------------------------------------------------------------
-- 1. Topic normalisation
--
-- Suggestions are free text typed by different people, so grouping is
-- necessarily crude: this lowercases, collapses whitespace, and drops
-- surrounding punctuation. "Myasthenia gravis." and "myasthenia  gravis" group;
-- "MG" does not group with either, and no amount of string work would make it.
-- The director sees the raw text of every request under each group, so a
-- mis-grouping is visible rather than silent.
--
-- Deliberately NOT split on commas. People write "nerve conduction, especially
-- in carpal tunnel" as often as they write a list, and splitting that produces
-- two fragments that mean nothing on their own. Newlines, semicolons and
-- bullet markers are unambiguous list separators and are split.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_topic(p_text text)
returns text
language sql
immutable
as $function$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(lower(coalesce(p_text, '')), '\s+', ' ', 'g'),
        '^[\s\-\*•"''.]+|[\s"''.!?]+$', '', 'g'
      )
    ),
    ''
  );
$function$;

comment on function public.normalize_topic(text) is
  'Grouping key for free-text topic suggestions: lowercased, whitespace collapsed, surrounding punctuation stripped. Used by both suggested_topic_summary() and topic_status so a dismissal matches the group it was made on.';

-- Split one free-text suggestion into individual topics.
create or replace function public.split_topics(p_text text)
returns setof text
language sql
immutable
as $function$
  select t from unnest(regexp_split_to_array(coalesce(p_text, ''), '[\n;•]|(?:^|\s)[-\*]\s')) as t
  where public.normalize_topic(t) is not null;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Every response, with names
-- ---------------------------------------------------------------------------
create or replace function public.feedback_review_responses(
  p_from date default null,
  p_to   date default null
)
returns table(
  session_id uuid,
  session_date date,
  topic text,
  provider_id uuid,
  provider_name text,
  fellow_id uuid,
  fellow_name text,
  rating smallint,
  comments text,
  suggested_topics text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(public.is_director_or_admin(), false) then
    raise exception 'not authorized to review teaching feedback';
  end if;

  return query
    select
      tf.session_id,
      ts.session_date,
      ts.topic,
      ts.provider_id,
      coalesce(pu.full_name, ts.provider_name),
      tf.fellow_id,
      coalesce(fu.full_name, 'Fellow'),
      tf.rating,
      tf.comments,
      tf.suggested_topics,
      tf.created_at
    from public.teaching_feedback tf
    join public.teaching_sessions ts on ts.id = tf.session_id
    left join public.users pu on pu.id = ts.provider_id
    left join public.users fu on fu.id = tf.fellow_id
    where (p_from is null or ts.session_date >= p_from)
      and (p_to   is null or ts.session_date <= p_to)
    order by ts.session_date desc, tf.created_at desc;
end;
$function$;

revoke all on function public.feedback_review_responses(date, date) from public, anon;
grant execute on function public.feedback_review_responses(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. One row per session — including sessions nobody rated
--
-- A session with zero responses is the interesting one: it is either a session
-- the fellows skipped or a request that went unanswered. A view built only from
-- teaching_feedback would hide exactly those, so this drives off
-- teaching_sessions and left-joins the ratings.
-- ---------------------------------------------------------------------------
create or replace function public.feedback_review_sessions(
  p_from date default null,
  p_to   date default null
)
returns table(
  session_id uuid,
  session_date date,
  topic text,
  provider_id uuid,
  provider_name text,
  status text,
  response_count int,
  avg_rating numeric,
  attended_count int,
  report_submitted_at timestamptz,
  topics_covered text,
  learning_gaps text,
  suggested_topics text,
  feedback_requested boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(public.is_director_or_admin(), false) then
    raise exception 'not authorized to review teaching feedback';
  end if;

  return query
    select
      ts.id,
      ts.session_date,
      ts.topic,
      ts.provider_id,
      coalesce(pu.full_name, ts.provider_name),
      ts.status::text,
      coalesce(fb.n, 0)::int,
      round(fb.avg_rating, 2),
      coalesce(att.n, 0)::int,
      ts.report_submitted_at,
      ts.topics_covered,
      ts.learning_gaps,
      ts.suggested_topics,
      ts.feedback_requested
    from public.teaching_sessions ts
    left join public.users pu on pu.id = ts.provider_id
    left join lateral (
      select count(*) as n, avg(tf.rating)::numeric as avg_rating
      from public.teaching_feedback tf where tf.session_id = ts.id
    ) fb on true
    left join lateral (
      select count(*) as n from public.session_attendance sa
      where sa.session_id = ts.id and sa.status = 'attended'
    ) att on true
    where ts.is_break = false
      and ts.assignment_draft = false
      and (p_from is null or ts.session_date >= p_from)
      and (p_to   is null or ts.session_date <= p_to)
    order by ts.session_date desc;
end;
$function$;

revoke all on function public.feedback_review_sessions(date, date) from public, anon;
grant execute on function public.feedback_review_sessions(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 & 5. Requested topics, ranked, with a curation state
-- ---------------------------------------------------------------------------
create table if not exists public.topic_status (
  topic_key   text primary key,
  label       text not null,
  status      text not null default 'open' check (status in ('open', 'covered', 'not_planned')),
  note        text,
  updated_by  uuid references public.users(id),
  updated_at  timestamptz not null default now()
);

comment on table public.topic_status is
  'Curation state for requested teaching topics, keyed by normalize_topic(). Absent row means open.';

alter table public.topic_status enable row level security;

drop policy if exists topic_status_rw on public.topic_status;
create policy topic_status_rw on public.topic_status
  for all to authenticated
  using (public.is_director_or_admin())
  with check (public.is_director_or_admin());

grant select, insert, update, delete on public.topic_status to authenticated;

create or replace function public.set_topic_status(
  p_key text,
  p_label text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(public.is_director_or_admin(), false) then
    raise exception 'not authorized to curate topic requests';
  end if;
  if p_status not in ('open', 'covered', 'not_planned') then
    raise exception 'unknown status %', p_status;
  end if;

  if p_status = 'open' then
    delete from public.topic_status where topic_key = p_key;
    return;
  end if;

  insert into public.topic_status (topic_key, label, status, updated_by, updated_at)
  values (p_key, p_label, p_status, auth.uid(), now())
  on conflict (topic_key) do update
    set status = excluded.status,
        label = excluded.label,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$function$;

revoke all on function public.set_topic_status(text, text, text) from public, anon;
grant execute on function public.set_topic_status(text, text, text) to authenticated;

-- Ranked demand across both sources: what fellows asked for when rating a
-- session, and what teachers suggested on their session reports.
create or replace function public.suggested_topic_summary(
  p_from date default null,
  p_to   date default null
)
returns table(
  topic_key text,
  label text,
  request_count int,
  fellow_requests int,
  teacher_requests int,
  first_requested date,
  last_requested date,
  status text,
  detail jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(public.is_director_or_admin(), false) then
    raise exception 'not authorized to review topic requests';
  end if;

  return query
  with raw as (
    -- Fellows, via the rating form
    select
      public.normalize_topic(t) as key,
      btrim(t)                  as label,
      'fellow'                  as source,
      coalesce(fu.full_name, 'Fellow') as person,
      ts.session_date,
      ts.topic as after_session
    from public.teaching_feedback tf
    join public.teaching_sessions ts on ts.id = tf.session_id
    left join public.users fu on fu.id = tf.fellow_id
    cross join lateral public.split_topics(tf.suggested_topics) as t
    where (p_from is null or ts.session_date >= p_from)
      and (p_to   is null or ts.session_date <= p_to)

    union all

    -- Teachers, via the session report
    select
      public.normalize_topic(t),
      btrim(t),
      'teacher',
      coalesce(pu.full_name, ts.provider_name, 'Teacher'),
      ts.session_date,
      ts.topic
    from public.teaching_sessions ts
    left join public.users pu on pu.id = ts.provider_id
    cross join lateral public.split_topics(ts.suggested_topics) as t
    where (p_from is null or ts.session_date >= p_from)
      and (p_to   is null or ts.session_date <= p_to)
  )
  select
    r.key,
    (array_agg(r.label order by r.session_date desc))[1],
    count(*)::int,
    count(*) filter (where r.source = 'fellow')::int,
    count(*) filter (where r.source = 'teacher')::int,
    min(r.session_date),
    max(r.session_date),
    coalesce(st.status, 'open'),
    jsonb_agg(
      jsonb_build_object(
        'source', r.source,
        'person', r.person,
        'text', r.label,
        'session_date', r.session_date,
        'after_session', r.after_session
      )
      order by r.session_date desc
    )
  from raw r
  left join public.topic_status st on st.topic_key = r.key
  where r.key is not null
  group by r.key, st.status
  order by count(*) desc, max(r.session_date) desc;
end;
$function$;

revoke all on function public.suggested_topic_summary(date, date) from public, anon;
grant execute on function public.suggested_topic_summary(date, date) to authenticated;
