import type { Metadata } from 'next';
import { getFeatureFlagsAction } from '@/lib/actions/superadmin';
import { FeatureFlagList } from '@/components/superadmin/FeatureFlagList';

export const metadata: Metadata = { title: 'Feature Flags · Super Admin' };

const FLAG_DESCRIPTIONS: Record<string, string> = {
  player_network:          'Player profiles, social feed, follow, messaging — hide for tournament-only mode',
  // Social media is now split into two role-specific flags:
  social_media_organiser:  'Club owners/admins: post draws, schedules, category/tournament winners to club social pages (enabled by default)',
  social_media_player:     'Players: auto-post match wins, category/tournament completions to personal social accounts (disabled by default — enable for player launch)',
  ai_schedule_assistant:   'AI scheduling assistant (Claude) on tournament schedule pages for admins. Super admins always have access regardless of this flag.',
  rankings:                'Rankings page and nav link — disable to hide global rankings from all users (super admins always see it).',
  sponsor_marketplace:     'Sponsor browsing, contact, and badge display features',
  tournament_display:      'Display screen URL generation and live display pages',
  player_self_reporting:   'Allow players to self-report match scores (off by default)',
  direct_messaging:        'Stream.io in-app chat between players',
  partner_matching:        'Doubles partner matching algorithm and search',
  practice_logger:         'Practice session logger for individual players',
  ai_caption_generation:   'Claude API caption generation for social media posts',
  geographic_heatmap:      'Player location heatmap on the analytics page',
};

export default async function SuperAdminFlagsPage() {
  const flags = await getFeatureFlagsAction();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Feature flags</h1>
        <p className="mt-1 text-sm text-slate-500">
          Disable entire feature modules platform-wide — affects all clubs and all roles.
          Changes take effect immediately without a deployment.
        </p>
      </div>

      <FeatureFlagList flags={flags} descriptions={FLAG_DESCRIPTIONS} />
    </div>
  );
}
