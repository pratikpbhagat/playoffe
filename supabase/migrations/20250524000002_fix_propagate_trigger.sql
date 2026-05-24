-- Fix propagate_match_result trigger: cast 'win'/'loss' strings to match_result_enum
CREATE OR REPLACE FUNCTION propagate_match_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
        (case when new.winner_entry_id = new.entry_a_id then 'win' else 'loss' end)::match_result_enum,
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
        (case when new.winner_entry_id = new.entry_b_id then 'win' else 'loss' end)::match_result_enum,
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
