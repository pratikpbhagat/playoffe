'use client';

import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { claimAccountAction, checkUsernameAction } from '@/lib/actions/auth';

interface Props {
  token: string;
  playerId: string;
  email: string;
  fullName: string;
  defaultUsername: string;
}

export function ClaimForm({ token, email, fullName, defaultUsername }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [username, setUsername] = useState(defaultUsername);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const debouncedUsername = useDebounce(username, 400);

  // Live username availability (skip check if unchanged from the provisioned default)
  useEffect(() => {
    if (!debouncedUsername || debouncedUsername.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    if (debouncedUsername === defaultUsername) {
      setUsernameStatus('available');
      return;
    }
    setUsernameStatus('checking');
    checkUsernameAction(debouncedUsername).then(({ available }) => {
      setUsernameStatus(available ? 'available' : 'taken');
    });
  }, [debouncedUsername, defaultUsername]);

  const usernameHint = {
    idle: '',
    checking: 'Checking…',
    available: 'Username is available',
    taken: 'Username is already taken',
  }[usernameStatus];

  const usernameHintColor = {
    idle: 'text-slate-500',
    checking: 'text-slate-500',
    available: 'text-accent-500',
    taken: 'text-red-400',
  }[usernameStatus];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (usernameStatus === 'taken') {
      setError('Please choose a different username');
      return;
    }

    setLoading(true);
    const result = await claimAccountAction({ token, password, username });
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success the server action redirects to /dashboard — no need to handle here
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Read-only identity fields */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Full name</label>
        <div className="block w-full rounded-lg border border-surface-border bg-surface/50 px-3 py-2 text-sm text-slate-400">
          {fullName}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Email address</label>
        <div className="block w-full rounded-lg border border-surface-border bg-surface/50 px-3 py-2 text-sm text-slate-400">
          {email}
        </div>
      </div>

      {/* Editable username */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          required
          className={`block w-full rounded-lg border px-3 py-2 text-sm text-white bg-surface outline-none transition placeholder:text-slate-600 focus:ring-2 focus:ring-brand-500/30 ${
            usernameStatus === 'taken'
              ? 'border-red-500 focus:border-red-500'
              : 'border-surface-border focus:border-brand-500'
          }`}
        />
        {usernameHint && (
          <p className={`mt-1 text-xs ${usernameHintColor}`}>{usernameHint}</p>
        )}
      </div>

      {/* Password */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Choose a password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="Min. 8 characters"
          className="block w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Confirm password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="Repeat your password"
          className={`block w-full rounded-lg border px-3 py-2 text-sm text-white bg-surface outline-none transition placeholder:text-slate-600 focus:ring-2 focus:ring-brand-500/30 ${
            confirm && confirm !== password
              ? 'border-red-500 focus:border-red-500'
              : 'border-surface-border focus:border-brand-500'
          }`}
        />
        {confirm && confirm !== password && (
          <p className="mt-1 text-xs text-red-400">Passwords don&apos;t match</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || usernameStatus === 'taken' || usernameStatus === 'checking'}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Activating account…' : 'Activate my account'}
      </button>
    </form>
  );
}
