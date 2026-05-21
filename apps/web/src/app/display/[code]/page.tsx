import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTournamentByDisplayCode, getDisplayState } from '@pickleball/db';
import { DisplayScreen } from '@/components/display/DisplayScreen';

interface Props {
  params: Promise<{ code: string }>;
}

export const metadata: Metadata = { title: 'Tournament Display' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DisplayPage({ params }: Props) {
  const { code } = await params;
  const supabase = await createClient();

  let tournament;
  let displayState;

  try {
    tournament = await getTournamentByDisplayCode(supabase, code.toUpperCase());
    displayState = await getDisplayState(supabase, tournament.id);
  } catch {
    notFound();
  }

  return (
    <DisplayScreen
      tournament={tournament}
      initialDisplayState={displayState}
    />
  );
}
