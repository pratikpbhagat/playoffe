import type { Database } from '@pickleball/db';

export type SubscriptionTier = Database['public']['Enums']['subscription_tier_enum'];
export type PlanLimits = Database['public']['Tables']['plan_limits']['Row'];
export type TournamentPricingTier = Database['public']['Tables']['tournament_pricing_tiers']['Row'];

export const PLAN_TIERS: SubscriptionTier[] = ['free', 'starter', 'pro', 'enterprise'];

export const PLAN_LABELS: Record<SubscriptionTier, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};
