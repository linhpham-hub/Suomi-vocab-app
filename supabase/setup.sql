-- Suomen Sanasto: Supabase setup. Safe to run more than once.
-- Paste the whole file into Supabase → SQL Editor → New query → Run.
--
-- BEFORE RUNNING: change 'YOUR_DASHBOARD_PASSPHRASE' near the bottom to a
-- NEW passphrase of your choice. It lives only here in the database (checked
-- on the server), never in the app's public files.

-- ---------------------------------------------------------------------------
-- 1. Owner dashboard: one summary row per learner (already created in v1;
--    kept here so a fresh project can be set up in one go).
-- ---------------------------------------------------------------------------
create table if not exists progress (
  device_id text primary key,
  name text not null default 'Friend',
  chapters jsonb not null default '{}'::jsonb,
  total_mastered int not null default 0,
  total_learning int not null default 0,
  total_words int not null default 0,
  last_active timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table progress enable row level security;

drop policy if exists "anon can upsert their own row" on progress;
drop policy if exists "anon can update any row" on progress;
drop policy if exists "anon can read all rows" on progress;
create policy "anon can upsert their own row" on progress for insert to anon with check (true);
create policy "anon can update any row" on progress for update to anon using (true) with check (true);
create policy "anon can read all rows" on progress for select to anon using (true);

-- ---------------------------------------------------------------------------
-- 2. "Save to all my devices": name + 4-digit PIN.
--    The table has NO policies, so nobody can read or change it directly with
--    the public key. The only way in is the two functions below, which check
--    the PIN. PINs are stored hashed (bcrypt via pgcrypto), never as text.
--    After 10 wrong PINs an account is locked for 15 minutes.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create table if not exists accounts (
  username text primary key,          -- lower-case name used to log in
  display_name text not null,
  pin_hash text not null,
  srs jsonb not null default '{}'::jsonb,  -- full word progress
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table accounts enable row level security;
revoke all on accounts from anon, authenticated;

-- Internal helper: checks the PIN and handles the lockout counter.
-- Returns 'ok', 'not_found', 'wrong_pin', 'locked' or 'invalid'.
create or replace function account_check(p_username text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u text := lower(trim(coalesce(p_username, '')));
  rec accounts%rowtype;
begin
  if u = '' or length(u) > 40 or coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    return 'invalid';
  end if;
  select * into rec from accounts where username = u;
  if not found then
    return 'not_found';
  end if;
  if rec.locked_until is not null and rec.locked_until > now() then
    return 'locked';
  end if;
  if rec.pin_hash = crypt(p_pin, rec.pin_hash) then
    if rec.failed_attempts > 0 or rec.locked_until is not null then
      update accounts set failed_attempts = 0, locked_until = null where username = u;
    end if;
    return 'ok';
  end if;
  update accounts
     set failed_attempts = failed_attempts + 1,
         locked_until = case when failed_attempts + 1 >= 10 then now() + interval '15 minutes' else null end
   where username = u;
  return 'wrong_pin';
end;
$$;
revoke all on function account_check(text, text) from public, anon, authenticated;

-- Load saved progress for a name + PIN.
create or replace function account_pull(p_username text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  status text := account_check(p_username, p_pin);
  rec accounts%rowtype;
begin
  if status <> 'ok' then
    return jsonb_build_object('status', status);
  end if;
  select * into rec from accounts where username = lower(trim(p_username));
  return jsonb_build_object('status', 'ok', 'display_name', rec.display_name, 'srs', rec.srs, 'updated_at', rec.updated_at);
end;
$$;

-- Save progress for a name + PIN (creates the account the first time).
create or replace function account_push(p_username text, p_pin text, p_display_name text, p_srs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  u text := lower(trim(coalesce(p_username, '')));
  status text := account_check(p_username, p_pin);
  shown text := left(coalesce(nullif(trim(p_display_name), ''), trim(p_username)), 40);
begin
  if p_srs is null or jsonb_typeof(p_srs) <> 'object' or pg_column_size(p_srs) > 500000 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if status = 'not_found' then
    insert into accounts (username, display_name, pin_hash, srs)
    values (u, shown, crypt(p_pin, gen_salt('bf')), p_srs)
    on conflict (username) do nothing;
    return jsonb_build_object('status', 'created');
  end if;
  if status <> 'ok' then
    return jsonb_build_object('status', status);
  end if;
  update accounts set srs = p_srs, display_name = shown, updated_at = now() where username = u;
  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function account_pull(text, text) to anon;
grant execute on function account_push(text, text, text, jsonb) to anon;

-- ---------------------------------------------------------------------------
-- 3. Feedback. Anyone using the app can SEND feedback, but nobody can read it
--    with the public key (it may contain friends' emails). The dashboard reads
--    it through list_feedback(), which requires the dashboard passphrase.
-- ---------------------------------------------------------------------------
create table if not exists feedback (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  name text,
  email text,
  message text not null,
  rating int,
  app_version text
);
alter table feedback enable row level security;

drop policy if exists "anon can send feedback" on feedback;
create policy "anon can send feedback" on feedback for insert to anon
  with check (
    char_length(message) between 1 and 2000
    and (name is null or char_length(name) <= 60)
    and (email is null or char_length(email) <= 120)
    and (rating is null or rating between 1 and 5)
  );
grant insert on feedback to anon;
grant usage, select on sequence feedback_id_seq to anon;

create table if not exists app_secrets (
  key text primary key,
  value text not null
);
alter table app_secrets enable row level security;
revoke all on app_secrets from anon, authenticated;

-- ⬇️  CHANGE THIS to your dashboard passphrase (don't reuse one that was ever in js/config.js)
insert into app_secrets (key, value) values ('dashboard_passphrase', 'YOUR_DASHBOARD_PASSPHRASE')
on conflict (key) do update set value = excluded.value;

create or replace function list_feedback(p_passphrase text)
returns setof feedback
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from app_secrets where key = 'dashboard_passphrase' and value = p_passphrase) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select * from feedback order by created_at desc limit 500;
end;
$$;
grant execute on function list_feedback(text) to anon;

-- Used by /dashboard.html to check the passphrase on the server.
create or replace function dashboard_check(p_passphrase text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from app_secrets where key = 'dashboard_passphrase' and value = p_passphrase);
$$;
grant execute on function dashboard_check(text) to anon;
