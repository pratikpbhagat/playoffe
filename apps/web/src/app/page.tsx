import Link from 'next/link';
import { Trophy, Zap, Monitor, Users, Check, ChevronRight, Calendar, Star } from 'lucide-react';

// ── Top navigation ────────────────────────────────────────────────────────────
function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-surface-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="text-xl font-black tracking-tight text-white">
          PLAY<span className="text-brand-500">OFFE</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-slate-400 transition-colors hover:text-white">
            Features
          </a>
          <a href="#for-clubs" className="text-sm text-slate-400 transition-colors hover:text-white">
            For Clubs
          </a>
          <a href="#for-players" className="text-sm text-slate-400 transition-colors hover:text-white">
            For Players
          </a>
          <Link href="/events" className="text-sm text-slate-400 transition-colors hover:text-white">
            Events
          </Link>
        </nav>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium text-slate-400 transition-colors hover:text-white sm:block"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-surface px-6 pt-20 text-center">
      {/* Purple glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(109,40,217,0.35) 0%, transparent 65%)',
        }}
      />

      {/* Headline */}
      <h1 className="relative max-w-4xl text-5xl font-black tracking-tight text-white md:text-7xl">
        Run Tournaments.{' '}
        <span className="text-brand-400">Score Live.</span>{' '}
        <span className="text-accent-400">Engage Players.</span>
      </h1>

      {/* Subheading */}
      <p className="relative mt-6 max-w-2xl text-lg leading-relaxed text-slate-400 md:text-xl">
        Everything a club or organiser needs — automated draws, live scoring, venue display
        screens, referee management, and a growing player network. All in one platform.
      </p>

      {/* CTAs */}
      <div className="relative mt-10 flex flex-col items-center gap-4 sm:flex-row">
        <Link
          href="/register"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-900/40 transition-all hover:bg-brand-700 hover:shadow-brand-900/60"
        >
          Get started free
          <ChevronRight className="h-4 w-4" />
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-8 py-3.5 text-base font-semibold text-slate-300 transition-all hover:border-slate-500 hover:bg-surface-card hover:text-white"
        >
          Log in
        </Link>
      </div>

      {/* Browse link */}
      <Link
        href="/events"
        className="relative mt-5 text-sm text-slate-500 transition-colors hover:text-slate-300"
      >
        Browse upcoming tournaments →
      </Link>

      {/* Stats strip */}
      <div className="relative mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
        {[
          { value: '100+', label: 'Tournaments hosted' },
          { value: '5,000+', label: 'Players registered' },
          { value: '50+', label: 'Clubs on platform' },
          { value: 'Real-time', label: 'Live scoring' },
        ].map((stat, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="hidden text-surface-border sm:inline">·</span>}
            <span className="font-bold text-slate-300">{stat.value}</span>
            <span>{stat.label}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Trophy,
    title: 'Draw Generation',
    body: 'Auto-generate group stage + knockout brackets in seconds. Seed by DUPR rating, handle byes, and support round-robin, Swiss, and single or double elimination.',
  },
  {
    icon: Zap,
    title: 'Live Scoring',
    body: 'Referees score from any device using a simple PIN. Real-time updates push instantly to the admin hub and the venue display screen — no refresh required.',
  },
  {
    icon: Monitor,
    title: 'Venue Display Screen',
    body: 'One URL, any TV or projector. Standings, live scores, bracket, full schedule, and announcements — all auto-rotating and updated in real time.',
  },
  {
    icon: Users,
    title: 'Player Network',
    body: 'DUPR-style skill ratings, doubles partner invites, player profiles, and registration management — everything players need in one place.',
  },
];

function Features() {
  return (
    <section id="features" className="bg-surface py-24">
      <div className="mx-auto max-w-5xl px-6">
        {/* Eyebrow + title */}
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-400">
            Features
          </p>
          <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">
            Everything your tournament needs
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            From registrations to the final scoreboard — handle every aspect of a pickleball
            tournament without juggling spreadsheets or separate tools.
          </p>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-2xl bg-surface-card p-6 ring-1 ring-surface-border transition-all hover:ring-brand-500/40"
            >
              <div className="mb-4 inline-flex rounded-xl bg-brand-900/60 p-3 text-brand-400 transition-colors group-hover:bg-brand-900/90">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-base font-bold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── For Clubs / For Players ───────────────────────────────────────────────────
const ORGANISER_BULLETS = [
  'Auto-generate draws from your entry list',
  'Assign referees with PIN-based mobile access',
  'Manage scheduling across multiple courts',
  'Live scoring visible on every venue screen',
];

const PLAYER_BULLETS = [
  'Browse and register for local tournaments',
  'Track your skill rating across events',
  'Invite doubles and mixed doubles partners',
  'View live brackets and real-time results',
];

function AudienceSection() {
  return (
    <section id="for-clubs" className="bg-surface py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">
            Built for every role in the game
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Whether you're running an eight-court facility or looking for your next doubles
            tournament, PLAYOFFE has you covered.
          </p>
        </div>

        <div id="for-players" className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* For Organisers */}
          <div className="rounded-2xl bg-brand-950/50 p-8 ring-1 ring-brand-800/40">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-400">
              For Organisers
            </p>
            <h3 className="mb-4 text-2xl font-black text-white">
              Run your tournament,{' '}
              <span className="text-brand-300">your way.</span>
            </h3>
            <ul className="mb-8 space-y-3">
              {ORGANISER_BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-slate-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                  {b}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Start organising
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* For Players */}
          <div
            className="rounded-2xl p-8 ring-1"
            style={{
              background: 'rgba(5, 30, 15, 0.7)',
              borderColor: 'rgba(22, 163, 74, 0.25)',
            }}
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-accent-400">
              For Players
            </p>
            <h3 className="mb-4 text-2xl font-black text-white">
              Find events.{' '}
              <span className="text-accent-400">Track your game.</span>
            </h3>
            <ul className="mb-8 space-y-3">
              {PLAYER_BULLETS.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-slate-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-400" />
                  {b}
                </li>
              ))}
            </ul>
            <Link
              href="/events"
              className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-700"
            >
              Browse events
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── CTA banner ────────────────────────────────────────────────────────────────
function CTABanner() {
  return (
    <section className="relative overflow-hidden bg-brand-900 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 50% 100%, rgba(109,40,217,0.5) 0%, transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-800/60 px-4 py-1.5 ring-1 ring-brand-700/50">
          <Star className="h-3.5 w-3.5 text-brand-300" />
          <span className="text-xs font-semibold text-brand-300">Free to get started</span>
        </div>
        <h2 className="text-3xl font-black text-white md:text-4xl">
          Ready to run your next tournament?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-brand-300">
          Create an account, add your club, and generate your first draw — all in under ten
          minutes.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-bold text-brand-700 transition-all hover:bg-brand-50"
          >
            Create a free account
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-700/60 px-8 py-3.5 text-base font-semibold text-brand-200 transition-all hover:border-brand-600 hover:bg-brand-800/40"
          >
            <Calendar className="h-4 w-4" />
            Browse events
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-surface-border bg-surface-card">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          {/* Brand */}
          <div>
            <p className="text-xl font-black text-white">
              PLAY<span className="text-brand-500">OFFE</span>
            </p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
              Professional tournament management, live scoring, and player networking for
              pickleball.
            </p>
          </div>

          {/* Platform links */}
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">
              Platform
            </p>
            <ul className="space-y-2.5">
              {[
                { label: 'Browse Events', href: '/events' },
                { label: 'Player Rankings', href: '/rankings' },
                { label: 'Player Feed', href: '/feed' },
              ].map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-slate-400 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account links */}
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">
              Account
            </p>
            <ul className="space-y-2.5">
              {[
                { label: 'Log in', href: '/login' },
                { label: 'Register', href: '/register' },
                { label: 'Dashboard', href: '/dashboard' },
              ].map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-slate-400 transition-colors hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 border-t border-surface-border pt-6 text-center text-xs text-slate-600">
          © {new Date().getFullYear()} PLAYOFFE · All rights reserved
        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <>
      <LandingNav />
      <Hero />
      <Features />
      <AudienceSection />
      <CTABanner />
      <Footer />
    </>
  );
}
