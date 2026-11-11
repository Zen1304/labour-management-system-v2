import { eq, asc, sql } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireCapability } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { workers, vendors, workerTypes, sites } from '@/lib/db/schema';
import { AppShell } from '@/components/app-shell';
import { WorkerForm } from '@/components/worker-form';
import { Button } from '@/components/ui/button';
import { updateWorkerAction, toggleWorkerVerificationAction } from '../../actions';

export const instant = false;

export default async function EditWorkerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('workers.manage');
  const { id } = await params;
  const { error } = await searchParams;
  const workerId = Number(id);

  const [worker] = await db.select().from(workers).where(eq(workers.id, workerId));
  if (!worker) notFound();

  const csrf = await authCsrfToken();
  const vendorRows = await db.select().from(vendors).orderBy(vendors.name);
  const workerTypeRows = await db.select().from(workerTypes).orderBy(workerTypes.name);
  const siteRows = await db
    .select()
    .from(sites)
    .orderBy(sql`${sites.projectNumber} nulls last`, asc(sites.name));

  return (
    <AppShell user={user}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Edit worker</h1>
        <p className="text-sm text-brand-ink-soft">
          Worker ID <b>{worker.workerCode || '—'}</b> &middot;{' '}
          {worker.verificationStatus === 'verified' ? 'ID Verified' : 'Verification pending'}
        </p>
      </div>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <WorkerForm
        worker={worker}
        vendorOptions={vendorRows.filter((v) => v.active || v.id === worker.vendorId).map((v) => ({ id: v.id, label: v.name }))}
        workerTypeOptions={workerTypeRows.filter((t) => t.active || t.id === worker.workerTypeId).map((t) => ({ id: t.id, label: t.name }))}
        siteOptions={siteRows.map((s) => ({ id: s.id, label: s.name }))}
        csrf={csrf}
        action={updateWorkerAction}
        submitLabel="Save changes"
      />

      {can(user, 'workers.verify') && (
        <div className="mt-6 max-w-2xl rounded-lg border border-brand-line bg-brand-sand p-4">
          <p className="mb-2 text-sm">
            <b>Identity verification</b> — the Aadhar number is this worker&apos;s proof of identity. Mark it once
            HR has checked it against the physical/scanned document.
          </p>
          <form action={toggleWorkerVerificationAction}>
            <input type="hidden" name="_csrf" value={csrf} />
            <input type="hidden" name="id" value={worker.id} />
            <Button type="submit" variant="outline">
              {worker.verificationStatus === 'verified' ? 'Mark as pending again' : 'Mark Aadhar as verified'}
            </Button>
          </form>
        </div>
      )}
    </AppShell>
  );
}
