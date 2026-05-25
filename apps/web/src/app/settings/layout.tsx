import { AppNav } from '@/components/layout/AppNav';
import { SettingsTabNav } from '@/components/settings/SettingsTabNav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <AppNav />
      <main className="mx-auto max-w-xl px-6 py-10">
        <SettingsTabNav />
        {children}
      </main>
    </div>
  );
}
