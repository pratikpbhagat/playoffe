/**
 * Typed notification send functions.
 *
 * Each function is fire-and-forget safe: errors are caught and logged so a
 * failed email never breaks the caller's action. Always returns void.
 */

import { sendEmail } from './service';
import { buildPartnerInviteEmail } from './templates/partner-invite';
import { buildTeamInviteEmail } from './templates/team-invite';
import {
  buildEntryConfirmedEmail,
  buildEntryRejectedEmail,
  buildWaitlistPromotedEmail,
} from './templates/entry-status';
import { buildScoreReportedEmail } from './templates/score-reported';
import { buildMatchResultEmail } from './templates/match-result';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// ── Partner invite (doubles registration) ────────────────────────────────────

export async function sendPartnerInviteNotification(opts: {
  partnerEmail: string;
  partnerName: string;
  inviterName: string;
  tournamentName: string;
  categoryName: string;
}) {
  try {
    const payload = buildPartnerInviteEmail({
      partnerName: opts.partnerName,
      inviterName: opts.inviterName,
      tournamentName: opts.tournamentName,
      categoryName: opts.categoryName,
      appUrl: APP_URL,
    });
    await sendEmail({ to: opts.partnerEmail, ...payload });
  } catch (err) {
    console.error('[email] sendPartnerInviteNotification failed:', err);
  }
}

// ── Team roster invite ───────────────────────────────────────────────────────

export async function sendTeamInviteNotification(opts: {
  memberEmail: string;
  memberName: string;
  captainName: string;
  teamName: string;
  tournamentName: string;
  categoryName: string;
}) {
  try {
    const payload = buildTeamInviteEmail({
      memberName: opts.memberName,
      captainName: opts.captainName,
      teamName: opts.teamName,
      tournamentName: opts.tournamentName,
      categoryName: opts.categoryName,
      appUrl: APP_URL,
    });
    await sendEmail({ to: opts.memberEmail, ...payload });
  } catch (err) {
    console.error('[email] sendTeamInviteNotification failed:', err);
  }
}

// ── Entry confirmed ──────────────────────────────────────────────────────────

export async function sendEntryConfirmedNotification(opts: {
  playerEmail: string;
  playerName: string;
  tournamentName: string;
  tournamentSlug: string;
  categoryName: string;
}) {
  try {
    const payload = buildEntryConfirmedEmail({
      playerName: opts.playerName,
      tournamentName: opts.tournamentName,
      categoryName: opts.categoryName,
      tournamentUrl: `${APP_URL}/events/${opts.tournamentSlug}`,
      eventsUrl: `${APP_URL}/events`,
    });
    await sendEmail({ to: opts.playerEmail, ...payload });
  } catch (err) {
    console.error('[email] sendEntryConfirmedNotification failed:', err);
  }
}

// ── Entry rejected ────────────────────────────────────────────────────────────

export async function sendEntryRejectedNotification(opts: {
  playerEmail: string;
  playerName: string;
  tournamentName: string;
  categoryName: string;
}) {
  try {
    const payload = buildEntryRejectedEmail({
      playerName: opts.playerName,
      tournamentName: opts.tournamentName,
      categoryName: opts.categoryName,
      tournamentUrl: `${APP_URL}/events`,
      eventsUrl: `${APP_URL}/events`,
    });
    await sendEmail({ to: opts.playerEmail, ...payload });
  } catch (err) {
    console.error('[email] sendEntryRejectedNotification failed:', err);
  }
}

// ── Waitlist promoted ─────────────────────────────────────────────────────────

export async function sendWaitlistPromotedNotification(opts: {
  playerEmail: string;
  playerName: string;
  tournamentName: string;
  tournamentSlug: string;
  categoryName: string;
}) {
  try {
    const payload = buildWaitlistPromotedEmail({
      playerName: opts.playerName,
      tournamentName: opts.tournamentName,
      categoryName: opts.categoryName,
      tournamentUrl: `${APP_URL}/events/${opts.tournamentSlug}`,
      eventsUrl: `${APP_URL}/events`,
    });
    await sendEmail({ to: opts.playerEmail, ...payload });
  } catch (err) {
    console.error('[email] sendWaitlistPromotedNotification failed:', err);
  }
}

// ── Match result (to both players) ───────────────────────────────────────────

export async function sendMatchResultNotification(opts: {
  playerEmail: string;
  playerName: string;
  opponentName: string;
  isWin: boolean;
  isWalkover: boolean;
  score: string;
  ratingChange: number;
  newRating: number;
  tournamentName: string;
  categoryName: string;
  tournamentSlug: string;
  matchId: string;
}) {
  try {
    const result = opts.isWalkover
      ? (opts.isWin ? 'walkover_win' : 'walkover_loss')
      : (opts.isWin ? 'win' : 'loss');

    const payload = buildMatchResultEmail({
      playerName: opts.playerName,
      opponentName: opts.opponentName,
      result,
      score: opts.score,
      tournamentName: opts.tournamentName,
      categoryName: opts.categoryName,
      ratingChange: opts.ratingChange,
      newRating: opts.newRating,
      matchUrl: `${APP_URL}/events/${opts.tournamentSlug}/score-report/${opts.matchId}`,
      appUrl: APP_URL,
    });
    await sendEmail({ to: opts.playerEmail, ...payload });
  } catch (err) {
    console.error('[email] sendMatchResultNotification failed:', err);
  }
}

// ── Score reported (to organiser) ────────────────────────────────────────────

export async function sendScoreReportedNotification(opts: {
  organiserEmails: string[];
  tournamentName: string;
  tournamentSlug: string;
  matchId: string;
  categoryName: string;
  roundName: string;
  playerA: string;
  playerB: string;
  reportedScore: string;
}) {
  const reviewUrl = `${APP_URL}/tournaments/${opts.tournamentSlug}/scoring/${opts.matchId}`;
  try {
    const payload = buildScoreReportedEmail({
      tournamentName: opts.tournamentName,
      categoryName: opts.categoryName,
      roundName: opts.roundName,
      playerA: opts.playerA,
      playerB: opts.playerB,
      reportedScore: opts.reportedScore,
      reviewUrl,
    });
    await Promise.all(
      opts.organiserEmails.map((to) => sendEmail({ to, ...payload })),
    );
  } catch (err) {
    console.error('[email] sendScoreReportedNotification failed:', err);
  }
}
