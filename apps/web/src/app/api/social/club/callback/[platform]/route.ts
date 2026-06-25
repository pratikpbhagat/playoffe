import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient, getCurrentUser } from '@/lib/supabase/server';
import { upsertClubSocialConnectionAction } from '@/lib/actions/social';
import type { OAuthPlatform } from '@/lib/social-types';

// ── Token exchange (mirrors player callback) ──────────────────────────────────

interface TokenResult {
  platformUserId: string;
  platformUsername: string | null;
  platformDisplayName: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
}

async function exchangeInstagram(code: string, callbackUrl: string): Promise<TokenResult> {
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
  if (!shortRes.ok) throw new Error(`Instagram short-token: ${await shortRes.text()}`);
  const { access_token: shortToken, user_id } = (await shortRes.json()) as { access_token: string; user_id: number };

  const longUrl = new URL('https://graph.instagram.com/access_token');
  longUrl.searchParams.set('grant_type',    'ig_exchange_token');
  longUrl.searchParams.set('client_secret', process.env.INSTAGRAM_CLIENT_SECRET!);
  longUrl.searchParams.set('access_token',  shortToken);
  const longRes = await fetch(longUrl.toString());
  if (!longRes.ok) throw new Error(`Instagram long-token: ${await longRes.text()}`);
  const { access_token, expires_in } = (await longRes.json()) as { access_token: string; expires_in: number };

  const userUrl = new URL('https://graph.instagram.com/me');
  userUrl.searchParams.set('fields', 'id,username');
  userUrl.searchParams.set('access_token', access_token);
  const userRes = await fetch(userUrl.toString());
  const userJson = userRes.ok ? ((await userRes.json()) as { id: string; username?: string }) : null;

  return {
    platformUserId:      String(userJson?.id ?? user_id),
    platformUsername:    userJson?.username ?? null,
    platformDisplayName: userJson?.username ? `@${userJson.username}` : null,
    accessToken:         access_token,
    refreshToken:        null,
    tokenExpiresAt:      expires_in ? new Date(Date.now() + expires_in * 1000) : null,
    scopes:              ['user_profile', 'user_media'],
  };
}

async function exchangeFacebook(code: string, callbackUrl: string): Promise<TokenResult> {
  const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
  tokenUrl.searchParams.set('client_id',     process.env.FACEBOOK_CLIENT_ID!);
  tokenUrl.searchParams.set('redirect_uri',  callbackUrl);
  tokenUrl.searchParams.set('client_secret', process.env.FACEBOOK_CLIENT_SECRET!);
  tokenUrl.searchParams.set('code',          code);
  const tokenRes = await fetch(tokenUrl.toString());
  if (!tokenRes.ok) throw new Error(`Facebook token: ${await tokenRes.text()}`);
  const { access_token, expires_in } = (await tokenRes.json()) as { access_token: string; expires_in?: number };

  const longUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
  longUrl.searchParams.set('grant_type',       'fb_exchange_token');
  longUrl.searchParams.set('client_id',        process.env.FACEBOOK_CLIENT_ID!);
  longUrl.searchParams.set('client_secret',    process.env.FACEBOOK_CLIENT_SECRET!);
  longUrl.searchParams.set('fb_exchange_token', access_token);
  const longRes  = await fetch(longUrl.toString());
  const longJson = longRes.ok ? ((await longRes.json()) as { access_token: string; expires_in?: number }) : null;
  const finalToken  = longJson?.access_token ?? access_token;
  const finalExpiry = longJson?.expires_in ?? expires_in;

  const userUrl = new URL('https://graph.facebook.com/me');
  userUrl.searchParams.set('fields', 'id,name');
  userUrl.searchParams.set('access_token', finalToken);
  const userRes  = await fetch(userUrl.toString());
  const userJson = userRes.ok ? ((await userRes.json()) as { id: string; name?: string }) : null;

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

async function exchangeX(code: string, callbackUrl: string, codeVerifier: string): Promise<TokenResult> {
  const tokenBody = new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: callbackUrl, code_verifier: codeVerifier });
  const basicAuth = Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth}` },
    body: tokenBody.toString(),
  });
  if (!tokenRes.ok) throw new Error(`X token: ${await tokenRes.text()}`);
  const tokenJson = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

  const userRes  = await fetch('https://api.twitter.com/2/users/me?user.fields=username,name', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userJson = userRes.ok ? ((await userRes.json()) as { data?: { id: string; username?: string; name?: string } }) : null;
  const userData = userJson?.data;

  return {
    platformUserId:      userData?.id ?? 'unknown',
    platformUsername:    userData?.username ? `@${userData.username}` : null,
    platformDisplayName: userData?.name ?? null,
    accessToken:         tokenJson.access_token,
    refreshToken:        tokenJson.refresh_token ?? null,
    tokenExpiresAt:      tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000) : null,
    scopes:              tokenJson.scope?.split(' ') ?? [],
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { platform: string } },
) {
  const { platform } = params;
  const url   = new URL(req.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/settings/profile?error=${encodeURIComponent(error)}`, req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings/profile?error=missing_code', req.url));
  }

  // Validate state
  let statePayload: { clubId: string; clubSlug: string; userId: string; ts: number };
  try {
    statePayload = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch {
    return NextResponse.redirect(new URL('/settings/profile?error=invalid_state', req.url));
  }

  if (Date.now() - statePayload.ts > 15 * 60 * 1000) {
    return NextResponse.redirect(
      new URL(`/clubs/${statePayload.clubSlug}/settings?error=state_expired`, req.url),
    );
  }

  // Verify the user who initiated the flow is still logged in
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user || user.id !== statePayload.userId) {
    return NextResponse.redirect(
      new URL(`/clubs/${statePayload.clubSlug}/settings?error=session_mismatch`, req.url),
    );
  }

  // Verify user is still a club manager
  const admin = createAdminClient();
  const { data: mgr } = await admin
    .from('club_managers')
    .select('role')
    .eq('club_id', statePayload.clubId)
    .eq('player_id', user.id)
    .maybeSingle();

  if (!mgr) {
    return NextResponse.redirect(
      new URL(`/clubs/${statePayload.clubSlug}/settings?error=permission_denied`, req.url),
    );
  }

  const appUrl      = (process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')!}`).replace(/\/$/, '');
  const callbackUrl = `${appUrl}/api/social/club/callback/${platform}`;

  // Token exchange
  let tokenResult: TokenResult;
  try {
    if (platform === 'instagram') {
      tokenResult = await exchangeInstagram(code, callbackUrl);
    } else if (platform === 'facebook') {
      tokenResult = await exchangeFacebook(code, callbackUrl);
    } else if (platform === 'x') {
      const codeVerifier = req.cookies.get(`pkce_club_x`)?.value;
      if (!codeVerifier) {
        return NextResponse.redirect(
          new URL(`/clubs/${statePayload.clubSlug}/settings?error=pkce_missing`, req.url),
        );
      }
      tokenResult = await exchangeX(code, callbackUrl, codeVerifier);
    } else {
      return NextResponse.redirect(
        new URL(`/clubs/${statePayload.clubSlug}/settings?error=invalid_platform`, req.url),
      );
    }
  } catch (e) {
    console.error(`[social/club/callback/${platform}]`, e);
    return NextResponse.redirect(
      new URL(`/clubs/${statePayload.clubSlug}/settings?error=connection_failed`, req.url),
    );
  }

  // Persist
  const result = await upsertClubSocialConnectionAction({
    clubId:               statePayload.clubId,
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
    console.error(`[social/club/callback/${platform}] upsert error:`, result.error);
    return NextResponse.redirect(
      new URL(`/clubs/${statePayload.clubSlug}/settings?error=${encodeURIComponent(result.error)}`, req.url),
    );
  }

  // Clear PKCE cookie
  const response = NextResponse.redirect(
    new URL(`/clubs/${statePayload.clubSlug}/settings?connected=${platform}`, req.url),
  );
  response.cookies.delete(`pkce_club_${platform}`);
  return response;
}
