'use client';

import { useState, useTransition } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export function AccountSecurityPanel({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePasswordReset() {
    startTransition(async () => {
      setError(null);
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (err) {
        setError(err.message);
      } else {
        setSent(true);
      }
    });
  }

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
      <div className="px-6 py-5 border-b border-surface-border">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Password</p>
        <p className="text-xs text-slate-500">
          We&apos;ll send a password reset link to <span className="text-slate-300">{email}</span>.
        </p>
      </div>
      <div className="px-6 py-4 flex items-center gap-4">
        {sent ? (
          <p className="text-sm text-accent-400">
            ✓ Reset link sent — check your inbox.
          </p>
        ) : (
          <>
            <button
              onClick={handlePasswordReset}
              disabled={isPending}
              className="rounded-lg bg-surface border border-surface-border px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors disabled:opacity-50"
            >
              {isPending ? 'Sending…' : 'Send password reset email'}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
