import { eq, and } from 'drizzle-orm';
import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { workers, attendance } from '@/lib/db/schema';
import { eligibleAttendanceSites, siteOffDayError } from '@/lib/entities/attendance';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveBulkAttendanceAction } from './actions';
import Link from 'next/link';

export const instant = false;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; siteId?: string; error?: string }>;
}) {
  const user = await requireCapability('attendance.mark');
  const sp = await searchParams;
  const date = sp.date || todayStr();
  const csrf = await authCsrfToken();

  const eligibleSites = await eligibleAttendanceSites(user);
  const siteId = Number(sp.siteId) || eligibleSites[0]?.id;

  const offError = siteId ? await siteOffDayError(siteId, date) : null;

  const crew = siteId
    ? await db
        .select()
        .from(workers)
        .where(and(eq(workers.siteId, siteId), eq(workers.status, 'active')))
        .orderBy(workers.name)
    : [];

  const existingRows = siteId
    ? await db.select().from(attendance).where(and(eq(attendance.siteId, siteId), eq(attendance.date, date)))
    : [];
  const existingByWorker = Object.fromEntries(existingRows.map((r) => [r.workerId, r]));

  return (
    <AppShell user={user}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Attendance</h1>
        <Link href="/attendance/site-off" className="text-sm text-blue-600 hover:underline">
          Manage site off days
        </Link>
      </div>

      {sp.error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{sp.error}</div>}
      {offError && !sp.error && <div className="mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-800">{offError}</div>}

      <form method="get" className="mb-6 flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Date</label>
          <Input name="date" type="date" defaultValue={date} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Site</label>
          <select
            name="siteId"
            defaultValue={siteId}
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          >
            {eligibleSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Go
        </Button>
      </form>

      {eligibleSites.length === 0 && (
        <p className="text-neutral-500">No active sites are eligible for attendance right now.</p>
      )}

      {siteId && !offError && (
        <form action={saveBulkAttendanceAction}>
          <input type="hidden" name="_csrf" value={csrf} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="siteId" value={siteId} />
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2">Worker</th>
                <th className="py-2">Hours worked</th>
                <th className="py-2">Leave hours</th>
                <th className="py-2">Overtime</th>
              </tr>
            </thead>
            <tbody>
              {crew.map((w) => {
                const existing = existingByWorker[w.id];
                return (
                  <tr key={w.id} className="border-b border-neutral-100">
                    <td className="py-2">{w.name}</td>
                    <td className="py-2">
                      <Input name={`hours_${w.id}`} type="number" step="0.5" min="0" max="10" className="w-20" defaultValue={existing?.hoursWorked ?? 0} />
                    </td>
                    <td className="py-2">
                      <Input name={`leave_${w.id}`} type="number" step="0.5" min="0" className="w-20" defaultValue={existing?.leaveHours ?? 0} />
                    </td>
                    <td className="py-2">
                      <Input name={`ot_${w.id}`} type="number" step="0.5" min="0" max="10" className="w-20" defaultValue={existing?.overtimeHours ?? 0} />
                    </td>
                  </tr>
                );
              })}
              {crew.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-neutral-400">
                    No active workers assigned to this site.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {crew.length > 0 && (
            <div className="mt-4">
              <Button type="submit">Save attendance</Button>
            </div>
          )}
        </form>
      )}
    </AppShell>
  );
}
