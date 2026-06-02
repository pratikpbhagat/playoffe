// ── Platform identifiers ──────────────────────────────────────────────────────

/** Platforms requiring OAuth token storage */
export type OAuthPlatform = 'instagram' | 'facebook' | 'x';

/** All platforms including WhatsApp (share-link, no OAuth) */
export type SocialPlatform = OAuthPlatform | 'whatsapp';

// ── Caption styles ────────────────────────────────────────────────────────────

export type CaptionStyle = 'hype' | 'humble' | 'motivational' | 'funny' | 'ai' | 'custom';

// ── Post triggers ─────────────────────────────────────────────────────────────

export interface SocialPostTriggers {
  match_win: boolean;
  category_complete: boolean;
  tournament_complete: boolean;
  milestones: boolean;
}

// ── Per-platform preferences ──────────────────────────────────────────────────

export interface PlatformPostPrefs {
  enabled: boolean;
  triggers: SocialPostTriggers;
  caption_style: CaptionStyle;
  custom_template: string;
  preview_before_post: boolean;
}

export const DEFAULT_TRIGGERS: SocialPostTriggers = {
  match_win: true,
  category_complete: true,
  tournament_complete: true,
  milestones: false,
};

export const DEFAULT_PLATFORM_PREFS: PlatformPostPrefs = {
  enabled: false,
  triggers: { ...DEFAULT_TRIGGERS },
  caption_style: 'humble',
  custom_template: 'Good match today. Beat {opponent} {score} at {tournament}. #{category}',
  preview_before_post: true,
};

// ── Global preferences ────────────────────────────────────────────────────────

export interface SocialPostPrefs {
  paused: boolean;
  platforms: Partial<Record<SocialPlatform, PlatformPostPrefs>>;
}

export const DEFAULT_SOCIAL_POST_PREFS: SocialPostPrefs = {
  paused: false,
  platforms: {},
};

// ── Connection shape (safe to send to client — no tokens) ─────────────────────

export interface SocialConnectionPublic {
  platform: OAuthPlatform;
  platform_username: string | null;
  platform_display_name: string | null;
  is_active: boolean;
  connected_at: string;
}

// ── Static platform metadata ──────────────────────────────────────────────────

export interface PlatformMeta {
  label: string;
  description: string;
  /** Tailwind ring/bg classes for the platform card accent */
  ringColor: string;
  /** Tailwind text colour class for platform name */
  textColor: string;
  /** Short abbreviation shown inside the icon box */
  abbr: string;
  /** Whether this platform uses OAuth (false = share-link only) */
  isOAuth: boolean;
}

export const PLATFORM_META: Record<SocialPlatform, PlatformMeta> = {
  instagram: {
    label: 'Instagram',
    description: 'Share match wins and tournament highlights to your feed and stories.',
    ringColor: 'ring-pink-500/30',
    textColor: 'text-pink-400',
    abbr: 'IG',
    isOAuth: true,
  },
  facebook: {
    label: 'Facebook',
    description: 'Post to your timeline and Facebook pages.',
    ringColor: 'ring-blue-600/30',
    textColor: 'text-blue-400',
    abbr: 'Fb',
    isOAuth: true,
  },
  x: {
    label: 'X (Twitter)',
    description: 'Tweet match results and tournament highlights.',
    ringColor: 'ring-slate-500/30',
    textColor: 'text-slate-300',
    abbr: 'X',
    isOAuth: true,
  },
  whatsapp: {
    label: 'WhatsApp',
    description: 'Share to your WhatsApp status via a quick share link — no connection needed.',
    ringColor: 'ring-green-500/30',
    textColor: 'text-green-400',
    abbr: 'WA',
    isOAuth: false,
  },
};

// ── Caption style metadata ────────────────────────────────────────────────────

export const CAPTION_STYLE_META: Record<
  CaptionStyle,
  { label: string; description: string; example: string }
> = {
  hype: {
    label: 'Hype',
    description: 'Energetic and celebratory.',
    example: "LETS GO! Took down {opponent} {score} at {tournament}! 🔥",
  },
  humble: {
    label: 'Humble',
    description: 'Modest and sportsmanlike.',
    example: 'Good match today. Beat {opponent} {score} at {tournament}.',
  },
  motivational: {
    label: 'Motivational',
    description: 'Inspiring and goal-focused.',
    example: 'One step closer. {score} over {opponent}. The grind continues. 💪',
  },
  funny: {
    label: 'Funny',
    description: 'Playful and light-hearted.',
    example: "Sorry not sorry {opponent}. {score} and it wasn't even close. 😂",
  },
  ai: {
    label: 'AI-generated',
    description: 'Claude AI writes a unique caption for each post.',
    example: '✨ A unique, AI-crafted caption based on your match data.',
  },
  custom: {
    label: 'Custom template',
    description: 'Write your own template using placeholders below.',
    example: '',
  },
};

// ── Caption placeholders ──────────────────────────────────────────────────────

export const CAPTION_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: '{player}',     description: 'Your display name' },
  { key: '{opponent}',   description: "Opponent's name" },
  { key: '{score}',      description: 'Match score (e.g. 11–7)' },
  { key: '{tournament}', description: 'Tournament name' },
  { key: '{category}',   description: 'Category name' },
  { key: '{rank}',       description: 'Your current global rank' },
  { key: '{streak}',     description: 'Current win streak' },
];

// ── Pure utility (safe to import from client and server) ──────────────────────

/**
 * Returns which platforms should receive a post for the given trigger,
 * respecting the global pause, per-platform enabled flags, trigger settings,
 * and whether an OAuth connection exists for that platform.
 * Used by Phase 11B Fargate workers and can also be called client-side for previews.
 */
export function getEnabledPlatformsForTrigger(
  prefs: SocialPostPrefs,
  connections: SocialConnectionPublic[],
  trigger: keyof SocialPostTriggers,
): SocialPlatform[] {
  if (prefs.paused) return [];
  const connectedOAuth = new Set(connections.map((c) => c.platform));
  const result: SocialPlatform[] = [];

  for (const [platform, platformPrefs] of Object.entries(prefs.platforms) as [
    SocialPlatform,
    PlatformPostPrefs,
  ][]) {
    if (!platformPrefs.enabled) continue;
    if (!platformPrefs.triggers[trigger]) continue;
    // WhatsApp uses share-link — no stored connection needed
    if (platform !== 'whatsapp' && !connectedOAuth.has(platform as OAuthPlatform)) continue;
    result.push(platform);
  }

  return result;
}
