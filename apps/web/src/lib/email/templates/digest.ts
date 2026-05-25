interface TournamentDigest {
  name: string;
  slug: string;
  status: string;
  activeEntries: number;
  waitlistEntries: number;
  pendingReports: number;
  upcomingMatches: number;
  completedMatches: number;
  totalMatches: number;
}

interface DigestParams {
  clubName: string;
  managerName: string;
  tournaments: TournamentDigest[];
  appUrl: string;
}

export function buildDigestEmail(params: DigestParams) {
  const { clubName, managerName, tournaments, appUrl } = params;
  const activeTournaments = tournaments.filter((t) =>
    ['registration_open', 'in_progress'].includes(t.status),
  );

  const subject = `${clubName} — Tournament digest`;

  const totalPendingReports = tournaments.reduce((s, t) => s + t.pendingReports, 0);
  const totalEntries = tournaments.reduce((s, t) => s + t.activeEntries, 0);

  const statusLabel: Record<string, string> = {
    registration_open: 'Registration open',
    in_progress: 'In progress',
    draft: 'Draft',
    completed: 'Completed',
  };

  const tournamentRows = activeTournaments
    .map((t) => {
      const progressPct =
        t.totalMatches > 0 ? Math.round((t.completedMatches / t.totalMatches) * 100) : 0;

      return `
    <tr>
      <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
        <a href="${appUrl}/tournaments/${t.slug}" style="font-size: 14px; font-weight: 600; color: #111827; text-decoration: none;">${t.name}</a>
        <p style="margin: 2px 0 0; font-size: 12px; color: #6b7280;">${statusLabel[t.status] ?? t.status}</p>
      </td>
      <td style="padding: 14px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 14px; font-weight: 600; color: #111827;">${t.activeEntries}</td>
      <td style="padding: 14px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 14px; font-weight: 600; color: ${t.waitlistEntries > 0 ? '#d97706' : '#9ca3af'};">${t.waitlistEntries}</td>
      <td style="padding: 14px 8px; border-bottom: 1px solid #e5e7eb; text-align: center; font-size: 14px; font-weight: 600; color: ${t.pendingReports > 0 ? '#dc2626' : '#9ca3af'};">${t.pendingReports > 0 ? `⚠️ ${t.pendingReports}` : '—'}</td>
      <td style="padding: 14px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        <span style="font-size: 12px; color: #6b7280;">${t.completedMatches}/${t.totalMatches} (${progressPct}%)</span>
      </td>
    </tr>`;
    })
    .join('');

  const alertBanner =
    totalPendingReports > 0
      ? `<div style="background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; display: flex; gap: 12px; align-items: center;">
    <span style="font-size: 20px;">⚠️</span>
    <div>
      <p style="margin: 0; font-size: 14px; font-weight: 700; color: #92400e;">${totalPendingReports} score report${totalPendingReports !== 1 ? 's' : ''} pending review</p>
      <p style="margin: 4px 0 0; font-size: 12px; color: #b45309;">Head to your scoring hubs to confirm or reject player-submitted results.</p>
    </div>
  </div>`
      : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; color: #111827; background: #ffffff;">

  <!-- Header -->
  <div style="margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
    <h1 style="font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 6px;">
      PLAY<span style="color: #7c3aed;">OFFE</span>
    </h1>
    <p style="margin: 0; font-size: 13px; color: #6b7280;">Tournament digest for <strong>${clubName}</strong></p>
  </div>

  <p style="font-size: 15px; color: #374151; margin: 0 0 24px;">
    Hi ${managerName}, here's a quick summary of your active tournaments.
  </p>

  ${alertBanner}

  <!-- Summary chips -->
  <div style="display: flex; gap: 12px; margin-bottom: 28px; flex-wrap: wrap;">
    <div style="background: #f3f4f6; border-radius: 8px; padding: 12px 18px; flex: 1; min-width: 110px; text-align: center;">
      <p style="font-size: 24px; font-weight: 700; color: #111827; margin: 0;">${activeTournaments.length}</p>
      <p style="font-size: 11px; color: #6b7280; margin: 4px 0 0; text-transform: uppercase; letter-spacing: 0.5px;">Active tournaments</p>
    </div>
    <div style="background: #f3f4f6; border-radius: 8px; padding: 12px 18px; flex: 1; min-width: 110px; text-align: center;">
      <p style="font-size: 24px; font-weight: 700; color: #111827; margin: 0;">${totalEntries}</p>
      <p style="font-size: 11px; color: #6b7280; margin: 4px 0 0; text-transform: uppercase; letter-spacing: 0.5px;">Registered players</p>
    </div>
    <div style="background: ${totalPendingReports > 0 ? '#fffbeb' : '#f3f4f6'}; border-radius: 8px; padding: 12px 18px; flex: 1; min-width: 110px; text-align: center;">
      <p style="font-size: 24px; font-weight: 700; color: ${totalPendingReports > 0 ? '#d97706' : '#9ca3af'}; margin: 0;">${totalPendingReports}</p>
      <p style="font-size: 11px; color: #6b7280; margin: 4px 0 0; text-transform: uppercase; letter-spacing: 0.5px;">Pending reports</p>
    </div>
  </div>

  <!-- Tournament table -->
  ${activeTournaments.length > 0 ? `
  <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 28px;">
    <thead>
      <tr style="background: #f9fafb;">
        <th style="padding: 10px 16px; text-align: left; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Tournament</th>
        <th style="padding: 10px 8px; text-align: center; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Entries</th>
        <th style="padding: 10px 8px; text-align: center; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Waitlist</th>
        <th style="padding: 10px 8px; text-align: center; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Reports</th>
        <th style="padding: 10px 16px; text-align: right; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Progress</th>
      </tr>
    </thead>
    <tbody>
      ${tournamentRows}
    </tbody>
  </table>` : '<p style="color: #6b7280; font-size: 14px; margin-bottom: 28px;">No active tournaments right now.</p>'}

  <!-- CTA -->
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${appUrl}/clubs"
       style="display: inline-block; background: #7c3aed; color: white; padding: 12px 28px;
              border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px;">
      Open club dashboard →
    </a>
  </div>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 20px;">
  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
    You're receiving this digest as a club manager on PLAYOFFE.
  </p>
</body>
</html>`;

  const text = `
${clubName} — Tournament Digest

Hi ${managerName},

${totalPendingReports > 0 ? `⚠️  ${totalPendingReports} score report(s) pending review.\n` : ''}
Active tournaments: ${activeTournaments.length}
Registered players: ${totalEntries}

${activeTournaments.map((t) => `• ${t.name} — ${t.activeEntries} entries, ${t.pendingReports} pending reports, ${t.completedMatches}/${t.totalMatches} matches done`).join('\n')}

Open your dashboard: ${appUrl}/clubs

— The PLAYOFFE Team
`.trim();

  return { subject, html, text };
}
