import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function EditTournamentLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8 space-y-1">
          <div className="h-7 w-44 rounded bg-slate-700" />
          <div className="h-4 w-56 rounded bg-slate-800" />
        </div>
        <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border space-y-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-28 rounded bg-slate-800" />
              <div className="h-10 w-full rounded-lg bg-slate-800" />
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <div className="h-10 w-28 rounded-lg bg-slate-700" />
            <div className="h-10 w-20 rounded-lg bg-slate-800" />
          </div>
        </div>
      </main>
    </div>
  );
}
