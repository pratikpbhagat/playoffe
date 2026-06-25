'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setActiveModeAction } from '@/lib/actions/mode';

interface Props {
  roles: string[];
  /** Server-resolved active mode — passed from AppNav to avoid client-side flash */
  initialMode: 'admin' | 'player';
}

export function RoleToggle({ roles, initialMode }: Props) {
  const router = useRouter();
  const [activeMode, setActiveMode] = useState<'admin' | 'player'>(initialMode);
  const [switching, setSwitching] = useState(false);
  // Wrapping router.push in a transition lets isPending track the navigation
  // itself — including the new route's data fetch — not just the cookie write.
  const [isPending, startTransition] = useTransition();

  // Only show when user has BOTH admin and player roles
  if (!roles.includes('admin') || !roles.includes('player')) return null;

  async function handleSwitch(mode: 'admin' | 'player') {
    if (mode === activeMode) return;           // no-op if already in this mode
    setActiveMode(mode);                       // optimistic — toggle responds instantly
    setSwitching(true);
    await setActiveModeAction(mode);           // write cookie + revalidate layout
    // Always navigate to /dashboard so the user immediately sees mode-appropriate
    // content (admin tiles vs player tiles). router.refresh() on pages without
    // mode-conditional content is invisible and confusing.
    startTransition(() => {
      router.push('/dashboard');
    });
    setSwitching(false); // isPending now tracks the rest of the navigation
  }

  const blocking = switching || isPending;

  return (
    <>
      {blocking && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[1px]"
          aria-busy="true"
          aria-label="Switching mode"
        >
          <div className="flex items-center gap-3 rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border shadow-2xl">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-brand-500" />
            <p className="text-sm font-medium text-white">Switching mode…</p>
          </div>
        </div>
      )}
      <div className="flex items-center rounded-full bg-slate-800 p-0.5 text-xs font-semibold ring-1 ring-slate-700">
        <button
          onClick={() => handleSwitch('admin')}
          disabled={blocking}
          className={`rounded-full px-3 py-1 transition-colors disabled:opacity-50 ${
            activeMode === 'admin' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          Admin
        </button>
        <button
          onClick={() => handleSwitch('player')}
          disabled={blocking}
          className={`rounded-full px-3 py-1 transition-colors disabled:opacity-50 ${
            activeMode === 'player' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          Player
        </button>
      </div>
    </>
  );
}
