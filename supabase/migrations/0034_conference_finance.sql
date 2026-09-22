-- ---------------------------------------------------------------------------
-- 0034 — conference money, guided setup, and deleting an event
--
-- Money, per event:
--   budget lines   what the coordinator plans to spend or take in, by heading
--                  (conf_budget, now edited freely; "estimated" is the budget)
--   transactions   what was actually paid or received, or is still owing,
--                  optionally against a budget line - the budget's "paid"
--                  column is the sum of these, never typed in
--   honoraria      what a speaker is to be paid and who to pay: collected
--                  from the speaker on their private /speaker/<token> page
--   claims         a speaker's travel and other expenses, with receipts,
--                  approved or declined by the coordinator
--   receipts       files in the private 'conference' bucket, attached to
--                  exactly one transaction, honorarium (the speaker's
--                  invoice) or claim
--
-- The speaker page never asks for bank account numbers or a SIN: a cheque
-- needs a name and an address, an e-Transfer needs an email address.
--
-- Same access model as 0030: every table per program, gated on the
-- 'conference' entitlement, readable and writable only by the program's
-- director or admin. Speakers reach their own row only through their token
-- and the functions below.
-- ---------------------------------------------------------------------------

-- ------------------------------- events -----------------------------------

alter table public.conf_events
  add column if not exists setup_done boolean not null default false,
  add column if not exists setup_step smallint not null default 0,
  add column if not exists tax_rate   numeric(5,2) not null default 13,
  add column if not exists tax_label  text not null default 'HST';

alter table public.conf_events
  add constraint conf_events_setup_step check (setup_step between 0 and 4),
  add constraint conf_events_tax_rate  check (tax_rate >= 0 and tax_rate <= 30),
  add constraint conf_events_tax_label check (length(tax_label) between 1 and 12);

-- Events made before the guided setup existed are already set up.
update public.conf_events set setup_done = true where not setup_done;

-- ------------------------------- budget -----------------------------------

alter table public.conf_budget add column if not exists sort integer not null default 0;
comment on column public.conf_budget.estimated is 'The budgeted amount for this line.';
comment on column public.conf_budget.actual is
  'Superseded: what was paid is now the sum of conf_transactions against the line. Kept so older pages still load.';

-- Composite keys, so a row can only point at a speaker, budget line,
-- honorarium or transaction of its OWN event.
alter table public.conf_budget   add constraint conf_budget_id_event_kind unique (id, event_id, kind);
alter table public.conf_budget   add constraint conf_budget_id_event      unique (id, event_id);
alter table public.conf_speakers add constraint conf_speakers_id_event    unique (id, event_id);

-- ------------------------------ honoraria ---------------------------------

create table public.conf_honoraria (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id        uuid not null references public.conf_events(id) on delete cascade,
  speaker_id      uuid not null unique,
  -- the budget line this is expected to come out of
  budget_id       uuid,
  amount          numeric(10,2) check (amount is null or amount >= 0),
  claims_allowed  boolean not null default false,
  claims_note     text,
  requested_at    timestamptz,
  -- the speaker agreed to this amount (cleared whenever the amount changes)
  confirmed_at    timestamptz,
  payee_type      text check (payee_type in ('individual', 'corporation')),
  legal_name      text,
  hst_number      text check (hst_number is null or hst_number ~ '^[0-9]{9}RT[0-9]{4}$'),
  address         text,
  pay_method      text check (pay_method in ('cheque', 'etransfer')),
  etransfer_email text check (etransfer_email is null or etransfer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  details_at      timestamptz,
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  constraint conf_honoraria_id_event unique (id, event_id),
  constraint conf_honoraria_speaker foreign key (speaker_id, event_id)
    references public.conf_speakers (id, event_id) on delete cascade,
  constraint conf_honoraria_budget foreign key (budget_id, event_id)
    references public.conf_budget (id, event_id) on delete set null (budget_id)
);

-- ----------------------------- transactions -------------------------------
-- amount is the total that changed hands, tax included; tax is the part of
-- it that was sales tax (HST/GST/PST), for the tax totals in the report.

create table public.conf_transactions (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id       uuid not null references public.conf_events(id) on delete cascade,
  kind           text not null default 'expense' check (kind in ('expense', 'income')),
  budget_id      uuid,
  txn_date       date not null default current_date,
  party          text,
  description    text not null check (length(trim(description)) > 0),
  amount         numeric(10,2) not null check (amount >= 0),
  tax            numeric(10,2) not null default 0,
  status         text not null default 'paid' check (status in ('owing', 'paid')),
  paid_on        date,
  method         text check (method in ('cheque', 'etransfer', 'card', 'eft', 'cash', 'other')),
  reference      text,
  honorarium_id  uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  constraint conf_transactions_tax check (tax >= 0 and tax <= amount),
  constraint conf_transactions_paid_on check (status = 'owing' or paid_on is not null),
  constraint conf_transactions_id_event unique (id, event_id),
  -- a cost can only go against a cost line, income against an income line
  constraint conf_transactions_budget foreign key (budget_id, event_id, kind)
    references public.conf_budget (id, event_id, kind) on delete set null (budget_id),
  constraint conf_transactions_honorarium foreign key (honorarium_id, event_id)
    references public.conf_honoraria (id, event_id) on delete set null (honorarium_id)
);

-- -------------------------------- claims ----------------------------------

create table public.conf_claims (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id        uuid not null references public.conf_events(id) on delete cascade,
  honorarium_id   uuid not null,
  category        text not null default 'travel' check (category in ('travel', 'accommodation', 'meals', 'other')),
  description     text not null check (length(trim(description)) > 0),
  incurred_on     date,
  -- what the speaker paid, tax included, and the tax part of it
  amount          numeric(10,2) not null check (amount > 0),
  tax             numeric(10,2) not null default 0,
  status          text not null default 'submitted' check (status in ('submitted', 'approved', 'declined', 'paid')),
  decision_note   text,
  decided_at      timestamptz,
  transaction_id  uuid,
  created_at      timestamptz not null default now(),
  constraint conf_claims_tax check (tax >= 0 and tax <= amount),
  constraint conf_claims_id_event unique (id, event_id),
  constraint conf_claims_honorarium foreign key (honorarium_id, event_id)
    references public.conf_honoraria (id, event_id) on delete cascade,
  constraint conf_claims_transaction foreign key (transaction_id, event_id)
    references public.conf_transactions (id, event_id) on delete set null (transaction_id)
);

-- ------------------------------- receipts ---------------------------------

create table public.conf_receipts (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  event_id       uuid not null references public.conf_events(id) on delete cascade,
  transaction_id uuid,
  honorarium_id  uuid,
  claim_id       uuid,
  storage_path   text not null unique,
  file_name      text not null,
  mime_type      text,
  size_bytes     bigint,
  uploaded_by    text not null default 'coordinator' check (uploaded_by in ('coordinator', 'speaker')),
  created_at     timestamptz not null default now(),
  constraint conf_receipts_one_parent check (num_nonnulls(transaction_id, honorarium_id, claim_id) = 1),
  -- a receipt row can only point into its own event's finance folder
  constraint conf_receipts_path check (starts_with(storage_path, event_id::text || '/finance/')),
  constraint conf_receipts_transaction foreign key (transaction_id, event_id)
    references public.conf_transactions (id, event_id) on delete cascade,
  constraint conf_receipts_honorarium foreign key (honorarium_id, event_id)
    references public.conf_honoraria (id, event_id) on delete cascade,
  constraint conf_receipts_claim foreign key (claim_id, event_id)
    references public.conf_claims (id, event_id) on delete cascade
);

create index conf_honoraria_event        on public.conf_honoraria (event_id);
create index conf_honoraria_speaker      on public.conf_honoraria (speaker_id, event_id);
create index conf_honoraria_budget       on public.conf_honoraria (budget_id, event_id);
create index conf_transactions_event     on public.conf_transactions (event_id, txn_date);
create index conf_transactions_budget    on public.conf_transactions (budget_id, event_id, kind);
create index conf_transactions_honorarium on public.conf_transactions (honorarium_id, event_id);
create index conf_claims_event           on public.conf_claims (event_id);
create index conf_claims_honorarium      on public.conf_claims (honorarium_id, event_id);
create index conf_claims_transaction     on public.conf_claims (transaction_id, event_id);
create index conf_receipts_event         on public.conf_receipts (event_id);
create index conf_receipts_transaction   on public.conf_receipts (transaction_id, event_id);
create index conf_receipts_honorarium    on public.conf_receipts (honorarium_id, event_id);
create index conf_receipts_claim         on public.conf_receipts (claim_id, event_id);

-- The same four policies as every other conference table (0030).
do $$
declare t text;
begin
  foreach t in array array['conf_honoraria', 'conf_transactions', 'conf_claims', 'conf_receipts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$
      create policy %I on public.%I as restrictive for all
        using ((site_id = (select public.current_site_id()))
               or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
        with check ((site_id = (select public.current_site_id()))
               or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
    $p$, t || '_site_isolation', t);
    execute format($p$
      create policy %I on public.%I as restrictive for all
        using (public.site_tool_enabled('conference'))
        with check (public.site_tool_enabled('conference'))
    $p$, t || '_tool_gate', t);
    execute format($p$
      create policy %I on public.%I for all to authenticated
        using (public.is_director_or_admin())
        with check (public.is_director_or_admin())
    $p$, t || '_manage', t);
    execute format($p$
      create policy %I on public.%I for all to app_definer using (true) with check (true)
    $p$, t || '_app_definer_all', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role, app_definer', t);
  end loop;
end $$;

-- A speaker agrees to an amount, not to whatever the amount later becomes.
create or replace function public.conf_honoraria_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.amount is distinct from old.amount and new.confirmed_at is not distinct from old.confirmed_at then
    new.confirmed_at := null;
  end if;
  return new;
end $$;
create trigger conf_honoraria_guard before update on public.conf_honoraria
  for each row execute function public.conf_honoraria_guard();

-- ------------------------------- storage ----------------------------------
-- The coordinator reaches a file through a row of their own program: a
-- presentation or a receipt, of an event they can see. Uploads go only into
-- a folder named for one of their own events. (Speakers upload through the
-- conf-speaker-files edge function, which checks their token instead.)

drop policy if exists conference_files_select on storage.objects;
drop policy if exists conference_files_insert on storage.objects;
drop policy if exists conference_files_delete on storage.objects;

create policy conference_files_select on storage.objects for select to authenticated
  using (bucket_id = 'conference' and (
    owner = auth.uid()
    or (public.is_director_or_admin() and (
          exists (select 1 from public.conf_presentations p join public.conf_events e on e.id = p.event_id
                   where p.storage_path = storage.objects.name)
       or exists (select 1 from public.conf_receipts r join public.conf_events e on e.id = r.event_id
                   where r.storage_path = storage.objects.name)))));

create policy conference_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'conference' and public.is_director_or_admin()
    and (storage.foldername(name))[1] in (select e.id::text from public.conf_events e));

create policy conference_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'conference' and (
    owner = auth.uid()
    or (public.is_director_or_admin() and (
          exists (select 1 from public.conf_presentations p join public.conf_events e on e.id = p.event_id
                   where p.storage_path = storage.objects.name)
       or exists (select 1 from public.conf_receipts r join public.conf_events e on e.id = r.event_id
                   where r.storage_path = storage.objects.name)))));

-- ============================ speakers, by token ============================

-- Everything on the speaker's page: their sessions and disclosure, and - if
-- the coordinator has set one up - their honorarium, payment details,
-- invoice and expense claims.
create or replace function public.conf_speaker_portal(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_x  boolean := public.conf_enter('speaker', p_token);
  v_sp public.conf_speakers;
  v_ev public.conf_events;
  v_h  public.conf_honoraria;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into v_sp from public.conf_speakers where token = p_token;
  if not found then return null; end if;
  select * into v_ev from public.conf_events where id = v_sp.event_id;
  select * into v_h from public.conf_honoraria where speaker_id = v_sp.id;

  return jsonb_build_object(
    'speaker_name', v_sp.full_name,
    'event_name', v_ev.name,
    'when', public.conf_when(v_ev.starts_on, v_ev.ends_on),
    'organizer_name', v_ev.organizer_name,
    'organizer_email', v_ev.organizer_email,
    'tax_label', v_ev.tax_label,
    'disclosure_status', v_sp.disclosure_status,
    'disclosure_text', v_sp.disclosure_text,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('title', s.title, 'role', ss.role,
               'session_date', s.session_date, 'start_time', to_char(s.start_time, 'HH24:MI'))
             order by s.session_date, s.start_time)
      from public.conf_session_speakers ss join public.conf_sessions s on s.id = ss.session_id
      where ss.speaker_id = v_sp.id), '[]'::jsonb),
    'honorarium', case when v_h.id is null then null else jsonb_build_object(
      'amount', v_h.amount,
      'confirmed', v_h.confirmed_at is not null,
      'claims_allowed', v_h.claims_allowed,
      'claims_note', v_h.claims_note,
      'payee_type', v_h.payee_type,
      'legal_name', v_h.legal_name,
      'hst_number', v_h.hst_number,
      'address', v_h.address,
      'pay_method', v_h.pay_method,
      'etransfer_email', v_h.etransfer_email,
      'details_given', v_h.details_at is not null,
      'paid', v_h.paid_at is not null,
      'invoices', coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'file_name', r.file_name, 'size_bytes', r.size_bytes,
                 'mine', r.uploaded_by = 'speaker') order by r.created_at)
        from public.conf_receipts r where r.honorarium_id = v_h.id), '[]'::jsonb),
      'claims', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'category', c.category, 'description', c.description,
                 'incurred_on', c.incurred_on, 'amount', c.amount, 'tax', c.tax,
                 'status', c.status, 'decision_note', c.decision_note,
                 'receipts', coalesce((
                   select jsonb_agg(jsonb_build_object('id', r.id, 'file_name', r.file_name,
                            'mine', r.uploaded_by = 'speaker') order by r.created_at)
                   from public.conf_receipts r where r.claim_id = c.id), '[]'::jsonb))
               order by c.created_at)
        from public.conf_claims c where c.honorarium_id = v_h.id), '[]'::jsonb)
    ) end);
end $$;

-- The speaker agrees to the amount they were shown. If the coordinator
-- changed it in the meantime, they are asked to look again.
create or replace function public.conf_speaker_confirm(p_token text, p_amount numeric)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_x boolean := public.conf_enter('speaker', p_token);
  v_h public.conf_honoraria;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid link'; end if;
  select h.* into v_h from public.conf_honoraria h join public.conf_speakers s on s.id = h.speaker_id
   where s.token = p_token for update of h;
  if not found or v_h.amount is null then raise exception 'There is no amount to confirm on this link yet'; end if;
  if v_h.paid_at is not null then raise exception 'This has already been paid'; end if;
  if p_amount is distinct from v_h.amount then
    raise exception 'The amount has changed since you opened this page. Reload it to see the new amount.';
  end if;
  update public.conf_honoraria set confirmed_at = now() where id = v_h.id;
  return true;
end $$;

-- Who to pay and how. A cheque needs a name and an address; an e-Transfer
-- an email address. Nothing else is asked for.
create or replace function public.conf_speaker_payee(
  p_token text, p_payee_type text, p_legal_name text, p_hst_number text,
  p_address text, p_pay_method text, p_etransfer_email text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_x    boolean := public.conf_enter('speaker', p_token);
  v_h    public.conf_honoraria;
  v_hst  text := nullif(upper(regexp_replace(coalesce(p_hst_number, ''), '[\s-]', '', 'g')), '');
  v_mail text := nullif(lower(trim(coalesce(p_etransfer_email, ''))), '');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid link'; end if;
  select h.* into v_h from public.conf_honoraria h join public.conf_speakers s on s.id = h.speaker_id
   where s.token = p_token for update of h;
  if not found then raise exception 'There is no payment to arrange on this link'; end if;
  if v_h.paid_at is not null then
    raise exception 'Your payment has already been made. To correct your details, contact the organizer.';
  end if;
  if p_payee_type is null or p_payee_type not in ('individual', 'corporation') then
    raise exception 'Choose whether you are paid personally or through a corporation';
  end if;
  if nullif(trim(p_legal_name), '') is null then raise exception 'Enter the name the payment should be made out to'; end if;
  if v_hst is not null and v_hst !~ '^[0-9]{9}RT[0-9]{4}$' then
    raise exception 'An HST number is nine digits, then RT, then four digits - for example 123456789 RT0001';
  end if;
  if p_pay_method is null or p_pay_method not in ('cheque', 'etransfer') then raise exception 'Choose cheque or e-Transfer'; end if;
  if p_pay_method = 'cheque' and nullif(trim(p_address), '') is null then
    raise exception 'Enter the mailing address the cheque should go to';
  end if;
  if p_pay_method = 'etransfer' and (v_mail is null or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Enter the email address you receive e-Transfers at';
  end if;

  update public.conf_honoraria set
    payee_type      = p_payee_type,
    legal_name      = left(trim(p_legal_name), 200),
    hst_number      = v_hst,
    address         = nullif(left(trim(coalesce(p_address, '')), 500), ''),
    pay_method      = p_pay_method,
    etransfer_email = case when p_pay_method = 'etransfer' then v_mail end,
    details_at      = now()
  where id = v_h.id;
  return true;
end $$;

-- One expense. Receipts are attached afterwards through conf-speaker-files.
create or replace function public.conf_speaker_claim(
  p_token text, p_category text, p_description text, p_incurred_on date, p_amount numeric, p_tax numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_x  boolean := public.conf_enter('speaker', p_token);
  v_h  public.conf_honoraria;
  v_id uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid link'; end if;
  select h.* into v_h from public.conf_honoraria h join public.conf_speakers s on s.id = h.speaker_id
   where s.token = p_token for update of h;
  if not found or not v_h.claims_allowed then
    raise exception 'Expense claims are not open on this link. Contact the organizer.';
  end if;
  if v_h.paid_at is not null then
    raise exception 'Your payment has already been made. Contact the organizer about further expenses.';
  end if;
  if p_category is null or p_category not in ('travel', 'accommodation', 'meals', 'other') then
    raise exception 'Choose the kind of expense';
  end if;
  if nullif(trim(p_description), '') is null then raise exception 'Say what the expense was for'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then raise exception 'Enter the amount you paid'; end if;
  if coalesce(p_tax, 0) < 0 or coalesce(p_tax, 0) > p_amount then
    raise exception 'The tax cannot be more than the amount paid';
  end if;
  if (select count(*) from public.conf_claims where honorarium_id = v_h.id) >= 40 then
    raise exception 'That is as many expenses as one claim can hold. Contact the organizer.';
  end if;
  insert into public.conf_claims (site_id, event_id, honorarium_id, category, description, incurred_on, amount, tax)
  values (v_h.site_id, v_h.event_id, v_h.id, p_category, left(trim(p_description), 300), p_incurred_on,
          round(p_amount, 2), round(coalesce(p_tax, 0), 2))
  returning id into v_id;
  return v_id;
end $$;

-- ========================== coordinator functions ===========================

-- Email the chosen speakers (or all who are owed something and have not been
-- paid) a link to confirm their amount and say how they want to be paid.
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
        '<p>Hi ' || public.conf_esc(coalesce(nullif(split_part(r.full_name, ' ', 1), ''), 'there')) || ',</p>'
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

-- Record a speaker as paid: the honorarium (plus tax, if they charge it) as
-- one cost, the approved expenses as a second, and the claims marked paid.
create or replace function public.conf_pay_speaker(
  p_honorarium uuid, p_paid_on date, p_method text, p_reference text,
  p_tax numeric default 0, p_budget uuid default null, p_claims_budget uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event uuid := (select event_id from public.conf_honoraria where id = p_honorarium);
  v_ev    public.conf_events := public.conf_require_coordinator(v_event);
  v_h     public.conf_honoraria;
  v_sp    public.conf_speakers;
  v_payee text;
  v_tax   numeric := round(coalesce(p_tax, 0), 2);
  v_sum   numeric;
  v_stax  numeric;
  v_fee   uuid;
  v_exp   uuid;
begin
  select * into v_h from public.conf_honoraria where id = p_honorarium for update;
  if v_h.paid_at is not null then raise exception 'This speaker has already been marked paid'; end if;
  if p_paid_on is null then raise exception 'Enter the date it was paid'; end if;
  if p_method is null or p_method not in ('cheque', 'etransfer', 'card', 'eft', 'cash', 'other') then
    raise exception 'Choose how it was paid';
  end if;
  if v_tax < 0 then raise exception 'Tax cannot be negative'; end if;
  if exists (select 1 from public.conf_claims where honorarium_id = v_h.id and status = 'submitted') then
    raise exception 'Approve or decline the expenses waiting for a decision first';
  end if;

  select * into v_sp from public.conf_speakers where id = v_h.speaker_id;
  v_payee := coalesce(nullif(trim(v_h.legal_name), ''), v_sp.full_name);

  if coalesce(v_h.amount, 0) > 0 then
    insert into public.conf_transactions
      (site_id, event_id, kind, budget_id, txn_date, party, description, amount, tax,
       status, paid_on, method, reference, honorarium_id)
    values
      (v_h.site_id, v_h.event_id, 'expense', coalesce(p_budget, v_h.budget_id), p_paid_on, v_payee,
       'Honorarium - ' || v_sp.full_name, v_h.amount + v_tax, v_tax,
       'paid', p_paid_on, p_method, nullif(trim(p_reference), ''), v_h.id)
    returning id into v_fee;
  end if;

  select coalesce(sum(amount), 0), coalesce(sum(tax), 0) into v_sum, v_stax
    from public.conf_claims where honorarium_id = v_h.id and status = 'approved';
  if v_sum > 0 then
    insert into public.conf_transactions
      (site_id, event_id, kind, budget_id, txn_date, party, description, amount, tax,
       status, paid_on, method, reference, honorarium_id)
    values
      (v_h.site_id, v_h.event_id, 'expense', p_claims_budget, p_paid_on, v_payee,
       'Expense reimbursement - ' || v_sp.full_name, v_sum, v_stax,
       'paid', p_paid_on, p_method, nullif(trim(p_reference), ''), v_h.id)
    returning id into v_exp;
    update public.conf_claims set status = 'paid', transaction_id = v_exp
     where honorarium_id = v_h.id and status = 'approved';
  end if;

  if v_fee is null and v_exp is null then
    raise exception 'There is nothing to pay yet: no honorarium amount and no approved expenses';
  end if;
  update public.conf_honoraria set paid_at = now() where id = v_h.id;
  return jsonb_build_object('honorarium_transaction', v_fee, 'expenses_transaction', v_exp);
end $$;

-- Undo a payment recorded by mistake. Files attached to the payments go back
-- to the speaker's invoice rather than being lost.
create or replace function public.conf_unpay_speaker(p_honorarium uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_event uuid := (select event_id from public.conf_honoraria where id = p_honorarium);
  v_ev    public.conf_events := public.conf_require_coordinator(v_event);
begin
  update public.conf_receipts set honorarium_id = p_honorarium, transaction_id = null
   where transaction_id in (select id from public.conf_transactions where honorarium_id = p_honorarium);
  update public.conf_claims set status = 'approved', transaction_id = null
   where honorarium_id = p_honorarium and status = 'paid';
  delete from public.conf_transactions where honorarium_id = p_honorarium;
  update public.conf_honoraria set paid_at = null where id = p_honorarium;
  return true;
end $$;

-- Queued, unsent emails about people and messages that no longer exist.
-- Owned by postgres so it can see the whole queue; callable only from inside
-- the conference functions.
create or replace function public.conf_forget_emails(p_ids uuid[])
returns integer
language sql security definer set search_path = public as $$
  with gone as (
    delete from public.email_queue
     where sent_at is null and p_ids is not null
       and substring(ref_key from '^conf[a-z]+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid
           = any (p_ids)
    returning 1)
  select count(*)::integer from gone
$$;

-- Delete an event and everything in it. The page removes the event's files
-- from storage first (the storage policies need the rows to find them); this
-- removes the rows and any emails about the event still waiting to go out.
create or replace function public.conf_delete_event(p_event uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ev  public.conf_events := public.conf_require_coordinator(p_event);
  v_ids uuid[];
begin
  select array_agg(id) into v_ids from (
    select id from public.conf_invitees  where event_id = v_ev.id
    union all select id from public.conf_speakers  where event_id = v_ev.id
    union all select id from public.conf_messages  where event_id = v_ev.id
    union all select id from public.conf_honoraria where event_id = v_ev.id) x;
  delete from public.conf_events where id = v_ev.id;
  perform public.conf_forget_emails(v_ids);
  return true;
end $$;

-- ---------------------------- ownership & grants ----------------------------

do $$
declare f text;
begin
  execute 'alter function public.conf_forget_emails(uuid[]) owner to postgres';
  execute 'revoke all on function public.conf_forget_emails(uuid[]) from public, anon, authenticated';
  execute 'grant execute on function public.conf_forget_emails(uuid[]) to app_definer';

  foreach f in array array[
    'conf_speaker_portal(text)', 'conf_speaker_confirm(text,numeric)',
    'conf_speaker_payee(text,text,text,text,text,text,text)',
    'conf_speaker_claim(text,text,text,date,numeric,numeric)',
    'conf_request_payment_details(uuid,uuid[])',
    'conf_pay_speaker(uuid,date,text,text,numeric,uuid,uuid)',
    'conf_unpay_speaker(uuid)', 'conf_delete_event(uuid)'
  ] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;

  -- speakers, signed out or in
  foreach f in array array[
    'conf_speaker_portal(text)', 'conf_speaker_confirm(text,numeric)',
    'conf_speaker_payee(text,text,text,text,text,text,text)',
    'conf_speaker_claim(text,text,text,date,numeric,numeric)'
  ] loop
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;

  -- the program's director or admin
  foreach f in array array[
    'conf_request_payment_details(uuid,uuid[])',
    'conf_pay_speaker(uuid,date,text,text,numeric,uuid,uuid)',
    'conf_unpay_speaker(uuid)', 'conf_delete_event(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
