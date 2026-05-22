export default function TournamentLoading() {
  return (
    <div className="min-h-screen bg-surface animate-pulse">
      {/* Nav skeleton */}
      <div className="border-b border-surface-border bg-surface-card px-6 py-3.5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
          <div className="h-5 w-28 rounded bg-slate-700" />
          <div className="hidden gap-5 sm:flex">
            <div className="h-4 w-20 rounded bg-slate-700" />
            <div className="h-4 w-28 rounded bg-slate-700" />
          </div>
          <div className="h-7 w-24 rounded bg-slate-700" />
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2">
          <div className="h-4 w-24 rounded bg-slate-800" />
          <div className="h-4 w-2 rounded bg-slate-800" />
          <div className="h-4 w-36 rounded bg-slate-800" />
        </div>

        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-7 w-64 rounded bg-slate-700" />
              <div className="h-5 w-20 rounded-full bg-slate-700" />
            </div>
            <div className="h-4 w-48 rounded bg-slate-800" />
          </div>
          <div className="h-9 w-40 rounded-lg bg-slate-700" />
        </div>

        {/* Stat cards */}
        <div className="mb-10 grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
              <div className="h-7 w-12 rounded bg-slate-700" />
              <div className="mt-2 h-3 w-20 rounded bg-slate-800" />
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="mb-10 flex gap-3">
          <div className="h-9 w-28 rounded-lg bg-slate-800" />
          <div className="h-9 w-36 rounded-lg bg-slate-800" />
        </div>

        {/* Categories header */}
        <div className="flex items-center justify-between">
          <div className="h-5 w-24 rounded bg-slate-700" />
          <div className="h-8 w-32 rounded-lg bg-slate-800" />
        </div>

        {/* Category rows */}
        <div className="mt-4 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border">
              <div className="space-y-1.5">
                <div className="h-4 w-40 rounded bg-slate-700" />
                <div className="h-3 w-28 rounded bg-slate-800" />
              </div>
              <div className="h-4 w-8 rounded bg-slate-800" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
