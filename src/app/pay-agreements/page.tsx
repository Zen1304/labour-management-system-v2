import Link from 'next/link';
import { eq, desc } from 'drizzle-orm';
import { requireCapability } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { payAgreements, sites } from '@/lib/db/schema';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';

export const instant = false;

export default async function PayAgreementsPage() {
  const user = await requireCapability('payagreements.manage');
  const rows = await db
    .select({
      id: payAgreements.id,
      mode: payAgreements.mode,
      scopeDescription: payAgreements.scopeDescription,
      status: payAgreements.status,
      periodStart: payAgreements.periodStart,
      periodEnd: payAgreements.periodEnd,
      siteName: sites.name,
    })
    .from(payAgreements)
    .leftJoin(sites, eq(payAgreements.siteId, sites.id))
    .orderBy(desc(payAgreements.createdAt));

  return (
    <AppShell user={user}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pay agreements</h1>
        <Link href="/pay-agreements/new">
          <Button>New agreement</Button>
        </Link>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2">Site</th>
            <th className="py-2">Mode</th>
            <th className="py-2">Scope</th>
            <th className="py-2">Period</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-neutral-100">
              <td className="py-2">{a.siteName}</td>
              <td className="py-2">{a.mode === 'subcontract' ? 'Subcontract' : 'Piece Work'}</td>
              <td className="py-2">
                <Link href={`/pay-agreements/${a.id}`} className="text-blue-600 hover:underline">
                  {a.scopeDescription}
                </Link>
              </td>
              <td className="py-2">
                {a.periodStart} {a.periodEnd ? `– ${a.periodEnd}` : '(open-ended)'}
              </td>
              <td className="py-2">{a.status === 'active' ? 'Active' : 'Closed'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-neutral-400">
                No pay agreements yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
