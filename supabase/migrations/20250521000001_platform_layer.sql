-- Platform layer: global player identity, profiles, stats, rankings
-- This schema lives above all tenants. Every player has exactly one record here.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── Players (global) ────────────────────────────────────────────────────────

create type gender_enum as enum ('male', 'female', 'other');
create type player_role_enum as enum ('player', 'organizer', 'club_manager', 'referee', 'sponsor', 'admin');

create table players (
  id                       uuid primary key references auth.users(id) on delete cascade,
  email                    text unique not null,
  username                 text unique not null,
  full_name                text not null,
  gender                   gender_enum not null,
  dob                      date,
  photo_url                text,
  location                 text,
  role                     player_role_enum not null default 'player',
  is_provisional           boolean not null default false,
  provisional_expires_at   timestamptz,
  provisional_claim_token  text unique,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint username_format check (
    username ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
    and length(username) >= 3
    and length(username) <= 30
    and username not like '%--%'
  )
);

create index players_username_idx on players (username);
create index players_email_idx on players (email);
create index players_provisional_expires_idx on players (provisional_expires_at)
  where is_provisional = true;

-- ─── Player Profiles ─────────────────────────────────────────────────────────

create table player_profiles (
  player_id       uuid primary key references players(id) on delete cascade,
  bio             text check (length(bio) <= 600),
  headline        text check (length(headline) <= 120),
  career_history  jsonb not null default '[]',
  certifications  jsonb not null default '[]',
  playing_since   integer check (playing_since >= 1990 and playing_since <= extract(year from now())),
  preferred_style text,
  updated_at      timestamptz not null default now()
);

-- ─── Global Stats ─────────────────────────────────────────────────────────────

create table global_stats (
  player_id               uuid primary key references players(id) on delete cascade,
  total_matches           integer not null default 0 check (total_matches >= 0),
  wins                    integer not null default 0 check (wins >= 0),
  losses                  integer not null default 0 check (losses >= 0),
  win_rate                numeric(5,4) not null default 0 check (win_rate >= 0 and win_rate <= 1),
  current_rating          numeric(4,2) not null default 3.50 check (current_rating >= 1.0 and current_rating <= 8.0),
  peak_rating             numeric(4,2) not null default 3.50,
  singles_matches         integer not null default 0,
  singles_wins            integer not null default 0,
  doubles_matches         integer not null default 0,
  doubles_wins            integer not null default 0,
  mixed_doubles_matches   integer not null default 0,
  mixed_doubles_wins      integer not null default 0,
  updated_at              timestamptz not null default now()
);

-- ─── Global Rankings ─────────────────────────────────────────────────────────

create type ranking_category_enum as enum (
  'singles_open', 'singles_a', 'singles_b', 'singles_c',
  'doubles_open', 'doubles_a', 'doubles_b',
  'mixed_doubles_open', 'mixed_doubles_a'
);

create table global_rankings (
  player_id     uuid references players(id) on delete cascade,
  category      ranking_category_enum not null,
  rank          integer not null check (rank >= 1),
  points        numeric(10,2) not null default 0,
  last_updated  timestamptz not null default now(),
  window_start  timestamptz not null default now() - interval '12 months',
  primary key (player_id, category)
);

create index global_rankings_category_rank_idx on global_rankings (category, rank);

-- ─── Match History (global) ───────────────────────────────────────────────────

create type match_result_enum as enum ('win', 'loss', 'walkover_win', 'walkover_loss');

create table match_history (
  id                 uuid primary key default gen_random_uuid(),
  player_id          uuid not null references players(id) on delete cascade,
  match_id           uuid not null,
  tournament_id      uuid not null,
  club_id            uuid not null,
  result             match_result_enum not null,
  sets               jsonb not null default '[]',
  opponent_entry_id  uuid,
  rating_before      numeric(4,2) not null,
  rating_after       numeric(4,2) not null,
  rating_change      numeric(5,2) not null,
  played_at          timestamptz not null default now()
);

create index match_history_player_idx on match_history (player_id, played_at desc);
create index match_history_tournament_idx on match_history (tournament_id);

-- ─── Helper Functions ─────────────────────────────────────────────────────────

create or replace function check_username_available(p_username text)
returns boolean
language plpgsql security definer
as $$
begin
  return not exists (
    select 1 from players where username = lower(p_username)
  );
end;
$$;

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_updated_at before update on players
  for each row execute function update_updated_at();

create trigger player_profiles_updated_at before update on player_profiles
  for each row execute function update_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table players enable row level security;
alter table player_profiles enable row level security;
alter table global_stats enable row level security;
alter table global_rankings enable row level security;
alter table match_history enable row level security;

-- Players: public read for non-provisional, own write
create policy "players_public_read" on players
  for select using (is_provisional = false or auth.uid() = id);

create policy "players_own_update" on players
  for update using (auth.uid() = id);

create policy "players_service_insert" on players
  for insert with check (true);

-- Player profiles: public read, own update
create policy "profiles_public_read" on player_profiles
  for select using (
    exists (select 1 from players p where p.id = player_id and p.is_provisional = false)
  );

create policy "profiles_own_update" on player_profiles
  for update using (auth.uid() = player_id);

create policy "profiles_service_insert" on player_profiles
  for insert with check (true);

-- Global stats: public read, service write
create policy "stats_public_read" on global_stats for select using (true);
create policy "stats_service_write" on global_stats for all using (true);

-- Rankings: public read, service write
create policy "rankings_public_read" on global_rankings for select using (true);
create policy "rankings_service_write" on global_rankings for all using (true);

-- Match history: own read
create policy "history_own_read" on match_history
  for select using (auth.uid() = player_id);

create policy "history_service_write" on match_history for all using (true);
