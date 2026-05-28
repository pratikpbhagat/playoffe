'use client';

import { useActiveReferees } from './ActiveRefereesContext';

/**
 * Reads the live referee list from ActiveRefereesContext and renders the
 * "active referees" chips. Updates in real-time as new referees check in —
 * no page refresh required.
 */
export function ActiveRefereesStrip() {
  const referees = useActiveReferees();

  if (referees.length === 0) {
    return (
      <p className="text-xs text-slate-600">
        No referee slots yet. Generate a PIN below and share it — the label becomes the referee&apos;s identity.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {referees.map((r) => (
        <span
          key={r.id}
          className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-surface-border"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent-400 shrink-0 animate-pulse" />
          {r.referee_name}
        </span>
      ))}
    </div>
  );
}
