'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export type FeedPost = {
  id: string;
  player_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  player_name: string;
  player_username: string;
  player_photo_url: string | null;
  like_count: number;
  comment_count: number;
  viewer_liked: boolean;
  comments: FeedComment[];
};

export type FeedComment = {
  id: string;
  post_id: string;
  player_id: string;
  body: string;
  created_at: string;
  player_name: string;
  player_username: string;
};

// Helper: typed query builder for tables not in generated schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any;
function fromAny(client: ReturnType<typeof createAdminClient>, table: string): AnyTable {
  return (client as AnyTable).from(table);
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getFeedPostsAction(
  scope: 'following' | 'all' = 'following',
): Promise<FeedPost[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  let scopedPlayerIds: string[] | null = null;

  if (scope === 'following' && user) {
    const { data: follows } = await admin
      .from('player_follows')
      .select('following_id')
      .eq('follower_id', user.id);
    const ids = (follows ?? []).map((f) => f.following_id as string);
    scopedPlayerIds = [user.id, ...ids];
  }

  // Fetch posts
  let postsQ = fromAny(admin, 'feed_posts')
    .select('id, player_id, body, image_url, created_at')
    .order('created_at', { ascending: false })
    .limit(40);

  if (scopedPlayerIds) {
    postsQ = postsQ.in('player_id', scopedPlayerIds);
  }

  const { data: posts } = (await postsQ) as { data: Array<{ id: string; player_id: string; body: string; image_url: string | null; created_at: string }> | null };

  if (!posts || posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);

  // Collect player IDs
  const playerIds = [...new Set(posts.map((p) => p.player_id))];
  const { data: players } = await admin
    .from('players')
    .select('id, full_name, username, photo_url')
    .in('id', playerIds);
  const playerMap = new Map((players ?? []).map((p) => [p.id, p]));

  // Fetch all likes for these posts
  const { data: likes } = (await fromAny(admin, 'post_likes')
    .select('post_id, player_id')
    .in('post_id', postIds)) as { data: Array<{ post_id: string; player_id: string }> | null };

  const likesArr = likes ?? [];
  const likeCountMap = new Map<string, number>();
  const viewerLikedSet = new Set<string>();
  for (const like of likesArr) {
    likeCountMap.set(like.post_id, (likeCountMap.get(like.post_id) ?? 0) + 1);
    if (user && like.player_id === user.id) viewerLikedSet.add(like.post_id);
  }

  // Fetch all comments for these posts
  const { data: comments } = (await fromAny(admin, 'post_comments')
    .select('id, post_id, player_id, body, created_at')
    .in('post_id', postIds)
    .order('created_at', { ascending: true })) as {
    data: Array<{ id: string; post_id: string; player_id: string; body: string; created_at: string }> | null;
  };

  const commentsArr = comments ?? [];
  const commentsByPost = new Map<string, typeof commentsArr>();
  for (const c of commentsArr) {
    const existing = commentsByPost.get(c.post_id) ?? [];
    existing.push(c);
    commentsByPost.set(c.post_id, existing);
  }

  // Batch-fetch commenter names we don't already have
  const commenterIds = [...new Set(commentsArr.map((c) => c.player_id).filter((id) => !playerMap.has(id)))];
  if (commenterIds.length > 0) {
    const { data: commenters } = await admin
      .from('players')
      .select('id, full_name, username, photo_url')
      .in('id', commenterIds);
    for (const cp of commenters ?? []) {
      playerMap.set(cp.id, cp);
    }
  }

  return posts.map((post) => {
    const p = playerMap.get(post.player_id);
    const postComments = (commentsByPost.get(post.id) ?? []).map((c) => {
      const cp = playerMap.get(c.player_id);
      return {
        id: c.id,
        post_id: c.post_id,
        player_id: c.player_id,
        body: c.body,
        created_at: c.created_at,
        player_name: cp?.full_name ?? 'Unknown',
        player_username: (cp as { username?: string } | undefined)?.username ?? 'unknown',
      };
    });

    return {
      id: post.id,
      player_id: post.player_id,
      body: post.body,
      image_url: post.image_url,
      created_at: post.created_at,
      player_name: p?.full_name ?? 'Unknown',
      player_username: (p as { username?: string } | undefined)?.username ?? 'unknown',
      player_photo_url: (p as { photo_url?: string | null } | undefined)?.photo_url ?? null,
      like_count: likeCountMap.get(post.id) ?? 0,
      comment_count: commentsByPost.get(post.id)?.length ?? 0,
      viewer_liked: viewerLikedSet.has(post.id),
      comments: postComments,
    };
  });
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createPostAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const body = (formData.get('body') as string | null)?.trim();
  if (!body || body.length === 0) return { error: 'Post body is required' };
  if (body.length > 500) return { error: 'Post must be 500 characters or fewer' };

  const imageFile = formData.get('image') as File | null;
  let image_url: string | null = null;

  if (imageFile && imageFile.size > 0) {
    if (imageFile.size > 5 * 1024 * 1024) return { error: 'Image must be under 5 MB' };
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(imageFile.type)) {
      return { error: 'Only JPEG, PNG, WebP or GIF images are accepted' };
    }
    const ext = imageFile.name.split('.').pop() ?? 'jpg';
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('post-images')
      .upload(path, imageFile, { upsert: false, contentType: imageFile.type });
    if (uploadErr) return { error: 'Image upload failed: ' + uploadErr.message };
    const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path);
    image_url = urlData.publicUrl;
  }

  const { error } = (await fromAny(supabase as unknown as ReturnType<typeof createAdminClient>, 'feed_posts').insert({
    player_id: user.id,
    body,
    image_url,
  })) as { error: { message: string } | null };

  if (error) return { error: error.message };

  revalidatePath('/feed');
  return { success: true as const };
}

export async function deletePostAction(postId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = (await fromAny(supabase as unknown as ReturnType<typeof createAdminClient>, 'feed_posts')
    .delete()
    .eq('id', postId)
    .eq('player_id', user.id)) as { error: { message: string } | null };

  if (error) return { error: error.message };
  revalidatePath('/feed');
  return { success: true as const };
}

export async function toggleLikeAction(postId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const sc = supabase as unknown as ReturnType<typeof createAdminClient>;

  // Check if already liked
  const { data: existing } = (await fromAny(sc, 'post_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('player_id', user.id)
    .maybeSingle()) as { data: { post_id: string } | null };

  if (existing) {
    await fromAny(sc, 'post_likes').delete().eq('post_id', postId).eq('player_id', user.id);
  } else {
    await fromAny(sc, 'post_likes').insert({ post_id: postId, player_id: user.id });
  }

  revalidatePath('/feed');
  return { success: true as const };
}

export async function addCommentAction(postId: string, body: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const trimmed = body.trim().slice(0, 300);
  if (!trimmed) return { error: 'Comment cannot be empty' };

  const sc = supabase as unknown as ReturnType<typeof createAdminClient>;
  const { data: inserted, error } = (await fromAny(sc, 'post_comments')
    .insert({ post_id: postId, player_id: user.id, body: trimmed })
    .select('id, post_id, player_id, body, created_at')
    .single()) as { data: { id: string; post_id: string; player_id: string; body: string; created_at: string } | null; error: { message: string } | null };

  if (error || !inserted) return { error: error?.message ?? 'Insert failed' };

  // Fetch player info for the returned comment
  const { data: player } = await supabase
    .from('players')
    .select('full_name, username')
    .eq('id', user.id)
    .single();

  revalidatePath('/feed');
  return {
    success: true as const,
    comment: {
      id: inserted.id,
      post_id: inserted.post_id,
      player_id: inserted.player_id,
      body: inserted.body,
      created_at: inserted.created_at,
      player_name: player?.full_name ?? 'Unknown',
      player_username: player?.username ?? 'unknown',
    } satisfies FeedComment,
  };
}

export async function deleteCommentAction(commentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const sc = supabase as unknown as ReturnType<typeof createAdminClient>;
  const { error } = (await fromAny(sc, 'post_comments')
    .delete()
    .eq('id', commentId)
    .eq('player_id', user.id)) as { error: { message: string } | null };

  if (error) return { error: error.message };
  revalidatePath('/feed');
  return { success: true as const };
}
