import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getNotificationPrefsAction } from '@/lib/actions/notifications';
import { NotificationPrefsForm } from '@/components/settings/NotificationPrefsForm';

export const metadata: Metadata = { title: 'Notification preferences' };

export default async function NotificationsSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?return=/settings/notifications');

  const prefs = await getNotificationPrefsAction();

  return (
    <>
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/settings/profile" className="hover:text-slate-300 transition-colors">Settings</Link>
        <span>/</span>
        <span className="text-slate-400">Notifications</span>
      </nav>

      <h1 className="mb-6 text-2xl font-bold text-white">Notification preferences</h1>

      <NotificationPrefsForm initialPrefs={prefs} />
    </>
  );
}
