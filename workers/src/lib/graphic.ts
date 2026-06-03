import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { loadFonts } from './fonts.js';
import type { MatchWinTemplateData } from './templates/match-win.js';
import type { CategoryCompleteTemplateData } from './templates/category-complete.js';
import type { PodiumTemplateData } from './templates/podium.js';
import type { DrawAnnouncementTemplateData } from './templates/draw-announcement.js';
import type { ScheduleAnnouncementTemplateData } from './templates/schedule-announcement.js';
import { buildMatchWinElement } from './templates/match-win.js';
import { buildCategoryCompleteElement } from './templates/category-complete.js';
import { buildPodiumElement } from './templates/podium.js';
import { buildDrawAnnouncementElement } from './templates/draw-announcement.js';
import { buildScheduleAnnouncementElement } from './templates/schedule-announcement.js';

// Graphic dimensions
const SQUARE_W = 1080;
const SQUARE_H = 1080;

/**
 * Render a Satori element tree to a PNG Buffer.
 * Uses @resvg/resvg-js for SVG → PNG (WASM, no native deps beyond the WASM binary).
 */
async function renderToPng(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: any,
  width = SQUARE_W,
  height = SQUARE_H,
): Promise<Buffer> {
  const fonts = await loadFonts();

  const svg = await satori(element, { width, height, fonts });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}

// ── Public render functions ───────────────────────────────────────────────────

export async function renderMatchWin(data: MatchWinTemplateData): Promise<Buffer> {
  return renderToPng(buildMatchWinElement(data));
}

export async function renderCategoryComplete(data: CategoryCompleteTemplateData): Promise<Buffer> {
  return renderToPng(buildCategoryCompleteElement(data));
}

export async function renderPodium(data: PodiumTemplateData): Promise<Buffer> {
  return renderToPng(buildPodiumElement(data));
}

export async function renderDrawAnnouncement(data: DrawAnnouncementTemplateData): Promise<Buffer> {
  return renderToPng(buildDrawAnnouncementElement(data));
}

export async function renderScheduleAnnouncement(data: ScheduleAnnouncementTemplateData): Promise<Buffer> {
  return renderToPng(buildScheduleAnnouncementElement(data));
}
