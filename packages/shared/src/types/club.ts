export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface Club {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_url: string | null;
  brand_primary_color: string;
  brand_secondary_color: string;
  location: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  founding_year: number | null;
  description: string | null;
  subscription_tier: SubscriptionTier;
  is_open_to_join: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClubAffiliation {
  id: string;
  player_id: string;
  club_id: string;
  is_current: boolean;
  joined_at: string;
  left_at: string | null;
}

export interface ClubSocialAccount {
  id: string;
  club_id: string;
  platform: SocialPlatform;
  account_name: string;
  is_active: boolean;
  connected_at: string;
}

export type SocialPlatform = 'instagram' | 'facebook' | 'twitter' | 'whatsapp';
