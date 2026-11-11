// V1 printable work order: a print-styled page, saved as PDF via the
// browser's own print dialog — see the rebuild plan's note on why this is
// the simplest reliable option to start with (no new PDF-rendering
// dependency). Not wrapped in AppShell on purpose — this is the document
// itself, meant to be printed without the app chrome around it.
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireCapability } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { payAgreements, payAgreementWorkers, workers, sites, vendors } from '@/lib/db/schema';

export const instant = false;

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('payagreements.manage');
  const { id } = await params;
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
      terms: payAgreements.terms,
      siteName: sites.name,
      siteAddress: sites.address,
      vendorName: vendors.name,
    })
    .from(payAgreements)
    .leftJoin(sites, eq(payAgreements.siteId, sites.id))
    .leftJoin(vendors, eq(payAgreements.vendorId, vendors.id))
    .where(eq(payAgreements.id, agreementId));
  if (!agreement) notFound();

  const assigned = await db
    .select({ workerId: payAgreementWorkers.workerId, sharePercent: payAgreementWorkers.sharePercent, workerName: workers.name, workerCode: workers.workerCode })
    .from(payAgreementWorkers)
    .leftJoin(workers, eq(payAgreementWorkers.workerId, workers.id))
    .where(eq(payAgreementWorkers.payAgreementId, agreementId));

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '720px', margin: '2rem auto', color: '#111' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: 0 }}>Work Order — {agreement.mode === 'subcontract' ? 'Subcontract' : 'Piece Work'} Agreement</h1>
        <p style={{ color: '#555' }}>BilaraGroup &middot; Labour Management System</p>
        <hr />
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
          <tbody>
            <tr><td style={{ padding: '4px 0', fontWeight: 600, width: '220px' }}>Site</td><td>{agreement.siteName}{agreement.siteAddress ? ` — ${agreement.siteAddress}` : ''}</td></tr>
            <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>Scope of work</td><td>{agreement.scopeDescription}</td></tr>
            {agreement.vendorName && <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>Vendor</td><td>{agreement.vendorName}</td></tr>}
            <tr>
              <td style={{ padding: '4px 0', fontWeight: 600 }}>Rate / amount</td>
              <td>
                {agreement.mode === 'subcontract'
                  ? `Lump sum: ₹${agreement.lumpSumAmount}`
                  : `₹${agreement.ratePerUnit} per ${agreement.unitLabel}`}
              </td>
            </tr>
            <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>Period</td><td>{agreement.periodStart}{agreement.periodEnd ? ` to ${agreement.periodEnd}` : ' (open-ended)'}</td></tr>
            <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>Payout method</td><td>{agreement.payoutMethod === 'cash' ? 'Cash' : 'Bank Transfer / Cheque'}</td></tr>
            {agreement.terms && <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>Terms</td><td>{agreement.terms}</td></tr>}
          </tbody>
        </table>

        <h2 style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>Assigned workers</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
              <th style={{ padding: '4px 0' }}>Code</th>
              <th style={{ padding: '4px 0' }}>Name</th>
              <th style={{ padding: '4px 0' }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {assigned.map((a) => (
              <tr key={a.workerId} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 0' }}>{a.workerCode}</td>
                <td style={{ padding: '4px 0' }}>{a.workerName}</td>
                <td style={{ padding: '4px 0' }}>{a.sharePercent !== null ? `${a.sharePercent}%` : 'Equal split'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'space-between' }}>
          <div>Authorized by: ______________________</div>
          <div>Date: ______________________</div>
        </div>

        <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#777' }} className="no-print">
          Use your browser&apos;s Print (Ctrl/Cmd+P) to save this as a PDF.
        </p>
    </div>
  );
}
