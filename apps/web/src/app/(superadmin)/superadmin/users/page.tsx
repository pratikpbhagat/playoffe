import type { Metadata } from 'next';
import { getAllUsersForSuperAdminAction } from '@/lib/actions/superadmin';
import { UsersListClient } from '@/components/superadmin/UsersListClient';

export const metadata: Metadata = { title: 'Users · Super Admin' };

export default async function SuperAdminUsersPage() {
  const users = await getAllUsersForSuperAdminAction();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">User management</h1>
        <p className="mt-1 text-sm text-slate-500">
          {users.length} user{users.length !== 1 ? 's' : ''} registered on the platform.
        </p>
      </div>

      <UsersListClient users={users} />
    </div>
  );
}
