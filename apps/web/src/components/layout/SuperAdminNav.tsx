'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Overview',      href: '/superadmin' },
  { label: 'Clubs',         href: '/superadmin/clubs' },
  { label: 'Tournaments',   href: '/superadmin/tournaments' },
  { label: 'Referees',      href: '/superadmin/referees' },
  { label: 'Users',         href: '/superadmin/users' },
  { label: 'Permissions',   href: '/superadmin/rbac' },
  { label: 'Feature Flags', href: '/superadmin/flags' },
  { label: 'Audit Log',     href: '/superadmin/audit' },
];

export function SuperAdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const isActive = tab.href === '/superadmin'
          ? pathname === '/superadmin'
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-brand-600 text-white'
                : 'border border-surface-border text-slate-400 hover:border-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
