'use server';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { registerPlayerSchema, type RegisterPlayerInput } from '@pickleball/shared';
import { getInitialRating } from '@pickleball/rating';

export async function registerAction(input: RegisterPlayerInput) {
  const parsed = registerPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password, full_name, username, gender, dob, location } = parsed.data;

  const admin = await createAdminClient();

  const { data: usernameCheck } = await admin.rpc('check_username_available', {
    p_username: username,
  });
  if (!usernameCheck) {
    return { error: 'Username is already taken' };
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });

  if (authError || !authData.user) {
    if (authError?.message.includes('already')) {
      return { error: 'An account with this email already exists' };
    }
    return { error: 'Failed to create account. Please try again.' };
  }

  const { error: profileError } = await admin.from('players').insert({
    id: authData.user.id,
    email,
    username,
    full_name,
    gender,
    dob: dob ?? null,
    location: location ?? null,
    role: 'player',
    is_provisional: false,
    provisional_expires_at: null,
    provisional_claim_token: null,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: 'Failed to create player profile. Please try again.' };
  }

  await admin.from('global_stats').insert({
    player_id: authData.user.id,
    total_matches: 0,
    wins: 0,
    losses: 0,
    win_rate: 0,
    current_rating: getInitialRating(),
    peak_rating: getInitialRating(),
    singles_matches: 0,
    singles_wins: 0,
    doubles_matches: 0,
    doubles_wins: 0,
    mixed_doubles_matches: 0,
    mixed_doubles_wins: 0,
    updated_at: new Date().toISOString(),
  });

  await admin.from('player_profiles').insert({
    player_id: authData.user.id,
    bio: null,
    headline: null,
    career_history: [],
    certifications: [],
    playing_since: null,
    preferred_style: null,
    updated_at: new Date().toISOString(),
  });

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });

  redirect('/dashboard');
}

export async function loginAction(email: string, password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect('/dashboard');
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function checkUsernameAction(username: string): Promise<{ available: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('check_username_available', { p_username: username });
  if (error) return { available: false };
  return { available: data };
}
