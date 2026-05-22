import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 bg-surface">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-tight text-white">
          PLAY<span className="text-brand-600">OFFE</span>
        </h1>
        <p className="mt-3 text-lg text-slate-400">
          Tournament management, player network &amp; venue display
        </p>
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-4">
          <Link
            href="/register"
            className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-600 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-surface-card transition-colors"
          >
            Log in
          </Link>
        </div>
        <Link
          href="/events"
          className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          Browse upcoming tournaments →
        </Link>
      </div>
    </main>
  );
}
