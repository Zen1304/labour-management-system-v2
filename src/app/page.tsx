import Link from 'next/link';
import { requireUser } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { MULTI_SITE_ROLES, ROLE_LABEL } from '@/lib/auth/permissions';
import { AppShell } from '@/components/app-shell';
import { dashboardData, payrollRunsCount } from '@/lib/entities/dashboard';
import { POOL_SITE_ID } from '@/lib/entities/attendance';

export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await dashboardData(user);
  const canViewAnalytics = can(user, 'analytics.view');
  const runsCount = canViewAnalytics ? await payrollRunsCount() : 0;
  const isSiteOverseer = MULTI_SITE_ROLES.includes(user.role);

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-bold">{isSiteOverseer ? (user.role === 'project_manager' ? 'My Projects' : 'My Sites') : `Welcome, ${user.name}`}</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {data.today} · {ROLE_LABEL[user.role]} view{isSiteOverseer ? ' · read-only oversight' : ''}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Active workers" value={data.totalWorkers} />
        <Stat label="Present today" value={data.presentToday} sub={data.totalWorkers > 0 ? `${Math.round((data.presentToday / data.totalWorkers) * 100)}% of workforce` : undefined} />
        <Stat label="Attendance marked" value={`${data.markedToday}/${data.totalWorkers}`} />
        <Stat label="Sites" value={data.sitesCount} />
      </div>

      <div className="mb-6 flex gap-2">
        {can(user, 'attendance.mark') ? (
          <Link href="/attendance">
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">Mark attendance</button>
          </Link>
        ) : null}
        {can(user, 'workers.manage') ? (
          <Link href="/workers/new">
            <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Add worker</button>
          </Link>
        ) : null}
      </div>

      {data.unassignedCount > 0 && data.scope === null && (
        <div className="mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {data.unassignedCount} worker(s) are still in the Unassigned Pool —{' '}
          <Link href={`/workers?site_id=${POOL_SITE_ID}`} className="underline">
            assign them to a site →
          </Link>
        </div>
      )}

      {canViewAnalytics && (
        <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          <b>Payroll runs generated:</b> {runsCount} · <Link href="/payroll" className="text-blue-600 hover:underline">View payroll →</Link> ·{' '}
          <Link href="/analytics" className="text-blue-600 hover:underline">
            View full analytics →
          </Link>
        </div>
      )}

      <h2 className="mb-2 text-lg font-semibold">{isSiteOverseer ? `${data.siteBreakdown.length} site(s)` : 'Sites overview'}</h2>
      {data.siteBreakdown.length === 0 ? (
        <p className="text-sm text-neutral-400">
          {isSiteOverseer ? "You haven't been assigned to any sites yet." : 'No sites yet.'}
        </p>
      ) : isSiteOverseer ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.siteBreakdown.map((s) => (
            <div key={s.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <h3 className="mb-2 font-semibold">
                {s.projectNumber != null ? <span className="text-neutral-400">{s.projectNumber} · </span> : null}
                {s.name}
              </h3>
              <p className="mb-3 text-sm">
                <b>{s.workerCount}</b> active worker(s) · <b>{s.presentToday}</b> present today
              </p>
              <div className="flex gap-3 text-sm">
                <Link href={`/workers?site_id=${s.id}`} className="text-blue-600 hover:underline">
                  Workers →
                </Link>
                <Link href={`/attendance/single-entry?site_id=${s.id}`} className="text-blue-600 hover:underline">
                  Attendance →
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2">Site</th>
              <th className="py-2">Active workers</th>
              <th className="py-2">Present today</th>
            </tr>
          </thead>
          <tbody>
            {data.siteBreakdown.map((s) => (
              <tr key={s.id} className="border-b border-neutral-100">
                <td className="py-2">{s.id === POOL_SITE_ID ? <span className="text-neutral-400">Unassigned Pool</span> : s.name}</td>
                <td className="py-2">{s.workerCount}</td>
                <td className="py-2">{s.presentToday}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}
