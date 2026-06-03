import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { ClubAdminNav } from '@/components/clubs/ClubAdminNav';
import { ClubSettingsForm } from '@/components/clubs/ClubSettingsForm';
import { ClubSocialPanel } from '@/components/clubs/ClubSocialPanel';
import { ClubPostHistoryPanel } from '@/components/clubs/ClubPostHistoryPanel';
import { getClubSocialConnectionsAction, getClubPostHistoryAction } from '@/lib/actions/social';
import { isFeatureEnabled } from '@/lib/features';

export const metadata: Metadata = { title: 'Club Settings' };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}

export default async function ClubSettingsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp       = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?return=/clubs/${slug}/settings`);

  const admin = createAdminClient();

  const { data: club } = await admin
    .from('clubs')
    .select('*, club_managers!inner(role, player_id)')
    .eq('slug', slug)
    .eq('club_managers.player_id', user.id)
    .single();

  if (!club) notFound();

  const role = (club.club_managers as { role: string }[])[0]?.role ?? 'manager';
  const isOwner = role === 'owner';

  // Redirect non-owners away
  if (!isOwner) redirect(`/clubs/${slug}`);

  // Gate organiser social features behind feature flag
  const organiserSocialEnabled = await isFeatureEnabled('social_media_organiser');

  // Fetch club social connections and post history (only if flag is enabled)
  const [clubConnections, clubPostHistory] = organiserSocialEnabled
    ? await Promise.all([
        getClubSocialConnectionsAction(club.id),
        getClubPostHistoryAction(club.id),
      ])
    : [[], []];

  // Flash from OAuth redirect
  type FlashMsg = { type: 'success' | 'error'; message: string } | null;
  let socialFlash: FlashMsg = null;
  if (sp.connected) {
    const label = sp.connected.charAt(0).toUpperCase() + sp.connected.slice(1);
    socialFlash = { type: 'success', message: `✓ ${label} connected successfully.` };
  } else if (sp.error) {
    socialFlash = { type: 'error', message: `Connection error: ${sp.error}` };
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Club header */}
        <div className="mb-8 flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-black text-white shadow"
            style={{ backgroundColor: club.brand_primary_color }}
          >
            {club.name[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{club.name}</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              {[club.city, club.location].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <ClubAdminNav clubSlug={slug} activeTab="settings" isOwner={isOwner} />

        <ClubSettingsForm
          clubId={club.id}
          clubSlug={slug}
          initialValues={{
            name: club.name,
            description: club.description ?? null,
            city: club.city ?? null,
            location: club.location ?? null,
            website: (club as unknown as { website: string | null }).website ?? null,
            founding_year: (club as unknown as { founding_year: number | null }).founding_year ?? null,
            is_open_to_join: (club as unknown as { is_open_to_join: boolean }).is_open_to_join ?? true,
            brand_primary_color: club.brand_primary_color,
            brand_secondary_color: club.brand_secondary_color ?? '#22c55e',
            logo_url: club.logo_url ?? null,
          }}
        />

        {/* Club social media connections — shown only when organiser flag is enabled */}
        {organiserSocialEnabled && (
          <div className="mt-8 rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
            <ClubSocialPanel
              clubId={club.id}
              clubSlug={slug}
              connections={clubConnections}
              flashMessage={socialFlash}
            />
            <ClubPostHistoryPanel history={clubPostHistory} />
          </div>
        )}
      </main>
    </div>
  );
}
