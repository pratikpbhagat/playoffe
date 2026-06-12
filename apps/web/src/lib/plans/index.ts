/**
 * Subscription plan limits & feature gates, backed by the `plan_limits` table.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { PLAN_TIERS, PLAN_LABELS } from './types';
import type { SubscriptionTier, PlanLimits, TournamentPricingTier } from './types';

export { PLAN_TIERS, PLAN_LABELS };
export { formatPaise } from './format';
export type { SubscriptionTier, PlanLimits, TournamentPricingTier };

/** Fetches the limits/feature row for a given tier. */
export async function getPlanLimits(tier: SubscriptionTier): Promise<PlanLimits | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('plan_limits')
    .select('*')
    .eq('tier', tier)
    .maybeSingle();

  return data ?? null;
}

/** Fetches limits/features for all tiers, ordered Free → Enterprise. */
export async function getAllPlanLimits(): Promise<PlanLimits[]> {
  const admin = createAdminClient();

  const { data } = await admin.from('plan_limits').select('*');

  const rows = data ?? [];
  return PLAN_TIERS.map((tier) => rows.find((r) => r.tier === tier)).filter(
    (r): r is PlanLimits => !!r,
  );
}

/** Fetches the plan limits applicable to a given club, based on its subscription_tier. */
export async function getClubPlanLimits(clubId: string): Promise<PlanLimits | null> {
  const admin = createAdminClient();

  const { data: club } = await admin
    .from('clubs')
    .select('subscription_tier')
    .eq('id', clubId)
    .maybeSingle();

  if (!club) return null;

  return getPlanLimits(club.subscription_tier);
}

/** True if the club's plan includes the given boolean feature flag. */
export async function hasFeature(
  clubId: string,
  feature: 'feature_live_scoring' | 'feature_referee_app' | 'feature_custom_branding' | 'feature_advanced_analytics',
): Promise<boolean> {
  const limits = await getClubPlanLimits(clubId);
  return limits?.[feature] ?? false;
}

/**
 * Checks whether a club can create another tournament.
 * `null` for max_active_tournaments means unlimited.
 */
export async function canCreateTournament(clubId: string): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getClubPlanLimits(clubId);
  if (!limits) return { allowed: true };
  if (limits.max_active_tournaments === null) return { allowed: true };

  const admin = createAdminClient();
  const { count } = await admin
    .from('tournaments')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .in('status', ['draft', 'registration_open', 'in_progress']);

  if ((count ?? 0) >= limits.max_active_tournaments) {
    return {
      allowed: false,
      reason: `Your ${PLAN_LABELS[limits.tier]} plan allows up to ${limits.max_active_tournaments} active tournament(s). Upgrade your plan to create more.`,
    };
  }

  return { allowed: true };
}

/**
 * Checks whether a tournament can have another category added.
 * `null` for max_categories_per_tournament means unlimited.
 */
export async function canAddCategory(tournamentId: string): Promise<{ allowed: boolean; reason?: string }> {
  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, club_id')
    .eq('id', tournamentId)
    .maybeSingle();

  if (!tournament) return { allowed: true };

  const limits = await getClubPlanLimits(tournament.club_id);
  if (!limits || limits.max_categories_per_tournament === null) return { allowed: true };

  const { count } = await admin
    .from('tournament_categories')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId);

  if ((count ?? 0) >= limits.max_categories_per_tournament) {
    return {
      allowed: false,
      reason: `Your ${PLAN_LABELS[limits.tier]} plan allows up to ${limits.max_categories_per_tournament} categor${limits.max_categories_per_tournament === 1 ? 'y' : 'ies'} per tournament. Upgrade your plan to add more.`,
    };
  }

  return { allowed: true };
}

/** Fetches all pay-as-you-go tournament pricing tiers, ordered by player count. */
export async function getTournamentPricingTiers(): Promise<TournamentPricingTier[]> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('tournament_pricing_tiers')
    .select('*')
    .order('min_players', { ascending: true });

  return data ?? [];
}

/** Returns the per-tournament event fee (in paise) for a given total player count. */
export async function getTournamentEventFee(playerCount: number): Promise<number> {
  const tiers = await getTournamentPricingTiers();

  const tier = tiers.find(
    (t) => playerCount >= t.min_players && (t.max_players === null || playerCount <= t.max_players),
  );

  return tier?.fee_paise ?? 0;
}
