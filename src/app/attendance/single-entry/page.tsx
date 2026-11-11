import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { workers, sites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { eligibleAttendanceSites } from '@/lib/entities/attendance';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveSingleEntryAction } from '../actions';

export const instant = false;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function SingleEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string; saved?: string }>;
}) {
  const user = await requireCapability('attendance.mark');
  const sp = await searchParams;
  const date = sp.date || todayStr();
  const csrf = await authCsrfToken();

  const eligibleSites = await eligibleAttendanceSites(user);
  const allWorkers = await db
    .select({ id: workers.id, name: workers.name, siteId: workers.siteId, siteName: sites.name })
    .from(workers)
    .leftJoin(sites, eq(workers.siteId, sites.id))
    .where(eq(workers.status, 'active'))
    .orderBy(workers.name);

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">Add single attendance entry</h1>
      {sp.error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{sp.error}</div>}
      {sp.saved && (
        <div className="mb-4 rounded-md bg-green-50 px-4 py-2 text-sm text-green-700">
          Saved attendance for {sp.saved}.
        </div>
      )}

      <form action={saveSingleEntryAction} className="grid max-w-xl grid-cols-2 gap-3">
        <input type="hidden" name="_csrf" value={csrf} />
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Worker</label>
          <select name="workerId" required className="h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm">
            <option value="">Select worker…</option>
            {allWorkers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} {w.siteName ? `(home: ${w.siteName})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Site worked at</label>
          <select name="siteId" required className="h-10 w-full rounded-md border border-brand-line bg-white px-3 text-sm">
            <option value="">Select site…</option>
            {eligibleSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Date</label>
          <Input name="date" type="date" required defaultValue={date} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Hours worked</label>
          <Input name="hours" type="number" step="0.5" min="0" max="10" defaultValue="0" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Leave hours</label>
          <Input name="leave" type="number" step="0.5" min="0" defaultValue="0" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Overtime</label>
          <Input name="ot" type="number" step="0.5" min="0" max="10" defaultValue="0" />
        </div>
        <div className="col-span-2">
          <Button type="submit">Save entry</Button>
        </div>
      </form>
    </AppShell>
  );
}
