import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPlayerByUsername } from '@pickleball/db';
import { PlayerProfileView } from '@/components/player/PlayerProfileView';

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();
  try {
    const player = await getPlayerByUsername(supabase, username);
    return {
      title: player.full_name,
      description: player.player_profiles?.bio ?? `Pickleball player profile for ${player.full_name}`,
      openGraph: {
        title: player.full_name,
        images: player.photo_url ? [player.photo_url] : [],
      },
    };
  } catch {
    return { title: 'Player not found' };
  }
}

export default async function PlayerProfilePage({ params }: Props) {
  const { username } = await params;
  const supabase = await createClient();

  let player;
  try {
    player = await getPlayerByUsername(supabase, username);
  } catch {
    notFound();
  }

  return <PlayerProfileView player={player} />;
}
