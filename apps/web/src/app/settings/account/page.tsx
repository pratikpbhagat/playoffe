import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { AccountSecurityPanel } from '@/components/settings/AccountSecurityPanel';

export const metadata: Metadata = { title: 'Account security' };

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?return=/settings/account');

  const { data: player } = await supabase
    .from('players')
    .select('username, full_name')
    .eq('id', user.id)
    .single();

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/settings/profile" className="hover:text-slate-300 transition-colors">Settings</Link>
          <span>/</span>
          <span className="text-slate-400">Account</span>
        </nav>

        {/* Settings nav */}
        <div className="mb-8 flex gap-2 text-sm">
          {[
            { label: 'Profile',        href: '/settings/profile' },
            { label: 'Notifications',  href: '/settings/notifications' },
            { label: 'Account',        href: '/settings/account' },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                tab.href === '/settings/account'
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-white border border-surface-border hover:border-slate-500'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <h1 className="mb-6 text-2xl font-bold text-white">Account & security</h1>

        {/* Email display */}
        <div className="mb-4 rounded-xl bg-surface-card px-6 py-5 ring-1 ring-surface-border">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Signed-in account</p>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">{player?.full_name ?? '—'}</p>
              <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
            </div>
            <span className="rounded-full bg-accent-500/10 px-2.5 py-1 text-xs font-medium text-accent-400 ring-1 ring-accent-500/20">
              Active
            </span>
          </div>
        </div>

        <AccountSecurityPanel email={user.email ?? ''} />

        {/* Danger zone */}
        <div className="mt-6 rounded-xl ring-1 ring-red-800/30 overflow-hidden">
          <div className="px-6 py-4 bg-red-950/10">
            <p className="text-sm font-semibold text-red-300 mb-1">Danger zone</p>
            <p className="text-xs text-slate-500">
              Account deletion is permanent and cannot be undone. Contact support to request account removal.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
