'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';

interface Props {
  username: string;
  fullName: string;
  /** Destination for the Settings link — /settings/profile for players, /settings/account for admin-only */
  settingsHref: string;
}

export function UserMenu({ username, fullName, settingsHref }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Trigger — avatar + username */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-400 hover:bg-surface hover:text-white transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-brand-300 shrink-0">
          {fullName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden sm:block">@{username}</span>
        {/* Chevron */}
        <svg
          className={`hidden sm:block h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-48 rounded-xl bg-surface-card ring-1 ring-surface-border shadow-xl overflow-hidden z-50"
        >
          {/* Identity strip */}
          <div className="px-4 py-3 border-b border-surface-border">
            <p className="text-xs font-semibold text-white truncate">{fullName}</p>
            <p className="text-xs text-slate-500 truncate">@{username}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              href={`/p/${username}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:bg-surface hover:text-white transition-colors"
            >
              {/* Person icon */}
              <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              View profile
            </Link>

            <Link
              href={settingsHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:bg-surface hover:text-white transition-colors"
            >
              {/* Gear icon */}
              <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              Settings
            </Link>
          </div>

          {/* Sign out */}
          <div className="border-t border-surface-border py-1">
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-400 hover:bg-surface hover:text-white transition-colors"
              >
                {/* Arrow-right-on-rectangle icon */}
                <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                </svg>
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
