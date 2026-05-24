import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function EventDetailLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2">
          <div className="h-4 w-16 rounded bg-slate-800" />
          <div className="h-4 w-2 rounded bg-slate-800" />
          <div className="h-4 w-36 rounded bg-slate-800" />
        </div>
        {/* Event header card */}
        <div className="mb-8 overflow-hidden rounded-2xl bg-surface-card ring-1 ring-surface-border">
          <div className="h-3 w-full bg-slate-700" />
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3 w-28 rounded bg-slate-800" />
                <div className="h-7 w-64 rounded bg-slate-700" />
              </div>
              <div className="h-7 w-24 rounded-full bg-slate-700" />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="h-4 w-36 rounded bg-slate-800" />
              <div className="h-4 w-40 rounded bg-slate-800" />
            </div>
            <div className="flex gap-2">
              <div className="h-6 w-16 rounded bg-slate-800" />
              <div className="h-6 w-20 rounded bg-slate-800" />
            </div>
          </div>
        </div>
        {/* Categories heading */}
        <div className="mb-4 h-4 w-24 rounded bg-slate-800" />
        {/* Category cards */}
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-5 w-44 rounded bg-slate-700" />
                  <div className="flex gap-2">
                    <div className="h-5 w-16 rounded bg-slate-800" />
                    <div className="h-5 w-20 rounded bg-slate-800" />
                  </div>
                </div>
                <div className="h-9 w-28 rounded-lg bg-slate-700" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
