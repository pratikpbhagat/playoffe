'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface Category {
  id: string;
  name: string;
}

interface Props {
  categories: Category[];
  activeCategoryId: string | null;
}

export function CategoryFilter({ categories, activeCategoryId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set('category', val);
    } else {
      params.delete('category');
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide shrink-0">
        Category
      </label>
      <select
        value={activeCategoryId ?? ''}
        onChange={handleChange}
        className="w-full rounded-lg border border-slate-700 bg-surface-card px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none sm:w-auto sm:flex-1 sm:max-w-sm"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
