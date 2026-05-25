import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { getNotificationPrefsAction } from '@/lib/actions/notifications';
import { NotificationPrefsForm } from '@/components/settings/NotificationPrefsForm';

export const metadata: Metadata = { title: 'Notification preferences' };

export default async function NotificationsSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?return=/settings/notifications');

  const prefs = await getNotificationPrefsAction();

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/settings/profile" className="hover:text-slate-300 transition-colors">Settings</Link>
          <span>/</span>
          <span className="text-slate-400">Notifications</span>
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
                tab.href === '/settings/notifications'
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-white border border-surface-border hover:border-slate-500'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <h1 className="mb-6 text-2xl font-bold text-white">Notification preferences</h1>

        <NotificationPrefsForm initialPrefs={prefs} />
      </main>
    </div>
  );
}
