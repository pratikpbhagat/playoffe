import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: player } = await supabase
    .from('players')
    .select('*, global_stats(*)')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-lg font-bold text-gray-900">Pickleball Platform</span>
          <div className="flex items-center gap-4">
            {player && (
              <Link href={`/p/${player.username}`} className="text-sm text-gray-600 hover:text-gray-900">
                @{player.username}
              </Link>
            )}
            <form action="/api/auth/signout" method="POST">
              <button className="text-sm text-gray-500 hover:text-gray-700">Sign out</button>
            </form>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {player?.full_name ?? 'Player'} 👋
        </h1>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Rating', value: player?.global_stats?.current_rating?.toFixed(2) ?? '3.50' },
            { label: 'Matches', value: player?.global_stats?.total_matches ?? 0 },
            { label: 'Wins', value: player?.global_stats?.wins ?? 0 },
            { label: 'Win rate', value: `${((player?.global_stats?.win_rate ?? 0) * 100).toFixed(0)}%` },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              <p className="mt-1 text-sm text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Quick actions</h2>
            <div className="mt-4 space-y-3">
              <Link href="/tournaments/new" className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <span className="text-xl">🏆</span>
                <span className="text-sm font-medium text-gray-700">Create tournament</span>
              </Link>
              <Link href={player ? `/p/${player.username}` : '#'} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <span className="text-xl">👤</span>
                <span className="text-sm font-medium text-gray-700">View my profile</span>
              </Link>
            </div>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Recent activity</h2>
            <p className="mt-4 text-sm text-gray-400">No recent activity yet — enter a tournament to get started.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
