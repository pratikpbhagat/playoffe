'use client';

import { useState, useMemo, useTransition } from 'react';
import type { UserRow } from '@/lib/actions/superadmin';
import {
  generatePasswordResetLinkAction,
  setUserPasswordAction,
} from '@/lib/actions/superadmin';

// ── Filter types ──────────────────────────────────────────────────────────────

type RoleFilter = 'all' | 'admin' | 'player_only' | 'no_profile';
type AccountFilter = 'all' | 'regular' | 'provisional';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0].toUpperCase();
}

// ── Per-user password reset panel ─────────────────────────────────────────────

function ResetPanel({ userId, email }: { userId: string; email: string }) {
  const [mode, setMode]           = useState<'idle' | 'link' | 'password'>('idle');
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);
  const [newPw, setNewPw]         = useState('');
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerateLink() {
    setMsg(null);
    setResetLink(null);
    setMode('link');
    startTransition(async () => {
      const res = await generatePasswordResetLinkAction(userId);
      if ('error' in res) { setMsg({ text: res.error!, ok: false }); return; }
      setResetLink(res.resetLink);
    });
  }

  function handleCopy() {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await setUserPasswordAction(userId, newPw);
      if ('error' in res) { setMsg({ text: res.error!, ok: false }); return; }
      setMsg({ text: '✓ Password updated.', ok: true });
      setNewPw('');
      setMode('idle');
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-surface-border bg-surface p-3 space-y-3">
      {/* Toggle buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleGenerateLink}
          disabled={isPending}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            mode === 'link'
              ? 'bg-brand-600 text-white'
              : 'border border-surface-border text-slate-400 hover:border-slate-500 hover:text-slate-200'
          }`}
        >
          Generate reset link
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === 'password' ? 'idle' : 'password'); setMsg(null); }}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            mode === 'password'
              ? 'bg-brand-600 text-white'
              : 'border border-surface-border text-slate-400 hover:border-slate-500 hover:text-slate-200'
          }`}
        >
          Set new password
        </button>
        <span className="text-xs text-slate-600">for {email}</span>
      </div>

      {/* Reset link result */}
      {mode === 'link' && (
        <div>
          {isPending && <p className="text-xs text-slate-500">Generating…</p>}
          {resetLink && (
            <div className="flex items-center gap-2 rounded-lg bg-surface-card px-3 py-2">
              <p className="flex-1 truncate text-xs text-brand-400 font-mono">{resetLink}</p>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded px-2 py-1 text-[10px] font-medium border border-surface-border hover:border-slate-500 text-slate-400 hover:text-slate-200 transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Set password form */}
      {mode === 'password' && (
        <form onSubmit={handleSetPassword} className="flex items-center gap-2">
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New password (min 8 chars)"
            minLength={8}
            required
            className="flex-1 rounded-lg border border-surface-border bg-surface-card px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand-500"
          />
          <button
            type="submit"
            disabled={isPending || newPw.length < 8}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? '…' : 'Set password'}
          </button>
        </form>
      )}

      {/* Feedback */}
      {msg && (
        <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>
      )}
    </div>
  );
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({ user }: { user: UserRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasAdmin  = user.roles.includes('admin');
  const hasPlayer = user.roles.includes('player');
  const displayName = user.full_name ?? user.email;

  return (
    <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-5 py-4">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-brand-300 mt-0.5">
          {initials(user.full_name, user.email)}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white truncate">{displayName}</p>
            {user.username && (
              <span className="text-xs text-slate-500">@{user.username}</span>
            )}
            {/* Role badges */}
            {hasAdmin && (
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                Admin
              </span>
            )}
            {hasPlayer && (
              <span className="rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300">
                Player
              </span>
            )}
            {!hasAdmin && !hasPlayer && (
              <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                No roles
              </span>
            )}
            {user.is_provisional && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                Provisional
              </span>
            )}
          </div>

          <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>

          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-600 flex-wrap">
            <span>Joined {new Date(user.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span>·</span>
            <span>Last login: {timeAgo(user.last_sign_in_at)}</span>
          </div>

          {/* Expanded reset panel */}
          {expanded && <ResetPanel userId={user.id} email={user.email} />}
        </div>

        {/* Reset password toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            expanded
              ? 'bg-surface text-slate-300 border border-slate-600'
              : 'border border-surface-border text-slate-400 hover:border-slate-500 hover:text-slate-200'
          }`}
        >
          {expanded ? 'Close' : 'Reset password'}
        </button>
      </div>
    </div>
  );
}

// ── Main list component ───────────────────────────────────────────────────────

interface Props {
  users: UserRow[];
}

export function UsersListClient({ users }: Props) {
  const [search, setSearch]     = useState('');
  const [role, setRole]         = useState<RoleFilter>('all');
  const [account, setAccount]   = useState<AccountFilter>('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter((u) => {
      if (q && (
        !u.email.toLowerCase().includes(q) &&
        !(u.full_name ?? '').toLowerCase().includes(q) &&
        !(u.username ?? '').toLowerCase().includes(q)
      )) return false;

      if (role === 'admin'       && !u.roles.includes('admin'))  return false;
      if (role === 'player_only' && (u.roles.includes('admin') || !u.roles.includes('player'))) return false;
      if (role === 'no_profile'  && u.username !== null)         return false;

      if (account === 'regular'     &&  u.is_provisional) return false;
      if (account === 'provisional' && !u.is_provisional) return false;

      return true;
    });
  }, [users, search, role, account]);

  const hasFilters = search || role !== 'all' || account !== 'all';

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-56">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or username…"
            className="w-full rounded-lg border border-surface-border bg-surface pl-8 pr-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              aria-label="Clear"
            >
              ✕
            </button>
          )}
        </div>

        {/* Role filter */}
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as RoleFilter)}
          className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
        >
          <option value="all">All roles</option>
          <option value="admin">Admin (club managers)</option>
          <option value="player_only">Player only</option>
          <option value="no_profile">No player profile</option>
        </select>

        {/* Account filter */}
        <select
          value={account}
          onChange={(e) => setAccount(e.target.value as AccountFilter)}
          className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
        >
          <option value="all">All accounts</option>
          <option value="regular">Regular</option>
          <option value="provisional">Provisional</option>
        </select>

        {/* Count + clear */}
        <p className="text-xs text-slate-500 whitespace-nowrap">
          {filtered.length} of {users.length}
        </p>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setRole('all'); setAccount('all'); }}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map((u) => (
          <UserRow key={u.id} user={u} />
        ))}

        {filtered.length === 0 && (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-sm text-slate-500">
              {hasFilters ? 'No users match your filters.' : 'No users found.'}
            </p>
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setRole('all'); setAccount('all'); }}
                className="mt-3 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
