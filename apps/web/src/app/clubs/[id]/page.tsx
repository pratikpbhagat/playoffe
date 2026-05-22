import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { AppNav } from '@/components/layout/AppNav';

export const metadata: Metadata = { title: 'Club' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClubPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Fetch club + verify caller is a manager
  const { data: club } = await admin
    .from('clubs')
    .select('*, club_managers!inner(role, player_id)')
    .eq('id', id)
    .eq('club_managers.player_id', user.id)
    .single();

  if (!club) notFound();

  // Fetch this club's tournaments
  const { data: tournaments } = await admin
    .from('tournaments')
    .select('id, name, status, start_date, end_date, display_code')
    .eq('club_id', id)
    .order('start_date', { ascending: false });

  const role = (club.club_managers as { role: string }[])[0]?.role ?? 'manager';

  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Club header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-xl font-black text-white shadow"
              style={{ backgroundColor: club.brand_primary_color }}
            >
              {club.name[0]}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{club.name}</h1>
              <p className="mt-0.5 text-sm text-slate-400">
                {[club.city, club.location].filter(Boolean).join(' · ')}
                {role === 'owner' && (
                  <span className="ml-2 rounded-full bg-brand-600/20 px-2 py-0.5 text-xs font-medium text-brand-300">
                    Owner
                  </span>
                )}
              </p>
            </div>
          </div>

          <Link
            href={`/tournaments/new?club=${id}`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            + New tournament
          </Link>
        </div>

        {club.description && (
          <p className="mb-8 text-sm text-slate-400">{club.description}</p>
        )}

        {/* Tournaments */}
        <div>
          <h2 className="mb-4 text-base font-semibold text-white">Tournaments</h2>

          {!tournaments || tournaments.length === 0 ? (
            <div className="rounded-xl bg-surface-card p-8 text-center ring-1 ring-surface-border">
              <p className="text-sm text-slate-500">
                No tournaments yet.{' '}
                <Link
                  href={`/tournaments/new?club=${id}`}
                  className="text-brand-400 hover:text-brand-300"
                >
                  Create your first one →
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tournaments.map((t) => (
                <Link
                  key={t.id}
                  href={`/tournaments/${t.id}`}
                  className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border hover:ring-brand-500/40 transition-all"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {new Date(t.start_date).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {t.end_date !== t.start_date &&
                        ` – ${new Date(t.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-slate-700 text-slate-300' },
    registration_open: { label: 'Registration open', className: 'bg-blue-900/60 text-blue-300' },
    in_progress: { label: 'In progress', className: 'bg-accent-500/20 text-accent-400' },
    completed: { label: 'Completed', className: 'bg-brand-600/20 text-brand-300' },
    cancelled: { label: 'Cancelled', className: 'bg-red-900/40 text-red-400' },
  };
  const { label, className } = map[status] ?? map.draft;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>
  );
}
