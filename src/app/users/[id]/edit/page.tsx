import { eq, asc, sql } from 'drizzle-orm';
import { notFound, forbidden } from 'next/navigation';
import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { users, sites, userSiteAssignments } from '@/lib/db/schema';
import { superAdminGuardError } from '@/lib/entities/users';
import { AppShell } from '@/components/app-shell';
import { UserForm } from '@/components/user-form';
import { updateUserAction } from '../../actions';

export const instant = false;

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actingUser = await requireCapability('admin.full');
  const { id } = await params;
  const { error } = await searchParams;
  const targetId = Number(id);

  const [target] = await db.select().from(users).where(eq(users.id, targetId));
  if (!target) notFound();
  if (superAdminGuardError(actingUser.role, { targetRole: target.role })) forbidden();

  const csrf = await authCsrfToken();
  const siteRows = await db
    .select()
    .from(sites)
    .orderBy(sql`${sites.projectNumber} nulls last`, asc(sites.name));
  const assignments = await db
    .select({ siteId: userSiteAssignments.siteId })
    .from(userSiteAssignments)
    .where(eq(userSiteAssignments.userId, targetId));

  return (
    <AppShell user={actingUser}>
      <h1 className="mb-6 text-2xl font-bold">Edit user</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      <UserForm
        user={target}
        assignedSiteIds={assignments.map((a) => a.siteId)}
        siteOptions={siteRows.map((s) => ({ id: s.id, label: s.name }))}
        actingRole={actingUser.role}
        csrf={csrf}
        action={updateUserAction}
        submitLabel="Save changes"
      />
    </AppShell>
  );
}
