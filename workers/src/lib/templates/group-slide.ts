// Group Slide graphic template for Satori.
// One slide per group in a group-stage draw carousel.
// Dimensions: 1080×1080 (Instagram carousel spec).
//
// Layout (top to bottom):
//   ┌─ header block ────────────────────────────────────┐
//   │  TOURNAMENT NAME (large, white)  [slide x/N pill] │
//   │  Category Name (brand purple)                     │
//   ├─ thick purple rule ───────────────────────────────┤
//   │           GROUP A  (very large, centered)         │
//   ├─ thin rule ───────────────────────────────────────┤
//   │  player cards (flex-1, fill all remaining space)  │
//   │   ① Ben Thompson    (singles)                     │
//   │   ② or             (doubles)                      │
//   │     Ben Thompson                                  │
//   │     & Chris Anderson                              │
//   ├─ footer ──────────────────────────────────────────┤
//   │  PLAYOFFE                      playoffe.com       │
//   └───────────────────────────────────────────────────┘

/** One entry in a group — singles has only `name`, doubles has both. */
export interface GroupPlayer {
  name: string;           // primary player full name
  partnerName?: string;   // doubles partner's full name (undefined for singles)
}

export interface GroupSlideTemplateData {
  tournamentName: string;
  categoryName: string;
  groupName: string;       // "Group A", "Group B", …
  players: GroupPlayer[];  // ordered by seed
  isDoubles: boolean;
  slideIndex: number;      // 0-based
  totalSlides: number;
  platform: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

function text(content: string, style: Record<string, unknown>): Node {
  return { type: 'span', props: { style, children: content } };
}
function div(style: Record<string, unknown>, ...children: Node[]): Node {
  const merged = children.length > 0 && !('display' in style)
    ? { display: 'flex', ...style }
    : style;
  return { type: 'div', props: { style: merged, children: children.length === 0 ? undefined : children } };
}

// Card accent colours cycle through an array so adjacent cards look distinct
const CARD_ACCENTS = [
  '#7c3aed', // brand purple
  '#2563eb', // blue
  '#0891b2', // cyan
  '#059669', // green
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // repeat
  '#2563eb',
];

export function buildGroupSlideElement(data: GroupSlideTemplateData): Node {
  const { tournamentName, categoryName, groupName, players, isDoubles, slideIndex, totalSlides } = data;

  // The group letter (A, B, …) used as background watermark and headline
  const groupLetter = groupName.replace(/^group\s*/i, '').toUpperCase(); // "A", "B", …

  // Clamp to 8 entries (only show first 8 if somehow more)
  const visiblePlayers = players.slice(0, 8);
  const count = visiblePlayers.length;

  // Vertical layout measurements (all px, total = 1080)
  const HEADER_H   = 190;   // tournament + category block
  const RULE_H     = 4;     // thick separator
  const GROUP_H    = 152;   // "GROUP A" headline
  const THIN_H     = 1;     // thin separator before cards
  const FOOTER_H   = 64;    // footer strip
  const CARDS_H    = 1080 - HEADER_H - RULE_H - GROUP_H - THIN_H - FOOTER_H; // remaining

  return div(
    {
      display: 'flex',
      flexDirection: 'column',
      width: '1080px',
      height: '1080px',
      background: '#0a0e1a',
      fontFamily: 'Inter',
      position: 'relative',
      overflow: 'hidden',
    },

    // ── Background decorative elements ────────────────────────────────────────

    // Large group-letter watermark — font properties on the text element itself
    div(
      {
        position: 'absolute',
        bottom: '24px',
        right: '-20px',
        display: 'flex',
        alignItems: 'flex-end',
      },
      text(groupLetter, {
        fontSize: '600px',
        fontWeight: 900,
        color: 'rgba(124,58,237,0.05)',
        lineHeight: '1',
        letterSpacing: '-20px',
      }),
    ),

    // Top-right purple glow
    div({
      position: 'absolute',
      top: '-80px',
      right: '-80px',
      width: '360px',
      height: '360px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(124,58,237,0.22) 0%, rgba(124,58,237,0) 70%)',
    }),

    // Bottom-left accent glow
    div({
      position: 'absolute',
      bottom: '40px',
      left: '-60px',
      width: '280px',
      height: '280px',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0) 70%)',
    }),

    // ── Header section ────────────────────────────────────────────────────────
    div(
      {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '1080px',
        height: `${HEADER_H}px`,
        padding: '0px 56px',
        background: 'rgba(124,58,237,0.07)',
        borderBottom: '1px solid rgba(124,58,237,0.15)',
        position: 'relative',
        flexShrink: '0',
      },

      // Slide counter pill — top-right
      div(
        {
          position: 'absolute',
          top: '20px',
          right: '56px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: 'rgba(124,58,237,0.18)',
          border: '1px solid rgba(124,58,237,0.35)',
          borderRadius: '999px',
          padding: '5px 14px',
        },
        text(`${slideIndex + 1} / ${totalSlides}`, {
          fontSize: '15px',
          fontWeight: 700,
          color: '#a78bfa',
          letterSpacing: '0.5px',
        }),
      ),

      // Tournament name
      text(tournamentName, {
        fontSize: '42px',
        fontWeight: 800,
        color: '#ffffff',
        letterSpacing: '-1.5px',
        lineHeight: 1.1,
        marginBottom: '10px',
        paddingRight: '160px', // avoid overlapping slide counter
      }),

      // Category name
      text(categoryName, {
        fontSize: '22px',
        fontWeight: 500,
        color: '#a78bfa',
        letterSpacing: '-0.3px',
      }),
    ),

    // ── Thick purple separator ────────────────────────────────────────────────
    div({
      width: '1080px',
      height: `${RULE_H}px`,
      background: 'linear-gradient(90deg, #7c3aed 0%, #2563eb 50%, #7c3aed 100%)',
      flexShrink: '0',
    }),

    // ── Group name headline ────────────────────────────────────────────────────
    div(
      {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1080px',
        height: `${GROUP_H}px`,
        flexShrink: '0',
        position: 'relative',
      },
      text(groupName.toUpperCase(), {
        fontSize: '88px',
        fontWeight: 900,
        color: '#ffffff',
        letterSpacing: '-3px',
        textShadow: '0 0 60px rgba(124,58,237,0.4)',
      }),
    ),

    // ── Thin separator before player cards ───────────────────────────────────
    div({
      width: '1080px',
      height: `${THIN_H}px`,
      background: 'rgba(100,116,139,0.25)',
      flexShrink: '0',
    }),

    // ── Player cards — flex-1, fill all available space equally ───────────────
    div(
      {
        display: 'flex',
        flexDirection: 'column',
        width: '1080px',
        height: `${CARDS_H}px`,
        flexShrink: '0',
      },
      ...visiblePlayers.map((player, idx) => {
        const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];
        const isFirst = idx === 0;
        const isLast  = idx === count - 1;
        // Alternate row tint for readability
        const rowBg = idx % 2 === 0 ? 'rgba(255,255,255,0.028)' : 'rgba(255,255,255,0.014)';

        return div(
          {
            display: 'flex',
            alignItems: 'center',
            flex: '1',
            padding: '0px 40px 0px 56px',
            background: rowBg,
            // Spread border conditionally so no `undefined` values reach Satori
            ...(idx > 0 ? { borderTop: '1px solid rgba(255,255,255,0.04)' } : {}),
            ...(isLast ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}),
            gap: '20px',
            position: 'relative',
          },

          // Left accent line
          div({
            position: 'absolute',
            left: '0px',
            top: '20%',
            width: '4px',
            height: '60%',
            background: accent,
            borderRadius: '0px 4px 4px 0px',
          }),

          // Seed badge
          div(
            {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: isFirst
                ? accent
                : `rgba(${accent.startsWith('#7c') ? '124,58,237' : accent.startsWith('#25') ? '37,99,235' : '37,99,235'},0.15)`,
              border: `2px solid ${accent}`,
              flexShrink: '0',
            },
            text(String(idx + 1), {
              fontSize: '16px',
              fontWeight: 800,
              color: isFirst ? '#ffffff' : accent,
            }),
          ),

          // Player name(s)
          div(
            { display: 'flex', flexDirection: 'column', gap: '4px', flex: '1', minWidth: '0px' },
            text(player.name, {
              fontSize: isDoubles ? '28px' : '34px',
              fontWeight: isFirst ? 700 : 500,
              color: isFirst ? '#ffffff' : '#e2e8f0',
              letterSpacing: '-0.8px',
            }),
            ...(player.partnerName
              ? [text(`& ${player.partnerName}`, {
                  fontSize: isDoubles ? '26px' : '30px',
                  fontWeight: 400,
                  color: '#94a3b8',
                  letterSpacing: '-0.5px',
                })]
              : []),
          ),
        );
      }),
    ),

    // ── Footer ────────────────────────────────────────────────────────────────
    div(
      {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '1080px',
        height: `${FOOTER_H}px`,
        padding: '0px 56px',
        background: 'rgba(0,0,0,0.3)',
        borderTop: '1px solid rgba(124,58,237,0.12)',
        flexShrink: '0',
      },

      // PLAYOFFE brand
      div(
        { display: 'flex', alignItems: 'center', gap: '6px' },
        text('PLAY', { fontSize: '18px', fontWeight: 700, color: '#94a3b8', letterSpacing: '-0.5px' }),
        text('OFFE', { fontSize: '18px', fontWeight: 700, color: '#7c3aed', letterSpacing: '-0.5px' }),
      ),

      text('playoffe.com', { fontSize: '15px', color: '#475569' }),
    ),
  );
}
