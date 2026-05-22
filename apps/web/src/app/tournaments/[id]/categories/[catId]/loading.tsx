export default function CategoryLoading() {
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
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2">
          <div className="h-4 w-20 rounded bg-slate-800" />
          <div className="h-4 w-2 rounded bg-slate-800" />
          <div className="h-4 w-32 rounded bg-slate-800" />
          <div className="h-4 w-2 rounded bg-slate-800" />
          <div className="h-4 w-28 rounded bg-slate-800" />
        </div>

        {/* Header */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-7 w-48 rounded bg-slate-700" />
              <div className="h-5 w-16 rounded-full bg-slate-700" />
            </div>
            <div className="h-4 w-40 rounded bg-slate-800" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 rounded-lg bg-slate-700" />
            <div className="h-9 w-28 rounded-lg bg-slate-700" />
          </div>
        </div>

        {/* Entry count chip */}
        <div className="mb-6 flex items-center gap-3">
          <div className="h-6 w-24 rounded-full bg-slate-800" />
        </div>

        {/* Entry list rows */}
        <div className="mb-8 space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-3.5 ring-1 ring-surface-border">
              <div className="flex items-center gap-3">
                <div className="h-4 w-5 rounded bg-slate-700" />
                <div>
                  <div className="h-4 w-36 rounded bg-slate-700" />
                  <div className="mt-1 h-3 w-24 rounded bg-slate-800" />
                </div>
              </div>
              <div className="h-7 w-7 rounded bg-slate-800" />
            </div>
          ))}
        </div>

        {/* Add player form skeleton */}
        <div className="rounded-xl bg-surface-card p-5 ring-1 ring-surface-border">
          <div className="mb-3 h-4 w-32 rounded bg-slate-700" />
          <div className="flex gap-2">
            <div className="h-9 flex-1 rounded-lg bg-slate-800" />
            <div className="h-9 w-16 rounded-lg bg-slate-700" />
          </div>
        </div>

        {/* Draw section skeleton */}
        <div className="mt-10">
          <div className="mb-4 h-px bg-surface-border" />
          <div className="flex items-center justify-between">
            <div className="h-5 w-20 rounded bg-slate-700" />
            <div className="h-9 w-32 rounded-lg bg-slate-700" />
          </div>
          <div className="mt-6 h-48 rounded-xl bg-surface-card ring-1 ring-surface-border" />
        </div>
      </main>
    </div>
  );
}
