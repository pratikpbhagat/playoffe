'use server';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

export interface CreateClubInput {
  name: string;
  city?: string;
  location?: string;
  description?: string;
  brand_primary_color?: string;
}

export async function createClubAction(input: CreateClubInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { name, city, location, description, brand_primary_color = '#7c3aed' } = input;

  if (!name || name.trim().length < 2) {
    return { error: 'Club name must be at least 2 characters' };
  }

  const admin = createAdminClient();

  // Generate a unique slug
  const baseSlug = slugify(name.trim());
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const { data: existing } = await admin
      .from('clubs')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!existing) break;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }

  const { data: club, error: clubError } = await admin
    .from('clubs')
    .insert({
      name: name.trim(),
      slug,
      city: city?.trim() || null,
      location: location?.trim() || null,
      description: description?.trim() || null,
      brand_primary_color,
      brand_secondary_color: '#22c55e',
    })
    .select('id')
    .single();

  if (clubError || !club) {
    return { error: 'Failed to create club. Please try again.' };
  }

  // Register creator as owner
  await admin.from('club_managers').insert({
    club_id: club.id,
    player_id: user.id,
    role: 'owner',
  });

  redirect(`/clubs/${club.id}`);
}

export async function getMyClubs() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from('club_managers')
    .select('clubs(id, name, slug, brand_primary_color, city, location)')
    .eq('player_id', user.id)
    .order('added_at', { ascending: false });

  return (data ?? []).flatMap((m) => (m.clubs ? [m.clubs] : []));
}
