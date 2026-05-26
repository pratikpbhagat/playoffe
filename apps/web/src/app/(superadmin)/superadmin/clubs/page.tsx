import type { Metadata } from 'next';
import { getAllClubsAction } from '@/lib/actions/superadmin';
import { SuspendClubButton } from '@/components/superadmin/SuspendClubButton';

export const metadata: Metadata = { title: 'Clubs · Super Admin' };

const TIER_STYLE: Record<string, string> = {
  free:       'bg-slate-700/40 text-slate-300',
  starter:    'bg-blue-500/20 text-blue-300',
  pro:        'bg-violet-500/20 text-violet-300',
  enterprise: 'bg-amber-500/20 text-amber-300',
};

export default async function SuperAdminClubsPage() {
  const clubs = await getAllClubsAction();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Club management</h1>
        <p className="mt-1 text-sm text-slate-500">
          {clubs.length} club{clubs.length !== 1 ? 's' : ''} on the platform.
        </p>
      </div>

      <div className="space-y-2">
        {clubs.map((club) => (
          <div
            key={club.id}
            className={`flex items-center justify-between rounded-xl px-5 py-4 ring-1 transition-all ${
              club.is_suspended
                ? 'bg-red-950/20 ring-red-900/50'
                : 'bg-surface-card ring-surface-border'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-white">{club.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TIER_STYLE[club.subscription_tier] ?? TIER_STYLE.free}`}>
                  {club.subscription_tier}
                </span>
                {club.is_suspended && (
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400 uppercase tracking-wide">
                    Suspended
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {club.slug} · Created {new Date(club.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0 ml-4">
              <SuspendClubButton
                clubId={club.id}
                clubName={club.name}
                isSuspended={club.is_suspended ?? false}
              />
            </div>
          </div>
        ))}

        {clubs.length === 0 && (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-sm text-slate-500">No clubs yet. Create an admin invite to add the first club.</p>
          </div>
        )}
      </div>
    </div>
  );
}
