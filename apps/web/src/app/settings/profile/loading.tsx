import { NavSkeleton } from '@/components/layout/NavSkeleton';

export default function SettingsProfileLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      <NavSkeleton />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8 space-y-1">
          <div className="h-7 w-36 rounded bg-slate-700" />
          <div className="h-4 w-52 rounded bg-slate-800" />
        </div>
        <div className="space-y-6">
          {/* Avatar section */}
          <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border flex items-center gap-5">
            <div className="h-16 w-16 rounded-full bg-slate-700 shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-32 rounded bg-slate-700" />
              <div className="h-3 w-48 rounded bg-slate-800" />
            </div>
            <div className="h-8 w-24 rounded-lg bg-slate-700" />
          </div>
          {/* Form fields */}
          <div className="rounded-xl bg-surface-card p-6 ring-1 ring-surface-border space-y-5">
            <div className="h-4 w-28 rounded bg-slate-700" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-24 rounded bg-slate-800" />
                <div className="h-10 w-full rounded-lg bg-slate-800" />
              </div>
            ))}
            <div className="pt-2">
              <div className="h-10 w-28 rounded-lg bg-slate-700" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
