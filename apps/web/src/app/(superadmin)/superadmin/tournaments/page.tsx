import type { Metadata } from 'next';
import { getAllTournamentsForSuperAdminAction, getAllClubsAction } from '@/lib/actions/superadmin';
import { SuperAdminTournamentsClient } from '@/components/superadmin/SuperAdminTournamentsClient';

export const metadata: Metadata = { title: 'Tournaments · Super Admin' };

const STATUS_STYLE: Record<string, string> = {
  draft:        'bg-slate-700/40 text-slate-300',
  registration: 'bg-blue-500/20 text-blue-300',
  in_progress:  'bg-green-500/20 text-green-300',
  completed:    'bg-slate-500/20 text-slate-400',
};

export default async function SuperAdminTournamentsPage() {
  const [tournaments, clubs] = await Promise.all([
    getAllTournamentsForSuperAdminAction(),
    getAllClubsAction(),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Tournament management</h1>
        <p className="mt-1 text-sm text-slate-500">
          {tournaments.length} tournament{tournaments.length !== 1 ? 's' : ''} across all clubs.
        </p>
      </div>

      {/* Create tournament form */}
      <SuperAdminTournamentsClient clubs={clubs} />

      {/* Tournament list */}
      <div className="mt-8 space-y-2">
        {tournaments.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-white">{t.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[t.status] ?? STATUS_STYLE.draft}`}>
                  {t.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.clubs?.name ?? '—'} · {t.start_date} → {t.end_date}
                {t.venue ? ` · ${t.venue}` : ''}
              </p>
            </div>
            <a
              href={`/tournaments/${t.slug}`}
              className="shrink-0 ml-4 rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-colors"
            >
              View →
            </a>
          </div>
        ))}

        {tournaments.length === 0 && (
          <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
            <p className="text-sm text-slate-500">No tournaments yet. Create one above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
