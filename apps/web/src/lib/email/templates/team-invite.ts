interface TeamInviteParams {
  memberName: string;
  captainName: string;
  teamName: string;
  tournamentName: string;
  categoryName: string;
  appUrl: string;
}

export function buildTeamInviteEmail(params: TeamInviteParams) {
  const { memberName, captainName, teamName, tournamentName, categoryName, appUrl } = params;

  const dashboardUrl = `${appUrl}/dashboard`;
  const subject = `${captainName} added you to ${teamName} at ${tournamentName}`;

  const text = `
Hi ${memberName},

${captainName} has added you to the roster for "${teamName}" in ${categoryName} at ${tournamentName}.

Log in to your PLAYOFFE dashboard to accept or decline:
${dashboardUrl}

— The PLAYOFFE Team
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827;">
  <div style="margin-bottom: 32px;">
    <h1 style="font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0;">
      PLAY<span style="color: #7c3aed;">OFFE</span>
    </h1>
  </div>

  <h2 style="font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 16px;">
    Team roster invitation 🏆
  </h2>

  <p style="color: #374151; line-height: 1.6; margin: 0 0 16px;">
    Hi <strong>${memberName}</strong>,
  </p>

  <p style="color: #374151; line-height: 1.6; margin: 0 0 24px;">
    <strong>${captainName}</strong> has added you to the roster for
    <strong>${teamName}</strong> in <strong>${categoryName}</strong> at <strong>${tournamentName}</strong>.
  </p>

  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 0 0 28px;">
    <p style="margin: 0; font-size: 14px; color: #6b7280;">Tournament</p>
    <p style="margin: 4px 0 12px; font-size: 16px; font-weight: 600; color: #111827;">${tournamentName}</p>
    <p style="margin: 0; font-size: 14px; color: #6b7280;">Team</p>
    <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #111827;">${teamName}</p>
  </div>

  <div style="margin: 0 0 32px; text-align: center;">
    <a href="${dashboardUrl}"
       style="display: inline-block; background: #7c3aed; color: white; padding: 14px 28px;
              border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 16px;">
      Accept or decline invite
    </a>
  </div>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
    If you weren't expecting this invite, you can decline it from your dashboard.
  </p>
</body>
</html>
`.trim();

  return { subject, html, text };
}
