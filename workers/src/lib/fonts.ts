// Font buffers for Satori — loaded once at worker startup and cached in memory.
// In production Docker images, bundle the fonts to avoid CDN fetch latency.

type SatoriFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: 'normal';
};

// satori@0.10.x bundles @shuding/opentype.js@1.4.0-beta.0 which does NOT
// support WOFF2 ("wOF2" signature).  Use plain WOFF or OTF instead.
const INTER_BASE = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.1.1/files';
const INTER_400_URL = `${INTER_BASE}/inter-latin-400-normal.woff`;
const INTER_700_URL = `${INTER_BASE}/inter-latin-700-normal.woff`;

let cached: SatoriFont[] | null = null;

/**
 * Returns Satori-compatible font definitions for Inter (Regular + Bold).
 * Fetched from CDN on first call; subsequent calls return the in-memory cache.
 */
export async function loadFonts(): Promise<SatoriFont[]> {
  if (cached) return cached;

  console.log('[fonts] Loading Inter from CDN…');
  const [regular, bold] = await Promise.all([
    fetch(INTER_400_URL).then((r) => r.arrayBuffer()),
    fetch(INTER_700_URL).then((r) => r.arrayBuffer()),
  ]);

  cached = [
    { name: 'Inter', data: regular, weight: 400, style: 'normal' },
    { name: 'Inter', data: bold,    weight: 700, style: 'normal' },
  ];
  console.log('[fonts] Inter loaded ✓');
  return cached;
}
