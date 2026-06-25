import { NextRequest, NextResponse } from 'next/server';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { upsertSocialConnectionAction } from '@/lib/actions/social';
import type { OAuthPlatform } from '@/lib/social-types';

// ── Shared result type from token exchange ────────────────────────────────────

interface TokenResult {
  platformUserId: string;
  platformUsername: string | null;
  platformDisplayName: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
}

// ── Instagram ─────────────────────────────────────────────────────────────────
// Docs: https://developers.facebook.com/docs/instagram-basic-display-api/guides/getting-access-tokens-and-permissions

async function exchangeInstagram(code: string, callbackUrl: string): Promise<TokenResult> {
  // Step 1: short-lived token (valid 1 hour)
  const shortForm = new URLSearchParams({
    client_id:     process.env.INSTAGRAM_CLIENT_ID!,
    client_secret: process.env.INSTAGRAM_CLIENT_SECRET!,
    grant_type:    'authorization_code',
    redirect_uri:  callbackUrl,
    code,
  });

  const shortRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: shortForm.toString(),
  });

  if (!shortRes.ok) {
    const txt = await shortRes.text();
    throw new Error(`Instagram short-token exchange failed: ${txt}`);
  }

  const { access_token: shortToken, user_id } = (await shortRes.json()) as {
    access_token: string;
    user_id: number;
  };

  // Step 2: exchange for long-lived token (valid 60 days, renewable)
  const longUrl = new URL('https://graph.instagram.com/access_token');
  longUrl.searchParams.set('grant_type',    'ig_exchange_token');
  longUrl.searchParams.set('client_secret', process.env.INSTAGRAM_CLIENT_SECRET!);
  longUrl.searchParams.set('access_token',  shortToken);

  const longRes = await fetch(longUrl.toString());
  if (!longRes.ok) {
    const txt = await longRes.text();
    throw new Error(`Instagram long-token exchange failed: ${txt}`);
  }

  const { access_token, expires_in } = (await longRes.json()) as {
    access_token: string;
    expires_in: number;
  };

  // Step 3: fetch display username
  const userUrl = new URL('https://graph.instagram.com/me');
  userUrl.searchParams.set('fields',       'id,username');
  userUrl.searchParams.set('access_token', access_token);

  const userRes = await fetch(userUrl.toString());
  const userJson = userRes.ok ? ((await userRes.json()) as { id: string; username?: string }) : null;

  return {
    platformUserId:      String(userJson?.id ?? user_id),
    platformUsername:    userJson?.username ?? null,
    platformDisplayName: userJson?.username ? `@${userJson.username}` : null,
    accessToken:         access_token,
    refreshToken:        null, // Instagram long-lived tokens refresh via a separate endpoint
    tokenExpiresAt:      expires_in ? new Date(Date.now() + expires_in * 1000) : null,
    scopes:              ['user_profile', 'user_media'],
  };
}

// ── Facebook ──────────────────────────────────────────────────────────────────
// Docs: https://developers.facebook.com/docs/facebook-login/guides/access-tokens

async function exchangeFacebook(code: string, callbackUrl: string): Promise<TokenResult> {
  // Step 1: exchange code for access token
  const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
  tokenUrl.searchParams.set('client_id',     process.env.FACEBOOK_CLIENT_ID!);
  tokenUrl.searchParams.set('redirect_uri',  callbackUrl);
  tokenUrl.searchParams.set('client_secret', process.env.FACEBOOK_CLIENT_SECRET!);
  tokenUrl.searchParams.set('code',          code);

  const tokenRes = await fetch(tokenUrl.toString());
  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    throw new Error(`Facebook token exchange failed: ${txt}`);
  }

  const { access_token, expires_in } = (await tokenRes.json()) as {
    access_token: string;
    expires_in?: number;
  };

  // Step 2: exchange for long-lived token
  const longUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
  longUrl.searchParams.set('grant_type',    'fb_exchange_token');
  longUrl.searchParams.set('client_id',     process.env.FACEBOOK_CLIENT_ID!);
  longUrl.searchParams.set('client_secret', process.env.FACEBOOK_CLIENT_SECRET!);
  longUrl.searchParams.set('fb_exchange_token', access_token);

  const longRes = await fetch(longUrl.toString());
  const longJson = longRes.ok
    ? ((await longRes.json()) as { access_token: string; expires_in?: number })
    : null;

  const finalToken = longJson?.access_token ?? access_token;
  const finalExpiry = longJson?.expires_in ?? expires_in;

  // Step 3: get user info
  const userUrl = new URL('https://graph.facebook.com/me');
  userUrl.searchParams.set('fields',       'id,name');
  userUrl.searchParams.set('access_token', finalToken);

  const userRes = await fetch(userUrl.toString());
  const userJson = userRes.ok
    ? ((await userRes.json()) as { id: string; name?: string })
    : null;

  return {
    platformUserId:      userJson?.id ?? 'unknown',
    platformUsername:    null,
    platformDisplayName: userJson?.name ?? null,
    accessToken:         finalToken,
    refreshToken:        null,
    tokenExpiresAt:      finalExpiry ? new Date(Date.now() + finalExpiry * 1000) : null,
    scopes:              ['public_profile', 'pages_manage_posts', 'pages_read_engagement'],
  };
}

// ── X (Twitter) ───────────────────────────────────────────────────────────────
// Docs: https://developer.twitter.com/en/docs/authentication/oauth-2-0/authorization-code

async function exchangeX(
  code: string,
  callbackUrl: string,
  codeVerifier: string,
): Promise<TokenResult> {
  // Step 1: exchange code + PKCE verifier for tokens
  const tokenBody = new URLSearchParams({
    code,
    grant_type:    'authorization_code',
    redirect_uri:  callbackUrl,
    code_verifier: codeVerifier,
  });

  // X uses HTTP Basic auth: base64(client_id:client_secret)
  const basicAuth = Buffer.from(
    `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`,
  ).toString('base64');

  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: tokenBody.toString(),
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    throw new Error(`X token exchange failed: ${txt}`);
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token:  string;
    refresh_token?: string;
    expires_in?:   number;
    scope?:        string;
  };

  // Step 2: fetch user info
  const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=username,name', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });

  const userJson = userRes.ok
    ? ((await userRes.json()) as { data?: { id: string; username?: string; name?: string } })
    : null;

  const userData = userJson?.data;

  return {
    platformUserId:      userData?.id ?? 'unknown',
    platformUsername:    userData?.username ? `@${userData.username}` : null,
    platformDisplayName: userData?.name ?? null,
    accessToken:         tokenJson.access_token,
    refreshToken:        tokenJson.refresh_token ?? null,
    tokenExpiresAt:      tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000)
      : null,
    scopes:              tokenJson.scope?.split(' ') ?? [],
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { platform: string } },
) {
  const { platform } = params;
  const url = new URL(req.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Provider returned an error (e.g. user denied)
  if (error) {
    const desc = url.searchParams.get('error_description') ?? error;
    return NextResponse.redirect(
      new URL(`/settings/social?error=${encodeURIComponent(desc)}`, req.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/social?error=missing_code', req.url),
    );
  }

  // Validate state — decode and verify player session
  let statePayload: { playerId: string; ts: number };
  try {
    statePayload = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch {
    return NextResponse.redirect(
      new URL('/settings/social?error=invalid_state', req.url),
    );
  }

  // State must be less than 15 minutes old
  if (Date.now() - statePayload.ts > 15 * 60 * 1000) {
    return NextResponse.redirect(
      new URL('/settings/social?error=state_expired', req.url),
    );
  }

  // Verify the current session matches the player who initiated the flow
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user || user.id !== statePayload.playerId) {
    return NextResponse.redirect(
      new URL('/settings/social?error=session_mismatch', req.url),
    );
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')!}`).replace(/\/$/, '');
  const callbackUrl = `${appUrl}/api/social/callback/${platform}`;

  // ── Token exchange ──────────────────────────────────────────────────────────
  let tokenResult: TokenResult;
  try {
    if (platform === 'instagram') {
      tokenResult = await exchangeInstagram(code, callbackUrl);
    } else if (platform === 'facebook') {
      tokenResult = await exchangeFacebook(code, callbackUrl);
    } else if (platform === 'x') {
      // Read PKCE code_verifier from cookie
      const codeVerifier = req.cookies.get(`pkce_x`)?.value;
      if (!codeVerifier) {
        return NextResponse.redirect(
          new URL('/settings/social?error=pkce_missing', req.url),
        );
      }
      tokenResult = await exchangeX(code, callbackUrl, codeVerifier);
    } else {
      return NextResponse.redirect(
        new URL('/settings/social?error=invalid_platform', req.url),
      );
    }
  } catch (e) {
    console.error(`[social/callback/${platform}]`, e);
    return NextResponse.redirect(
      new URL('/settings/social?error=connection_failed', req.url),
    );
  }

  // ── Persist connection ──────────────────────────────────────────────────────
  const result = await upsertSocialConnectionAction({
    playerId:             user.id,
    platform:             platform as OAuthPlatform,
    platformUserId:       tokenResult.platformUserId,
    platformUsername:     tokenResult.platformUsername,
    platformDisplayName:  tokenResult.platformDisplayName,
    accessToken:          tokenResult.accessToken,
    refreshToken:         tokenResult.refreshToken,
    tokenExpiresAt:       tokenResult.tokenExpiresAt,
    scopes:               tokenResult.scopes,
  });

  if (result.error) {
    console.error(`[social/callback/${platform}] upsert error:`, result.error);
    return NextResponse.redirect(
      new URL(`/settings/social?error=${encodeURIComponent(result.error)}`, req.url),
    );
  }

  // Clear the PKCE cookie (X only)
  const successResponse = NextResponse.redirect(
    new URL(`/settings/social?connected=${platform}`, req.url),
  );
  successResponse.cookies.delete(`pkce_${platform}`);
  return successResponse;
}
