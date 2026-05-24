import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { EditProfileForm } from '@/components/player/EditProfileForm';
import { PhotoUpload } from '@/components/player/PhotoUpload';

export const metadata: Metadata = { title: 'Edit profile' };

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?return=/settings/profile');

  const { data: player } = await supabase
    .from('players')
    .select('full_name, username, location, photo_url, player_profiles(bio, headline, playing_since)')
    .eq('id', user.id)
    .single();

  if (!player) redirect('/login');

  const profile = player.player_profiles as {
    bio: string | null;
    headline: string | null;
    playing_since: number | null;
  } | null;

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-xl px-6 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/p/${player.username}`} className="hover:text-slate-300 transition-colors">
            My profile
          </Link>
          <span>/</span>
          <span className="text-slate-400">Edit</span>
        </nav>

        <h1 className="mb-8 text-2xl font-bold text-white">Edit profile</h1>

        <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
          <PhotoUpload
            currentUrl={player.photo_url ?? null}
            username={player.username}
          />
          <EditProfileForm
            username={player.username}
            initial={{
              full_name: player.full_name,
              location: player.location ?? null,
              photo_url: player.photo_url ?? null,
              headline: profile?.headline ?? null,
              bio: profile?.bio ?? null,
              playing_since: profile?.playing_since ?? null,
            }}
          />
        </div>
      </main>
    </div>
  );
}
