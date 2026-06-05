'use client';

import { useState } from 'react';
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

  // Only show when user has BOTH admin and player roles
  if (!roles.includes('admin') || !roles.includes('player')) return null;

  async function handleSwitch(mode: 'admin' | 'player') {
    if (mode === activeMode) return;           // no-op if already in this mode
    setActiveMode(mode);                       // optimistic — toggle responds instantly
    await setActiveModeAction(mode);           // write cookie + revalidate layout
    // Always navigate to /dashboard so the user immediately sees mode-appropriate
    // content (admin tiles vs player tiles). router.refresh() on pages without
    // mode-conditional content is invisible and confusing.
    router.push('/dashboard');
  }

  return (
    <div className="flex items-center rounded-full bg-slate-800 p-0.5 text-xs font-semibold ring-1 ring-slate-700">
      <button
        onClick={() => handleSwitch('admin')}
        className={`rounded-full px-3 py-1 transition-colors ${
          activeMode === 'admin' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-300'
        }`}
      >
        Admin
      </button>
      <button
        onClick={() => handleSwitch('player')}
        className={`rounded-full px-3 py-1 transition-colors ${
          activeMode === 'player' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-300'
        }`}
      >
        Player
      </button>
    </div>
  );
}
