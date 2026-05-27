import type { Metadata } from 'next';
import { getAllTournamentsForSuperAdminAction } from '@/lib/actions/superadmin';
import { SuperAdminRefereesClient } from '@/components/superadmin/SuperAdminRefereesClient';

export const metadata: Metadata = { title: 'Referees · Super Admin' };

export default async function SuperAdminRefereesPage() {
  const tournaments = await getAllTournamentsForSuperAdminAction();

  // Group by club name for the selector
  const grouped = tournaments.reduce<Record<string, typeof tournaments>>((acc, t) => {
    const key = t.clubs?.name ?? 'No club';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Referee PIN management</h1>
        <p className="mt-1 text-sm text-slate-500">
          Generate and revoke referee PINs for any tournament.
        </p>
      </div>

      <SuperAdminRefereesClient groupedTournaments={grouped} />
    </div>
  );
}
