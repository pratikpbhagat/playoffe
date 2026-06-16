import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { createAdminClient } from '@/lib/supabase/server';
import { getRolePermissionsAction } from '@/lib/actions/superadmin';

const PermissionMatrix = dynamic(() => import('@/components/superadmin/PermissionMatrix').then((m) => m.PermissionMatrix));

export const metadata: Metadata = { title: 'Permissions · Super Admin' };

interface Props {
  searchParams: Promise<{ club?: string }>;
}

export default async function SuperAdminRbacPage({ searchParams }: Props) {
  const sp = await searchParams;
  const selectedClubId = sp.club || undefined;

  const admin = createAdminClient();

  const [permissions, { data: clubs }] = await Promise.all([
    getRolePermissionsAction(selectedClubId),
    admin.from('clubs').select('id, name').order('name'),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Role permissions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure what each role can see and do. Global defaults apply to all clubs unless overridden.
        </p>
      </div>

      <PermissionMatrix
        permissions={permissions}
        clubs={(clubs ?? []) as Array<{ id: string; name: string }>}
        selectedClubId={selectedClubId}
      />
    </div>
  );
}
