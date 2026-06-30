-- Team events: rosters, ties, and rubber matches.

-- ─── Rosters ──────────────────────────────────────────────────────────────────

create table tournament_teams (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  category_id   uuid not null references tournament_categories(id) on delete cascade,
  name          text not null,
  captain_id    uuid not null references players(id),
  status        entry_status_enum not null default 'active',
  seed          integer check (seed >= 1),
  registered_at timestamptz not null default now()
);

create index teams_tournament_idx on tournament_teams (tournament_id);
create index teams_category_idx on tournament_teams (category_id);

create table team_members (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references tournament_teams(id) on delete cascade,
  player_id     uuid not null references players(id),
  status        entry_status_enum not null default 'provisional',
  invited_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (team_id, player_id)
);

create index team_members_team_idx on team_members (team_id);
create index team_members_player_idx on team_members (player_id);

-- ─── Rubber lineup config (per category) ─────────────────────────────────────

alter table tournament_categories add column if not exists rubber_lineup jsonb not null default '[]';

-- ─── Ties ─────────────────────────────────────────────────────────────────────

create type tie_status_enum as enum ('pending_lineups', 'scheduled', 'in_progress', 'completed');

create table ties (
  id                     uuid primary key default gen_random_uuid(),
  tournament_id          uuid not null references tournaments(id) on delete cascade,
  category_id            uuid not null references tournament_categories(id) on delete cascade,
  round                  integer not null check (round >= 1),
  round_name             text,
  group_name             text,
  team_a_id              uuid references tournament_teams(id),
  team_b_id              uuid references tournament_teams(id),
  status                 tie_status_enum not null default 'pending_lineups',
  winner_team_id         uuid references tournament_teams(id),
  rubbers_won_a          integer not null default 0,
  rubbers_won_b          integer not null default 0,
  point_diff_a           integer not null default 0,
  bracket_position       integer,
  bracket_type           text,
  winner_to_tie_id       uuid references ties(id),
  winner_slot            text,
  lineup_a_submitted_at  timestamptz,
  lineup_b_submitted_at  timestamptz,
  created_at             timestamptz not null default now(),
  completed_at           timestamptz
);

create index ties_tournament_idx on ties (tournament_id);
create index ties_category_idx on ties (category_id);

-- ─── Wire matches and tournament_entries into ties/teams ─────────────────────

alter table matches add column if not exists tie_id uuid references ties(id);
alter table matches add column if not exists rubber_sequence integer;
create index matches_tie_idx on matches (tie_id);

alter table tournament_entries add column if not exists team_id uuid references tournament_teams(id);
create index entries_team_idx on tournament_entries (team_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table tournament_teams enable row level security;
alter table team_members enable row level security;
alter table ties enable row level security;

create policy "teams_public_read" on tournament_teams
  for select using (
    exists (select 1 from tournaments t
            where t.id = tournament_id and (t.status != 'draft' or is_club_manager(t.club_id)))
  );

create policy "teams_service_write" on tournament_teams for all using (true);

create policy "team_members_read" on team_members
  for select using (
    player_id = auth.uid()
    or exists (select 1 from tournament_teams tt where tt.id = team_id and tt.captain_id = auth.uid())
    or exists (select 1 from tournament_teams tt join tournaments t on t.id = tt.tournament_id
               where tt.id = team_id and is_club_manager(t.club_id))
  );

create policy "team_members_service_write" on team_members for all using (true);

create policy "ties_public_read" on ties
  for select using (
    exists (select 1 from tournaments t
            where t.id = tournament_id and (t.status != 'draft' or is_club_manager(t.club_id)))
  );

create policy "ties_service_write" on ties for all using (true);

-- ─── Tie-completion trigger ───────────────────────────────────────────────────
-- Structural data-capture only (mirrors propagate_match_result): recomputes
-- per-tie aggregates whenever a rubber match completes, and flips ties.status
-- to 'completed' + sets winner_team_id once every rubber has reported in.
-- Tie-level bracket advancement and notifications are handled by a server
-- action, not here (same division of responsibility as match-level results).

create or replace function update_tie_on_rubber_complete()
returns trigger language plpgsql security definer as $$
declare
  v_tie ties%rowtype;
  v_total_rubbers integer;
  v_completed_rubbers integer;
  v_point_diff_a integer;
begin
  if new.tie_id is null then
    return new;
  end if;
  if new.status not in ('completed', 'walkover') then
    return new;
  end if;
  if old.status in ('completed', 'walkover') then
    return new;
  end if;

  select * into v_tie from ties where id = new.tie_id for update;
  if v_tie.id is null then
    return new;
  end if;

  select jsonb_array_length(tc.rubber_lineup) into v_total_rubbers
    from tournament_categories tc where tc.id = v_tie.category_id;

  select count(*) into v_completed_rubbers from matches
    where tie_id = new.tie_id and status in ('completed', 'walkover');

  select coalesce(sum(
           case when e.team_id = v_tie.team_a_id then 1 when e.team_id = v_tie.team_b_id then -1 else 0 end
           * coalesce((select sum((s->>'score_a')::int - (s->>'score_b')::int) from jsonb_array_elements(m.sets) s), 0)
         ), 0)
    into v_point_diff_a
    from matches m
    join tournament_entries e on e.id = m.entry_a_id
    where m.tie_id = new.tie_id and m.status in ('completed', 'walkover');

  update ties set
    rubbers_won_a = (select count(*) from matches m join tournament_entries e on e.id = m.winner_entry_id
                      where m.tie_id = new.tie_id and e.team_id = v_tie.team_a_id),
    rubbers_won_b = (select count(*) from matches m join tournament_entries e on e.id = m.winner_entry_id
                      where m.tie_id = new.tie_id and e.team_id = v_tie.team_b_id),
    point_diff_a = v_point_diff_a
  where id = new.tie_id;

  if v_completed_rubbers >= v_total_rubbers then
    update ties set
      status = 'completed',
      completed_at = now(),
      winner_team_id = case
        when rubbers_won_a > rubbers_won_b then v_tie.team_a_id
        when rubbers_won_b > rubbers_won_a then v_tie.team_b_id
        when point_diff_a >= 0 then v_tie.team_a_id
        else v_tie.team_b_id
      end
    where id = new.tie_id;
  end if;

  return new;
end;
$$;

create trigger tie_rubber_complete after update on matches
  for each row execute function update_tie_on_rubber_complete();

-- ─── RBAC: team management permissions ───────────────────────────────────────

insert into role_permissions (role, feature, sub_feature, is_enabled, can_read, can_write, scope) values
  ('player', 'team_management', 'create_team',     true, true, true, 'global'),
  ('player', 'team_management', 'manage_own_team', true, true, true, 'global'),
  ('admin',  'team_management', 'manage_roster',   true, true, true, 'global');
