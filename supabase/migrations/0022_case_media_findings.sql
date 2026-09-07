-- ---------------------------------------------------------------------------
-- What a case shows: a controlled vocabulary, and a many-to-many link to it.
--
-- Applied live 2026-09-06; this file is the repo's record of it.
--
-- Built this way rather than as a text[] column on case_media because the
-- stated reason for having it is a quiz later. A quiz asks questions a text
-- array answers badly: give me every case showing a fibrillation potential;
-- give me cases with exactly one finding so the answer is unambiguous; give me
-- three findings this case does NOT show, as distractors; how many examples of
-- neuromyotonia do we actually have. Those are indexed joins here and full
-- scans with array operators there.
--
-- The vocabulary is a TABLE, not a CHECK constraint or a TypeScript union:
-- adding a term later should be one INSERT by the director, not a migration
-- plus a deploy. applies_to says which media kinds offer it, so extending the
-- nerve list to MRI is also a data change rather than a code change.
-- ---------------------------------------------------------------------------

create table if not exists public.case_finding (
  code        text primary key,
  label       text not null,
  -- Which media kinds may be tagged with this. An array so one finding can
  -- serve more than one kind without duplicating the row.
  applies_to  text[] not null,
  sort_order  integer not null default 0,
  -- Retire a term instead of deleting it: cases already tagged with it keep
  -- their tag, it simply stops being offered on new uploads.
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.case_finding is
  'Controlled vocabulary of what a teaching case shows. Extend by INSERT; retire by setting active = false rather than deleting, so existing tags survive.';

create table if not exists public.case_media_finding (
  case_id      uuid not null references public.case_media (id) on delete cascade,
  finding_code text not null references public.case_finding (code) on delete restrict,
  created_at   timestamptz not null default now(),
  primary key (case_id, finding_code)
);

comment on table public.case_media_finding is
  'Which findings a case shows. Many-to-many: a single trace can be both a fibrillation potential and a positive sharp wave.';

-- The index a quiz needs: "every case showing X". The primary key already
-- covers case_id first, so this is the other direction.
create index if not exists case_media_finding_by_code
  on public.case_media_finding (finding_code, case_id);

alter table public.case_finding enable row level security;
alter table public.case_media_finding enable row level security;

-- The vocabulary is readable by everyone signed in; only the director and
-- program admin can change it.
-- coalesce() throughout: is_director_or_admin() returns NULL, not false, for a
-- JWT with no matching users row. See claude/feedback-review-page.md.
drop policy if exists case_finding_read on public.case_finding;
create policy case_finding_read on public.case_finding
  for select to authenticated using (true);

drop policy if exists case_finding_write on public.case_finding;
create policy case_finding_write on public.case_finding
  for all to authenticated
  using (coalesce(public.is_director_or_admin(), false))
  with check (coalesce(public.is_director_or_admin(), false));

-- Tags follow the case: anyone signed in can read them, and whoever may edit
-- the case may tag it. Mirrors 0018 exactly rather than inventing a second
-- rule, so "who can change this case" has one answer.
drop policy if exists case_media_finding_read on public.case_media_finding;
create policy case_media_finding_read on public.case_media_finding
  for select to authenticated using (true);

drop policy if exists case_media_finding_write on public.case_media_finding;
create policy case_media_finding_write on public.case_media_finding
  for insert to authenticated
  with check (
    exists (
      select 1 from public.case_media m
      where m.id = case_id
        and (m.author_id = auth.uid() or coalesce(public.is_director_or_admin(), false))
    )
  );

drop policy if exists case_media_finding_delete on public.case_media_finding;
create policy case_media_finding_delete on public.case_media_finding
  for delete to authenticated
  using (
    exists (
      select 1 from public.case_media m
      where m.id = case_id
        and (m.author_id = auth.uid() or coalesce(public.is_director_or_admin(), false))
    )
  );

grant select on public.case_finding to authenticated;
grant insert, update, delete on public.case_finding to authenticated;
grant select, insert, delete on public.case_media_finding to authenticated;

-- ---------------------------------------------------------------------------
-- The two vocabularies, in the order the fellowship gave them. No terms added,
-- none reordered into invented categories.
-- ---------------------------------------------------------------------------

insert into public.case_finding (code, label, applies_to, sort_order) values
  ('fibrillation_potential',        'Fibrillation potential',           array['waveform'],  10),
  ('positive_sharp_wave',           'Positive sharp wave',              array['waveform'],  20),
  ('complex_repetitive_discharge',  'Complex repetitive discharge',     array['waveform'],  30),
  ('myotonia',                      'Myotonia',                         array['waveform'],  40),
  ('neuromyotonia',                 'Neuromyotonia',                    array['waveform'],  50),
  ('myokymia',                      'Myokymia',                         array['waveform'],  60),
  ('pacemaker_artifact',            'Pacemaker artifact',               array['waveform'],  70),
  ('endplate_spikes',               'Endplate spikes',                  array['waveform'],  80),
  ('fasciculation_potentials',      'Fasciculation potentials',         array['waveform'],  90),
  ('doublet',                       'Doublet',                          array['waveform'], 100),
  ('triplet',                       'Triplet',                          array['waveform'], 110),
  ('reduced_recruitment',           'Reduced recruitment',              array['waveform'], 120),
  ('early_recruitment',             'Early recruitment',                array['waveform'], 130),
  ('nascent_unit',                  'Nascent unit',                     array['waveform'], 140),
  ('polyphasic_unit',               'Polyphasic unit',                  array['waveform'], 150),
  ('abnormal_jitter',               'Abnormal jitter',                  array['waveform'], 160),
  ('normal_jitter',                 'Normal jitter',                    array['waveform'], 170),

  ('median_nerve',                  'Median nerve',                     array['ultrasound'], 210),
  ('ulnar_nerve',                   'Ulnar nerve',                      array['ultrasound'], 220),
  ('radial_nerve',                  'Radial nerve',                     array['ultrasound'], 230),
  ('brachial_plexus',               'Brachial plexus',                  array['ultrasound'], 240),
  ('peroneal_nerve',                'Peroneal nerve',                   array['ultrasound'], 250),
  ('tibial_nerve',                  'Tibial nerve',                     array['ultrasound'], 260),
  ('sciatic_nerve',                 'Sciatic nerve',                    array['ultrasound'], 270),
  ('lateral_femoral_cutaneous_nerve','Lateral femoral cutaneous nerve', array['ultrasound'], 280),
  ('diaphragm',                     'Diaphragm',                        array['ultrasound'], 290)
on conflict (code) do update
  set label = excluded.label,
      applies_to = excluded.applies_to,
      sort_order = excluded.sort_order;
