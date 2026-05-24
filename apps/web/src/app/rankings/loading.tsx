import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function RankingsLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="h-8 w-36 rounded bg-slate-700" />
          <div className="mt-2 h-4 w-64 rounded bg-slate-800" />
        </div>
        {/* Filter tabs */}
        <div className="mb-6 flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 w-24 rounded-full bg-slate-700" />
          ))}
        </div>
        {/* Rankings table */}
        <div className="overflow-hidden rounded-xl bg-surface-card ring-1 ring-surface-border">
          <div className="border-b border-surface-border px-5 py-3 grid grid-cols-12 gap-4">
            <div className="col-span-1 h-3 w-6 rounded bg-slate-800" />
            <div className="col-span-7 h-3 w-16 rounded bg-slate-800" />
            <div className="col-span-2 h-3 w-10 rounded bg-slate-800 text-right" />
            <div className="col-span-2 h-3 w-12 rounded bg-slate-800 text-right" />
          </div>
          {[...Array(15)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-surface-border last:border-0">
              <div className="w-8 shrink-0 h-4 w-6 rounded bg-slate-800" />
              <div className="flex items-center gap-3 flex-1">
                <div className="h-8 w-8 rounded-full bg-slate-700 shrink-0" />
                <div className="space-y-1">
                  <div className="h-4 w-32 rounded bg-slate-700" />
                  <div className="h-3 w-20 rounded bg-slate-800" />
                </div>
              </div>
              <div className="h-5 w-12 rounded bg-slate-700 shrink-0" />
              <div className="h-4 w-10 rounded bg-slate-800 shrink-0" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
