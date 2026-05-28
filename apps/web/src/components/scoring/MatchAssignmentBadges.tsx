'use client';

/**
 * MatchAssignmentBadges
 *
 * Shows the court and referee pills on the individual match scoring page.
 * Subscribes to Realtime so that:
 *  - Re-assigning the match on the scoring hub updates the pills instantly.
 *  - Removing a referee (which clears assigned_referee_name to null in the DB)
 *    makes the referee pill disappear without a page reload.
 */

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  matchId: string;
  initialCourt: number | null;
  initialRefereeName: string | null;
}

export function MatchAssignmentBadges({ matchId, initialCourt, initialRefereeName }: Props) {
  const [court, setCourt] = useState(initialCourt);
  const [refereeName, setRefereeName] = useState(initialRefereeName);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`match-assignment:${matchId}`)
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
          const n = payload.new;
          if (!n) return;
          if (n.court !== undefined) setCourt(n.court ?? null);
          if ('assigned_referee_name' in n) setRefereeName(n.assigned_referee_name ?? null);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [matchId]);

  if (!court && !refereeName) return null;

  return (
    <div className="mt-2 flex items-center gap-3 flex-wrap">
      {court && (
        <span className="rounded-full bg-surface-card px-3 py-1 text-xs font-medium text-slate-400 ring-1 ring-surface-border">
          Court {court}
        </span>
      )}
      {refereeName && (
        <span className="rounded-full bg-surface-card px-3 py-1 text-xs font-medium text-slate-400 ring-1 ring-surface-border">
          Referee: {refereeName}
        </span>
      )}
    </div>
  );
}
