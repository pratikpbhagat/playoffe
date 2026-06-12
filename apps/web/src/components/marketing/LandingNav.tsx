import Link from 'next/link';

export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-surface-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="text-xl font-black tracking-tight text-white">
          PLAY<span className="text-brand-500">OFFE</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/#features" className="text-sm text-slate-400 transition-colors hover:text-white">
            Features
          </Link>
          <Link href="/#for-clubs" className="text-sm text-slate-400 transition-colors hover:text-white">
            For Clubs
          </Link>
          <Link href="/#for-players" className="text-sm text-slate-400 transition-colors hover:text-white">
            For Players
          </Link>
          <Link href="/events" className="text-sm text-slate-400 transition-colors hover:text-white">
            Events
          </Link>
          <Link href="/pricing" className="text-sm text-slate-400 transition-colors hover:text-white">
            Pricing
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
