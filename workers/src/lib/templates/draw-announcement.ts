// Draw Announcement graphic template for Satori.
// Rendered by the organiser posting pipeline when a draw is published.
// Tells followers: the bracket for a specific category is now live.

export interface DrawAnnouncementTemplateData {
  tournamentName: string;
  categoryName: string;
  participantCount: number;
  drawFormat: string;   // 'single_elimination', 'round_robin', etc.
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

const FORMAT_LABEL: Record<string, string> = {
  round_robin:          'Round Robin',
  single_elimination:   'Single Elimination',
  double_elimination:   'Double Elimination',
  group_stage_knockout: 'Group Stage + Knockout',
  swiss:                'Swiss',
};

export function buildDrawAnnouncementElement(data: DrawAnnouncementTemplateData): Node {
  const { tournamentName, categoryName, participantCount, drawFormat } = data;
  const formatLabel = FORMAT_LABEL[drawFormat] ?? drawFormat;

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

    // Top-right glow
    div({
      position: 'absolute',
      top: '-60px',
      right: '-60px',
      width: '420px',
      height: '420px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(124,58,237,0.30) 0%, rgba(124,58,237,0) 70%)',
    }),

    // PLAYOFFE brand
    div(
      { display: 'flex', alignItems: 'center', gap: '8px' },
      text('PLAY', { fontSize: '22px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.5px' }),
      text('OFFE', { fontSize: '22px', fontWeight: 700, color: '#7c3aed', letterSpacing: '-0.5px' }),
    ),

    // Main content
    div(
      { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: '1' },

      // Badge
      div(
        {
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(124,58,237,0.12)',
          border: '1px solid rgba(124,58,237,0.35)',
          borderRadius: '999px',
          padding: '10px 28px',
          marginBottom: '40px',
        },
        text('🎯', { fontSize: '22px' }),
        text('DRAW IS LIVE', {
          fontSize: '15px',
          fontWeight: 700,
          color: '#a78bfa',
          letterSpacing: '3px',
        }),
      ),

      // Tournament name
      text(tournamentName, {
        fontSize: '52px',
        fontWeight: 700,
        color: '#ffffff',
        textAlign: 'center',
        letterSpacing: '-1.5px',
        lineHeight: 1.1,
        marginBottom: '20px',
      }),

      // Category name
      text(categoryName, {
        fontSize: '32px',
        fontWeight: 400,
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: '44px',
      }),

      // Stats row
      div(
        { display: 'flex', gap: '32px', alignItems: 'center' },
        div(
          { display: 'flex', flexDirection: 'column', alignItems: 'center' },
          text(String(participantCount), { fontSize: '52px', fontWeight: 700, color: '#7c3aed', letterSpacing: '-2px' }),
          text('players', { fontSize: '16px', color: '#64748b', marginTop: '4px' }),
        ),
        div({ width: '1px', height: '60px', background: 'rgba(100,116,139,0.3)' }),
        div(
          { display: 'flex', flexDirection: 'column', alignItems: 'center' },
          text(formatLabel, { fontSize: '22px', fontWeight: 600, color: '#cbd5e1', textAlign: 'center' }),
          text('format', { fontSize: '16px', color: '#64748b', marginTop: '4px' }),
        ),
      ),
    ),

    // Footer
    div(
      { display: 'flex', justifyContent: 'flex-end' },
      text('View bracket at playoffe.com', { fontSize: '14px', color: '#334155' }),
    ),
  );
}
