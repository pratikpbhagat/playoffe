import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export async function AppNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: player } = user
    ? await supabase.from('players').select('username').eq('id', user.id).single()
    : { data: null };

  return (
    <nav className="border-b border-surface-border bg-surface-card px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/dashboard" className="text-lg font-black text-white">
          PLAY<span className="text-brand-600">OFFE</span>
        </Link>

        <div className="flex items-center gap-6">
          {player && (
            <>
              <Link
                href="/tournaments/new"
                className="hidden text-sm text-slate-400 hover:text-white transition-colors sm:block"
              >
                New tournament
              </Link>
              <Link
                href={`/p/${player.username}`}
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                @{player.username}
              </Link>
            </>
          )}
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
