export default function ScoringLoading() {
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

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Back link */}
        <div className="mb-6 h-4 w-36 rounded bg-slate-800" />

        {/* Header */}
        <div className="mb-8">
          <div className="h-7 w-52 rounded bg-slate-700" />
          <div className="mt-1 h-4 w-40 rounded bg-slate-800" />
        </div>

        {/* Section: Live */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-4 w-20 rounded bg-slate-700" />
            <div className="h-5 w-5 rounded-full bg-slate-700" />
          </div>
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border">
                <div className="h-5 w-16 rounded bg-slate-700" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-48 rounded bg-slate-700" />
                  <div className="h-3 w-24 rounded bg-slate-800" />
                </div>
                <div className="h-5 w-20 rounded-full bg-slate-700" />
              </div>
            ))}
          </div>
        </div>

        {/* Section: Scheduled */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="h-4 w-24 rounded bg-slate-700" />
            <div className="h-5 w-5 rounded-full bg-slate-700" />
          </div>
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl bg-surface-card px-5 py-4 ring-1 ring-surface-border">
                <div className="h-5 w-16 rounded bg-slate-800" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-40 rounded bg-slate-700" />
                  <div className="h-3 w-20 rounded bg-slate-800" />
                </div>
                <div className="h-5 w-20 rounded-full bg-slate-800" />
              </div>
            ))}
          </div>
        </div>

        {/* Section: Done */}
        <div>
          <div className="mb-3 h-4 w-16 rounded bg-slate-800" />
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl bg-surface-card px-5 py-3 ring-1 ring-surface-border opacity-50">
                <div className="h-5 w-16 rounded bg-slate-800" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-36 rounded bg-slate-800" />
                  <div className="h-3 w-28 rounded bg-slate-800" />
                </div>
                <div className="h-5 w-20 rounded-full bg-slate-800" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
