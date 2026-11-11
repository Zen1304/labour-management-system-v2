import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { sites } from '@/lib/db/schema';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createSiteAction, updateSiteStatusAction } from './actions';
import { asc, sql } from 'drizzle-orm';

export const instant = false;

const STATUS_LABEL: Record<string, string> = { active: 'Active', on_hold: 'On Hold', completed: 'Completed' };
const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  active: [
    { value: 'on_hold', label: 'Put on hold' },
    { value: 'completed', label: 'Mark completed' },
  ],
  on_hold: [
    { value: 'active', label: 'Resume' },
    { value: 'completed', label: 'Mark completed' },
  ],
  completed: [{ value: 'active', label: 'Reopen' }],
};

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('admin.full');
  const { error } = await searchParams;
  const csrf = await authCsrfToken();
  const rows = await db
    .select()
    .from(sites)
    .orderBy(sql`${sites.projectNumber} nulls last`, asc(sites.name));

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">Sites</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <form action={createSiteAction} className="mb-6 grid max-w-2xl grid-cols-2 gap-3">
        <input type="hidden" name="_csrf" value={csrf} />
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Name</label>
          <Input name="name" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Project number</label>
          <Input name="projectNumber" type="number" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Client name</label>
          <Input name="clientName" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Location</label>
          <Input name="location" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">District</label>
          <Input name="district" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">State</label>
          <Input name="state" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Maps link</label>
          <Input name="mapsLink" />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Address</label>
          <Input name="address" />
        </div>
        <div className="col-span-2">
          <Button type="submit">Add site</Button>
        </div>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-brand-line text-left text-brand-ink-soft">
            <th className="py-2">#</th>
            <th className="py-2">Name</th>
            <th className="py-2">Client</th>
            <th className="py-2">Location</th>
            <th className="py-2">Status</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b border-brand-line/70">
              <td className="py-2 font-mono text-xs">{s.projectNumber ?? (s.id === 100 ? '—' : s.id)}</td>
              <td className="py-2">{s.name}</td>
              <td className="py-2">{s.clientName || '—'}</td>
              <td className="py-2">{s.location || '—'}</td>
              <td className="py-2">{STATUS_LABEL[s.status]}</td>
              <td className="py-2 text-right space-x-2">
                {s.id !== 100 &&
                  NEXT_STATUS[s.status]?.map((opt) => (
                    <form action={updateSiteStatusAction} className="inline" key={opt.value}>
                      <input type="hidden" name="_csrf" value={csrf} />
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value={opt.value} />
                      <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                        {opt.label}
                      </Button>
                    </form>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
