import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function ClubLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Club header */}
        <div className="mb-8 flex items-start gap-5">
          <div className="h-16 w-16 rounded-xl bg-slate-700 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-7 w-48 rounded bg-slate-700" />
            <div className="h-4 w-32 rounded bg-slate-800" />
            <div className="flex gap-2 mt-1">
              <div className="h-5 w-20 rounded-full bg-slate-800" />
              <div className="h-5 w-16 rounded-full bg-slate-800" />
            </div>
          </div>
          <div className="h-9 w-32 rounded-lg bg-slate-700" />
        </div>
        {/* Tournaments section */}
        <div className="mb-4 flex items-center justify-between">
          <div className="h-4 w-28 rounded bg-slate-800" />
          <div className="h-8 w-28 rounded-lg bg-slate-700" />
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border">
              <div className="space-y-1.5">
                <div className="h-5 w-44 rounded bg-slate-700" />
                <div className="h-3 w-28 rounded bg-slate-800" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-6 w-20 rounded-full bg-slate-800" />
                <div className="h-8 w-8 rounded-lg bg-slate-800" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
