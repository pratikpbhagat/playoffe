import { cookies } from 'next/headers';
import { validateRefereePinAction, getRefereeMatchesAction } from '@/lib/actions/referee';
import { RefereeScoringView } from '@/components/scoring/RefereeScoringView';
import { RefereeNameForm } from '@/components/scoring/RefereeNameForm';
import type { Metadata } from 'next';

// Never cache this page — it reads the ref_${pin} session cookie which changes
// immediately after the referee clicks "Start scoring". Without force-dynamic
// Next.js may serve a stale cached version that predates the cookie being set.
export const dynamic = 'force-dynamic';

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
    // Show a human-readable error rather than a generic 404.
    // Common causes: wrong PIN, expired PIN, revoked PIN, cancelled tournament.
    const errorMsg = (pinValidation as { error?: string }).error ?? 'Invalid or expired PIN.';
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="text-2xl font-black tracking-tight text-white">
            PLAY<span className="text-brand-400">OFFE</span>
          </p>
          <div className="rounded-2xl bg-surface-card ring-1 ring-surface-border p-8 space-y-3">
            <p className="text-4xl">🔒</p>
            <h1 className="text-base font-bold text-white">PIN not accepted</h1>
            <p className="text-sm text-slate-400">{errorMsg}</p>
            <a
              href="/ref"
              className="mt-4 inline-block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Try again
            </a>
          </div>
        </div>
      </div>
    );
  }

  const pinLabel = (pinValidation as { label?: string | null }).label?.trim() || 'Referee';
  const tournamentName = pinValidation.tournament.name;

  const cookieStore = await cookies();
  // Use a PIN-specific cookie so multiple referee tabs in the same browser
  // session (e.g. Court 1 and Court 2 in different incognito tabs) stay
  // independent. The cookie name encodes the PIN so there is no cross-tab bleed.
  const refereeName = cookieStore.get(`ref_${pin}`)?.value;

  // No session yet — show the check-in screen with the PIN label and tournament name
  if (!refereeName) {
    return <RefereeNameForm pin={pin} pinLabel={pinLabel} tournamentName={tournamentName} />;
  }

  // Fetch matches assigned to this referee (filtered by their identity = PIN label)
  const result = await getRefereeMatchesAction(pin, refereeName);

  if (!result.success || !result.tournament) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="text-2xl font-black tracking-tight text-white">
            PLAY<span className="text-brand-400">OFFE</span>
          </p>
          <div className="rounded-2xl bg-surface-card ring-1 ring-surface-border p-8 space-y-3">
            <p className="text-4xl">⚠️</p>
            <h1 className="text-base font-bold text-white">Could not load matches</h1>
            <p className="text-sm text-slate-400">
              {(result as { error?: string }).error ?? 'Something went wrong. Please try again.'}
            </p>
            <a
              href="/ref"
              className="mt-4 inline-block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Back to PIN entry
            </a>
          </div>
        </div>
      </div>
    );
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
