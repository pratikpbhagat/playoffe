'use client';

import { useState } from 'react';
import { ActiveRefereesStrip } from './ActiveRefereesStrip';
import { RefereePinsPanel } from '@/components/tournaments/RefereePinsPanel';

interface Props {
  tournamentId: string;
  pins: Array<{ id: string; label: string | null; expires_at: string; is_revoked: boolean }>;
  initialSessions: Array<{
    id: string;
    pin_id: string;
    referee_name: string;
    last_active_at: string | null;
    matches_scored_count: number;
  }>;
}

export function RefereePinsSection({ tournamentId, pins, initialSessions }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
      {/* Always-visible row: referee slots + toggle */}
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Referee slots
          </p>
          <ActiveRefereesStrip />
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
        >
          {expanded ? 'Hide PINs' : 'Manage PINs'}
          <span
            className="inline-block transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            ↓
          </span>
        </button>
      </div>

      {/* Collapsible: full PIN management panel */}
      {expanded && (
        <RefereePinsPanel
          tournamentId={tournamentId}
          pins={pins}
          initialSessions={initialSessions}
          // No mt-8 / outer rounded card — we're already inside the wrapper card
          className="rounded-none border-t border-surface-border"
        />
      )}
    </div>
  );
}
