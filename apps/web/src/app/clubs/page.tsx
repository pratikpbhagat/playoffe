import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, getUserRoles } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { getMyClubs } from '@/lib/actions/clubs';

export const metadata: Metadata = { title: 'My Clubs · PLAYOFFE' };

export default async function MyClubsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Admin-only: player mode → redirect to events
  const roles = getUserRoles(user);
  const isAdmin = roles.includes('admin');
  const isPlayer = roles.includes('player') || roles.length === 0;
  const hasBothRoles = isAdmin && isPlayer;
  const rawMode = (await cookies()).get('active_mode')?.value;
  const activeMode: 'admin' | 'player' = hasBothRoles
    ? (rawMode === 'player' ? 'player' : 'admin')
    : isAdmin ? 'admin' : 'player';
  if (activeMode === 'player' || !isAdmin) redirect('/dashboard');

  const clubs = await getMyClubs();

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">My Clubs</h1>
            <p className="mt-1 text-sm text-slate-500">
              {clubs.length === 0
                ? 'No clubs assigned yet'
                : `${clubs.length} club${clubs.length !== 1 ? 's' : ''} you manage`}
            </p>
          </div>
        </div>

        {clubs.length === 0 ? (
          <div className="rounded-xl bg-surface-card p-12 text-center ring-1 ring-surface-border">
            <p className="text-3xl mb-3">🏟️</p>
            <p className="text-sm font-medium text-white mb-1">No clubs yet</p>
            <p className="text-xs text-slate-500">
              Contact the platform admin to get a club assigned to your account.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {clubs.map((club) => (
              <Link
                key={club.id}
                href={`/clubs/${club.slug}`}
                className="group flex items-center gap-4 rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border hover:ring-brand-500/40 transition-all"
              >
                {/* Club colour avatar */}
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-black text-white shadow-sm"
                  style={{ backgroundColor: club.brand_primary_color ?? '#7c3aed' }}
                >
                  {club.name[0].toUpperCase()}
                </div>

                {/* Club info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white group-hover:text-brand-300 transition-colors truncate">
                    {club.name}
                  </p>
                  {(club.city || club.location) && (
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      📍 {[club.city, club.location].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <span className="shrink-0 text-slate-600 group-hover:text-brand-400 transition-colors text-sm">
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
