'use client';

/**
 * LiveScoreDisplay
 *
 * Renders the current score for a single in-progress match and subscribes to
 * Supabase Realtime so the score updates automatically as the referee auto-saves
 * scores on their device — no page refresh required.
 *
 * Usage:
 *   <LiveScoreDisplay matchId={match.id} initialSets={sets} />
 */

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface SetScore {
  score_a: number;
  score_b: number;
}

interface Props {
  matchId: string;
  initialSets: SetScore[];
  /** Tailwind className for the rendered <span>. Defaults to accent-coloured mono. */
  className?: string;
  /** Text to show when there are no sets yet. Defaults to nothing (renders null). */
  emptyLabel?: string;
}

export function LiveScoreDisplay({ matchId, initialSets, className, emptyLabel }: Props) {
  const [sets, setSets] = useState<SetScore[]>(initialSets);

  // Keep initialSets in sync if the parent server-renders new props (e.g. after router.refresh())
  useEffect(() => {
    setSets(initialSets);
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`live-score:${matchId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const newSets = payload.new?.sets;
          if (Array.isArray(newSets)) {
            // Accept empty array too — clears the score display if admin resets match
            setSets(newSets as SetScore[]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  if (sets.length === 0) {
    if (emptyLabel) {
      return <span className={className ?? 'text-[11px] text-slate-600'}>{emptyLabel}</span>;
    }
    return null;
  }

  const scoreStr = sets.map((s) => `${s.score_a}–${s.score_b}`).join('  ');
  return (
    <span className={className ?? 'text-xs font-mono font-bold text-accent-400'}>
      {scoreStr}
    </span>
  );
}
