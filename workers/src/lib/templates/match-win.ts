// Match Win graphic template for Satori.
// Output: 1080×1080 square (feed), 1080×1920 story variant.
//
// Layout:
//   Dark surface background + purple radial glow (top-right)
//   ┌──────────────────────────────────────┐
//   │  PLAYOFFE                            │  ← brand mark
//   │                                      │
//   │         🏆 MATCH WIN                 │  ← pill badge
//   │                                      │
//   │         {playerName}                 │  ← 72px bold white
//   │           defeated                   │  ← slate-400
//   │         {opponentName}               │  ← 48px white
//   │                                      │
//   │          11 — 7                      │  ← score, accent green, 80px
//   │                                      │
//   │    Blue Bird Championships           │  ← tournament
//   │    Intermediate Men's Singles        │  ← category
//   └──────────────────────────────────────┘

export interface MatchWinTemplateData {
  playerName: string;
  opponentName: string;
  score: string;          // "11-7" or "11-7, 8-11, 11-5"
  tournamentName: string;
  categoryName: string;
  platform: string;
}

// Satori vdom (React.createElement-compatible object format)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

function text(content: string, style: Record<string, unknown>): Node {
  return { type: 'span', props: { style, children: content } };
}

// Satori requires every div with children to have display:flex.
// Default to flex so individual styles only need to override when necessary.
function div(style: Record<string, unknown>, ...children: Node[]): Node {
  const mergedStyle = children.length > 0 && !('display' in style)
    ? { display: 'flex', ...style }
    : style;
  return { type: 'div', props: { style: mergedStyle, children: children.length === 0 ? undefined : children } };
}

/** Returns the root Satori element for a 1080×1080 match-win graphic */
export function buildMatchWinElement(data: MatchWinTemplateData): Node {
  const { playerName, opponentName, score, tournamentName, categoryName } = data;

  // Format score: "11-7, 8-11, 11-5" → "11–7   8–11   11–5"
  const formattedScore = score
    .split(',')
    .map((s) => s.trim().replace('-', '–'))
    .join('   ');

  return div(
    {
      display: 'flex',
      flexDirection: 'column',
      width: '1080px',
      height: '1080px',
      background: '#0f172a',
      padding: '64px',
      fontFamily: 'Inter',
      position: 'relative',
    },

    // Purple glow blob (top-right)
    div({
      position: 'absolute',
      top: '-100px',
      right: '-100px',
      width: '500px',
      height: '500px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(124,58,237,0.35) 0%, rgba(124,58,237,0) 70%)',
    }),

    // PLAYOFFE branding (top-left)
    div(
      { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0px' },
      text('PLAY', { fontSize: '22px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.5px' }),
      text('OFFE', { fontSize: '22px', fontWeight: 700, color: '#7c3aed', letterSpacing: '-0.5px' }),
    ),

    // Main content — vertically centered
    div(
      {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '1',
        gap: '0px',
      },

      // "MATCH WIN" badge
      div(
        {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(34,197,94,0.12)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '999px',
          padding: '8px 24px',
          marginBottom: '36px',
        },
        text('🏆', { fontSize: '18px' }),
        text('MATCH WIN', {
          fontSize: '14px',
          fontWeight: 700,
          color: '#22c55e',
          letterSpacing: '2px',
        }),
      ),

      // Player name
      text(playerName, {
        fontSize: '68px',
        fontWeight: 700,
        color: '#ffffff',
        letterSpacing: '-2px',
        textAlign: 'center',
        lineHeight: 1.1,
        marginBottom: '16px',
      }),

      // "defeated"
      text('defeated', {
        fontSize: '24px',
        color: '#64748b',
        marginBottom: '16px',
        letterSpacing: '0.5px',
      }),

      // Opponent name
      text(opponentName, {
        fontSize: '44px',
        fontWeight: 400,
        color: '#cbd5e1',
        textAlign: 'center',
        lineHeight: 1.15,
        marginBottom: '40px',
      }),

      // Score
      text(formattedScore, {
        fontSize: '72px',
        fontWeight: 700,
        color: '#22c55e',
        letterSpacing: '-2px',
        marginBottom: '48px',
      }),

      // Divider line
      div({
        width: '80px',
        height: '2px',
        background: 'rgba(100,116,139,0.4)',
        marginBottom: '32px',
      }),

      // Tournament
      text(tournamentName, {
        fontSize: '22px',
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: '10px',
      }),

      // Category
      text(categoryName, {
        fontSize: '18px',
        color: '#475569',
        textAlign: 'center',
      }),
    ),

    // Footer
    div(
      {
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: '0px',
      },
      text('playoffe.com', { fontSize: '14px', color: '#334155' }),
    ),
  );
}
