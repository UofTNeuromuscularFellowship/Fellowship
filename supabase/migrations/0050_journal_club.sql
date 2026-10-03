-- ---------------------------------------------------------------------------
-- Journal Club.
--
-- Anyone in the program recommends an article; it goes straight onto the
-- list. Each article has ONE shared summary — a one-line outcome and its
-- limitations — that anyone may edit (who last edited it is shown), and a
-- discussion of comments and questions.
--
-- Conduct: before anyone posts for the first time they accept the program's
-- policy (no verbal abuse or harassment). Anyone can report a comment; the
-- director/admin is emailed and can remove comments and articles. A removal
-- keeps the original text in jc_moderation_log, readable only by the
-- director/admin, and the discussion shows that a comment was removed.
--
-- Applied to the live database in two parts (0050a tables, 0050b functions).
--
-- All writes go through the functions below (SECURITY DEFINER), so the rules
-- live in one place; members can only read the tables directly.
-- ---------------------------------------------------------------------------

create table if not exists public.jc_articles (
  id                  uuid primary key default gen_random_uuid(),
  site_id             uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  title               text not null check (length(trim(title)) between 1 and 500),
  authors             text check (length(authors) <= 1000),
  journal             text check (length(journal) <= 300),
  year                integer check (year is null or year between 1800 and 2200),
  url                 text check (url is null or url ~ '^https?://'),
  doi                 text check (length(doi) <= 200),
  pmid                text check (pmid is null or pmid ~ '^[0-9]{1,10}$'),
  why                 text check (length(why) <= 2000),
  recommended_by      uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  summary_outcome     text check (length(summary_outcome) <= 400),
  summary_limitations text check (length(summary_limitations) <= 3000),
  summary_by          uuid references public.users(id) on delete set null,
  summary_at          timestamptz,
  removed_at          timestamptz,
  removed_by          uuid references public.users(id) on delete set null,
  removed_reason      text
);
create index if not exists jc_articles_site on public.jc_articles (site_id, created_at desc);

create table if not exists public.jc_comments (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  article_id     uuid not null references public.jc_articles(id) on delete cascade,
  author_id      uuid references public.users(id) on delete set null,
  body           text check (body is null or length(body) between 1 and 4000),
  is_question    boolean not null default false,
  created_at     timestamptz not null default now(),
  edited_at      timestamptz,
  removed_at     timestamptz,
  removed_by     uuid references public.users(id) on delete set null,
  -- 'author' when the writer deleted it, 'moderator' when the director did
  removed_kind   text check (removed_kind in ('author', 'moderator'))
);
create index if not exists jc_comments_article on public.jc_comments (article_id, created_at);

create table if not exists public.jc_policy_acks (
  site_id     uuid not null references public.sites(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (site_id, user_id)
);

create table if not exists public.jc_reports (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  comment_id  uuid not null references public.jc_comments(id) on delete cascade,
  reporter_id uuid references public.users(id) on delete set null,
  reason      text check (length(reason) <= 1000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  unique (comment_id, reporter_id)
);

create table if not exists public.jc_moderation_log (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  kind        text not null check (kind in ('comment', 'article')),
  target_id   uuid not null,
  original    jsonb not null,
  reason      text,
  removed_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ access

do $$
declare t text;
begin
  foreach t in array array['jc_articles', 'jc_comments', 'jc_policy_acks', 'jc_reports', 'jc_moderation_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I as restrictive for all
      using ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
      with check ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))$p$,
      t || '_site_isolation', t);
    execute format('create policy %I on public.%I for all to app_definer using (true) with check (true)', t || '_app_definer_all', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role, app_definer', t);
  end loop;
end $$;

-- Members read the list and the discussion. A removed article is seen only
-- by the director/admin; a removed comment stays as a placeholder (its text
-- is cleared at removal).
create policy jc_articles_read on public.jc_articles for select to authenticated
  using (public.current_app_role() is not null and (removed_at is null or coalesce(public.is_director_or_admin(), false)));
create policy jc_comments_read on public.jc_comments for select to authenticated
  using (public.current_app_role() is not null);
create policy jc_policy_acks_read on public.jc_policy_acks for select to authenticated
  using (user_id = public.current_uid() or coalesce(public.is_director_or_admin(), false));
create policy jc_reports_read on public.jc_reports for select to authenticated
  using (coalesce(public.is_director_or_admin(), false) or reporter_id = public.current_uid());
create policy jc_moderation_log_read on public.jc_moderation_log for select to authenticated
  using (coalesce(public.is_director_or_admin(), false));
grant select on public.jc_articles, public.jc_comments, public.jc_policy_acks, public.jc_reports, public.jc_moderation_log to authenticated;

-- ------------------------------------------------------------ helpers

create or replace function public.jc_require_member() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := public.current_uid();
begin
  if v is null or public.current_app_role() is null then
    raise exception 'Sign in as a member of this program to use Journal Club' using errcode = 'insufficient_privilege';
  end if;
  return v;
end $$;

create or replace function public.jc_require_policy() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := public.jc_require_member();
begin
  if not exists (select 1 from public.jc_policy_acks where site_id = public.current_site_id() and user_id = v) then
    raise exception 'Please read and accept the Journal Club conduct policy before posting' using errcode = 'insufficient_privilege';
  end if;
  return v;
end $$;

create or replace function public.jc_require_moderator() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := public.jc_require_member();
begin
  if not coalesce(public.is_director_or_admin(), false) then
    raise exception 'Only the program director can remove posts' using errcode = 'insufficient_privilege';
  end if;
  return v;
end $$;

create or replace function public.jc_clean(p text) returns text
language sql immutable set search_path = public as $$ select nullif(trim(p), '') $$;

-- ------------------------------------------------------------ actions

create or replace function public.jc_accept_policy() returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_member();
begin
  insert into public.jc_policy_acks (site_id, user_id) values (public.current_site_id(), v)
  on conflict (site_id, user_id) do nothing;
end $$;

create or replace function public.jc_recommend(
  p_title text, p_authors text, p_journal text, p_year integer, p_url text, p_doi text, p_pmid text, p_why text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_policy(); v_id uuid;
begin
  if public.jc_clean(p_title) is null then raise exception 'Add the article''s title'; end if;
  insert into public.jc_articles (site_id, title, authors, journal, year, url, doi, pmid, why, recommended_by)
  values (public.current_site_id(), trim(p_title), public.jc_clean(p_authors), public.jc_clean(p_journal), p_year,
          public.jc_clean(p_url), public.jc_clean(p_doi), public.jc_clean(p_pmid), public.jc_clean(p_why), v)
  returning id into v_id;
  return v_id;
end $$;

-- The article's details: whoever recommended it, or the director/admin.
create or replace function public.jc_update_article(
  p_article uuid, p_title text, p_authors text, p_journal text, p_year integer, p_url text, p_doi text, p_pmid text, p_why text
) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_policy(); a public.jc_articles;
begin
  select * into a from public.jc_articles where id = p_article and site_id = public.current_site_id() and removed_at is null;
  if not found then raise exception 'That article is no longer on the list'; end if;
  if a.recommended_by is distinct from v and not coalesce(public.is_director_or_admin(), false) then
    raise exception 'Only the person who recommended it, or the director, can change its details' using errcode = 'insufficient_privilege';
  end if;
  if public.jc_clean(p_title) is null then raise exception 'Add the article''s title'; end if;
  update public.jc_articles set title = trim(p_title), authors = public.jc_clean(p_authors), journal = public.jc_clean(p_journal),
    year = p_year, url = public.jc_clean(p_url), doi = public.jc_clean(p_doi), pmid = public.jc_clean(p_pmid), why = public.jc_clean(p_why)
   where id = p_article;
end $$;

-- The one shared summary: anyone may write or improve it.
create or replace function public.jc_save_summary(p_article uuid, p_outcome text, p_limitations text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_policy();
begin
  update public.jc_articles
     set summary_outcome = public.jc_clean(p_outcome), summary_limitations = public.jc_clean(p_limitations),
         summary_by = v, summary_at = now()
   where id = p_article and site_id = public.current_site_id() and removed_at is null;
  if not found then raise exception 'That article is no longer on the list'; end if;
end $$;

create or replace function public.jc_post_comment(p_article uuid, p_body text, p_question boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_policy(); v_id uuid;
begin
  if public.jc_clean(p_body) is null then raise exception 'Write something first'; end if;
  if not exists (select 1 from public.jc_articles where id = p_article and site_id = public.current_site_id() and removed_at is null) then
    raise exception 'That article is no longer on the list';
  end if;
  insert into public.jc_comments (site_id, article_id, author_id, body, is_question)
  values (public.current_site_id(), p_article, v, trim(p_body), coalesce(p_question, false))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.jc_edit_comment(p_comment uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_policy();
begin
  if public.jc_clean(p_body) is null then raise exception 'Write something first'; end if;
  update public.jc_comments set body = trim(p_body), edited_at = now()
   where id = p_comment and author_id = v and removed_at is null and site_id = public.current_site_id();
  if not found then raise exception 'You can only edit your own comments' using errcode = 'insufficient_privilege'; end if;
end $$;

-- Withdrawing your own comment.
create or replace function public.jc_delete_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_member();
begin
  update public.jc_comments set body = null, removed_at = now(), removed_by = v, removed_kind = 'author'
   where id = p_comment and author_id = v and removed_at is null and site_id = public.current_site_id();
  if not found then raise exception 'You can only delete your own comments' using errcode = 'insufficient_privilege'; end if;
end $$;

-- Anyone can report a comment; the director/admin is emailed.
create or replace function public.jc_report_comment(p_comment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_member(); c public.jc_comments; a public.jc_articles; r record;
begin
  select * into c from public.jc_comments where id = p_comment and site_id = public.current_site_id() and removed_at is null;
  if not found then raise exception 'That comment is no longer there'; end if;
  insert into public.jc_reports (site_id, comment_id, reporter_id, reason)
  values (c.site_id, c.id, v, left(public.jc_clean(p_reason), 1000))
  on conflict (comment_id, reporter_id) do update set reason = excluded.reason, created_at = now(), resolved_at = null, resolved_by = null;
  select * into a from public.jc_articles where id = c.article_id;
  for r in
    select u.email from public.site_memberships m join public.users u on u.id = m.user_id
     where m.site_id = c.site_id and m.status = 'active' and m.role in ('director', 'admin') and u.email is not null
  loop
    perform public.enqueue_email('jcreport-' || c.id || '-' || v || '-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS'), r.email,
      'Journal Club: a comment was reported',
      '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1B2D;line-height:1.55">'
      || '<h2 style="font-family:Georgia,serif;font-weight:500;margin:0 0 16px">A Journal Club comment was reported</h2>'
      || '<p>A comment on <strong>' || public.conf_esc(a.title) || '</strong> was reported'
      || case when public.jc_clean(p_reason) is not null then ' with this note: <em>' || public.conf_esc(left(p_reason, 1000)) || '</em>' else '' end
      || '.</p><p>Please review it against the conduct policy. You can remove it from the discussion.</p>'
      || '<p style="margin:28px 0"><a href="' || public.conf_portal_url() || '/journal-club/' || a.id
      || '" style="background:#0E7C86;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Review the discussion</a></p></div>');
  end loop;
end $$;

-- Director/admin: remove a comment. The original text is kept in the log.
create or replace function public.jc_remove_comment(p_comment uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_moderator(); c public.jc_comments;
begin
  select * into c from public.jc_comments where id = p_comment and site_id = public.current_site_id() and removed_at is null;
  if not found then raise exception 'That comment is no longer there'; end if;
  insert into public.jc_moderation_log (site_id, kind, target_id, original, reason, removed_by)
  values (c.site_id, 'comment', c.id, to_jsonb(c), public.jc_clean(p_reason), v);
  update public.jc_comments set body = null, removed_at = now(), removed_by = v, removed_kind = 'moderator' where id = c.id;
  update public.jc_reports set resolved_at = now(), resolved_by = v where comment_id = c.id and resolved_at is null;
end $$;

-- Director/admin: dismiss reports on a comment that is fine.
create or replace function public.jc_dismiss_reports(p_comment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_moderator();
begin
  update public.jc_reports set resolved_at = now(), resolved_by = v
   where comment_id = p_comment and resolved_at is null and site_id = public.current_site_id();
end $$;

-- Director/admin: take an article off the list (its discussion goes with it).
create or replace function public.jc_remove_article(p_article uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.jc_require_moderator(); a public.jc_articles;
begin
  select * into a from public.jc_articles where id = p_article and site_id = public.current_site_id() and removed_at is null;
  if not found then raise exception 'That article is no longer on the list'; end if;
  insert into public.jc_moderation_log (site_id, kind, target_id, original, reason, removed_by)
  values (a.site_id, 'article', a.id, to_jsonb(a), public.jc_clean(p_reason), v);
  update public.jc_articles set removed_at = now(), removed_by = v, removed_reason = public.jc_clean(p_reason) where id = a.id;
end $$;

-- Who's who in the discussion: names of members, for the page to show.
create or replace function public.jc_people() returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path = public as $$
  select u.id, u.full_name, m.role::text
    from public.site_memberships m join public.users u on u.id = m.user_id
   where m.site_id = public.current_site_id() and public.current_app_role() is not null
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'jc_require_member()', 'jc_require_policy()', 'jc_require_moderator()',
    'jc_accept_policy()', 'jc_recommend(text,text,text,integer,text,text,text,text)',
    'jc_update_article(uuid,text,text,text,integer,text,text,text,text)', 'jc_save_summary(uuid,text,text)',
    'jc_post_comment(uuid,text,boolean)', 'jc_edit_comment(uuid,text)', 'jc_delete_comment(uuid)',
    'jc_report_comment(uuid,text)', 'jc_remove_comment(uuid,text)', 'jc_dismiss_reports(uuid)',
    'jc_remove_article(uuid,text)', 'jc_people()'] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
