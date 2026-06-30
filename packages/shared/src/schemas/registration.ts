import { z } from 'zod';

export const csvImportRowSchema = z.object({
  full_name: z.string().min(2).max(100),
  email: z.string().email(),
  category: z.string().min(1).optional().nullable(),
  gender: z.enum(['male', 'female', 'other', 'Male', 'Female', 'Other', 'M', 'F']).transform((v) =>
    v.toLowerCase() === 'm' || v.toLowerCase() === 'male' ? 'male' :
    v.toLowerCase() === 'f' || v.toLowerCase() === 'female' ? 'female' : 'other'
  ),
  dob: z.string().optional().nullable(),
  club: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  skill_rating: z.string().optional().nullable().transform((v) => (v ? parseFloat(v) : null)),
});

export const teamCsvImportRowSchema = csvImportRowSchema.extend({
  team_name: z.string().min(2).max(80),
  owner_name: z.string().max(80).optional().nullable(),
  is_captain: z.string().optional().nullable(),
});

export const bulkImportSchema = z.object({
  tournament_id: z.string().uuid(),
  rows: z.array(csvImportRowSchema).min(1).max(512),
});

export const selfRegisterEntrySchema = z.object({
  tournament_id: z.string().uuid(),
  category_id: z.string().uuid(),
  partner_email: z.string().email().optional(),
});

export type CsvImportRow = z.infer<typeof csvImportRowSchema>;
export type TeamCsvImportRow = z.infer<typeof teamCsvImportRowSchema>;
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
export type SelfRegisterEntryInput = z.infer<typeof selfRegisterEntrySchema>;
