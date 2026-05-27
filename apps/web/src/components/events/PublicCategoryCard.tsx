'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerForCategoryAction, registerDoublesAction, withdrawEntryAction } from '@/lib/actions/registration';
import { useConfirm } from '@/components/ui/ConfirmProvider';

interface Category {
  id: string;
  name: string;
  slug: string;
  play_format: string;
  draw_format: string;
  status: string;
  max_entries: number | null;
}

interface Props {
  tournamentSlug: string;
  category: Category;
  entryCount: number;
  myStatus: string | null;
  registrationOpen: boolean;
  isLoggedIn: boolean;
  playFormatLabel: string;
  drawFormatLabel: string;
  matchProgress: { total: number; completed: number } | null;
}

const MY_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active:      { label: 'Registered ✓',     className: 'bg-accent-500/20 text-accent-400' },
  pending:     { label: 'Pending approval',  className: 'bg-amber-900/40 text-amber-300' },
  waitlisted:  { label: 'Waitlisted',        className: 'bg-slate-700/60 text-slate-300' },
  provisional: { label: 'Invite sent ⏳',    className: 'bg-brand-900/40 text-brand-300' },
};

const CAT_STATUS: Record<string, string> = {
  pending:        'Setup',
  registration:   'Open',
  draw_generated: 'Draw ready',
  in_progress:    'In progress',
  completed:      'Completed',
};

const isDoubles = (fmt: string) => fmt === 'doubles' || fmt === 'mixed_doubles';

export function PublicCategoryCard({
  tournamentSlug,
  category,
  entryCount,
  myStatus,
  registrationOpen,
  isLoggedIn,
  playFormatLabel,
  drawFormatLabel,
  matchProgress,
}: Props) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(myStatus);

  // Doubles partner form state
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [partnerUsername, setPartnerUsername] = useState('');
  const [inviteSent, setInviteSent] = useState<string | null>(null); // partner name on success

  const doubles = isDoubles(category.play_format);
  const isFull = category.max_entries !== null && entryCount >= category.max_entries;
  const categoryAcceptsEntries = category.status === 'registration';
  // Participants and entry counts are only revealed after the draw is published
  const drawPublished = category.status === 'draw_generated' || category.status === 'in_progress' || category.status === 'completed';
  const canAct = registrationOpen && categoryAcceptsEntries && !localStatus;
  const canRegister = canAct && !isFull && !doubles;
  const canWaitlist = canAct && isFull && !doubles;
  const canRegisterDoubles = canAct && doubles;
  const canWithdraw = !!localStatus && localStatus !== 'withdrawn';

  async function handleRegister() {
    setLoading(true);
    setError(null);
    const result = await registerForCategoryAction(category.id);
    if (result.error) {
      setError(result.error);
    } else {
      setLocalStatus(result.status ?? 'active');
      router.refresh();
    }
    setLoading(false);
  }

  async function handleDoubles() {
    if (!partnerUsername.trim()) { setError('Enter your partner\'s username.'); return; }
    setLoading(true);
    setError(null);
    const result = await registerDoublesAction(category.id, partnerUsername.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setLocalStatus('provisional');
      setInviteSent(result.partnerName ?? partnerUsername);
      setShowPartnerForm(false);
      router.refresh();
    }
    setLoading(false);
  }

  async function handleWithdraw() {
    if (!await confirm({ title: 'Withdraw from category?', message: 'You can re-register if spots are still available.', confirmLabel: 'Withdraw', variant: 'danger' })) return;
    router.push(`/events/${tournamentSlug}/withdraw/${category.slug}`);
  }

  const myBadge = localStatus ? MY_STATUS_BADGE[localStatus] : null;

  return (
    <div className="rounded-xl bg-surface-card px-6 py-5 ring-1 ring-surface-border">
      <div className="flex items-start justify-between gap-4">
        {/* Left: info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{category.name}</h3>
            {myBadge && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${myBadge.className}`}>
                {myBadge.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {playFormatLabel} · {drawFormatLabel}
          </p>

          {/* Entry count / capacity bar — hidden until draw is published */}
          {drawPublished && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {category.max_entries && (
                  <div className="w-20 h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isFull ? 'bg-slate-500' : 'bg-brand-600'}`}
                      style={{ width: `${Math.min(100, (entryCount / category.max_entries) * 100)}%` }}
                    />
                  </div>
                )}
                <span className="text-xs text-slate-400">
                  {entryCount}
                  {category.max_entries ? ` / ${category.max_entries}` : doubles ? ' teams' : ' entries'}
                </span>
                {isFull && (
                  <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] text-slate-400">Full</span>
                )}
              </div>
            </div>
          )}

          {/* Match progress for standings-type formats */}
          {matchProgress !== null && matchProgress.total > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="w-20 h-1 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-500"
                  style={{ width: `${Math.round((matchProgress.completed / matchProgress.total) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-slate-500">
                {matchProgress.completed}/{matchProgress.total} matches done
              </span>
            </div>
          )}

          {/* Invite sent confirmation */}
          {inviteSent && (
            <p className="mt-2 text-xs text-brand-400">
              ✓ Invite sent to {inviteSent} — waiting for them to confirm.
            </p>
          )}
        </div>

        {/* Right: actions */}
        <div className="shrink-0 flex flex-col items-end gap-2">
          {/* Category non-registration status */}
          {category.status !== 'registration' && category.status !== 'pending' && (
            <span className="text-xs text-slate-500">{CAT_STATUS[category.status] ?? category.status}</span>
          )}

          {/* Singles register */}
          {isLoggedIn && canRegister && (
            <button
              onClick={handleRegister}
              disabled={loading}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Registering…' : 'Register'}
            </button>
          )}

          {/* Singles waitlist */}
          {isLoggedIn && canWaitlist && (
            <button
              onClick={handleRegister}
              disabled={loading}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-surface-border hover:text-white transition-colors disabled:opacity-50"
            >
              {loading ? 'Joining…' : 'Join waitlist'}
            </button>
          )}

          {/* Doubles register */}
          {isLoggedIn && canRegisterDoubles && !showPartnerForm && (
            <button
              onClick={() => setShowPartnerForm(true)}
              disabled={loading}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              Register with partner
            </button>
          )}

          {/* Log in prompt */}
          {!isLoggedIn && registrationOpen && categoryAcceptsEntries && (
            <Link
              href={`/login?return=${encodeURIComponent(`/events/${tournamentSlug}`)}`}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-surface-card hover:text-white transition-colors"
            >
              Log in to register
            </Link>
          )}

          {/* Withdraw */}
          {canWithdraw && (
            <button
              onClick={handleWithdraw}
              disabled={loading}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              Withdraw
            </button>
          )}

          {/* View draw / standings */}
          {(category.status === 'draw_generated' || category.status === 'in_progress' || category.status === 'completed') && (
            <Link
              href={`/events/${tournamentSlug}/draw/${category.slug}`}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              {matchProgress !== null ? 'View standings →' : 'View draw →'}
            </Link>
          )}
        </div>
      </div>

      {/* Doubles partner form */}
      {showPartnerForm && (
        <div className="mt-4 rounded-xl border border-brand-700/40 bg-brand-950/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-brand-300">Enter your partner&apos;s username</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-sm">@</span>
              <input
                type="text"
                value={partnerUsername}
                onChange={(e) => setPartnerUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDoubles()}
                placeholder="username"
                autoFocus
                className="w-full rounded-lg border border-slate-700 bg-surface pl-7 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleDoubles}
              disabled={loading || !partnerUsername.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? '…' : 'Send invite'}
            </button>
            <button
              onClick={() => { setShowPartnerForm(false); setError(null); }}
              className="px-2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-slate-600">
            They&apos;ll see the invite on their dashboard and can confirm or decline.
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
