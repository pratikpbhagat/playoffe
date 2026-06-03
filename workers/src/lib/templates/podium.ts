// Podium / wrap-up graphic template for Satori.
// Rendered by the organiser posting pipeline after a category or tournament ends.
// Phase 11B stub — renders a clean winner announcement card.

export interface PodiumTemplateData {
  type: 'podium' | 'wrap_up';
  tournamentName: string;
  categoryName?: string;     // for podium type
  winnerName: string;
  runnerUpName?: string;
  thirdPlaceName?: string;
  sponsorNames?: string[];   // shown in footer
  platform: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

function text(content: string, style: Record<string, unknown>): Node {
  return { type: 'span', props: { style, children: content } };
}
function div(style: Record<string, unknown>, ...children: Node[]): Node {
  const mergedStyle = children.length > 0 && !('display' in style)
    ? { display: 'flex', ...style }
    : style;
  return { type: 'div', props: { style: mergedStyle, children: children.length === 0 ? undefined : children } };
}

export function buildPodiumElement(data: PodiumTemplateData): Node {
  const { tournamentName, categoryName, winnerName, runnerUpName, thirdPlaceName, type } = data;
  const isWrapUp = type === 'wrap_up';

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

    div({
      position: 'absolute',
      top: '0px',
      left: '0px',
      right: '0px',
      height: '300px',
      background: 'linear-gradient(180deg, rgba(124,58,237,0.2) 0%, rgba(124,58,237,0) 100%)',
    }),

    // Header
    div(
      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0px' },
      div(
        { display: 'flex', alignItems: 'center', gap: '8px' },
        text('PLAY', { fontSize: '22px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.5px' }),
        text('OFFE', { fontSize: '22px', fontWeight: 700, color: '#7c3aed', letterSpacing: '-0.5px' }),
      ),
      text(isWrapUp ? 'TOURNAMENT WRAP-UP' : 'PODIUM', {
        fontSize: '12px',
        fontWeight: 700,
        color: '#475569',
        letterSpacing: '2px',
      }),
    ),

    // Main content
    div(
      {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '1',
        gap: '0px',
      },

      // Tournament name
      text(tournamentName, {
        fontSize: '28px',
        fontWeight: 700,
        color: '#7c3aed',
        textAlign: 'center',
        marginBottom: '8px',
        letterSpacing: '-0.5px',
      }),

      // Category (for podium type)
      ...(categoryName
        ? [text(categoryName, { fontSize: '20px', color: '#64748b', textAlign: 'center', marginBottom: '48px' })]
        : [div({ height: '48px' })]),

      // 🥇 Winner
      div(
        {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'rgba(234,179,8,0.08)',
          border: '1px solid rgba(234,179,8,0.25)',
          borderRadius: '20px',
          padding: '32px 56px',
          marginBottom: '20px',
          width: '100%',
        },
        text('🥇', { fontSize: '48px', marginBottom: '8px' }),
        text(winnerName, { fontSize: '48px', fontWeight: 700, color: '#fef08a', textAlign: 'center', letterSpacing: '-1px' }),
        text('Champion', { fontSize: '16px', color: '#ca8a04', marginTop: '4px', letterSpacing: '1px', fontWeight: 700 }),
      ),

      // Runner-up row
      ...(runnerUpName || thirdPlaceName
        ? [
            div(
              { display: 'flex', gap: '16px', width: '100%' },
              ...(runnerUpName
                ? [div(
                    {
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      flex: '1', background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.15)',
                      borderRadius: '16px', padding: '20px 24px',
                    },
                    text('🥈', { fontSize: '28px', marginBottom: '6px' }),
                    text(runnerUpName, { fontSize: '24px', fontWeight: 700, color: '#cbd5e1', textAlign: 'center' }),
                    text('Runner-up', { fontSize: '12px', color: '#64748b', marginTop: '4px', letterSpacing: '1px' }),
                  )]
                : []),
              ...(thirdPlaceName
                ? [div(
                    {
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      flex: '1', background: 'rgba(148,163,184,0.04)', border: '1px solid rgba(148,163,184,0.10)',
                      borderRadius: '16px', padding: '20px 24px',
                    },
                    text('🥉', { fontSize: '28px', marginBottom: '6px' }),
                    text(thirdPlaceName, { fontSize: '24px', fontWeight: 700, color: '#94a3b8', textAlign: 'center' }),
                    text('3rd place', { fontSize: '12px', color: '#475569', marginTop: '4px', letterSpacing: '1px' }),
                  )]
                : []),
            ),
          ]
        : []),
    ),

    // Footer
    div(
      { display: 'flex', justifyContent: 'flex-end' },
      text('playoffe.com', { fontSize: '14px', color: '#334155' }),
    ),
  );
}
