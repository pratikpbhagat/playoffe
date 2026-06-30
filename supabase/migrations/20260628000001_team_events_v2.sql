-- Team events v2: roster composition rules, marquee/owner display fields,
-- decider rubbers, per-rubber lineup locking, and richer tie aggregates.
-- Builds on 20260627000001_team_events.sql.

-- ─── Roster display fields ────────────────────────────────────────────────────

alter table tournament_teams add column if not exists marquee_player_id uuid references players(id);
alter table tournament_teams add column if not exists owner_name text;

-- ─── Category config: roster composition rule + decider format ──────────────
-- roster_composition: [{ "count": 2, "gender": "male" }, { "count": 2, "gender": "female", "age_min": 35 }]
-- Enforced as a soft warning only (not a hard block) for now.
-- decider_format: 'singles' | 'doubles' | null — set once per category in advance;
-- only used to break a tied knockout tie (never used in group-stage ties).

alter table tournament_categories add column if not exists roster_composition jsonb not null default '[]';
alter table tournament_categories add column if not exists decider_format text check (decider_format in ('singles', 'doubles'));

-- ─── Decider rubber support ───────────────────────────────────────────────────
-- A decider is an ordinary `matches` row (tie_id set, rubber_sequence = lineup
-- length + 1) flagged so the tie-completion logic can tell it apart from the
-- pre-configured rubber lineup.

alter table matches add column if not exists is_decider boolean not null default false;

-- ─── Tie status: knockout ties tied on rubbers wait for a decider ───────────

alter type tie_status_enum add value if not exists 'awaiting_decider';

-- ─── Richer tie aggregates ────────────────────────────────────────────────────
-- points_for_a/points_against_a let group-stage standings tell apart "tied on
-- net point diff but different absolute scores" from a genuine full tie
-- (same points scored AND same points conceded), per the spec's tiebreak chain.

alter table ties add column if not exists points_for_a integer not null default 0;
alter table ties add column if not exists points_against_a integer not null default 0;

-- ─── RLS: allow public read of the new owner/marquee display fields ─────────
-- (no policy change needed — they're plain columns on tournament_teams, which
-- already has a public-read policy from the v1 migration)

-- ─── Tie-completion trigger: aggregates only, no completion decision ───────
-- v1's trigger decided the winner and flipped status to 'completed' itself.
-- That no longer works once a tied knockout tie needs a decider rubber created
-- on the fly (business logic — touches notifications, inserts a new match row)
-- and group-stage ties need to allow a genuine draw (no decider at all). So
-- this trigger now ONLY recomputes aggregates; the completion/decider decision
-- moves to checkAndAdvanceTie() in scoring.ts, run after every rubber result.

create or replace function update_tie_on_rubber_complete()
returns trigger language plpgsql security definer as $$
declare
  v_tie ties%rowtype;
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

  update ties set
    rubbers_won_a = (select count(*) from matches m join tournament_entries e on e.id = m.winner_entry_id
                      where m.tie_id = new.tie_id and e.team_id = v_tie.team_a_id),
    rubbers_won_b = (select count(*) from matches m join tournament_entries e on e.id = m.winner_entry_id
                      where m.tie_id = new.tie_id and e.team_id = v_tie.team_b_id),
    points_for_a = (select coalesce(sum(
                      case when ea.team_id = v_tie.team_a_id
                             then (select coalesce(sum((s->>'score_a')::int), 0) from jsonb_array_elements(m.sets) s)
                           else (select coalesce(sum((s->>'score_b')::int), 0) from jsonb_array_elements(m.sets) s)
                      end
                    ), 0)
                    from matches m
                    join tournament_entries ea on ea.id = m.entry_a_id
                    where m.tie_id = new.tie_id and m.status in ('completed', 'walkover')),
    points_against_a = (select coalesce(sum(
                      case when ea.team_id = v_tie.team_a_id
                             then (select coalesce(sum((s->>'score_b')::int), 0) from jsonb_array_elements(m.sets) s)
                           else (select coalesce(sum((s->>'score_a')::int), 0) from jsonb_array_elements(m.sets) s)
                      end
                    ), 0)
                    from matches m
                    join tournament_entries ea on ea.id = m.entry_a_id
                    where m.tie_id = new.tie_id and m.status in ('completed', 'walkover'))
  where id = new.tie_id;

  update ties set point_diff_a = points_for_a - points_against_a where id = new.tie_id;

  return new;
end;
$$;
