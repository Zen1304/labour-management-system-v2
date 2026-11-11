import { asc, sql } from 'drizzle-orm';
import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { sites } from '@/lib/db/schema';
import { AppShell } from '@/components/app-shell';
import { UserForm } from '@/components/user-form';
import { createUserAction } from '../actions';

export const instant = false;

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('admin.full');
  const { error } = await searchParams;
  const csrf = await authCsrfToken();
  const siteRows = await db
    .select()
    .from(sites)
    .orderBy(sql`${sites.projectNumber} nulls last`, asc(sites.name));

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">Add user</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      <UserForm
        siteOptions={siteRows.map((s) => ({ id: s.id, label: s.name }))}
        actingRole={user.role}
        csrf={csrf}
        action={createUserAction}
        submitLabel="Add user"
      />
    </AppShell>
  );
}
