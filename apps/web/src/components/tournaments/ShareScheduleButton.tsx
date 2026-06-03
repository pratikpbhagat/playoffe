'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { shareScheduleOnSocialAction } from '@/lib/actions/social';

interface Props {
  tournamentId: string;
  matchCount: number;
}

/**
 * "Share schedule on social" CTA for the tournament schedule page.
 * Only rendered when the social_media_organiser flag is enabled and the club
 * has at least one connected social account.
 */
export function ShareScheduleButton({ tournamentId, matchCount }: Props) {
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const [shared, setShared]   = useState(false);

  async function handleShare() {
    setSharing(true);
    const result = await shareScheduleOnSocialAction(tournamentId);
    if (result.error) {
      toast(result.error, 'error');
    } else {
      toast('Schedule shared on social media! 📅', 'success');
      setShared(true);
    }
    setSharing(false);
  }

  if (shared) {
    return (
      <span className="rounded-full bg-accent-500/10 px-3 py-1.5 text-xs text-accent-400 ring-1 ring-accent-500/25">
        ✓ Shared
      </span>
    );
  }

  return (
    <button
      onClick={handleShare}
      disabled={sharing || matchCount === 0}
      title={
        matchCount === 0
          ? 'Schedule at least one match before sharing'
          : 'Post a schedule announcement to the club\'s social media pages'
      }
      className="rounded-lg border border-brand-700/50 px-3 py-1.5 text-xs text-brand-400 hover:bg-brand-700/10 transition-colors disabled:opacity-40"
    >
      {sharing ? 'Sharing…' : '📢 Share schedule on social'}
    </button>
  );
}
