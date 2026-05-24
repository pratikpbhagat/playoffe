/** Skeleton placeholder for AppNav — used in every loading.tsx */
export function NavSkeleton() {
  return (
    <div className="border-b border-surface-border bg-surface-card px-6 py-3.5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
        <div className="h-5 w-28 rounded bg-slate-700" />
        <div className="hidden gap-5 sm:flex">
          <div className="h-4 w-14 rounded bg-slate-700" />
          <div className="h-4 w-20 rounded bg-slate-700" />
          <div className="h-4 w-28 rounded bg-slate-700" />
        </div>
        <div className="h-7 w-24 rounded bg-slate-700" />
      </div>
    </div>
  );
}
