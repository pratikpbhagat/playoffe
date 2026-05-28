'use client';

/**
 * ActiveRefereesProvider
 *
 * Provides the live list of ASSIGNABLE referees for the scoring hub dropdown.
 * The source of truth is `tournament_referee_pins` (PIN labels set by the admin),
 * NOT `referee_sessions` (who has typed their name and checked in).
 *
 * Why PIN labels, not sessions?
 *  - The admin assigns matches by choosing a PIN label from the dropdown.
 *  - When a referee checks in, `startRefereeSessionAction` uses the PIN label as
 *    their `referee_name` (cookie + DB row). This makes assignment and filtering
 *    identical — no mismatch is possible.
 *  - New PINs appear in the dropdown immediately when the admin creates them
 *    (via router.refresh() after creation, or via the realtime subscription here).
 *  - Revoked/expired PINs disappear from the dropdown automatically.
 */

import { useState, useEffect, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ActiveRefereesContext, type ActiveReferee } from './ActiveRefereesContext';

interface Props {
  tournamentId: string;
  initialReferees: ActiveReferee[];
  children: ReactNode;
}

export function ActiveRefereesProvider({ tournamentId, initialReferees, children }: Props) {
  const [referees, setReferees] = useState<ActiveReferee[]>(initialReferees);

  // When the server re-renders (after router.refresh()), sync server state in.
  // Server state is authoritative. We only keep locally-seen entries that are
  // not yet reflected in the server response AND don't conflict by name.
  // The name-conflict guard prevents duplicates after PIN regeneration: when the
  // old PIN is revoked and a new one (same label) is created, the server returns
  // only the new entry. Any stale "localOnly" entry with the same label is dropped.
  useEffect(() => {
    setReferees((prev) => {
      const serverIds   = new Set(initialReferees.map((r) => r.id));
      const serverNames = new Set(initialReferees.map((r) => r.referee_name));
      const localOnly   = prev.filter(
        (r) => !serverIds.has(r.id) && !serverNames.has(r.referee_name),
      );
      return [...initialReferees, ...localOnly];
    });
  }, [initialReferees]);

  // Realtime: watch tournament_referee_pins for instant dropdown updates when
  // the admin creates or revokes a PIN on the same page.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`assignable-referees:${tournamentId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'tournament_referee_pins',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const now = new Date().toISOString();

          if (payload.eventType === 'INSERT') {
            const n = payload.new;
            if (!n?.id || !n?.label) return;
            // Only add if active (not revoked, not expired)
            if (n.is_revoked || n.expires_at < now) return;
            setReferees((prev) => {
              if (prev.some((r) => r.id === n.id)) return prev;
              return [...prev, { id: n.id, referee_name: n.label.trim() || 'Referee' }];
            });
          } else if (payload.eventType === 'UPDATE') {
            const n = payload.new;
            if (!n?.id) return;
            const isActive = !n.is_revoked && n.expires_at > now;
            if (isActive) {
              // Update label if it changed
              setReferees((prev) =>
                prev.map((r) => r.id === n.id ? { id: n.id, referee_name: n.label?.trim() || 'Referee' } : r),
              );
            } else {
              // Revoked or expired — remove from dropdown
              setReferees((prev) => prev.filter((r) => r.id !== n.id));
            }
          } else if (payload.eventType === 'DELETE') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oldId = (payload.old as any)?.id;
            if (oldId) setReferees((prev) => prev.filter((r) => r.id !== oldId));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  return (
    <ActiveRefereesContext.Provider value={referees}>
      {children}
    </ActiveRefereesContext.Provider>
  );
}
