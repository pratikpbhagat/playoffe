'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MobileNavProps {
  isLoggedIn: boolean;
  username?: string;
  fullName?: string;
  email?: string;
  isSuperAdmin?: boolean;
  activeMode?: 'admin' | 'player';
  showRankings?: boolean;
}

interface NavEntry {
  label: string;
  href: string;
  exact?: boolean;
}

const GUEST_LINKS: NavEntry[] = [
  { label: 'Events',   href: '/events' },
  { label: 'Rankings', href: '/rankings' },
];

/** Admin mode: club/tournament management, no player-only pages */
const ADMIN_LINKS: NavEntry[] = [
  { label: 'Dashboard',      href: '/dashboard',   exact: true },
  { label: 'My clubs',       href: '/clubs',       exact: true },
  { label: 'Rankings',       href: '/rankings' },
  { label: 'My tournaments', href: '/tournaments', exact: true },
];

/** Player mode: full player experience, no admin-only tools */
const PLAYER_LINKS: NavEntry[] = [
  { label: 'Dashboard', href: '/dashboard', exact: true },
  { label: 'Events',    href: '/events' },
  { label: 'Rankings',  href: '/rankings' },
  { label: 'Feed',      href: '/feed',      exact: true },
  { label: 'Practice',  href: '/practice',  exact: true },
  { label: 'Partners',  href: '/partners',  exact: true },
];

export function MobileNav({ isLoggedIn, username, fullName, email, isSuperAdmin, activeMode, showRankings = true }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer whenever route changes
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Filter Rankings from link arrays when flag is off
  const filterLinks = (arr: NavEntry[]) =>
    showRankings ? arr : arr.filter((l) => l.href !== '/rankings');

  // Pick the correct link set based on role mode
  const links = isSuperAdmin ? []
    : !isLoggedIn ? filterLinks(GUEST_LINKS)
    : activeMode === 'admin' ? filterLinks(ADMIN_LINKS)
    : filterLinks(PLAYER_LINKS);

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <>
      {/* Hamburger button — only visible on small screens */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="sm:hidden flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface transition-colors"
      >
        <span className="block h-0.5 w-5 bg-current rounded-full" />
        <span className="block h-0.5 w-5 bg-current rounded-full" />
        <span className="block h-0.5 w-5 bg-current rounded-full" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-black/60 animate-backdrop-in"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`sm:hidden fixed inset-y-0 left-0 z-50 w-72 bg-surface-card flex flex-col shadow-2xl transition-transform duration-250 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <span className="text-lg font-black text-white">
            PLAY<span className="text-brand-500">OFFE</span>
          </span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive(link.href, link.exact)
                      ? 'bg-brand-600/20 text-white'
                      : 'text-slate-400 hover:bg-surface hover:text-white'
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {isSuperAdmin && (
              <li>
                <Link
                  href="/superadmin"
                  className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive('/superadmin', true)
                      ? 'bg-violet-600/20 text-violet-300'
                      : 'text-violet-400 hover:bg-surface hover:text-violet-300'
                  }`}
                >
                  Super Admin
                </Link>
              </li>
            )}
          </ul>
        </nav>

        {/* Bottom user section */}
        <div className="border-t border-surface-border px-5 py-4">
          {isSuperAdmin ? (
            /* Super admin: show email + sign out */
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-900 text-sm font-bold text-violet-300">
                  {email?.charAt(0).toUpperCase()}
                </span>
                <p className="text-xs text-slate-400 truncate">{email}</p>
              </div>
              <form action="/api/auth/signout" method="POST">
                <button type="submit" className="text-xs text-slate-500 hover:text-white transition-colors shrink-0">
                  Sign out
                </button>
              </form>
            </div>
          ) : isLoggedIn && username ? (
            <div className="space-y-3">
              {/* Identity */}
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-brand-300">
                  {fullName?.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{fullName}</p>
                  <p className="text-xs text-slate-500 truncate">@{username}</p>
                </div>
              </div>
              {/* Settings + Sign out */}
              <div className="flex items-center gap-2">
                <Link
                  href="/settings/profile"
                  className="flex-1 rounded-lg border border-surface-border px-3 py-1.5 text-center text-xs font-medium text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                >
                  Settings
                </Link>
                <form action="/api/auth/signout" method="POST" className="flex-1">
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <Link
                href="/login"
                className="flex-1 rounded-lg border border-surface-border px-4 py-2 text-center text-sm text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
