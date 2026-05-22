import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/server';
import { ClaimForm } from '@/components/auth/ClaimForm';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Claim your account' };

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ClaimPage({ params }: Props) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: player } = await admin
    .from('players')
    .select('id, email, full_name, username, is_provisional, provisional_expires_at')
    .eq('provisional_claim_token', token)
    .single();

  // ── Invalid token ──────────────────────────────────────────────────
  if (!player) {
    return (
      <Shell>
        <StatusCard
          icon="🔗"
          title="Invalid link"
          body="This claim link doesn't exist or has already been used."
          cta={{ href: '/login', label: 'Go to login' }}
        />
      </Shell>
    );
  }

  // ── Already claimed ────────────────────────────────────────────────
  if (!player.is_provisional) {
    return (
      <Shell>
        <StatusCard
          icon="✅"
          title="Account already active"
          body={`${player.email} already has an active PLAYOFFE account. Log in to continue.`}
          cta={{ href: '/login', label: 'Log in' }}
        />
      </Shell>
    );
  }

  // ── Expired ────────────────────────────────────────────────────────
  const isExpired =
    player.provisional_expires_at != null &&
    new Date(player.provisional_expires_at) < new Date();

  if (isExpired) {
    return (
      <Shell>
        <StatusCard
          icon="⏳"
          title="Link expired"
          body="This invite link has expired. Contact your tournament organiser to request a new one."
          cta={{ href: '/login', label: 'Go to login' }}
        />
      </Shell>
    );
  }

  // ── Valid — show the claim form ────────────────────────────────────
  return (
    <Shell>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-white">
            PLAY<span className="text-brand-600">OFFE</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">Activate your account</p>
        </div>

        <div className="rounded-xl bg-surface-card px-8 py-8 ring-1 ring-surface-border">
          <div className="mb-6 rounded-lg bg-brand-600/10 border border-brand-600/30 px-4 py-3">
            <p className="text-sm text-brand-300">
              You've been registered for a tournament. Set a password to activate your
              PLAYOFFE account as <strong>{player.email}</strong>.
            </p>
          </div>

          <ClaimForm
            token={token}
            playerId={player.id}
            email={player.email}
            fullName={player.full_name}
            defaultUsername={player.username}
          />
        </div>
      </div>
    </Shell>
  );
}

// ── Shared layout shell ────────────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-12">
      {children}
    </div>
  );
}

// ── Status card (invalid / expired / already claimed) ─────────────────────────
function StatusCard({
  icon,
  title,
  body,
  cta,
}: {
  icon: string;
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="w-full max-w-md rounded-xl bg-surface-card px-8 py-10 text-center ring-1 ring-surface-border">
      <div className="mb-4 text-5xl">{icon}</div>
      <h1 className="text-xl font-bold text-white">{title}</h1>
      <p className="mt-3 text-sm text-slate-400">{body}</p>
      <Link
        href={cta.href}
        className="mt-6 inline-block rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        {cta.label}
      </Link>
    </div>
  );
}
