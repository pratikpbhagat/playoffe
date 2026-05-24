import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function PlayerProfileLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-3xl px-4 py-10">
        {/* Profile card */}
        <div className="overflow-hidden rounded-2xl bg-surface-card ring-1 ring-surface-border">
          {/* Banner */}
          <div className="h-28 bg-slate-700" />
          <div className="px-8 pb-8">
            {/* Avatar row */}
            <div className="-mt-14 flex items-end justify-between gap-4">
              <div className="h-28 w-28 shrink-0 rounded-full bg-slate-700 ring-4 ring-surface-card" />
              <div className="mb-1 flex gap-2">
                <div className="h-8 w-24 rounded-lg bg-slate-700" />
                <div className="h-8 w-24 rounded-lg bg-slate-800" />
              </div>
            </div>
            {/* Name */}
            <div className="mt-4 space-y-2">
              <div className="h-7 w-44 rounded bg-slate-700" />
              <div className="h-4 w-28 rounded bg-slate-800" />
              <div className="h-4 w-36 rounded bg-slate-800" />
            </div>
            {/* Stats */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl bg-surface px-4 py-4 text-center ring-1 ring-surface-border">
                  <div className="mx-auto h-7 w-14 rounded bg-slate-700" />
                  <div className="mx-auto mt-1.5 h-3 w-12 rounded bg-slate-800" />
                </div>
              ))}
            </div>
            {/* Format breakdown */}
            <div className="mt-5 rounded-xl bg-surface px-4 py-4 ring-1 ring-surface-border">
              <div className="mb-3 h-3 w-16 rounded bg-slate-800" />
              <div className="grid grid-cols-3 gap-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="text-center space-y-1">
                    <div className="mx-auto h-6 w-8 rounded bg-slate-700" />
                    <div className="mx-auto h-3 w-12 rounded bg-slate-800" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Match history */}
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-3 w-32 rounded bg-slate-800" />
            <div className="h-3 w-16 rounded bg-slate-800" />
          </div>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl bg-surface-card px-5 py-3.5 ring-1 ring-surface-border">
                <div className="h-6 w-8 rounded bg-slate-700" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-36 rounded bg-slate-700" />
                  <div className="h-3 w-24 rounded bg-slate-800" />
                </div>
                <div className="space-y-1 text-right">
                  <div className="h-4 w-12 rounded bg-slate-700" />
                  <div className="h-3 w-10 rounded bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
