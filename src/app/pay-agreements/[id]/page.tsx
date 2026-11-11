import { eq, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { payAgreements, payAgreementWorkers, workers, sites, vendors, pieceWorkEntries } from '@/lib/db/schema';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { closePayAgreementAction, logPieceWorkEntryAction } from '../actions';
import Link from 'next/link';

export const instant = false;

export default async function PayAgreementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('payagreements.manage');
  const { id } = await params;
  const { error } = await searchParams;
  const agreementId = Number(id);

  const [agreement] = await db
    .select({
      id: payAgreements.id,
      mode: payAgreements.mode,
      scopeDescription: payAgreements.scopeDescription,
      lumpSumAmount: payAgreements.lumpSumAmount,
      unitLabel: payAgreements.unitLabel,
      ratePerUnit: payAgreements.ratePerUnit,
      periodStart: payAgreements.periodStart,
      periodEnd: payAgreements.periodEnd,
      payoutMethod: payAgreements.payoutMethod,
      status: payAgreements.status,
      terms: payAgreements.terms,
      siteName: sites.name,
      vendorName: vendors.name,
    })
    .from(payAgreements)
    .leftJoin(sites, eq(payAgreements.siteId, sites.id))
    .leftJoin(vendors, eq(payAgreements.vendorId, vendors.id))
    .where(eq(payAgreements.id, agreementId));
  if (!agreement) notFound();

  const csrf = await authCsrfToken();

  const assigned = await db
    .select({ workerId: payAgreementWorkers.workerId, sharePercent: payAgreementWorkers.sharePercent, workerName: workers.name })
    .from(payAgreementWorkers)
    .leftJoin(workers, eq(payAgreementWorkers.workerId, workers.id))
    .where(eq(payAgreementWorkers.payAgreementId, agreementId));

  const entries =
    agreement.mode === 'piece_work'
      ? await db
          .select({ id: pieceWorkEntries.id, workerId: pieceWorkEntries.workerId, date: pieceWorkEntries.date, quantity: pieceWorkEntries.quantity, workerName: workers.name })
          .from(pieceWorkEntries)
          .leftJoin(workers, eq(pieceWorkEntries.workerId, workers.id))
          .where(eq(pieceWorkEntries.payAgreementId, agreementId))
          .orderBy(desc(pieceWorkEntries.date))
      : [];

  return (
    <AppShell user={user}>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{agreement.scopeDescription}</h1>
        <div className="flex gap-2">
          <Link href={`/pay-agreements/${agreementId}/work-order`} className="text-sm text-blue-600 hover:underline self-center">
            Printable work order
          </Link>
          {agreement.status === 'active' && (
            <form action={closePayAgreementAction}>
              <input type="hidden" name="_csrf" value={csrf} />
              <input type="hidden" name="id" value={agreementId} />
              <Button type="submit" variant="outline">
                Close agreement
              </Button>
            </form>
          )}
        </div>
      </div>
      <p className="mb-6 text-sm text-neutral-500">
        {agreement.siteName} &middot; {agreement.mode === 'subcontract' ? 'Subcontract' : 'Piece Work'} &middot;{' '}
        {agreement.status === 'active' ? 'Active' : 'Closed'} &middot; {agreement.payoutMethod === 'cash' ? 'Cash' : 'Bank Transfer'}
      </p>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <p>
          Period: {agreement.periodStart} {agreement.periodEnd ? `– ${agreement.periodEnd}` : '(open-ended)'}
        </p>
        {agreement.mode === 'subcontract' ? (
          <p>Lump sum: ₹{agreement.lumpSumAmount}</p>
        ) : (
          <p>
            Rate: ₹{agreement.ratePerUnit} per {agreement.unitLabel}
          </p>
        )}
        {agreement.vendorName && <p>Vendor: {agreement.vendorName}</p>}
        {agreement.terms && <p>Terms: {agreement.terms}</p>}
      </div>

      <h2 className="mb-2 text-lg font-semibold">Assigned workers</h2>
      <table className="mb-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2">Worker</th>
            <th className="py-2">Share</th>
          </tr>
        </thead>
        <tbody>
          {assigned.map((a) => (
            <tr key={a.workerId} className="border-b border-neutral-100">
              <td className="py-2">{a.workerName}</td>
              <td className="py-2">{a.sharePercent !== null ? `${a.sharePercent}%` : 'equal split'}</td>
            </tr>
          ))}
          {assigned.length === 0 && (
            <tr>
              <td colSpan={2} className="py-4 text-center text-neutral-400">
                No workers assigned.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {agreement.mode === 'piece_work' && agreement.status === 'active' && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Log output</h2>
          <form action={logPieceWorkEntryAction} className="mb-6 flex items-end gap-3">
            <input type="hidden" name="_csrf" value={csrf} />
            <input type="hidden" name="payAgreementId" value={agreementId} />
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Date</label>
              <Input name="date" type="date" required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Worker (blank = team total)</label>
              <select name="workerId" className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm">
                <option value="">Team total</option>
                {assigned.map((a) => (
                  <option key={a.workerId} value={a.workerId}>
                    {a.workerName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Quantity ({agreement.unitLabel})</label>
              <Input name="quantity" type="number" step="0.01" min="0" required className="w-28" />
            </div>
            <Button type="submit">Log</Button>
          </form>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2">Date</th>
                <th className="py-2">Worker</th>
                <th className="py-2">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-neutral-100">
                  <td className="py-2">{e.date}</td>
                  <td className="py-2">{e.workerName || 'Team total'}</td>
                  <td className="py-2">{e.quantity}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-neutral-400">
                    No output logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </AppShell>
  );
}
