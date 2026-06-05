import Link from 'next/link';

type Tab = 'overview' | 'members' | 'analytics' | 'settings';

interface ClubAdminNavProps {
  clubSlug: string;
  activeTab: Tab;
  isOwner: boolean;
}

export function ClubAdminNav({ clubSlug, activeTab, isOwner }: ClubAdminNavProps) {
  const tabs: { id: Tab; label: string; href: string }[] = [
    { id: 'overview', label: 'Overview', href: `/clubs/${clubSlug}` },
    { id: 'members', label: 'Members', href: `/clubs/${clubSlug}/members` },
    { id: 'analytics', label: 'Analytics', href: `/clubs/${clubSlug}/analytics` },
    ...(isOwner ? [{ id: 'settings' as Tab, label: 'Settings', href: `/clubs/${clubSlug}/settings` }] : []),
  ];

  return (
    <nav className="mb-8 flex gap-1 border-b border-surface-border">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={`-mb-px flex-1 text-center whitespace-nowrap border-b-2 px-2 py-2 text-sm font-medium transition-colors rounded-t-md sm:flex-none sm:px-4 ${
            activeTab === tab.id
              ? 'border-brand-500 text-white bg-surface-card/40'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-surface-card/20'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
