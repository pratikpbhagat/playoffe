'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RefPinPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.trim().length < 4) {
      setError('Please enter your PIN');
      return;
    }
    router.push(`/ref/${pin.trim()}`);
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <p className="text-center text-2xl font-black tracking-tight text-white mb-2">
          PLAY<span className="text-brand-400">OFFE</span>
        </p>
        <p className="text-center text-sm text-slate-500 mb-8">Referee scoring</p>

        <div className="rounded-2xl bg-surface-card ring-1 ring-surface-border p-8">
          <h1 className="text-lg font-bold text-white mb-1 text-center">Enter your PIN</h1>
          <p className="text-xs text-slate-500 text-center mb-6">
            Get your PIN from the tournament organiser
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d*"
              maxLength={8}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(null); }}
              placeholder="6-digit PIN"
              autoFocus
              className="block w-full rounded-xl border border-slate-700 bg-surface px-4 py-4 text-center text-2xl font-mono tracking-[0.4em] text-white placeholder:text-slate-700 placeholder:tracking-normal focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              type="submit"
              disabled={pin.length < 4}
              className="w-full rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-40"
            >
              Continue →
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
