import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function ScheduleLoading() {
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
        <div className="mb-6 flex items-center justify-between">
          <div className="h-7 w-32 rounded bg-slate-700" />
          <div className="h-8 w-28 rounded-lg bg-slate-700" />
        </div>
        {/* Round groups */}
        {[...Array(3)].map((_, r) => (
          <div key={r} className="mb-8">
            <div className="mb-3 h-4 w-24 rounded bg-slate-800" />
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl bg-surface-card px-5 py-3.5 ring-1 ring-surface-border">
                  <div className="h-4 w-8 rounded bg-slate-800 shrink-0" />
                  <div className="flex-1 flex items-center justify-between gap-4">
                    <div className="h-4 w-28 rounded bg-slate-700" />
                    <div className="h-3 w-8 rounded bg-slate-800" />
                    <div className="h-4 w-28 rounded bg-slate-700" />
                  </div>
                  <div className="h-3 w-12 rounded bg-slate-800 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
