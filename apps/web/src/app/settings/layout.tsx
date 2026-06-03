import { AppNav } from '@/components/layout/AppNav';
import { SettingsTabNav } from '@/components/settings/SettingsTabNav';
import { isFeatureEnabled } from '@/lib/features';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const socialEnabled = await isFeatureEnabled('social_media_player');

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />
      <main className="mx-auto max-w-xl px-6 py-10">
        <SettingsTabNav showSocialTab={socialEnabled} />
        {children}
      </main>
    </div>
  );
}
