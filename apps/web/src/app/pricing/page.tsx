import type { Metadata } from 'next';
import { getAllPlanLimits, getTournamentPricingTiers } from '@/lib/plans';
import { LandingNav } from '@/components/marketing/LandingNav';
import { PricingTabs } from '@/components/marketing/PricingTabs';

export const metadata: Metadata = { title: 'Pricing · PLAYOFFE' };

export default async function PricingPage() {
  const plans = await getAllPlanLimits();
  const tournamentTiers = await getTournamentPricingTiers();

  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-surface px-6 py-24 pt-32">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-400">Pricing</p>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">
              Plans for clubs of every size
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-slate-400">
              Start free, upgrade as your tournaments grow. All prices in INR, billed monthly or
              annually.
            </p>
          </div>

          <PricingTabs plans={plans} tournamentTiers={tournamentTiers} />

          <p className="mx-auto mt-10 max-w-xl text-center text-xs text-slate-500">
            Need a custom plan for a league or federation?{' '}
            <a href="mailto:hello@playoffe.dev" className="text-brand-400 hover:text-brand-300">
              Contact us
            </a>
            .
          </p>
        </div>
      </main>
    </>
  );
}
