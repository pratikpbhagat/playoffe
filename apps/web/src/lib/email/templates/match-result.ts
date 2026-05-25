interface MatchResultEmailOpts {
  playerName: string;
  opponentName: string;
  result: 'win' | 'loss' | 'walkover_win' | 'walkover_loss';
  score: string; // e.g. "11-7, 9-11, 11-8"
  tournamentName: string;
  categoryName: string;
  ratingChange: number;
  newRating: number;
  matchUrl: string;
  appUrl: string;
}

export function buildMatchResultEmail(opts: MatchResultEmailOpts): { subject: string; html: string; text: string } {
  const isWin = opts.result === 'win' || opts.result === 'walkover_win';
  const isWalkover = opts.result === 'walkover_win' || opts.result === 'walkover_loss';
  const resultLabel = isWin ? '🏆 You won!' : '👊 Match complete';
  const ratingSign = opts.ratingChange >= 0 ? '+' : '';
  const ratingStr = `${ratingSign}${opts.ratingChange.toFixed(1)}`;

  const subject = isWin
    ? `You beat ${opts.opponentName} — ${opts.tournamentName}`
    : `Result recorded vs ${opts.opponentName} — ${opts.tournamentName}`;

  const scoreSection = isWalkover
    ? `<p style="color:#94a3b8;font-size:14px;margin:0 0 16px">Walkover — no sets played</p>`
    : opts.score
    ? `<p style="font-family:monospace;font-size:16px;font-weight:700;color:#ffffff;margin:0 0 16px">${opts.score}</p>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155">
        <!-- Header -->
        <tr>
          <td style="background:${isWin ? '#166534' : '#1e3a5f'};padding:24px 32px">
            <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:${isWin ? '#86efac' : '#93c5fd'};text-transform:uppercase;letter-spacing:0.05em">
              ${opts.tournamentName} · ${opts.categoryName}
            </p>
            <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff">${resultLabel}</p>
          </td>
        </tr>
        <!-- Match info -->
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 8px;font-size:13px;color:#94a3b8">
              ${isWin ? 'You defeated' : 'You lost to'}
            </p>
            <p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#ffffff">${opts.opponentName}</p>
            ${scoreSection}
            <!-- Rating change -->
            <table cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:10px;padding:16px 20px;width:100%;box-sizing:border-box">
              <tr>
                <td>
                  <p style="margin:0 0 2px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Rating change</p>
                  <p style="margin:0;font-size:22px;font-weight:800;color:${opts.ratingChange >= 0 ? '#4ade80' : '#f87171'}">${ratingStr}</p>
                </td>
                <td align="right">
                  <p style="margin:0 0 2px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">New rating</p>
                  <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff">${opts.newRating.toFixed(0)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- CTA -->
        <tr>
          <td style="padding:0 32px 28px">
            <a href="${opts.matchUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px">
              View match details →
            </a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #334155">
            <p style="margin:0;font-size:12px;color:#475569">
              PLAYOFFE · <a href="${opts.appUrl}/rankings" style="color:#7c3aed;text-decoration:none">View rankings</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `${resultLabel}`,
    ``,
    `${isWin ? 'You defeated' : 'You lost to'} ${opts.opponentName}`,
    opts.score && !isWalkover ? `Score: ${opts.score}` : isWalkover ? 'Walkover' : '',
    ``,
    `Rating change: ${ratingStr}`,
    `New rating:    ${opts.newRating.toFixed(0)}`,
    ``,
    `Tournament: ${opts.tournamentName} · ${opts.categoryName}`,
    ``,
    `View match: ${opts.matchUrl}`,
  ].filter((l) => l !== undefined).join('\n');

  return { subject, html, text };
}
