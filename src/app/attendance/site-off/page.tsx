import { eq, desc, asc, sql } from 'drizzle-orm';
import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { siteOffDays, sites } from '@/lib/db/schema';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addSiteOffDayAction, deleteSiteOffDayAction } from '../actions';

export const instant = false;

export default async function SiteOffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('attendance.mark');
  const { error } = await searchParams;
  const csrf = await authCsrfToken();

  const siteRows = await db
    .select()
    .from(sites)
    .where(eq(sites.status, 'active'))
    .orderBy(sql`${sites.projectNumber} nulls last`, asc(sites.name));

  const offRows = await db
    .select({
      id: siteOffDays.id,
      siteId: siteOffDays.siteId,
      date: siteOffDays.date,
      reason: siteOffDays.reason,
      siteName: sites.name,
    })
    .from(siteOffDays)
    .leftJoin(sites, eq(siteOffDays.siteId, sites.id))
    .orderBy(desc(siteOffDays.date))
    .limit(50);

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">Site off days</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <form action={addSiteOffDayAction} className="mb-6 flex items-end gap-3">
        <input type="hidden" name="_csrf" value={csrf} />
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Site</label>
          <select name="siteId" required className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm">
            {siteRows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Date</label>
          <Input name="date" type="date" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Reason</label>
          <Input name="reason" placeholder="e.g. Public holiday" />
        </div>
        <Button type="submit">Mark off</Button>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2">Date</th>
            <th className="py-2">Site</th>
            <th className="py-2">Reason</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {offRows.map((o) => (
            <tr key={o.id} className="border-b border-neutral-100">
              <td className="py-2">{o.date}</td>
              <td className="py-2">{o.siteName}</td>
              <td className="py-2">{o.reason || '—'}</td>
              <td className="py-2 text-right">
                <form action={deleteSiteOffDayAction} className="inline">
                  <input type="hidden" name="_csrf" value={csrf} />
                  <input type="hidden" name="id" value={o.id} />
                  <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                    Remove
                  </Button>
                </form>
              </td>
            </tr>
          ))}
          {offRows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-neutral-400">
                No off days recorded.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
