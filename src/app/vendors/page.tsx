import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { vendors } from '@/lib/db/schema';
import { vendorDependencyCounts } from '@/lib/entities/vendors';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createVendorAction, toggleVendorActiveAction, deleteVendorAction } from './actions';

export const instant = false;

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('admin.full');
  const { error } = await searchParams;
  const csrf = await authCsrfToken();
  const rows = await db.select().from(vendors).orderBy(vendors.name);
  const depsByVendor = Object.fromEntries(
    await Promise.all(rows.map(async (v) => [v.id, await vendorDependencyCounts(v.id)] as const))
  );

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">Vendors</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <form action={createVendorAction} className="mb-6 grid max-w-2xl grid-cols-2 gap-3">
        <input type="hidden" name="_csrf" value={csrf} />
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Name</label>
          <Input name="name" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Contact</label>
          <Input name="contact" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">WhatsApp</label>
          <Input name="whatsapp" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Email</label>
          <Input name="email" type="email" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Address</label>
          <Input name="address" />
        </div>
        <div className="col-span-2">
          <Button type="submit">Add vendor</Button>
        </div>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-line text-left text-brand-ink-soft">
            <th className="py-2">Code</th>
            <th className="py-2">Name</th>
            <th className="py-2">Contact</th>
            <th className="py-2">Workers</th>
            <th className="py-2">Status</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const deps = depsByVendor[v.id];
            const canHardDelete = deps.workers === 0 && deps.payrollItems === 0;
            return (
              <tr key={v.id} className="border-b border-brand-line/70">
                <td className="py-2 font-mono text-xs">{v.vendorCode}</td>
                <td className="py-2">
                  {v.name}
                  {v.isDirect && <span className="ml-2 text-xs text-brand-ink-soft/70">(Bilara Direct)</span>}
                </td>
                <td className="py-2">{v.contact || '—'}</td>
                <td className="py-2">{deps.workers}</td>
                <td className="py-2">{v.active ? 'Active' : 'Inactive'}</td>
                <td className="py-2 text-right space-x-2">
                  {!v.isDirect && (
                    <>
                      <form action={toggleVendorActiveAction} className="inline">
                        <input type="hidden" name="_csrf" value={csrf} />
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="nextActive" value={(!v.active).toString()} />
                        <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                          {v.active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </form>
                      {canHardDelete && (
                        <form action={deleteVendorAction} className="inline">
                          <input type="hidden" name="_csrf" value={csrf} />
                          <input type="hidden" name="id" value={v.id} />
                          <Button type="submit" variant="outline" className="h-8 px-3 text-xs text-red-600">
                            Delete
                          </Button>
                        </form>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-brand-ink-soft/70">
                No vendors yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
