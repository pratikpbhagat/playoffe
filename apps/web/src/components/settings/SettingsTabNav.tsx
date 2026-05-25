'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Profile',       href: '/settings/profile' },
  { label: 'Notifications', href: '/settings/notifications' },
  { label: 'Account',       href: '/settings/account' },
];

export function SettingsTabNav() {
  const pathname = usePathname();
  return (
    <div className="mb-8 flex gap-2 text-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
            pathname === tab.href
              ? 'bg-brand-600 text-white'
              : 'text-slate-400 hover:text-white border border-surface-border hover:border-slate-500'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
