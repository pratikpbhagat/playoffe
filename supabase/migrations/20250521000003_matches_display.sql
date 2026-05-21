-- Matches, scores, display state, announcements

-- ─── Matches ─────────────────────────────────────────────────────────────────

create type match_status_enum as enum (
  'scheduled', 'in_progress', 'completed', 'disputed', 'walkover', 'retired'
);

create table matches (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references tournament_categories(id) on delete cascade,
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  round           integer not null check (round >= 1),
  round_name      text,
  group_name      text,
  entry_a_id      uuid references tournament_entries(id),
  entry_b_id      uuid references tournament_entries(id),
  court           integer check (court >= 1),
  scheduled_time  timestamptz,
  status          match_status_enum not null default 'scheduled',
  sets            jsonb not null default '[]',
  winner_entry_id uuid references tournament_entries(id),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index matches_tournament_idx on matches (tournament_id, status);
create index matches_category_idx on matches (category_id);
create index matches_scheduled_idx on matches (tournament_id, scheduled_time);
create index matches_court_idx on matches (tournament_id, court, scheduled_time);

-- ─── Score Submissions ────────────────────────────────────────────────────────

create type submitter_role_enum as enum ('referee', 'organizer', 'player');

create table score_submissions (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references matches(id) on delete cascade,
  submitted_by    uuid not null references players(id),
  submitter_role  submitter_role_enum not null,
  sets            jsonb not null default '[]',
  submitted_at    timestamptz not null default now(),
  is_confirmed    boolean not null default false,
  confirmed_by    uuid references players(id),
  confirmed_at    timestamptz
);

create index score_submissions_match_idx on score_submissions (match_id);

-- ─── Display State ───────────────────────────────────────────────────────────

create type display_slide_enum as enum (
  'live_scores', 'group_standings', 'live_bracket',
  'upcoming_matches', 'full_schedule', 'category_podium',
  'announcement', 'wrap_up'
);

create table display_state (
  tournament_id            uuid primary key references tournaments(id) on delete cascade,
  current_slide            display_slide_enum not null default 'live_scores',
  is_pinned                boolean not null default false,
  rotation_interval_secs   integer not null default 30 check (rotation_interval_secs >= 10),
  active_announcement_id   uuid,
  active_category_filter   uuid references tournament_categories(id),
  is_paused                boolean not null default false,
  last_updated_by          uuid references players(id),
  updated_at               timestamptz not null default now()
);

create or replace function init_display_state()
returns trigger language plpgsql as $$
begin
  insert into display_state (tournament_id) values (new.id)
  on conflict (tournament_id) do nothing;
  return new;
end;
$$;

create trigger tournaments_init_display after insert on tournaments
  for each row execute function init_display_state();

-- ─── Announcements ───────────────────────────────────────────────────────────

create type urgency_enum as enum ('normal', 'urgent');

create table announcements (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references tournaments(id) on delete cascade,
  message          text not null check (length(message) <= 200),
  urgency          urgency_enum not null default 'normal',
  sent_by          uuid not null references players(id),
  sent_at          timestamptz not null default now(),
  dismissed_at     timestamptz,
  also_push_notify boolean not null default false
);

create index announcements_tournament_idx on announcements (tournament_id, sent_at desc);

-- ─── Display Sessions (presence tracking) ────────────────────────────────────

create table display_sessions (
  id                 uuid primary key default gen_random_uuid(),
  tournament_id      uuid not null references tournaments(id) on delete cascade,
  device_fingerprint text not null,
  connected_at       timestamptz not null default now(),
  last_seen_at       timestamptz not null default now()
);

create index display_sessions_tournament_idx on display_sessions (tournament_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table matches enable row level security;
alter table score_submissions enable row level security;
alter table display_state enable row level security;
alter table announcements enable row level security;
alter table display_sessions enable row level security;

-- Matches: public read for live/scheduled tournaments
create policy "matches_public_read" on matches
  for select using (
    exists (select 1 from tournaments t
            where t.id = tournament_id and t.status in ('in_progress', 'completed'))
    or is_club_manager((select club_id from tournaments where id = tournament_id))
  );

create policy "matches_manager_write" on matches
  for all using (
    is_club_manager((select club_id from tournaments where id = tournament_id))
  );

-- Score submissions
create policy "scores_own_read" on score_submissions
  for select using (
    submitted_by = auth.uid() or
    is_club_manager((select t.club_id from tournaments t join matches m on m.tournament_id = t.id where m.id = match_id))
  );

create policy "scores_write" on score_submissions
  for insert with check (auth.uid() = submitted_by);

-- Display state: public read (no auth required for display screens)
create policy "display_state_public_read" on display_state for select using (true);

create policy "display_state_manager_write" on display_state
  for update using (
    is_club_manager((select club_id from tournaments where id = tournament_id))
  );

-- Announcements: public read, manager write
create policy "announcements_public_read" on announcements for select using (true);

create policy "announcements_manager_write" on announcements
  for all using (
    is_club_manager((select club_id from tournaments where id = tournament_id))
  );

-- Display sessions: open write (no auth needed for display screens)
create policy "display_sessions_open_write" on display_sessions for all using (true);

-- ─── Result propagation function ─────────────────────────────────────────────
-- Called by a DB trigger when a match is marked completed.
-- Updates global stats and match history for both players.

create or replace function propagate_match_result()
returns trigger language plpgsql security definer as $$
declare
  v_player_a_id uuid;
  v_player_b_id uuid;
  v_club_id uuid;
  v_play_format text;
begin
  if new.status = 'completed' and old.status != 'completed' and new.winner_entry_id is not null then
    select t.club_id into v_club_id from tournaments t where t.id = new.tournament_id;
    select tc.play_format into v_play_format
      from tournament_categories tc where tc.id = new.category_id;

    select player_id into v_player_a_id from tournament_entries where id = new.entry_a_id;
    select player_id into v_player_b_id from tournament_entries where id = new.entry_b_id;

    -- Insert match history for player A
    if v_player_a_id is not null then
      insert into match_history (player_id, match_id, tournament_id, club_id, result, sets,
        opponent_entry_id, rating_before, rating_after, rating_change, played_at)
      select
        v_player_a_id, new.id, new.tournament_id, v_club_id,
        case when new.winner_entry_id = new.entry_a_id then 'win' else 'loss' end,
        new.sets, new.entry_b_id,
        gs.current_rating, gs.current_rating, 0, now()
      from global_stats gs where gs.player_id = v_player_a_id;

      update global_stats set
        total_matches = total_matches + 1,
        wins = wins + case when new.winner_entry_id = new.entry_a_id then 1 else 0 end,
        losses = losses + case when new.winner_entry_id != new.entry_a_id then 1 else 0 end,
        win_rate = (wins + case when new.winner_entry_id = new.entry_a_id then 1 else 0 end)::numeric /
                   nullif(total_matches + 1, 0),
        updated_at = now()
      where player_id = v_player_a_id;
    end if;

    -- Insert match history for player B
    if v_player_b_id is not null then
      insert into match_history (player_id, match_id, tournament_id, club_id, result, sets,
        opponent_entry_id, rating_before, rating_after, rating_change, played_at)
      select
        v_player_b_id, new.id, new.tournament_id, v_club_id,
        case when new.winner_entry_id = new.entry_b_id then 'win' else 'loss' end,
        new.sets, new.entry_a_id,
        gs.current_rating, gs.current_rating, 0, now()
      from global_stats gs where gs.player_id = v_player_b_id;

      update global_stats set
        total_matches = total_matches + 1,
        wins = wins + case when new.winner_entry_id = new.entry_b_id then 1 else 0 end,
        losses = losses + case when new.winner_entry_id != new.entry_b_id then 1 else 0 end,
        win_rate = (wins + case when new.winner_entry_id = new.entry_b_id then 1 else 0 end)::numeric /
                   nullif(total_matches + 1, 0),
        updated_at = now()
      where player_id = v_player_b_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger matches_propagate_result after update on matches
  for each row execute function propagate_match_result();
