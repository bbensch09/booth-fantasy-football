-- Booth: schema. Paste into the Supabase SQL editor and run.

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now()
);

-- ---------- preferences ----------
-- The whole point of Booth. Every recommendation is filtered through this
-- before it is shown, so the same engine produces a different product per person.
create table if not exists preferences (
  user_id uuid primary key references profiles on delete cascade,
  time_budget_min int not null default 60,
  autonomy text not null default 'recommend_deeplink',
  risk text not null default 'balanced',
  homer_team text,
  homer_weight numeric not null default 0.15,
  homer_min_slots int not null default 0,
  suppress text[] not null default '{}',
  gameday_checkins boolean not null default true,
  digest_day text not null default 'sun',
  digest_hour int not null default 9,
  timezone text not null default 'America/Los_Angeles',
  notify_email text,
  notify_sms text,
  notify_telegram_chat_id text,
  urgent_channel text not null default 'email',
  onboarded boolean not null default false,
  updated_at timestamptz default now()
);

-- ---------- leagues ----------
create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  platform text not null,
  external_id text not null,
  team_id text,
  name text,
  season int not null,
  scoring text not null default 'half_ppr',
  teams int not null default 12,
  slots jsonb not null default '{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"K":1,"DEF":1,"BN":6}'::jsonb,
  credentials jsonb,
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, platform, external_id)
);

create table if not exists roster_snapshots (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues on delete cascade,
  week int,
  payload jsonb not null,
  created_at timestamptz default now()
);
create index if not exists roster_snapshots_league_idx on roster_snapshots (league_id, created_at desc);

-- shared player cache, public read, written by the refresh job
create table if not exists player_cache (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists draft_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  league_id uuid references leagues on delete set null,
  name text not null default 'Draft',
  teams int not null default 12,
  rounds int not null default 15,
  my_slot int not null default 1,
  scoring text not null default 'half_ppr',
  slots jsonb not null default '{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"K":1,"DEF":1,"BN":6}'::jsonb,
  status text not null default 'active',
  created_at timestamptz default now()
);

create table if not exists draft_picks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references draft_sessions on delete cascade,
  overall int not null,
  team_slot int not null,
  player_id text not null,
  is_mine boolean not null default false,
  created_at timestamptz default now(),
  unique (session_id, overall)
);

-- every call Booth made, so you can audit it later
create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  league_id uuid references leagues on delete cascade,
  week int,
  kind text not null,
  payload jsonb not null,
  outcome jsonb,
  created_at timestamptz default now()
);

create table if not exists feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  raw text not null,
  spec text,
  status text not null default 'filed',
  issue_url text,
  created_at timestamptz default now()
);

-- ---------- row level security ----------
alter table profiles enable row level security;
alter table preferences enable row level security;
alter table leagues enable row level security;
alter table roster_snapshots enable row level security;
alter table draft_sessions enable row level security;
alter table draft_picks enable row level security;
alter table decisions enable row level security;
alter table feature_requests enable row level security;
alter table player_cache enable row level security;

drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own prefs" on preferences;
create policy "own prefs" on preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own leagues" on leagues;
create policy "own leagues" on leagues for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own snapshots" on roster_snapshots;
create policy "own snapshots" on roster_snapshots for all
  using (exists (select 1 from leagues l where l.id = league_id and l.user_id = auth.uid()))
  with check (exists (select 1 from leagues l where l.id = league_id and l.user_id = auth.uid()));

drop policy if exists "own drafts" on draft_sessions;
create policy "own drafts" on draft_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own picks" on draft_picks;
create policy "own picks" on draft_picks for all
  using (exists (select 1 from draft_sessions d where d.id = session_id and d.user_id = auth.uid()))
  with check (exists (select 1 from draft_sessions d where d.id = session_id and d.user_id = auth.uid()));

drop policy if exists "own decisions" on decisions;
create policy "own decisions" on decisions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own requests" on feature_requests;
create policy "own requests" on feature_requests for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "players readable" on player_cache;
create policy "players readable" on player_cache for select using (true);

-- ---------- new user bootstrap ----------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into profiles (id, email) values (new.id, new.email) on conflict do nothing;
  insert into preferences (user_id, notify_email) values (new.id, new.email) on conflict do nothing;
  return new;
end; $fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
