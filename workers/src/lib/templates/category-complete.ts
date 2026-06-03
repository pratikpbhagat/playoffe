// Category Complete graphic template for Satori.
// Shown when a player finishes all their matches in a category.

export interface CategoryCompleteTemplateData {
  playerName: string;
  tournamentName: string;
  categoryName: string;
  position?: number;      // final placing (1 = winner, 2 = runner-up, etc.) if known
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

const POSITION_LABEL: Record<number, string> = {
  1: '🥇 Champion',
  2: '🥈 Runner-up',
  3: '🥉 Third place',
};

export function buildCategoryCompleteElement(data: CategoryCompleteTemplateData): Node {
  const { playerName, tournamentName, categoryName, position } = data;
  const positionLabel = position != null ? (POSITION_LABEL[position] ?? `${position}th place`) : null;

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

    // Accent glow
    div({
      position: 'absolute',
      bottom: '-80px',
      left: '-80px',
      width: '400px',
      height: '400px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(124,58,237,0.25) 0%, rgba(124,58,237,0) 70%)',
    }),

    // PLAYOFFE brand
    div(
      { display: 'flex', alignItems: 'center', gap: '8px' },
      text('PLAY', { fontSize: '22px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '-0.5px' }),
      text('OFFE', { fontSize: '22px', fontWeight: 700, color: '#7c3aed', letterSpacing: '-0.5px' }),
    ),

    // Main content
    div(
      {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '1',
      },

      // Badge
      div(
        {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(124,58,237,0.12)',
          border: '1px solid rgba(124,58,237,0.3)',
          borderRadius: '999px',
          padding: '8px 24px',
          marginBottom: '36px',
        },
        text('CATEGORY COMPLETE', {
          fontSize: '13px',
          fontWeight: 700,
          color: '#a78bfa',
          letterSpacing: '2px',
        }),
      ),

      // Player name
      text(playerName, {
        fontSize: '64px',
        fontWeight: 700,
        color: '#ffffff',
        letterSpacing: '-2px',
        textAlign: 'center',
        lineHeight: 1.1,
        marginBottom: '20px',
      }),

      // Category name
      text(categoryName, {
        fontSize: '32px',
        fontWeight: 400,
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: position != null ? '32px' : '48px',
      }),

      // Position label (if known)
      ...(positionLabel
        ? [
            text(positionLabel, {
              fontSize: '48px',
              fontWeight: 700,
              color: '#f8fafc',
              letterSpacing: '-1px',
              marginBottom: '48px',
            }),
          ]
        : []),

      div({ width: '80px', height: '2px', background: 'rgba(100,116,139,0.4)', marginBottom: '32px' }),

      text(tournamentName, {
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
