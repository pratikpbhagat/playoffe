-- Tenant layer: clubs, tournaments, categories, matches, entries
-- All tables are scoped to a club_id. RLS enforces tenant isolation.

-- ─── Clubs ───────────────────────────────────────────────────────────────────

create type subscription_tier_enum as enum ('free', 'starter', 'pro', 'enterprise');

create table clubs (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  slug                 text unique not null,
  logo_url             text,
  cover_url            text,
  brand_primary_color  text not null default '#16a34a',
  brand_secondary_color text not null default '#15803d',
  location             text,
  city                 text,
  country              text,
  website              text,
  founding_year        integer check (founding_year >= 1900 and founding_year <= extract(year from now())),
  description          text,
  subscription_tier    subscription_tier_enum not null default 'free',
  is_open_to_join      boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index clubs_slug_idx on clubs (slug);
create index clubs_country_idx on clubs (country);

-- ─── Club Affiliations (bridge: player ↔ club) ───────────────────────────────

create table club_affiliations (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  club_id     uuid not null references clubs(id) on delete cascade,
  is_current  boolean not null default true,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  unique (player_id, club_id, is_current)
);

create index club_affiliations_player_idx on club_affiliations (player_id);
create index club_affiliations_club_idx on club_affiliations (club_id);

-- ─── Club Managers (who can manage a club) ───────────────────────────────────

create table club_managers (
  club_id   uuid references clubs(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  role      text not null default 'manager' check (role in ('owner', 'manager')),
  added_at  timestamptz not null default now(),
  primary key (club_id, player_id)
);

-- ─── Tournaments ─────────────────────────────────────────────────────────────

create type tournament_status_enum as enum (
  'draft', 'registration_open', 'in_progress', 'completed', 'cancelled'
);

create table tournaments (
  id                      uuid primary key default gen_random_uuid(),
  club_id                 uuid not null references clubs(id) on delete cascade,
  name                    text not null,
  description             text,
  venue                   text,
  start_date              date not null,
  end_date                date not null,
  status                  tournament_status_enum not null default 'draft',
  court_count             integer not null default 1 check (court_count >= 1 and court_count <= 50),
  display_code            text unique not null,
  registration_deadline   date,
  max_participants        integer check (max_participants >= 4),
  social_post_triggers    jsonb not null default '[]',
  created_by              uuid not null references players(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint end_after_start check (end_date >= start_date)
);

create index tournaments_club_idx on tournaments (club_id, start_date desc);
create index tournaments_display_code_idx on tournaments (display_code);
create index tournaments_status_idx on tournaments (status);

-- Generate a unique 8-char alphanumeric display code
create or replace function generate_display_code()
returns text
language plpgsql
as $$
declare
  code text;
  attempts integer := 0;
begin
  loop
    code := upper(substring(encode(gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (select 1 from tournaments where display_code = code);
    attempts := attempts + 1;
    if attempts > 100 then
      raise exception 'Failed to generate unique display code';
    end if;
  end loop;
  return code;
end;
$$;

create or replace function set_display_code()
returns trigger language plpgsql as $$
begin
  if new.display_code is null or new.display_code = '' then
    new.display_code := generate_display_code();
  end if;
  return new;
end;
$$;

create trigger tournaments_display_code before insert on tournaments
  for each row execute function set_display_code();

create trigger tournaments_updated_at before update on tournaments
  for each row execute function update_updated_at();

-- ─── Tournament Categories ────────────────────────────────────────────────────

create type category_type_enum as enum ('skill', 'age', 'gender', 'open');
create type play_format_enum as enum ('singles', 'doubles', 'mixed_doubles');
create type draw_format_enum as enum (
  'round_robin', 'single_elimination', 'double_elimination', 'group_stage_knockout', 'swiss'
);
create type category_status_enum as enum (
  'pending', 'registration', 'draw_generated', 'in_progress', 'completed'
);

create table tournament_categories (
  id                  uuid primary key default gen_random_uuid(),
  tournament_id       uuid not null references tournaments(id) on delete cascade,
  name                text not null,
  type                category_type_enum not null,
  play_format         play_format_enum not null,
  draw_format         draw_format_enum not null,
  status              category_status_enum not null default 'pending',
  max_entries         integer check (max_entries >= 2),
  min_age             integer check (min_age >= 5),
  max_age             integer check (max_age <= 100),
  skill_levels        jsonb not null default '[]',
  winner_entry_id     uuid,
  runner_up_entry_id  uuid,
  third_place_entry_id uuid,
  created_at          timestamptz not null default now()
);

create index categories_tournament_idx on tournament_categories (tournament_id);

-- ─── Tournament Entries (bridge: global Player ↔ club Tournament) ─────────────

create type entry_status_enum as enum ('active', 'withdrawn', 'provisional');

create table tournament_entries (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  category_id    uuid not null references tournament_categories(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  partner_id     uuid references players(id),
  seed           integer check (seed >= 1),
  status         entry_status_enum not null default 'active',
  registered_at  timestamptz not null default now(),
  unique (category_id, player_id)
);

create index entries_tournament_idx on tournament_entries (tournament_id);
create index entries_category_idx on tournament_entries (category_id);
create index entries_player_idx on tournament_entries (player_id);

-- ─── Referee PINs ─────────────────────────────────────────────────────────────

create table tournament_referee_pins (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  pin_hash       text not null,
  label          text,
  created_by     uuid not null references players(id),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  is_revoked     boolean not null default false
);

create index referee_pins_tournament_idx on tournament_referee_pins (tournament_id);

create or replace function verify_referee_pin(p_tournament_id uuid, p_pin text)
returns boolean
language plpgsql security definer
as $$
begin
  return exists (
    select 1 from tournament_referee_pins
    where tournament_id = p_tournament_id
      and pin_hash = crypt(p_pin, pin_hash)
      and is_revoked = false
      and expires_at > now()
  );
end;
$$;

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table clubs enable row level security;
alter table club_affiliations enable row level security;
alter table club_managers enable row level security;
alter table tournaments enable row level security;
alter table tournament_categories enable row level security;
alter table tournament_entries enable row level security;
alter table tournament_referee_pins enable row level security;

-- Helper: check if auth user manages a club
create or replace function is_club_manager(p_club_id uuid)
returns boolean language plpgsql security definer as $$
begin
  return exists (
    select 1 from club_managers
    where club_id = p_club_id and player_id = auth.uid()
  );
end;
$$;

-- Clubs: public read, manager update
create policy "clubs_public_read" on clubs for select using (true);
create policy "clubs_manager_update" on clubs for update using (is_club_manager(id));
create policy "clubs_service_insert" on clubs for insert with check (true);

-- Club affiliations: member read own, manager read all
create policy "affiliations_own_read" on club_affiliations
  for select using (player_id = auth.uid() or is_club_manager(club_id));

create policy "affiliations_service_write" on club_affiliations for all using (true);

-- Tournaments: public read if not draft, manager write
create policy "tournaments_public_read" on tournaments
  for select using (status != 'draft' or is_club_manager(club_id));

create policy "tournaments_manager_write" on tournaments
  for all using (is_club_manager(club_id));

-- Categories: same as tournament
create policy "categories_public_read" on tournament_categories
  for select using (
    exists (select 1 from tournaments t
            where t.id = tournament_id and (t.status != 'draft' or is_club_manager(t.club_id)))
  );

create policy "categories_manager_write" on tournament_categories
  for all using (
    exists (select 1 from tournaments t
            where t.id = tournament_id and is_club_manager(t.club_id))
  );

-- Entries: player sees own, manager sees all in club
create policy "entries_own_read" on tournament_entries
  for select using (
    player_id = auth.uid() or partner_id = auth.uid() or
    exists (select 1 from tournaments t
            where t.id = tournament_id and is_club_manager(t.club_id))
  );

create policy "entries_service_write" on tournament_entries for all using (true);

-- Referee pins: organizer only
create policy "referee_pins_manager" on tournament_referee_pins
  for all using (
    exists (select 1 from tournaments t
            where t.id = tournament_id and is_club_manager(t.club_id))
  );
