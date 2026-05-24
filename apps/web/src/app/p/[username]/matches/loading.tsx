import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function MatchHistoryLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-3xl px-4 py-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2">
          <div className="h-4 w-28 rounded bg-slate-800" />
          <div className="h-4 w-2 rounded bg-slate-800" />
          <div className="h-4 w-24 rounded bg-slate-800" />
        </div>
        {/* Header */}
        <div className="mb-6">
          <div className="h-7 w-40 rounded bg-slate-700" />
          <div className="mt-1.5 h-4 w-48 rounded bg-slate-800" />
        </div>
        {/* Format tabs */}
        <div className="mb-6 flex gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-7 w-20 rounded-full bg-slate-700" />
          ))}
        </div>
        {/* Match rows */}
        <div className="rounded-xl bg-surface-card ring-1 ring-surface-border overflow-hidden">
          <div className="divide-y divide-surface-border">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="h-6 w-9 rounded bg-slate-700" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-40 rounded bg-slate-700" />
                  <div className="h-3 w-32 rounded bg-slate-800" />
                </div>
                <div className="space-y-1 text-right">
                  <div className="h-4 w-12 rounded bg-slate-700" />
                  <div className="h-3 w-10 rounded bg-slate-800" />
                </div>
                <div className="h-3 w-12 rounded bg-slate-800 hidden sm:block" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
