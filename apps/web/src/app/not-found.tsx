import Link from 'next/link';
import { AppNav } from '@/components/layout/AppNav';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface">
      <AppNav />

      <main className="flex flex-col items-center justify-center px-6 py-32 text-center">
        {/* Large 404 */}
        <p className="text-[8rem] font-black leading-none text-surface-card select-none">
          404
        </p>

        {/* Paddle emoji as visual accent */}
        <p className="mt-2 text-5xl">🏓</p>

        <h1 className="mt-6 text-2xl font-bold text-white">Page not found</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-500">
          That page doesn't exist or you don't have permission to view it.
        </p>

        <div className="mt-8 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Go to dashboard
          </Link>
          <Link
            href="/"
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            Home
          </Link>
        </div>
      </main>
    </div>
  );
}
