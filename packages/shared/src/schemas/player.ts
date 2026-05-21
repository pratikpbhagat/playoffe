import { z } from 'zod';

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Username can only contain lowercase letters, numbers, and hyphens')
  .refine((val) => !val.includes('--'), 'Username cannot contain consecutive hyphens');

export const registerPlayerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  username: usernameSchema,
  gender: z.enum(['male', 'female', 'other']),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
});

export const updatePlayerProfileSchema = z.object({
  bio: z.string().max(600).nullable().optional(),
  headline: z.string().max(120).nullable().optional(),
  playing_since: z.number().int().min(1990).max(new Date().getFullYear()).nullable().optional(),
  preferred_style: z.string().max(100).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
});

export const claimProvisionalSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2).max(100),
  username: usernameSchema,
  gender: z.enum(['male', 'female', 'other']),
});

export type RegisterPlayerInput = z.infer<typeof registerPlayerSchema>;
export type UpdatePlayerProfileInput = z.infer<typeof updatePlayerProfileSchema>;
export type ClaimProvisionalInput = z.infer<typeof claimProvisionalSchema>;
