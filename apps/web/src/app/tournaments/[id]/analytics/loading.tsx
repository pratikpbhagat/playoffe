import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function AnalyticsLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2">
          <div className="h-4 w-36 rounded bg-slate-800" />
          <div className="h-4 w-2 rounded bg-slate-800" />
          <div className="h-4 w-20 rounded bg-slate-800" />
        </div>
        <div className="mb-8 h-7 w-28 rounded bg-slate-700" />
        {/* Stat cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-card px-5 py-5 ring-1 ring-surface-border">
              <div className="h-8 w-14 rounded bg-slate-700" />
              <div className="mt-2 h-3 w-20 rounded bg-slate-800" />
            </div>
          ))}
        </div>
        {/* Category breakdown */}
        <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
          <div className="mb-4 h-4 w-36 rounded bg-slate-700" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2 border-t border-surface-border first:border-0">
                <div className="h-4 w-40 rounded bg-slate-700 flex-1" />
                <div className="h-3 w-full max-w-xs rounded-full bg-slate-800 flex-1" />
                <div className="h-4 w-8 rounded bg-slate-800" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
