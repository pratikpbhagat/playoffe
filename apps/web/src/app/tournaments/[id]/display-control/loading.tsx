import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function DisplayControlLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-2xl px-6 py-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2">
          <div className="h-4 w-36 rounded bg-slate-800" />
          <div className="h-4 w-2 rounded bg-slate-800" />
          <div className="h-4 w-28 rounded bg-slate-800" />
        </div>
        <div className="mb-8 space-y-2">
          <div className="h-7 w-40 rounded bg-slate-700" />
          <div className="h-4 w-64 rounded bg-slate-800" />
        </div>
        {/* QR / display code card */}
        <div className="mb-6 rounded-xl bg-surface-card p-6 ring-1 ring-surface-border flex gap-6 items-center">
          <div className="h-28 w-28 rounded-xl bg-slate-700 shrink-0" />
          <div className="space-y-3 flex-1">
            <div className="h-5 w-32 rounded bg-slate-700" />
            <div className="h-4 w-48 rounded bg-slate-800" />
            <div className="h-8 w-28 rounded-lg bg-slate-700" />
          </div>
        </div>
        {/* Slide controls */}
        <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border space-y-4">
          <div className="h-4 w-28 rounded bg-slate-700" />
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-slate-800" />
            ))}
          </div>
          <div className="h-px bg-surface-border" />
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 rounded bg-slate-800" />
            <div className="h-8 w-20 rounded-lg bg-slate-700" />
          </div>
        </div>
      </main>
    </div>
  );
}
