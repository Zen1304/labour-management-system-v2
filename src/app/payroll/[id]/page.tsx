import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { can } from '@/lib/auth/permissions';
import { db } from '@/lib/db/client';
import { payrollRuns, payrollItems, workers, sites, users } from '@/lib/db/schema';
import { sitesForPayrollRun } from '@/lib/entities/payroll';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { verifySiteAction, completeRunAction } from '../actions';

export const instant = false;

const PAY_MODE_LABEL: Record<string, string> = {
  daily_wage: 'Daily Wage',
  subcontract: 'Subcontract',
  piece_work: 'Piece Work',
  mixed: 'Mixed',
};

export default async function PayrollRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('payroll.view');
  const { id } = await params;
  const { error } = await searchParams;
  const runId = Number(id);

  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
  if (!run) notFound();

  const canApprove = can(user, 'payroll.approve');
  const csrf = await authCsrfToken();

  const items = await db
    .select({
      id: payrollItems.id,
      payMode: payrollItems.payMode,
      payoutMethod: payrollItems.payoutMethod,
      daysPresent: payrollItems.daysPresent,
      hoursWorked: payrollItems.hoursWorked,
      overtimeHours: payrollItems.overtimeHours,
      basePay: payrollItems.basePay,
      overtimePay: payrollItems.overtimePay,
      workerName: workers.name,
      workerCode: workers.workerCode,
    })
    .from(payrollItems)
    .leftJoin(workers, eq(payrollItems.workerId, workers.id))
    .where(eq(payrollItems.payrollRunId, runId))
    .orderBy(workers.name);

  const siteRows = await sitesForPayrollRun(runId);
  const siteIds = siteRows.map((s) => s.siteId);
  const siteNames = siteIds.length
    ? Object.fromEntries((await db.select({ id: sites.id, name: sites.name }).from(sites)).map((s) => [s.id, s.name]))
    : {};

  const allVerified = siteRows.length > 0 && siteRows.every((s) => s.verifiedAt);

  let verifiedByName: string | null = null;
  let completedByName: string | null = null;
  let flaggedByName: string | null = null;
  if (run.verifiedBy || run.completedBy || run.flaggedBy) {
    const ids = [run.verifiedBy, run.completedBy, run.flaggedBy].filter(Boolean) as number[];
    const rows = ids.length ? await db.select({ id: users.id, name: users.name }).from(users) : [];
    const map = new Map(rows.map((r) => [r.id, r.name]));
    verifiedByName = run.verifiedBy ? map.get(run.verifiedBy) || null : null;
    completedByName = run.completedBy ? map.get(run.completedBy) || null : null;
    flaggedByName = run.flaggedBy ? map.get(run.flaggedBy) || null : null;
  }

  const netTotal = items.reduce((sum, i) => sum + i.basePay + i.overtimePay, 0);

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-bold">
        Payroll run: {run.periodStart} → {run.periodEnd}
      </h1>
      <p className="mb-4 text-sm text-brand-ink-soft">
        Generated {run.generatedAt.toISOString().slice(0, 10)}
        {run.notes ? ` · ${run.notes}` : ''}
      </p>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {run.flagged && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          Flagged{flaggedByName ? ` by ${flaggedByName}` : ''}
          {run.flaggedReason ? `: ${run.flaggedReason}` : ''} — this run&apos;s wage period is free to be regenerated.
          This run&apos;s own data is untouched.
        </div>
      )}

      <div className="mb-6 rounded-lg border border-brand-line bg-white p-4 text-sm">
        <p>
          Status: <span className="font-semibold">{run.status.replace('_', ' ')}</span>
          {verifiedByName ? ` · Verified by ${verifiedByName}` : ''}
          {completedByName ? ` · Completed by ${completedByName}` : ''}
        </p>
        <p className="mt-1">Net total: ₹{netTotal.toFixed(2)}</p>
      </div>

      <h2 className="mb-2 text-lg font-semibold">Per-site verification</h2>
      <table className="mb-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-line text-left text-brand-ink-soft">
            <th className="py-2">Site</th>
            <th className="py-2">Workers</th>
            <th className="py-2">Net pay</th>
            <th className="py-2">Status</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {siteRows.map((s) => (
            <tr key={s.siteId} className="border-b border-brand-line/70">
              <td className="py-2">{siteNames[s.siteId] || `Site ${s.siteId}`}</td>
              <td className="py-2">{s.workerCount}</td>
              <td className="py-2">₹{Number(s.netPay).toFixed(2)}</td>
              <td className="py-2">{s.verifiedAt ? 'Verified' : 'Pending'}</td>
              <td className="py-2">
                {canApprove && !s.verifiedAt && run.status === 'pending_verification' && (
                  <form action={verifySiteAction}>
                    <input type="hidden" name="_csrf" value={csrf} />
                    <input type="hidden" name="runId" value={runId} />
                    <input type="hidden" name="siteId" value={s.siteId} />
                    <Button type="submit">Verify site</Button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {siteRows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-brand-ink-soft/70">
                No site slices in this run.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canApprove && run.status === 'verified' && (
        <form action={completeRunAction} className="mb-6">
          <input type="hidden" name="_csrf" value={csrf} />
          <input type="hidden" name="runId" value={runId} />
          <Button type="submit">Complete run</Button>
        </form>
      )}
      {run.status === 'completed' && <p className="mb-6 text-sm text-green-700">This run has been completed.</p>}
      {!allVerified && run.status === 'pending_verification' && (
        <p className="mb-6 text-xs text-brand-ink-soft/70">The run auto-verifies once every site above has been verified.</p>
      )}

      <h2 className="mb-2 text-lg font-semibold">Per-worker breakdown</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-line text-left text-brand-ink-soft">
            <th className="py-2">Worker</th>
            <th className="py-2">Mode</th>
            <th className="py-2">Days present</th>
            <th className="py-2">Hours</th>
            <th className="py-2">OT hours</th>
            <th className="py-2">Pay</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-brand-line/70">
              <td className="py-2">
                {i.workerCode} — {i.workerName}
              </td>
              <td className="py-2">{PAY_MODE_LABEL[i.payMode] || i.payMode}</td>
              <td className="py-2">{i.daysPresent}</td>
              <td className="py-2">{i.hoursWorked}</td>
              <td className="py-2">{i.overtimeHours}</td>
              <td className="py-2">₹{(i.basePay + i.overtimePay).toFixed(2)}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-brand-ink-soft/70">
                No workers in this run.
              </td>
            </tr>
          )}
        </tbody>
      </table>

    </AppShell>
  );
}
