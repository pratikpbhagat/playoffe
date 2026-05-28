'use client';

/**
 * ScoringHubRealtime
 *
 * Mounted on the admin scoring hub page. Subscribes to Supabase Realtime for
 * match updates in this tournament and calls router.refresh() whenever a change
 * that affects section membership arrives:
 *
 *  - Referee pauses a match   → paused_for_reassignment becomes true
 *                              → match must move from "Live Now" to "Paused"
 *
 *  - Referee requests restart → restart_requested becomes true
 *                              → match must appear in "Restart requests"
 *
 *  - Referee starts a match   → status changes to in_progress
 *                              → match must move from "Scheduled" to "Live Now"
 *
 *  - Referee ends a match     → status changes to completed
 *                              → match must move to "Completed"
 *
 * Score auto-saves (sets column only) are deliberately ignored to avoid
 * triggering a full re-render on every keystroke — LiveScoreDisplay handles
 * those in real-time via its own subscription.
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Props {
  tournamentId: string;
}

export function ScoringHubRealtime({ tournamentId }: Props) {
  const router = useRouter();
  // Track the last seen state of each match so we only refresh when
  // section-membership fields change (not on score auto-saves).
  const seenRef = useRef<Map<string, {
    status: string;
    paused: boolean;
    restartRequested: boolean;
  }>>(new Map());

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`scoring-hub:${tournamentId}`)
      // ── Watch match status/pause/restart changes ───────────────────────────
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const n = payload.new;
          if (!n?.id) return;

          const newStatus: string = n.status ?? '';
          const newPaused: boolean = n.paused_for_reassignment ?? false;
          const newRestart: boolean = n.restart_requested ?? false;

          const prev = seenRef.current.get(n.id);

          const statusChanged  = prev ? prev.status !== newStatus : false;
          const pausedChanged  = prev ? prev.paused !== newPaused : newPaused;
          const restartChanged = prev ? prev.restartRequested !== newRestart : newRestart;

          // Always update our seen-state
          seenRef.current.set(n.id, {
            status: newStatus,
            paused: newPaused,
            restartRequested: newRestart,
          });

          // Only refresh when something that changes section membership changed
          if (statusChanged || pausedChanged || restartChanged) {
            router.refresh();
          }
        },
      )
      .subscribe();
      // NOTE: referee_sessions changes are handled by ActiveRefereesProvider
      // (direct context state update) — no router.refresh() needed for that.

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId, router]);

  // Renders nothing — pure side-effect component
  return null;
}
