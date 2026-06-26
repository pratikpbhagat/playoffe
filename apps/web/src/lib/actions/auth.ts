'use server';

import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { registerPlayerSchema, type RegisterPlayerInput } from '@pickleball/shared';
import { INITIAL_RATING } from '@pickleball/rating';
import { consumeRateLimit } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/email/service';
import { buildVerifyEmail } from '@/lib/email/templates/verify-email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function registerAction(input: RegisterPlayerInput, returnUrl?: string) {
  const parsed = registerPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password, full_name, username, gender, dob, location } = parsed.data;

  // Cap signup attempts per email — registration creates a real auth user
  // and sends an email, so it's a more expensive/abusable path than a simple read.
  if (!consumeRateLimit(`register:${email.toLowerCase()}`, 5, 10 * 60_000)) {
    return { error: 'Too many signup attempts for this email. Please wait a few minutes and try again.' };
  }

  const admin = createAdminClient();

  const { data: usernameCheck } = await admin.rpc('check_username_available', {
    p_username: username,
  });
  if (!usernameCheck) {
    return { error: 'Username is already taken' };
  }

  // After clicking the email link, send the user to the login page (with a
  // "verified" banner) rather than straight into the app — they still need
  // to log in with their password since registerAction never signs them in.
  const redirectTo = `${APP_URL}/api/auth/confirm?next=${encodeURIComponent('/login?verified=1')}`;

  // generateLink with type 'signup' both creates the auth user (unconfirmed)
  // and returns the confirmation link — replaces the old createUser() call,
  // since we no longer sign the user in immediately.
  const { data: linkData, error: authError } = await admin.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { redirectTo, data: { roles: ['player'] } },
  });

  const authData = { user: linkData?.user ?? null };

  if (authError || !authData.user) {
    if (authError?.message.includes('already')) {
      return { error: 'An account with this email already exists' };
    }
    return { error: 'Failed to create account. Please try again.' };
  }

  await admin.auth.admin.updateUserById(authData.user.id, {
    app_metadata: { roles: ['player'] },
  });

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

  // Don't sign in yet — the account stays unconfirmed until the user clicks
  // the emailed link, which lands on /api/auth/confirm and exchanges the code
  // for a session there.
  const confirmUrl = linkData?.properties?.action_link;
  if (confirmUrl) {
    const payload = buildVerifyEmail({ recipientName: full_name, confirmUrl });
    void sendEmail({ to: email, ...payload }).catch((err) => {
      console.error(`[email] Failed to send verification email to ${email}:`, err);
    });
  }

  return { pendingVerification: true as const, email };
}

export async function resendVerificationAction(email: string, returnUrl?: string) {
  if (!consumeRateLimit(`resend-verify:${email.toLowerCase()}`, 3, 10 * 60_000)) {
    return { error: 'Too many requests. Please wait a few minutes and try again.' };
  }

  const destination = returnUrl && returnUrl.startsWith('/') ? returnUrl : '/dashboard';
  const redirectTo = `${APP_URL}/api/auth/confirm?next=${encodeURIComponent(destination)}`;

  // Use the dedicated resend API rather than admin.generateLink — generateLink
  // with type 'signup' takes a password and would silently reset the user's
  // existing password if called again for an already-created account.
  const supabase = await createClient();
  await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: redirectTo },
  });

  // Resending shouldn't reveal whether the email exists or is already
  // confirmed — always return the same success-shaped output to the caller.
  return { success: true };
}

export async function loginAction(email: string, password: string, returnUrl?: string) {
  if (!consumeRateLimit(`login:${email.toLowerCase()}`, 8, 5 * 60_000)) {
    return { error: 'Too many login attempts. Please wait a few minutes and try again.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      return { error: 'Please verify your email before logging in. Check your inbox for the confirmation link.' };
    }
    return { error: error.message };
  }

  // Super admins land on the platform overview, not the player dashboard
  const isSuperAdminUser = data.user?.app_metadata?.role === 'super_admin';
  const defaultDestination = isSuperAdminUser ? '/superadmin' : '/dashboard';
  const destination = returnUrl && returnUrl.startsWith('/') ? returnUrl : defaultDestination;

  // Return the destination so the client can do a hard navigation (window.location.href),
  // which bypasses the Next.js Router Cache and guarantees a fresh AppNav render.
  return { redirectTo: destination };
}

export async function forgotPasswordAction(email: string) {
  if (!consumeRateLimit(`forgot-password:${email.toLowerCase()}`, 3, 10 * 60_000)) {
    return { error: 'Too many requests. Please wait a few minutes and try again.' };
  }

  const redirectTo = `${APP_URL}/api/auth/confirm?next=${encodeURIComponent('/reset-password')}`;

  const supabase = await createClient();
  // Don't surface whether the email exists to the caller — same {success:true}
  // response either way — but DO log the real error server-side, since
  // Supabase's built-in mailer fails (rate limits, etc.) without bubbling up
  // anything visible to the user otherwise.
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    console.error('[forgot-password] resetPasswordForEmail failed:', error.message);
  }

  return { success: true };
}

export async function resetPasswordAction(password: string) {
  if (password.length < 8) return { error: 'Password must be at least 8 characters' };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error('[reset-password] updateUser failed:', error.message);
    return { error: error.message };
  }

  return { success: true };
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

  // Set password + confirm email + ensure player role is stored in JWT
  const { error: updateAuthErr } = await admin.auth.admin.updateUserById(player.id, {
    password,
    email_confirm: true,
    app_metadata: { roles: ['player'] },
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
