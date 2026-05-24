'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface ProfileFormValues {
  full_name: string;
  location: string;
  headline: string;
  bio: string;
  playing_since: string; // string from form input, coerce to int
}

export async function updateProfileAction(values: ProfileFormValues) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const fullName = values.full_name.trim();
  if (!fullName) return { error: 'Name is required' };
  if (fullName.length > 100) return { error: 'Name must be 100 characters or less' };

  const headline = values.headline.trim().slice(0, 120) || null;
  const bio = values.bio.trim().slice(0, 600) || null;
  const location = values.location.trim() || null;
  const playingSince = values.playing_since ? parseInt(values.playing_since, 10) || null : null;

  // Update core player fields
  const { error: playerErr } = await supabase
    .from('players')
    .update({ full_name: fullName, location })
    .eq('id', user.id);

  if (playerErr) return { error: 'Failed to update profile: ' + playerErr.message };

  // Upsert player_profiles (row may not exist yet)
  const { error: profileErr } = await supabase.from('player_profiles').upsert(
    { player_id: user.id, headline, bio, playing_since: playingSince },
    { onConflict: 'player_id' },
  );

  if (profileErr) return { error: 'Failed to update profile details: ' + profileErr.message };

  // Revalidate public profile + dashboard
  const { data: player } = await supabase
    .from('players')
    .select('username')
    .eq('id', user.id)
    .single();
  if (player?.username) revalidatePath(`/p/${player.username}`);
  revalidatePath('/dashboard');

  return { success: true, username: player?.username };
}

export async function uploadAvatarAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { error: 'No file provided' };
  if (file.size > 5 * 1024 * 1024) return { error: 'File must be under 5 MB' };
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    return { error: 'Only JPEG, PNG, WebP or GIF files are accepted' };
  }

  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'gif';
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (uploadErr) return { error: 'Upload failed: ' + uploadErr.message };

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

  // Save URL to players table
  const { error: updateErr } = await supabase.from('players').update({ photo_url: publicUrl }).eq('id', user.id);
  if (updateErr) return { error: 'Failed to save photo URL' };

  // Revalidate
  const { data: player } = await supabase.from('players').select('username').eq('id', user.id).single();
  if (player?.username) revalidatePath(`/p/${player.username}`);
  revalidatePath('/settings/profile');

  return { success: true, url: publicUrl };
}

export async function getOwnProfileAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('players')
    .select('full_name, username, location, photo_url, player_profiles(bio, headline, playing_since)')
    .eq('id', user.id)
    .single();

  return data;
}
