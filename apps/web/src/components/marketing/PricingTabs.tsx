'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, X, ChevronRight } from 'lucide-react';
import { formatPaise } from '@/lib/plans/format';
import { PLAN_LABELS } from '@/lib/plans/types';
import type { PlanLimits, TournamentPricingTier } from '@/lib/plans/types';

const TIER_DESCRIPTIONS: Record<string, string> = {
  free: 'Try it out with a single tournament.',
  starter: 'For small, local clubs running regular events.',
  pro: 'For active clubs and recurring tournaments.',
  enterprise: 'For large clubs, leagues, and federations.',
};

const TIER_HIGHLIGHT: Record<string, boolean> = {
  pro: true,
};

function pluralize(unit: string): string {
  return unit.endsWith('y') ? `${unit.slice(0, -1)}ies` : `${unit}s`;
}

function formatLimit(value: number | null, unit: string): string {
  if (value === null) return `Unlimited ${pluralize(unit)}`;
  return `${value} ${value === 1 ? unit : pluralize(unit)}`;
}

const TABS = [
  { key: 'plans', label: 'Subscription Plans' },
  { key: 'payg', label: 'Pay-as-you-go' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface Props {
  plans: PlanLimits[];
  tournamentTiers: TournamentPricingTier[];
}

export function PricingTabs({ plans, tournamentTiers }: Props) {
  const [tab, setTab] = useState<TabKey>('plans');

  return (
    <div>
      {/* Tab switcher */}
      <div className="mb-12 flex justify-center">
        <div className="inline-flex rounded-xl bg-surface-card p-1 ring-1 ring-surface-border">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
                tab === key
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'plans' ? (
        <SubscriptionPlans plans={plans} />
      ) : (
        <PayAsYouGo tournamentTiers={tournamentTiers} />
      )}
    </div>
  );
}

function SubscriptionPlans({ plans }: { plans: PlanLimits[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
      {plans.map((plan) => {
        const highlighted = TIER_HIGHLIGHT[plan.tier];
        return (
          <div
            key={plan.tier}
            className={`flex flex-col rounded-2xl p-6 ring-1 ${
              highlighted
                ? 'bg-brand-950/50 ring-brand-600/60'
                : 'bg-surface-card ring-surface-border'
            }`}
          >
            {highlighted && (
              <span className="mb-3 inline-flex w-fit rounded-full bg-brand-600 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                Most popular
              </span>
            )}

            <h2 className="text-xl font-black text-white">{PLAN_LABELS[plan.tier]}</h2>
            <p className="mt-1 text-sm text-slate-400">{TIER_DESCRIPTIONS[plan.tier]}</p>

            <div className="mt-5">
              {plan.monthly_price_paise === 0 ? (
                <span className="text-3xl font-black text-white">Free</span>
              ) : (
                <>
                  <span className="text-3xl font-black text-white">
                    {formatPaise(plan.monthly_price_paise)}
                  </span>
                  <span className="text-sm text-slate-500">/month</span>
                </>
              )}
              {plan.annual_price_paise > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  or {formatPaise(plan.annual_price_paise)}/year
                </p>
              )}
            </div>

            <ul className="mt-6 flex-1 space-y-3 text-sm">
              <li className="flex items-start gap-2 text-slate-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                {formatLimit(plan.max_active_tournaments, 'active tournament')}
              </li>
              <li className="flex items-start gap-2 text-slate-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                Up to {formatLimit(plan.max_participants_per_tournament, 'participant')} per tournament
              </li>
              <li className="flex items-start gap-2 text-slate-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                {formatLimit(plan.max_categories_per_tournament, 'category')} per tournament
              </li>
              <li className="flex items-start gap-2 text-slate-300">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                {formatLimit(plan.max_club_managers, 'club manager')}
              </li>
              <FeatureRow enabled={plan.feature_live_scoring} label="Live scoring & venue display" />
              <FeatureRow enabled={plan.feature_referee_app} label="Referee mobile scoring" />
              <FeatureRow enabled={plan.feature_custom_branding} label="Custom branding" />
              <FeatureRow enabled={plan.feature_advanced_analytics} label="Advanced analytics & reports" />
            </ul>

            <Link
              href="/register"
              className={`mt-8 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
                highlighted
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'border border-slate-600 text-slate-300 hover:border-slate-500 hover:bg-surface hover:text-white'
              }`}
            >
              Get started
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function PayAsYouGo({ tournamentTiers }: { tournamentTiers: TournamentPricingTier[] }) {
  return (
    <div>
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-black tracking-tight text-white md:text-3xl">
          Per-tournament event fees
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-400">
          Running a one-off event bigger than your plan's normal limits? Pay a single fee for that
          tournament based on the total number of players entered — across all categories,
          counting each member of a doubles or team entry individually.
        </p>
      </div>

      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl ring-1 ring-surface-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-card">
            <tr>
              <th className="px-6 py-3 font-semibold text-slate-300">Total players</th>
              <th className="px-6 py-3 font-semibold text-slate-300">Event fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {tournamentTiers.map((tier) => (
              <tr key={tier.id} className="bg-surface">
                <td className="px-6 py-3 text-slate-300">
                  {tier.max_players === null
                    ? `${tier.min_players}+`
                    : `${tier.min_players}–${tier.max_players}`}
                </td>
                <td className="px-6 py-3 font-semibold text-white">
                  {tier.fee_paise === 0 ? 'Included' : formatPaise(tier.fee_paise)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeatureRow({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <li className={`flex items-start gap-2 ${enabled ? 'text-slate-300' : 'text-slate-600'}`}>
      {enabled ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
      ) : (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />
      )}
      {label}
    </li>
  );
}
