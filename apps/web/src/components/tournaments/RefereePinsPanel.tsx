'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createRefereePinAction, revokePinAction, regeneratePinAction, deleteRefereeAction } from '@/lib/actions/referee';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface Pin {
  id: string;
  label: string | null;
  expires_at: string;
  is_revoked: boolean;
}

interface Props {
  tournamentId: string;
  pins: Pin[];
  initialSessions?: Array<{
    id: string;
    pin_id: string;
    referee_name: string;
    last_active_at: string | null;
    matches_scored_count: number;
  }>;
  /** Override the root section className (e.g. to embed without the default mt-8). */
  className?: string;
}

export function RefereePinsPanel({ tournamentId, pins, initialSessions, className }: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newPin, setNewPin] = useState<string | null>(null);
  const [newPinLabel, setNewPinLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [deletingPinId, setDeletingPinId] = useState<string | null>(null);
  const [sessions, setSessions] = useState(initialSessions ?? []);

  // Sync when the parent re-renders after router.refresh() (server state wins).
  // We deduplicate by referee_name so regenerating a PIN doesn't leave a stale
  // duplicate: the new session has the same name but a different id.
  const prevInitialRef = useRef(initialSessions);
  useEffect(() => {
    if (prevInitialRef.current !== initialSessions) {
      prevInitialRef.current = initialSessions;
      setSessions(initialSessions ?? []);
    }
  }, [initialSessions]);

  useEffect(() => {
    if (!tournamentId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`referee-sessions-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referee_sessions',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setSessions((prev) => [payload.new as any, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as any;
            // Remove the session if it was deactivated (e.g. after PIN regeneration)
            if (updated.is_active === false) {
              setSessions((prev) => prev.filter((s) => s.id !== updated.id));
            } else {
              setSessions((prev) =>
                prev.map((s) => s.id === updated.id ? updated : s),
              );
            }
          } else if (payload.eventType === 'DELETE') {
            setSessions((prev) => prev.filter((s) => s.id !== (payload.old as any).id));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tournamentId]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    setNewPin(null);
    setNewPinLabel(null);
    const pinLabel = label || 'Referee';
    const result = await createRefereePinAction(tournamentId, pinLabel);
    if (result.error) {
      setError(result.error);
    } else {
      setNewPin(result.pin ?? null);
      setNewPinLabel(pinLabel);
      setLabel('');
      router.refresh();
    }
    setCreating(false);
  }

  async function handleRegenerate(pinId: string, pinLabel: string | null) {
    setRegeneratingId(pinId);
    setError(null);
    setNewPin(null);
    setNewPinLabel(null);
    const result = await regeneratePinAction(pinId);
    if (result.error) {
      setError(result.error);
    } else {
      setNewPin(result.pin ?? null);
      setNewPinLabel(pinLabel ?? 'Referee');
      router.refresh();
    }
    setRegeneratingId(null);
  }

  async function handleRevoke(pinId: string) {
    if (!await confirm({ title: 'Revoke PIN?', message: 'This PIN will stop working immediately. Any referee currently using it will lose access.', confirmLabel: 'Revoke', variant: 'danger' })) return;
    await revokePinAction(pinId);
    router.refresh();
  }

  async function handleDelete(pinId: string, name: string) {
    if (!await confirm({
      title: `Remove ${name}?`,
      message: 'Their PIN will be revoked immediately and they will be removed from the active referees list.',
      confirmLabel: 'Remove',
      variant: 'danger',
    })) return;
    setDeletingPinId(pinId);
    const result = await deleteRefereeAction(pinId);
    if (result.error) setError(result.error);
    else {
      setSessions((prev) => prev.filter((s) => s.pin_id !== pinId));
      router.refresh();
    }
    setDeletingPinId(null);
  }

  const activePins = pins.filter((p) => !p.is_revoked && new Date(p.expires_at) > new Date());

  return (
    <section className={className ?? 'mt-8 rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden'}>
      <div className="border-b border-surface-border px-5 py-4">
        <h3 className="text-sm font-semibold text-white">Referee PINs</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Share a PIN with referees so they can score matches at{' '}
          <a href="/ref" target="_blank" className="text-brand-400 hover:underline">
            playoffe.com/ref
          </a>
        </p>
      </div>

      {/* New PIN display */}
      {newPin && (
        <div className="border-b border-surface-border bg-brand-900/30 px-5 py-4">
          <p className="text-xs font-semibold text-brand-300 mb-2">
            {newPinLabel ? `New PIN for "${newPinLabel}" — share this with the referee:` : 'New PIN created — share this with the referee:'}
          </p>
          <div className="flex items-center gap-3">
            <p className="text-3xl font-mono font-bold tracking-[0.3em] text-white">{newPin}</p>
            <button
              onClick={() => navigator.clipboard.writeText(newPin)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Copy
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">This PIN will not be shown again. It expires in 7 days.</p>
          <button onClick={() => { setNewPin(null); setNewPinLabel(null); }} className="mt-2 text-xs text-slate-600 hover:text-slate-400">
            Dismiss
          </button>
        </div>
      )}

      {/* Active PINs */}
      {activePins.length > 0 && (
        <div className="divide-y divide-surface-border">
          {activePins.map((pin) => (
            <div key={pin.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{pin.label ?? 'Referee'}</p>
                <p className="text-xs text-slate-500">
                  Expires {new Date(pin.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => handleRegenerate(pin.id, pin.label)}
                  disabled={regeneratingId === pin.id}
                  className="text-xs text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
                  title="Revoke this PIN and generate a new one with the same label"
                >
                  {regeneratingId === pin.id ? 'Generating…' : '↻ Regenerate'}
                </button>
                <button
                  onClick={() => handleRevoke(pin.id)}
                  className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activePins.length === 0 && !newPin && (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-slate-500">No active PINs</p>
        </div>
      )}

      {/* Create new PIN */}
      <div className="border-t border-surface-border px-5 py-4 flex items-center gap-3">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Court 1 referee)"
          className="flex-1 rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
        />
        <button
          onClick={handleCreate}
          disabled={creating}
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {creating ? 'Generating…' : 'Generate PIN'}
        </button>
      </div>
      {error && <p className="px-5 pb-3 text-xs text-red-400">{error}</p>}

      {/* Active referee sessions — part of the same card, separated by a border */}
      <div className="border-t border-surface-border px-5 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
          Active Referees
        </h3>
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-600">No referees checked in yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-surface-border"
              >
                {/* Status dot */}
                <span className="h-2 w-2 shrink-0 rounded-full bg-accent-400 animate-pulse" />

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white leading-tight">{session.referee_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {session.matches_scored_count ?? 0} match{(session.matches_scored_count ?? 0) !== 1 ? 'es' : ''} scored
                    {session.last_active_at
                      ? ` · Last active ${new Date(session.last_active_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true })}`
                      : ''}
                  </p>
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(session.pin_id, session.referee_name)}
                  disabled={deletingPinId === session.pin_id}
                  title="Revoke PIN and remove this referee"
                  className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-950/40 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  {deletingPinId === session.pin_id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
