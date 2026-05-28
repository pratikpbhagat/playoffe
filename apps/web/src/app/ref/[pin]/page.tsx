import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { validateRefereePinAction, getRefereeMatchesAction } from '@/lib/actions/referee';
import { RefereeScoringView } from '@/components/scoring/RefereeScoringView';
import { RefereeNameForm } from '@/components/scoring/RefereeNameForm';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ pin: string }>;
}

export const metadata: Metadata = { title: 'Referee Scoring · PLAYOFFE' };

export default async function RefereeCourtPage({ params }: Props) {
  const { pin } = await params;

  // Validate the PIN first so we can show the label on the check-in screen
  // and confirm the tournament exists before rendering anything.
  const pinValidation = await validateRefereePinAction(pin);
  if (!pinValidation.success || !pinValidation.tournament) {
    notFound();
  }

  const pinLabel = (pinValidation as { label?: string | null }).label?.trim() || 'Referee';

  const cookieStore = await cookies();
  // Use a PIN-specific cookie so multiple referee tabs in the same browser
  // session (e.g. Court 1 and Court 2 in different incognito tabs) stay
  // independent. The cookie name encodes the PIN so there is no cross-tab bleed.
  const refereeName = cookieStore.get(`ref_${pin}`)?.value;

  // No session yet — show the check-in screen with the PIN label
  if (!refereeName) {
    return <RefereeNameForm pin={pin} pinLabel={pinLabel} />;
  }

  // Fetch matches assigned to this referee (filtered by their identity = PIN label)
  const result = await getRefereeMatchesAction(pin, refereeName);

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
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{refereeName}</span>
          <span className="rounded-full bg-accent-500/20 px-2.5 py-0.5 text-xs font-medium text-accent-400">
            Referee
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <RefereeScoringView
          matches={result.matches ?? []}
          pin={pin}
          refereeName={refereeName}
          tournamentId={result.tournament.id}
          tournamentSlug={result.tournament.slug}
        />
      </main>
    </div>
  );
}
