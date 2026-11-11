import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { requireCapability } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { workers, vendors, sites } from '@/lib/db/schema';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';

export const instant = false;

export default async function WorkersPage() {
  const user = await requireCapability('workers.manage');
  const rows = await db
    .select({
      id: workers.id,
      workerCode: workers.workerCode,
      name: workers.name,
      wageRate: workers.wageRate,
      status: workers.status,
      verificationStatus: workers.verificationStatus,
      vendorName: vendors.name,
      siteName: sites.name,
    })
    .from(workers)
    .leftJoin(vendors, eq(workers.vendorId, vendors.id))
    .leftJoin(sites, eq(workers.siteId, sites.id))
    .orderBy(workers.name);

  return (
    <AppShell user={user}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workers</h1>
        <Link href="/workers/new">
          <Button>Add worker</Button>
        </Link>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-line text-left text-brand-ink-soft">
            <th className="py-2">Code</th>
            <th className="py-2">Name</th>
            <th className="py-2">Vendor</th>
            <th className="py-2">Site</th>
            <th className="py-2">Wage</th>
            <th className="py-2">Status</th>
            <th className="py-2">Verification</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id} className="border-b border-brand-line/70">
              <td className="py-2 font-mono text-xs">{w.workerCode}</td>
              <td className="py-2">{w.name}</td>
              <td className="py-2">{w.vendorName || '—'}</td>
              <td className="py-2">{w.siteName || '—'}</td>
              <td className="py-2">₹{w.wageRate}/hr</td>
              <td className="py-2">{w.status}</td>
              <td className="py-2">{w.verificationStatus === 'verified' ? 'Verified' : 'Pending'}</td>
              <td className="py-2 text-right">
                <Link href={`/workers/${w.id}/edit`} className="text-sm text-brand-accent hover:underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-brand-ink-soft/70">
                No workers yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
