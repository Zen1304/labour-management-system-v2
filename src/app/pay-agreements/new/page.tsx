import { asc, eq, sql } from 'drizzle-orm';
import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { sites, vendors, workers } from '@/lib/db/schema';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPayAgreementAction } from '../actions';

export const instant = false;

export default async function NewPayAgreementPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('payagreements.manage');
  const { error } = await searchParams;
  const csrf = await authCsrfToken();

  const siteRows = await db
    .select()
    .from(sites)
    .where(eq(sites.status, 'active'))
    .orderBy(sql`${sites.projectNumber} nulls last`, asc(sites.name));
  const vendorRows = await db.select().from(vendors).where(eq(vendors.active, true)).orderBy(vendors.name);
  const workerRows = await db.select().from(workers).where(eq(workers.status, 'active')).orderBy(workers.name);

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">New pay agreement</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <form action={createPayAgreementAction} className="max-w-3xl space-y-4">
        <input type="hidden" name="_csrf" value={csrf} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Site</label>
            <select name="siteId" required className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm">
              {siteRows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Vendor (optional)</label>
            <select name="vendorId" className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm">
              <option value="">(none)</option>
              {vendorRows.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Mode</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" value="subcontract" defaultChecked /> Subcontract (lump sum)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" value="piece_work" /> Piece Work (per unit)
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Scope description</label>
          <Input name="scopeDescription" required placeholder="e.g. Plastering, Block B, Phase 2" />
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-md border border-neutral-200 p-3">
          <p className="col-span-3 text-xs text-neutral-500">
            Fill in the fields for whichever mode you selected above — Subcontract uses lump sum; Piece Work uses unit
            label + rate per unit.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Lump sum amount (₹)</label>
            <Input name="lumpSumAmount" type="number" step="0.01" min="0.01" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Unit label</label>
            <Input name="unitLabel" placeholder="e.g. sq ft" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Rate per unit (₹)</label>
            <Input name="ratePerUnit" type="number" step="0.01" min="0.01" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Period start</label>
            <Input name="periodStart" type="date" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Period end (optional)</label>
            <Input name="periodEnd" type="date" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Payout method</label>
            <select name="payoutMethod" className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer / Cheque</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Terms (for the printable work order)</label>
          <Input name="terms" />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase text-neutral-500">
            Assign workers — leave every share blank for an equal split, or set every assigned worker&apos;s % so they
            add up to 100.
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-neutral-200 p-2">
            {workerRows.map((w) => (
              <div key={w.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" name="workerIds" value={w.id} />
                <span className="w-48">{w.name}</span>
                <Input name={`share_${w.id}`} type="number" step="0.01" min="0" max="100" placeholder="%" className="w-24" />
              </div>
            ))}
          </div>
        </div>

        <Button type="submit">Create agreement</Button>
      </form>
    </AppShell>
  );
}
