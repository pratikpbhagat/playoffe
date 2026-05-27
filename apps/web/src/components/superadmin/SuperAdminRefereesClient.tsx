'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  listRefereePinsAction,
  createRefereePinAsSuperAdminAction,
  revokePinAsSuperAdminAction,
} from '@/lib/actions/superadmin';

interface Tournament {
  id: string;
  name: string;
  slug: string;
  status: string;
  clubs: { id: string; name: string } | null;
}

interface Pin {
  id: string;
  label: string;
  expires_at: string;
  is_revoked: boolean;
  created_at: string;
}

interface Props {
  groupedTournaments: Record<string, Tournament[]>;
}

export function SuperAdminRefereesClient({ groupedTournaments }: Props) {
  const [selectedId, setSelectedId] = useState('');
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [loadingPins, setLoadingPins] = useState(false);

  // Generate PIN state
  const [label, setLabel] = useState('');
  const [newPin, setNewPin] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [generating, startGenerating] = useTransition();

  // Revoke state
  const [revoking, startRevoking] = useTransition();
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function loadPins(tournamentId: string) {
    setLoadingPins(true);
    setPins(null);
    setNewPin(null);
    setPinError(null);
    setRevokeError(null);
    const data = await listRefereePinsAction(tournamentId);
    setPins(data as Pin[]);
    setLoadingPins(false);
  }

  useEffect(() => {
    if (selectedId) {
      loadPins(selectedId);
    }
  }, [selectedId]);

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setPinError(null);
    setNewPin(null);
    startGenerating(async () => {
      const result = await createRefereePinAsSuperAdminAction(selectedId, label.trim() || 'Referee');
      if ('error' in result) {
        setPinError(result.error ?? 'Unknown error');
      } else {
        setNewPin(result.pin);
        setLabel('');
        loadPins(selectedId);
      }
    });
  }

  function handleRevoke(pinId: string) {
    setRevokeError(null);
    startRevoking(async () => {
      const result = await revokePinAsSuperAdminAction(pinId);
      if ('error' in result && result.error) {
        setRevokeError(String(result.error));
      } else {
        loadPins(selectedId);
      }
    });
  }

  const allTournaments = Object.values(groupedTournaments).flat();

  return (
    <div className="space-y-6">
      {/* Tournament selector */}
      <div className="rounded-xl bg-surface-card px-5 py-5 ring-1 ring-surface-border">
        <label className="mb-2 block text-xs font-medium text-slate-400">Select tournament</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
        >
          <option value="">Choose a tournament…</option>
          {Object.entries(groupedTournaments).map(([clubName, tournaments]) => (
            <optgroup key={clubName} label={clubName}>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.status.replace('_', ' ')})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {allTournaments.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">No tournaments found. Create one in the Tournaments tab first.</p>
        )}
      </div>

      {selectedId && (
        <>
          {/* Generate new PIN */}
          <div className="rounded-xl bg-surface-card px-5 py-5 ring-1 ring-surface-border">
            <h2 className="mb-4 text-sm font-semibold text-slate-300">Generate referee PIN</h2>
            <form onSubmit={handleGenerate} className="flex gap-2">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (e.g. Court 1 Referee)"
                className="flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={generating}
                className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {generating ? 'Generating…' : 'Generate PIN'}
              </button>
            </form>

            {pinError && (
              <p className="mt-2 text-xs text-red-400">{pinError}</p>
            )}

            {newPin && (
              <div className="mt-3 rounded-lg border border-green-800 bg-green-950/60 px-4 py-3">
                <p className="text-xs font-semibold text-green-400 mb-1">PIN generated — shown once only</p>
                <p className="text-3xl font-mono font-bold text-white tracking-widest">{newPin}</p>
                <p className="mt-1 text-xs text-green-300/70">Share this PIN with the referee. It cannot be retrieved again.</p>
              </div>
            )}
          </div>

          {/* Existing PINs */}
          <div className="rounded-xl bg-surface-card px-5 py-5 ring-1 ring-surface-border">
            <h2 className="mb-4 text-sm font-semibold text-slate-300">Existing PINs</h2>

            {loadingPins && <p className="text-xs text-slate-500">Loading…</p>}
            {revokeError && <p className="mb-2 text-xs text-red-400">{revokeError}</p>}

            {pins !== null && pins.length === 0 && (
              <p className="text-xs text-slate-500">No PINs generated yet for this tournament.</p>
            )}

            {pins !== null && pins.length > 0 && (
              <div className="space-y-2">
                {pins.map((pin) => (
                  <div
                    key={pin.id}
                    className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                      pin.is_revoked ? 'bg-surface opacity-50' : 'bg-surface'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{pin.label}</p>
                        {pin.is_revoked && (
                          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400 uppercase">
                            Revoked
                          </span>
                        )}
                        {!pin.is_revoked && new Date(pin.expires_at) < new Date() && (
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400 uppercase">
                            Expired
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Created {new Date(pin.created_at).toLocaleDateString()} ·
                        Expires {new Date(pin.expires_at).toLocaleDateString()}
                      </p>
                    </div>

                    {!pin.is_revoked && (
                      <button
                        onClick={() => handleRevoke(pin.id)}
                        disabled={revoking}
                        className="shrink-0 ml-3 rounded-lg border border-red-800/50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
