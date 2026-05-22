'use server';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { registerPlayerSchema, type RegisterPlayerInput } from '@pickleball/shared';
import { INITIAL_RATING } from '@pickleball/rating';

export async function registerAction(input: RegisterPlayerInput, returnUrl?: string) {
  const parsed = registerPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password, full_name, username, gender, dob, location } = parsed.data;

  const admin = createAdminClient();

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
    current_rating: INITIAL_RATING,
    peak_rating: INITIAL_RATING,
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

  const destination = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/dashboard';
  redirect(destination);
}

export async function loginAction(email: string, password: string, returnUrl?: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  const destination = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/dashboard';
  redirect(destination);
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

export async function claimAccountAction({
  token,
  password,
  username,
}: {
  token: string;
  password: string;
  username: string;
}) {
  if (password.length < 8) return { error: 'Password must be at least 8 characters' };
  if (!/^[a-z0-9-]{3,}$/.test(username)) return { error: 'Invalid username format' };

  const admin = createAdminClient();

  // Re-fetch player by token (authoritative check)
  const { data: player, error: fetchErr } = await admin
    .from('players')
    .select('id, email, username, is_provisional, provisional_expires_at')
    .eq('provisional_claim_token', token)
    .single();

  if (fetchErr || !player) return { error: 'Invalid or expired claim link' };
  if (!player.is_provisional) return { error: 'This account has already been claimed' };
  if (
    player.provisional_expires_at &&
    new Date(player.provisional_expires_at) < new Date()
  ) {
    return { error: 'This invite link has expired. Please contact your organiser.' };
  }

  // If username changed, check availability
  if (username !== player.username) {
    const { data: available } = await admin.rpc('check_username_available', {
      p_username: username,
    });
    if (!available) return { error: 'Username is already taken' };
  }

  // Set password + confirm email on the auth user
  const { error: updateAuthErr } = await admin.auth.admin.updateUserById(player.id, {
    password,
    email_confirm: true,
  });
  if (updateAuthErr) return { error: 'Failed to set password. Please try again.' };

  // Mark player as claimed
  const { error: updatePlayerErr } = await admin
    .from('players')
    .update({
      is_provisional: false,
      provisional_claim_token: null,
      provisional_expires_at: null,
      username,
      updated_at: new Date().toISOString(),
    })
    .eq('id', player.id);

  if (updatePlayerErr) return { error: 'Failed to activate account. Please try again.' };

  // Sign in the newly activated player
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: player.email,
    password,
  });
  if (signInErr) return { error: 'Account activated! Please log in.' };

  redirect('/dashboard');
}
