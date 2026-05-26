import Link from 'next/link';
import { createClient, createAdminClient, isSuperAdmin, getUserRoles } from '@/lib/supabase/server';
import { NotificationBell } from './NotificationBell';
import { NavLink } from './NavLink';
import { MobileNav } from './MobileNav';
import { RoleToggle } from './RoleToggle';
import type { Notification } from '@/lib/actions/notifications';

export async function AppNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: player } = user
    ? await supabase.from('players').select('username, full_name').eq('id', user.id).single()
    : { data: null };

  const superAdmin = isSuperAdmin(user);
  const roles = getUserRoles(user);

  // Fetch initial notifications for the bell (last 30, server-side)
  let initialNotifications: Notification[] = [];
  if (user) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('notifications')
      .select('id, type, title, body, link, is_read, created_at')
      .eq('player_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    initialNotifications = (data ?? []) as Notification[];
  }

  return (
    <nav className="border-b border-surface-border bg-surface-card px-6 py-3.5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
        {/* Mobile hamburger + brand */}
        <div className="flex items-center gap-3">
          <MobileNav
            isLoggedIn={!!player || superAdmin}
            username={player?.username}
            fullName={player?.full_name ?? undefined}
            email={user?.email}
            isSuperAdmin={superAdmin}
          />
          <Link href={superAdmin ? '/superadmin' : player ? '/dashboard' : '/'} className="text-lg font-black text-white shrink-0">
            PLAY<span className="text-brand-500">OFFE</span>
          </Link>
        </div>

        {/* Center nav — player links hidden for super admins */}
        <div className="hidden items-center gap-5 sm:flex">
          {!superAdmin && player && <NavLink href="/dashboard" exact>Dashboard</NavLink>}
          {!superAdmin && <NavLink href="/events">Events</NavLink>}
          {!superAdmin && <NavLink href="/rankings">Rankings</NavLink>}
          {!superAdmin && player && (
            <>
              <NavLink href="/feed" exact>Feed</NavLink>
              <NavLink href="/practice" exact>Practice</NavLink>
              <NavLink href="/partners" exact>Partners</NavLink>
              <NavLink href="/tournaments/new" exact>New tournament</NavLink>
            </>
          )}
          {superAdmin && (
            <Link href="/superadmin" className="text-violet-400 hover:text-violet-300 text-sm font-semibold transition-colors">
              Super Admin
            </Link>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {superAdmin ? (
            /* Super admin: no player features — just identity + sign out */
            <>
              <span className="hidden sm:block text-sm text-slate-500">{user?.email}</span>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <RoleToggle roles={roles} />
              {player ? (
                <>
                  {/* Notification bell */}
                  <NotificationBell
                    initialNotifications={initialNotifications}
                    userId={user!.id}
                  />

                  {/* Avatar / username */}
                  <Link
                    href={`/p/${player.username}`}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-400 hover:bg-surface hover:text-white transition-colors"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-brand-300">
                      {player.full_name?.charAt(0).toUpperCase()}
                    </span>
                    <span className="hidden sm:block">@{player.username}</span>
                  </Link>

                  {/* Sign out */}
                  <form action="/api/auth/signout" method="POST">
                    <button
                      type="submit"
                      className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                  >
                    Get started
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

