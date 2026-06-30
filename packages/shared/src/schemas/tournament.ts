import { z } from 'zod';
import { CATEGORY_TYPES, PLAY_FORMATS, DRAW_FORMATS } from '../constants/category-formats';

const categoryTypeValues = CATEGORY_TYPES.map((t) => t.value) as [string, ...string[]];
const playFormatValues = PLAY_FORMATS.map((f) => f.value) as [string, ...string[]];
const drawFormatValues = DRAW_FORMATS.map((f) => f.value) as [string, ...string[]];

export const createTournamentSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(1000).nullable().optional(),
  venue: z.string().max(200).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  court_count: z.number().int().min(1).max(50),
  registration_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  max_participants: z.number().int().min(4).max(512).nullable().optional(),
  // Scoring defaults (can be overridden per category or per stage)
  scoring_format: z.enum(['rally', 'traditional']).default('rally'),
  num_sets: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(1),
  points_per_set: z.number().int().min(5).max(100).default(11),
  win_by: z.union([z.literal(1), z.literal(2)]).default(2),
  deuce_cap: z.number().int().min(5).max(200).nullable().optional(),
}).refine((data) => data.end_date >= data.start_date, {
  message: 'End date must be on or after start date',
  path: ['end_date'],
});

const rubberLineupItemSchema = z.object({
  sequence: z.number().int().min(1),
  name: z.string().min(1).max(40),
  play_format: z.enum(['singles', 'doubles', 'mixed_doubles']),
});

const rosterCompositionRuleSchema = z.object({
  count: z.number().int().min(1).max(50),
  gender: z.enum(['male', 'female']).optional(),
  age_min: z.number().int().min(0).max(120).optional(),
  age_max: z.number().int().min(0).max(120).optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(2).max(80),
  type: z.enum(categoryTypeValues),
  play_format: z.enum(playFormatValues),
  draw_format: z.enum(drawFormatValues),
  max_entries: z.number().int().min(2).max(256).nullable().optional(),
  min_age: z.number().int().min(5).max(100).nullable().optional(),
  max_age: z.number().int().min(5).max(100).nullable().optional(),
  skill_levels: z.array(z.string()).default([]),
  rubber_lineup: z.array(rubberLineupItemSchema).default([]),
  roster_composition: z.array(rosterCompositionRuleSchema).default([]),
  decider_format: z.enum(['singles', 'doubles']).nullable().optional(),
}).refine((data) => {
  if (data.play_format !== 'team_event') return true;
  if (data.rubber_lineup.length === 0) return false;
  const sequences = data.rubber_lineup.map((r) => r.sequence);
  return new Set(sequences).size === sequences.length;
}, {
  message: 'Team event categories require a non-empty rubber lineup with unique sequence numbers',
  path: ['rubber_lineup'],
});

export const registerTeamSchema = z.object({
  name: z.string().min(2).max(80),
  member_usernames: z.array(z.string().min(2).max(30)).min(1).max(20),
  owner_name: z.string().max(80).nullable().optional(),
});

export const scheduleMatchSchema = z.object({
  match_id: z.string().uuid(),
  court: z.number().int().min(1),
  scheduled_time: z.string().datetime(),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type ScheduleMatchInput = z.infer<typeof scheduleMatchSchema>;
export type RegisterTeamInput = z.infer<typeof registerTeamSchema>;
