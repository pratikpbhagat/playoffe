'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MobileNavProps {
  isLoggedIn: boolean;
  username?: string;
  fullName?: string;
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

const AUTH_LINKS: NavEntry[] = [
  { label: 'Dashboard',      href: '/dashboard',      exact: true },
  { label: 'Events',         href: '/events' },
  { label: 'Rankings',       href: '/rankings' },
  { label: 'Feed',           href: '/feed',           exact: true },
  { label: 'Practice',       href: '/practice',       exact: true },
  { label: 'Partners',       href: '/partners',       exact: true },
  { label: 'New tournament', href: '/tournaments/new', exact: true },
];

export function MobileNav({ isLoggedIn, username, fullName }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer whenever route changes
  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const links = isLoggedIn ? AUTH_LINKS : GUEST_LINKS;

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
          </ul>
        </nav>

        {/* Bottom user section */}
        <div className="border-t border-surface-border px-5 py-4">
          {isLoggedIn && username ? (
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-brand-300">
                {fullName?.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{fullName}</p>
                <p className="text-xs text-slate-500 truncate">@{username}</p>
              </div>
              <form action="/api/auth/signout" method="POST">
                <button type="submit" className="text-xs text-slate-500 hover:text-white transition-colors">
                  Sign out
                </button>
              </form>
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
