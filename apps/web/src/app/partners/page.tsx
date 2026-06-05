import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';
import { PartnerActions } from '@/components/player/PartnerActions';
import { PartnerFilters } from '@/components/player/PartnerFilters';
import { getPartnerSuggestionsAction } from '@/lib/actions/partners';

export const metadata: Metadata = { title: 'Partner Matching · PLAYOFFE' };

interface Props {
  searchParams: Promise<{ gender?: string; location?: string; format?: string }>;
}

export default async function PartnersPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const sp = await searchParams;
  const filterGender = (sp.gender as 'male' | 'female' | 'other' | undefined) ?? undefined;
  const filterLocation = sp.location?.trim() ?? undefined;
  const filterFormat = (sp.format as 'singles' | 'doubles' | undefined) ?? undefined;

  // Suggestions with optional filters
  const { players, myRating, sentIds } = await getPartnerSuggestionsAction({
    gender: filterGender,
    location: filterLocation,
    format: filterFormat,
  });

  // Incoming requests (to me, pending)
  const { data: incoming } = await admin
    .from('partner_requests')
    .select('id, from_player_id, message, created_at, status')
    .eq('to_player_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  // Accepted partners
  const { data: accepted } = await admin
    .from('partner_requests')
    .select('id, from_player_id, to_player_id, status, created_at')
    .or(`from_player_id.eq.${user.id},to_player_id.eq.${user.id}`)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false });

  // Sent pending requests
  const { data: sent } = await admin
    .from('partner_requests')
    .select('id, to_player_id, message, created_at, status')
    .eq('from_player_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  // Resolve player names for requests
  const reqPlayerIds = [
    ...(incoming ?? []).map((r) => r.from_player_id),
    ...(accepted ?? []).flatMap((r) => [r.from_player_id, r.to_player_id]),
    ...(sent ?? []).map((r) => r.to_player_id),
  ];
  const uniqueIds = [...new Set(reqPlayerIds.filter((id) => id !== user.id))];

  const { data: reqPlayers } = uniqueIds.length > 0
    ? await admin.from('players').select('id, full_name, username').in('id', uniqueIds)
    : { data: [] };

  const reqPlayerMap = new Map((reqPlayers ?? []).map((p) => [p.id, p]));

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white">Doubles Partner Matching</h1>
          <p className="mt-1 text-sm text-slate-500">
            Find doubles partners within ±0.75 of your rating ({myRating?.toFixed(2) ?? '—'})
          </p>
        </div>

        {/* Incoming requests */}
        {(incoming ?? []).length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-amber-400">
              Partner requests ({incoming!.length})
            </h2>
            <div className="space-y-2">
              {incoming!.map((req) => {
                const p = reqPlayerMap.get(req.from_player_id);
                return (
                  <div key={req.id} className="flex items-center gap-4 rounded-xl bg-surface-card px-5 py-4 ring-1 ring-amber-500/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {p ? (
                          <Link href={`/p/${p.username}`} className="hover:text-brand-300">{p.full_name}</Link>
                        ) : 'Unknown'}
                      </p>
                      {req.message && <p className="mt-0.5 text-xs text-slate-400 italic">"{req.message}"</p>}
                    </div>
                    <PartnerActions requestId={req.id} mode="respond" />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Accepted partners */}
        {(accepted ?? []).length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent-400">
              My partners ({accepted!.length})
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {accepted!.map((req) => {
                const partnerId = req.from_player_id === user.id ? req.to_player_id : req.from_player_id;
                const p = reqPlayerMap.get(partnerId);
                return (
                  <div key={req.id} className="flex items-center gap-3 rounded-xl bg-surface-card px-4 py-3 ring-1 ring-accent-500/20">
                    <span className="text-lg">🤝</span>
                    <div className="min-w-0">
                      {p ? (
                        <Link href={`/p/${p.username}`} className="text-sm font-semibold text-white hover:text-brand-300">
                          {p.full_name}
                        </Link>
                      ) : <p className="text-sm text-slate-400">Unknown</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Filter bar */}
        <Suspense fallback={null}>
          <PartnerFilters
            currentGender={sp.gender ?? ''}
            currentLocation={sp.location ?? ''}
            currentFormat={sp.format ?? ''}
          />
        </Suspense>

        {/* Suggestions */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Suggested partners
          </h2>

          {players.length === 0 ? (
            <div className="rounded-xl bg-surface-card p-10 text-center ring-1 ring-surface-border">
              <p className="text-2xl mb-2">🎾</p>
              <p className="text-sm text-slate-500">No suggestions yet. Play more matches to improve your rating and find compatible partners.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {players.map((p) => {
                const rating = p.stats?.current_rating?.toFixed(2) ?? '—';
                const doublesWinRate = p.stats?.doubles_matches
                  ? `${Math.round((p.stats.doubles_wins / p.stats.doubles_matches) * 100)}%`
                  : null;
                const alreadySent = sentIds.has(p.id);

                return (
                  <div key={p.id} className="rounded-xl bg-surface-card px-4 py-3 ring-1 ring-surface-border">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="shrink-0">
                        {p.photo_url ? (
                          <div className="relative h-9 w-9 overflow-hidden rounded-full">
                            <Image src={p.photo_url} alt={p.full_name} fill className="object-cover" />
                          </div>
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-sm font-bold text-brand-300">
                            {p.full_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <Link href={`/p/${p.username}`} className="text-sm font-semibold text-white hover:text-brand-300 transition-colors truncate">
                            {p.full_name}
                          </Link>
                          <span className="shrink-0 rounded-full bg-brand-600/20 px-2 py-0.5 text-xs font-medium text-brand-300">
                            {rating}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-xs text-slate-500">@{p.username}</p>
                          {p.location && <p className="text-xs text-slate-600">· 📍 {p.location}</p>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {doublesWinRate && (
                            <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-slate-400">
                              {doublesWinRate} WR
                            </span>
                          )}
                          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-slate-500">
                            {p.stats?.total_matches ?? 0} matches
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex gap-2">
                      {alreadySent ? (
                        <span className="text-xs text-slate-500 italic">Request sent</span>
                      ) : (
                        <PartnerActions targetId={p.id} mode="send" />
                      )}
                      <Link
                        href={`/p/${p.username}`}
                        className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-400 hover:bg-surface hover:text-white transition-colors"
                      >
                        View profile
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
