import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMyTournaments } from '@/lib/actions/tournaments';
import { AppNav } from '@/components/layout/AppNav';

const STATUS_BADGE: Record<string, { label: string; className: string; dot: string }> = {
  draft:             { label: 'Draft',             className: 'bg-slate-700 text-slate-300',      dot: 'bg-slate-400' },
  registration_open: { label: 'Registration open', className: 'bg-blue-900/60 text-blue-300',     dot: 'bg-blue-400' },
  in_progress:       { label: 'In progress',       className: 'bg-accent-500/20 text-accent-400', dot: 'bg-accent-400' },
  completed:         { label: 'Completed',          className: 'bg-brand-600/20 text-brand-300',   dot: 'bg-brand-400' },
  cancelled:         { label: 'Cancelled',          className: 'bg-red-900/40 text-red-400',       dot: 'bg-red-500' },
};

export default async function MyTournamentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // No limit — show every tournament from clubs the user manages
  const tournaments = await getMyTournaments();

  type TRow = typeof tournaments[number] & { slug: string; clubs: { id: string; name: string } | null };
  const rows = tournaments as unknown as TRow[];

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">My Tournaments</h1>
            <p className="mt-1 text-sm text-slate-500">
              All tournaments across the clubs you manage.
            </p>
          </div>
          <Link
            href="/tournaments/new"
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            + New Tournament
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl bg-surface-card p-12 text-center ring-1 ring-surface-border">
            <p className="text-4xl mb-3">🏆</p>
            <p className="text-base font-medium text-white">No tournaments yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create your first tournament to get started.
            </p>
            <Link
              href="/tournaments/new"
              className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              + New Tournament
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((t) => {
              const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.draft;
              return (
                <Link
                  key={t.id}
                  href={`/tournaments/${t.slug}`}
                  className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border hover:ring-brand-700/50 transition-all"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      {t.clubs && <span>{t.clubs.name}</span>}
                      {t.clubs && <span>·</span>}
                      <span>
                        {new Date(t.start_date).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  {/* Mobile: colored dot with tooltip on hover */}
                  <span
                    title={badge.label}
                    className={`ml-3 mt-1 h-2.5 w-2.5 shrink-0 rounded-full sm:hidden ${badge.dot}`}
                  />
                  {/* Desktop: full text badge */}
                  <span className={`ml-4 hidden shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold sm:inline-flex ${badge.className}`}>
                    {badge.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
