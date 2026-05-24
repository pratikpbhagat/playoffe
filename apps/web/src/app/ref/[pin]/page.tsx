import { notFound } from 'next/navigation';
import { getRefereeMatchesAction } from '@/lib/actions/referee';
import { RefereeScoringView } from '@/components/scoring/RefereeScoringView';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ pin: string }>;
}

export const metadata: Metadata = { title: 'Referee Scoring · PLAYOFFE' };

export default async function RefereeCourtPage({ params }: Props) {
  const { pin } = await params;

  const result = await getRefereeMatchesAction(pin);

  if (!result.success || !result.tournament) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Minimal header */}
      <div className="border-b border-surface-border px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-black tracking-tight text-brand-400">PLAYOFFE</p>
          <p className="text-sm font-semibold text-white">{result.tournament.name}</p>
        </div>
        <span className="rounded-full bg-accent-500/20 px-2.5 py-0.5 text-xs font-medium text-accent-400">
          Referee
        </span>
      </div>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <RefereeScoringView
          matches={result.matches ?? []}
          pin={pin}
          tournamentSlug={result.tournament.slug}
        />
      </main>
    </div>
  );
}
