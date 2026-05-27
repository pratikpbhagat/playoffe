import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMyTournaments } from '@/lib/actions/tournaments';
import { AppNav } from '@/components/layout/AppNav';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft:             { label: 'Draft',             className: 'bg-slate-700 text-slate-300' },
  registration_open: { label: 'Registration open', className: 'bg-blue-900/60 text-blue-300' },
  in_progress:       { label: 'In progress',       className: 'bg-accent-500/20 text-accent-400' },
  completed:         { label: 'Completed',          className: 'bg-brand-600/20 text-brand-300' },
  cancelled:         { label: 'Cancelled',          className: 'bg-red-900/40 text-red-400' },
};

export default async function MyTournamentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tournaments = await getMyTournaments();

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">My Tournaments</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tournaments across the clubs you manage.
          </p>
        </div>

        {tournaments.length === 0 ? (
          <div className="rounded-xl bg-surface-card p-12 text-center ring-1 ring-surface-border">
            <p className="text-slate-400">No tournaments yet.</p>
            <p className="mt-1 text-sm text-slate-600">
              Tournaments you create will appear here once a club manager role is assigned to you.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tournaments.map((t) => {
              const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.draft;
              const club = t.clubs as { name: string } | null;
              return (
                <Link
                  key={t.id}
                  href={`/tournaments/${(t as unknown as { slug: string }).slug}`}
                  className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border hover:ring-brand-700/50 transition-all"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      {club && <span>{club.name}</span>}
                      {club && <span>·</span>}
                      <span>
                        {new Date(t.start_date).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  <span className={`ml-4 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>
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
