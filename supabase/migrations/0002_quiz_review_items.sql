-- Per-user "review list" for Test mode (quiz mistakes), synced across devices.
-- One row per (user, question). RLS restricts every row to its owning user.

create table if not exists quiz_review_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  item_key      text not null,          -- stable "<itemId>::<aspect>" key
  source        text not null,          -- 'emg' | 'nerve'
  item_name     text not null,
  aspect_label  text not null,
  prompt        text not null,
  correct       text not null,
  created_at    timestamptz not null default now(),
  unique (user_id, item_key)
);

create index if not exists quiz_review_items_user_idx
  on quiz_review_items(user_id, created_at);

alter table quiz_review_items enable row level security;

create policy quiz_review_self on quiz_review_items
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
