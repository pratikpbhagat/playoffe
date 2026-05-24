import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function RegistrationsLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2">
          <div className="h-4 w-36 rounded bg-slate-800" />
          <div className="h-4 w-2 rounded bg-slate-800" />
          <div className="h-4 w-28 rounded bg-slate-800" />
        </div>
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="h-7 w-40 rounded bg-slate-700" />
          <div className="h-8 w-32 rounded-lg bg-slate-700" />
        </div>
        {/* Category tabs */}
        <div className="mb-6 flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 w-28 rounded-full bg-slate-700" />
          ))}
        </div>
        {/* Entry rows */}
        <div className="overflow-hidden rounded-xl bg-surface-card ring-1 ring-surface-border">
          <div className="border-b border-surface-border px-5 py-3 flex gap-4">
            <div className="h-3 w-32 rounded bg-slate-800" />
            <div className="ml-auto h-3 w-16 rounded bg-slate-800" />
            <div className="h-3 w-20 rounded bg-slate-800" />
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-surface-border last:border-0">
              <div className="h-8 w-8 rounded-full bg-slate-700 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-36 rounded bg-slate-700" />
                <div className="h-3 w-24 rounded bg-slate-800" />
              </div>
              <div className="h-6 w-20 rounded-full bg-slate-800" />
              <div className="h-7 w-20 rounded-lg bg-slate-800" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
