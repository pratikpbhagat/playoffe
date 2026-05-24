import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Welcome heading */}
        <div className="mb-8 flex items-center gap-3">
          <div className="h-8 w-56 rounded bg-slate-700" />
          <div className="h-6 w-6 rounded bg-slate-800" />
        </div>

        {/* Stats row */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-card px-5 py-5 ring-1 ring-surface-border">
              <div className="h-8 w-16 rounded bg-slate-700" />
              <div className="mt-2 h-3 w-20 rounded bg-slate-800" />
            </div>
          ))}
        </div>

        {/* My registrations */}
        <div className="mb-8 rounded-xl bg-surface-card p-6 ring-1 ring-surface-border">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-4 w-32 rounded bg-slate-700" />
            <div className="h-4 w-24 rounded bg-slate-800" />
          </div>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-t border-surface-border first:border-0">
              <div className="space-y-1.5">
                <div className="h-4 w-40 rounded bg-slate-700" />
                <div className="h-3 w-28 rounded bg-slate-800" />
              </div>
              <div className="h-6 w-20 rounded-full bg-slate-700" />
            </div>
          ))}
        </div>

        {/* Bottom 3-col grid */}
        <div className="grid gap-6 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
              <div className="mb-4 flex items-center justify-between">
                <div className="h-4 w-24 rounded bg-slate-700" />
                <div className="h-4 w-8 rounded bg-slate-800" />
              </div>
              {[...Array(3)].map((__, j) => (
                <div key={j} className="flex items-center gap-3 py-2 border-t border-surface-border first:border-0">
                  <div className="h-7 w-7 rounded-full bg-slate-700 shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3.5 w-28 rounded bg-slate-700" />
                    <div className="h-3 w-16 rounded bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
