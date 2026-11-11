import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { vendors, workerTypes } from '@/lib/db/schema';
import { AppShell } from '@/components/app-shell';
import { WorkerForm } from '@/components/worker-form';
import { createWorkerAction } from '../actions';

export const instant = false;

export default async function NewWorkerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('workers.manage');
  const { error } = await searchParams;
  const csrf = await authCsrfToken();
  const vendorRows = await db.select().from(vendors).orderBy(vendors.name);
  const activeVendors = vendorRows.filter((v) => v.active);
  const workerTypeRows = await db.select().from(workerTypes).orderBy(workerTypes.name);

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">Add worker</h1>
      <p className="mb-4 text-sm text-brand-ink-soft">
        A Worker ID will be assigned automatically once saved. New workers start in the Unassigned Pool.
      </p>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      <WorkerForm
        vendorOptions={activeVendors.map((v) => ({ id: v.id, label: v.name }))}
        workerTypeOptions={workerTypeRows.filter((t) => t.active).map((t) => ({ id: t.id, label: t.name }))}
        siteOptions={[]}
        csrf={csrf}
        action={createWorkerAction}
        submitLabel="Add worker"
      />
    </AppShell>
  );
}
