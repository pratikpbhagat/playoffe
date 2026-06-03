// Schedule Announcement graphic template for Satori.
// Rendered by the organiser posting pipeline when match schedules are published.

export interface ScheduleAnnouncementTemplateData {
  tournamentName: string;
  matchCount: number;
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

export function buildScheduleAnnouncementElement(data: ScheduleAnnouncementTemplateData): Node {
  const { tournamentName, matchCount } = data;

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

    // Bottom-left glow
    div({
      position: 'absolute',
      bottom: '-60px',
      left: '-60px',
      width: '380px',
      height: '380px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0) 70%)',
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
          background: 'rgba(34,197,94,0.10)',
          border: '1px solid rgba(34,197,94,0.28)',
          borderRadius: '999px',
          padding: '10px 28px',
          marginBottom: '40px',
        },
        text('📅', { fontSize: '22px' }),
        text('SCHEDULE RELEASED', {
          fontSize: '14px',
          fontWeight: 700,
          color: '#4ade80',
          letterSpacing: '3px',
        }),
      ),

      // Tournament name
      text(tournamentName, {
        fontSize: '56px',
        fontWeight: 700,
        color: '#ffffff',
        textAlign: 'center',
        letterSpacing: '-2px',
        lineHeight: 1.1,
        marginBottom: '48px',
      }),

      // Match count callout
      div(
        {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.20)',
          borderRadius: '20px',
          padding: '28px 60px',
          marginBottom: '48px',
        },
        text(String(matchCount), { fontSize: '80px', fontWeight: 700, color: '#22c55e', letterSpacing: '-4px' }),
        text('matches scheduled', { fontSize: '20px', color: '#4ade80', marginTop: '6px' }),
      ),

      text('Check your match times at playoffe.com', {
        fontSize: '22px',
        color: '#64748b',
        textAlign: 'center',
      }),
    ),

    // Footer
    div(
      { display: 'flex', justifyContent: 'flex-end' },
      text('playoffe.com', { fontSize: '14px', color: '#334155' }),
    ),
  );
}
