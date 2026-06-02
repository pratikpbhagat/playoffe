import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient, createAdminClient, isSuperAdmin, getUserRoles } from '@/lib/supabase/server';
import { NotificationBell } from './NotificationBell';
import { NavLink } from './NavLink';
import { MobileNav } from './MobileNav';
import { RoleToggle } from './RoleToggle';
import { UserMenu } from './UserMenu';
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

  // ── Active mode resolution ──────────────────────────────────────────────────
  const isAdmin     = roles.includes('admin');
  const isPlayer    = roles.includes('player') || roles.length === 0;
  const hasBothRoles = isAdmin && isPlayer;

  const rawMode = (await cookies()).get('active_mode')?.value;
  const activeMode: 'admin' | 'player' = hasBothRoles
    ? (rawMode === 'player' ? 'player' : 'admin')   // default to admin for dual-role
    : isAdmin ? 'admin'
    : 'player';

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
            activeMode={activeMode}
          />
          <Link href={superAdmin ? '/superadmin' : player ? '/dashboard' : '/'} className="text-lg font-black text-white shrink-0">
            PLAY<span className="text-brand-500">OFFE</span>
          </Link>
        </div>

        {/* Center nav */}
        <div className="hidden items-center gap-5 sm:flex">
          {/* Admin mode: Dashboard, Rankings, My Tournaments */}
          {!superAdmin && player && activeMode === 'admin' && (
            <>
              <NavLink href="/dashboard" exact>Dashboard</NavLink>
              <NavLink href="/clubs" exact>My clubs</NavLink>
              <NavLink href="/rankings">Rankings</NavLink>
              <NavLink href="/tournaments" exact>My tournaments</NavLink>
            </>
          )}

          {/* Player mode: Dashboard, Events, Rankings, Feed, Practice, Partners */}
          {!superAdmin && player && activeMode === 'player' && (
            <>
              <NavLink href="/dashboard" exact>Dashboard</NavLink>
              <NavLink href="/events">Events</NavLink>
              <NavLink href="/rankings">Rankings</NavLink>
              <NavLink href="/feed" exact>Feed</NavLink>
              <NavLink href="/practice" exact>Practice</NavLink>
              <NavLink href="/partners" exact>Partners</NavLink>
            </>
          )}

          {/* Logged in but no player profile yet */}
          {!superAdmin && !player && user && (
            <>
              <NavLink href="/events">Events</NavLink>
              <NavLink href="/rankings">Rankings</NavLink>
            </>
          )}

          {/* Logged out */}
          {!superAdmin && !user && (
            <>
              <NavLink href="/events">Events</NavLink>
              <NavLink href="/rankings">Rankings</NavLink>
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

                  {/* Avatar dropdown — profile, settings, sign out */}
                  <UserMenu
                    username={player.username ?? ''}
                    fullName={player.full_name ?? ''}
                    settingsHref="/settings/profile"
                  />
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
