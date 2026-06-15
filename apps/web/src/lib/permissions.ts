/**
 * Role-based permission checks backed by the `role_permissions` table.
 *
 * Club-level overrides take precedence over global defaults.
 * Always uses the admin client so RLS does not interfere.
 */

import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Returns true if the given role is allowed to perform the action identified
 * by (feature, subFeature) — optionally scoped to a specific club.
 *
 * Resolution order:
 *   1. Club-level override (scope = 'club', club_id = clubId) — if present, wins
 *   2. Global default (scope = 'global')
 *   3. Falls back to `defaultValue` when no row exists at all
 *
 * Memoized per request via React's `cache()` so repeated checks for the same
 * (role, feature, subFeature, clubId) within one render don't re-query.
 */
export const checkPermission = cache(async function checkPermission(
  role: string,
  feature: string,
  subFeature: string,
  clubId?: string,
  defaultValue = true,
): Promise<boolean> {
  const admin = createAdminClient();

  // Fetch both global and club-level rows in one query
  const { data } = await (admin.from('role_permissions' as any) as any)
    .select('is_enabled, scope, club_id')
    .eq('role', role)
    .eq('feature', feature)
    .eq('sub_feature', subFeature) as {
      data: Array<{
        is_enabled: boolean;
        scope: string;
        club_id: string | null;
      }> | null;
    };

  if (!data || data.length === 0) return defaultValue;

  // Prefer club-level override if clubId provided
  if (clubId) {
    const clubRow = data.find((r) => r.scope === 'club' && r.club_id === clubId);
    if (clubRow) return clubRow.is_enabled;
  }

  // Fall back to global
  const globalRow = data.find((r) => r.scope === 'global');
  if (globalRow) return globalRow.is_enabled;

  return defaultValue;
});
