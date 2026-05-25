interface TournamentInviteParams {
  recipientName: string;
  inviterName: string;
  tournamentName: string;
  tournamentSlug: string;
  startDate: string;
  venue: string | null;
  appUrl: string;
}

export function buildTournamentInviteEmail(params: TournamentInviteParams) {
  const { recipientName, inviterName, tournamentName, tournamentSlug, startDate, venue, appUrl } =
    params;

  const registrationUrl = `${appUrl}/events/${tournamentSlug}`;
  const formattedDate = new Date(startDate).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const subject = `You're invited to ${tournamentName}`;

  const text = `
Hi ${recipientName},

${inviterName} has personally invited you to compete in ${tournamentName}.

📅 ${formattedDate}${venue ? `\n📍 ${venue}` : ''}

Register now: ${registrationUrl}

— The PLAYOFFE Team
`.trim();

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827; background: #ffffff;">

  <!-- Header -->
  <div style="margin-bottom: 28px;">
    <h1 style="font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0;">
      PLAY<span style="color: #7c3aed;">OFFE</span>
    </h1>
  </div>

  <!-- Banner -->
  <div style="background: linear-gradient(135deg, #4c1d95, #7c3aed); border-radius: 12px; padding: 28px 32px; margin-bottom: 28px; text-align: center;">
    <p style="font-size: 32px; margin: 0 0 8px;">🏆</p>
    <h2 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 6px;">${tournamentName}</h2>
    <p style="font-size: 14px; color: #c4b5fd; margin: 0;">You've been personally invited to compete</p>
  </div>

  <p style="font-size: 15px; color: #374151; margin: 0 0 20px;">
    Hi <strong>${recipientName}</strong>,
  </p>
  <p style="font-size: 15px; color: #374151; margin: 0 0 24px; line-height: 1.6;">
    <strong>${inviterName}</strong> has invited you to register for <strong>${tournamentName}</strong>. Don't miss your spot!
  </p>

  <!-- Details -->
  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px;">
    <p style="margin: 0 0 8px; font-size: 14px; color: #374151;">📅 <strong>${formattedDate}</strong></p>
    ${venue ? `<p style="margin: 0; font-size: 14px; color: #374151;">📍 <strong>${venue}</strong></p>` : ''}
  </div>

  <!-- CTA -->
  <div style="text-align: center; margin-bottom: 32px;">
    <a href="${registrationUrl}"
       style="display: inline-block; background: #7c3aed; color: white; padding: 14px 32px;
              border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 16px;">
      View &amp; register →
    </a>
  </div>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 20px;">
  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
    This invitation was sent by ${inviterName} via PLAYOFFE.
    If you weren't expecting this, you can ignore this email.
  </p>
</body>
</html>`;

  return { subject, html, text };
}
