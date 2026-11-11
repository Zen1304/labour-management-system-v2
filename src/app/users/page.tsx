import Link from 'next/link';
import { requireCapability } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { ROLE_LABEL } from '@/lib/auth/permissions';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { toggleUserActiveAction } from './actions';

export const instant = false;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('admin.full');
  const { error } = await searchParams;
  const csrf = await authCsrfToken();
  const rows = await db.select().from(users).orderBy(users.name);

  return (
    <AppShell user={user}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Link href="/users/new">
          <Button>Add user</Button>
        </Link>
      </div>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-line text-left text-brand-ink-soft">
            <th className="py-2">Username</th>
            <th className="py-2">Name</th>
            <th className="py-2">Role</th>
            <th className="py-2">Status</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-brand-line/70">
              <td className="py-2">{u.username}</td>
              <td className="py-2">{u.name}</td>
              <td className="py-2">{ROLE_LABEL[u.role]}</td>
              <td className="py-2">{u.active ? 'Active' : 'Inactive'}</td>
              <td className="py-2 text-right space-x-2">
                <Link href={`/users/${u.id}/edit`} className="text-sm text-brand-accent hover:underline">
                  Edit
                </Link>
                {u.id !== user.id && (
                  <form action={toggleUserActiveAction} className="inline">
                    <input type="hidden" name="_csrf" value={csrf} />
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="nextActive" value={(!u.active).toString()} />
                    <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
