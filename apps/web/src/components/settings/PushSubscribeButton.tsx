'use client';

import { useEffect, useState, useTransition } from 'react';
import { subscribeToPushAction, unsubscribeFromPushAction } from '@/lib/actions/push';

// VAPID public key must be base64url-encoded
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushSubscribeButton() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setSupported(true);

    // Check existing subscription
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) {
          setSubscribed(true);
          setCurrentEndpoint(sub.endpoint);
        }
      });
    });
  }, []);

  if (!supported) {
    return (
      <p className="text-xs text-slate-500">
        Push notifications are not supported in this browser.
      </p>
    );
  }

  async function handleSubscribe() {
    setError(null);
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setError('Push notifications are not configured on this server.');
      return;
    }

    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setError('Notification permission denied. Please allow notifications in your browser settings.');
          return;
        }

        // Register the service worker (no-op if already registered)
        await navigator.serviceWorker.register('/sw.js');
        const reg = await navigator.serviceWorker.ready;
        const keyBytes = urlBase64ToUint8Array(vapidKey);
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes as unknown as ArrayBuffer,
        });

        const { endpoint, keys } = sub.toJSON() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };

        const result = await subscribeToPushAction({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
        if ('error' in result) {
          setError((result as { error: string }).error);
          return;
        }

        setSubscribed(true);
        setCurrentEndpoint(endpoint ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to subscribe to push notifications');
      }
    });
  }

  async function handleUnsubscribe() {
    setError(null);
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          const endpoint = currentEndpoint ?? sub.endpoint;
          await unsubscribeFromPushAction(endpoint);
        }
        setSubscribed(false);
        setCurrentEndpoint(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
      }
    });
  }

  return (
    <div className="space-y-2">
      {subscribed ? (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-accent-400">
            <span className="h-2 w-2 rounded-full bg-accent-500 inline-block" />
            Push notifications enabled
          </span>
          <button
            onClick={handleUnsubscribe}
            disabled={isPending}
            className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-40 transition-colors"
          >
            Disable
          </button>
        </div>
      ) : (
        <button
          onClick={handleSubscribe}
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          {isPending ? 'Enabling…' : 'Enable push notifications'}
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <p className="text-xs text-slate-600">
        Receive browser notifications for match results, partner requests, and more.
        {!subscribed && ' A service worker will be registered for this.'}
      </p>
    </div>
  );
}
