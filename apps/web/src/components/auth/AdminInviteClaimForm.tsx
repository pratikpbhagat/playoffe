'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { claimAdminInviteAction } from '@/lib/actions/superadmin';

interface Props {
  token: string;
  email: string;
  defaultName: string;
  clubName: string;
  inviteType?: 'new_club_owner' | 'existing_club_manager';
  /** True when the invitee already has a Supabase auth account */
  isExistingUser?: boolean;
}

export function AdminInviteClaimForm({
  token,
  email,
  defaultName,
  clubName,
  inviteType = 'new_club_owner',
  isExistingUser = false,
}: Props) {
  const isManagerInvite = inviteType === 'existing_club_manager';
  const router = useRouter();
  const [fullName, setFullName] = useState(defaultName);
  const [username, setUsername] = useState(
    // Hyphens, not underscores — must satisfy the DB's username_format check
    // constraint (^[a-z0-9][a-z0-9-]*[a-z0-9]$), which rejects underscores.
    defaultName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // For existing users claiming a manager invite, we skip the new-account setup fields.
    if (!isExistingUser) {
      if (!fullName.trim()) { setError('Full name is required'); return; }
      if (!username.trim()) { setError('Username is required'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
      if (password !== confirm) { setError("Passwords don't match"); return; }
    }

    setLoading(true);
    // For existing users, the server action ignores password/fullName/username —
    // it identifies the user by the invite's email address.
    const result = await claimAdminInviteAction({
      token,
      password: isExistingUser ? '' : password,
      fullName: isExistingUser ? '' : fullName,
      username: isExistingUser ? '' : username,
    });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Existing logged-in users go straight to dashboard (their session is already active).
    // New users need to sign in first with their freshly-created password.
    if (isExistingUser) {
      router.push('/dashboard?clubJoined=1');
    } else {
      router.push('/login?joined=1');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Club context (read-only) */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Club</label>
        <div className="block w-full rounded-lg border border-surface-border bg-surface/50 px-3 py-2 text-sm text-slate-400">
          {clubName}
        </div>
      </div>

      {/* Email (read-only — from invite) */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-300">Email address</label>
        <div className="block w-full rounded-lg border border-surface-border bg-surface/50 px-3 py-2 text-sm text-slate-400">
          {email}
        </div>
      </div>

      {/* For existing users claiming a manager invite — no account setup needed */}
      {isExistingUser && isManagerInvite ? (
        <div className="rounded-lg border border-brand-800/40 bg-brand-950/30 px-4 py-3 text-sm text-brand-300">
          You already have a PLAYOFFE account. Click below to accept the invitation and join{' '}
          <strong>{clubName}</strong> as a manager.
        </div>
      ) : (
        <>
          {/* Full name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Your full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Jane Smith"
              className="block w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          {/* Username */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Username</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required
                placeholder="jane-smith"
                className="block w-full rounded-lg border border-surface-border bg-surface pl-7 pr-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">Letters, numbers and hyphens only</p>
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
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
        </>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading
          ? (isManagerInvite ? 'Joining club…' : 'Setting up your club…')
          : (isManagerInvite ? 'Join as manager →' : 'Set up my club →')}
      </button>
    </form>
  );
}
