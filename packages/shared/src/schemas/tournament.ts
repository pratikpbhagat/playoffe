import { z } from 'zod';

export const createTournamentSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(1000).nullable().optional(),
  venue: z.string().max(200).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  court_count: z.number().int().min(1).max(50),
  registration_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  max_participants: z.number().int().min(4).max(512).nullable().optional(),
  // Scoring defaults (can be overridden per category)
  scoring_format: z.enum(['rally', 'traditional']).default('rally'),
  num_sets: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(1),
  points_per_set: z.number().int().min(5).max(100).default(11),
}).refine((data) => data.end_date >= data.start_date, {
  message: 'End date must be on or after start date',
  path: ['end_date'],
});

export const createCategorySchema = z.object({
  name: z.string().min(2).max(80),
  type: z.enum(['skill', 'age', 'gender', 'open']),
  play_format: z.enum(['singles', 'doubles', 'mixed_doubles']),
  draw_format: z.enum(['round_robin', 'single_elimination', 'double_elimination', 'group_stage_knockout', 'swiss']),
  max_entries: z.number().int().min(2).max(256).nullable().optional(),
  min_age: z.number().int().min(5).max(100).nullable().optional(),
  max_age: z.number().int().min(5).max(100).nullable().optional(),
  skill_levels: z.array(z.string()).default([]),
});

export const scheduleMatchSchema = z.object({
  match_id: z.string().uuid(),
  court: z.number().int().min(1),
  scheduled_time: z.string().datetime(),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type ScheduleMatchInput = z.infer<typeof scheduleMatchSchema>;
