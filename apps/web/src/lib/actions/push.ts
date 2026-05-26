'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';

type PushSub = { endpoint: string; p256dh: string; auth: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromAny(client: any, table: string) {
  return client.from(table);
}

export async function subscribeToPushAction(subscription: PushSub) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  const { error } = (await fromAny(admin, 'push_subscriptions').upsert(
    {
      player_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
    { onConflict: 'endpoint' },
  )) as { error: { message: string } | null };

  if (error) return { error: error.message };
  return { success: true as const };
}

export async function unsubscribeFromPushAction(endpoint: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  const { error } = (await fromAny(admin, 'push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('player_id', user.id)) as { error: { message: string } | null };

  if (error) return { error: error.message };
  return { success: true as const };
}

/**
 * Send a web push notification to all subscriptions for a given player.
 * Requires VAPID keys to be configured in env:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL
 *
 * To generate VAPID keys:
 *   npx web-push generate-vapid-keys
 *
 * This function gracefully no-ops if web-push is not installed or VAPID
 * keys are not set — in-app notifications still work without it.
 */
export async function sendPushToPlayer(
  playerId: string,
  title: string,
  body: string,
  url = '/',
) {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL;

  if (!vapidPublicKey || !vapidPrivateKey || !vapidEmail) {
    // VAPID not configured — skip silently
    return;
  }

  const admin = createAdminClient();
  const { data: subs } = (await fromAny(admin, 'push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('player_id', playerId)) as {
    data: Array<{ endpoint: string; p256dh: string; auth: string }> | null;
  };

  if (!subs || subs.length === 0) return;

  // Dynamically import web-push to keep the server action lightweight.
  // Generate keys with: cd apps/web && node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log(k)"
  try {
    const webpush = await import('web-push');
    webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({ title, body, url });

    await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        ),
      ),
    );
  } catch {
    // web-push not installed or send failed — ignore
  }
}
