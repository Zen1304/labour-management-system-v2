// Home dashboard queries — ported from the old app's renderDashboard() /
// renderSiteOverseerHome(), scoped the same way attendance already is
// (siteScopeForUser: null = unrestricted, array = exactly those sites for
// project_manager/site_engineer). No 'supervisor' role in this rebuild, so
// the old app's single-site special case doesn't carry forward.
import { and, eq, inArray, ne, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sites, workers, attendance, payrollRuns } from '@/lib/db/schema';
import { POOL_SITE_ID, siteScopeForUser } from './attendance';
import type { AuthUser } from '@/lib/auth/permissions';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function dashboardData(user: AuthUser) {
  const scope = await siteScopeForUser(user);
  const today = todayStr();
  const siteScopeCond = scope === null ? undefined : inArray(workers.siteId, scope.length ? scope : [-1]);

  const [{ totalWorkers }] = await db
    .select({ totalWorkers: sql<number>`count(*)::int` })
    .from(workers)
    .where(siteScopeCond ? and(eq(workers.status, 'active'), siteScopeCond) : eq(workers.status, 'active'));

  const presentBase = db
    .select({ c: sql<number>`count(distinct ${attendance.workerId})::int` })
    .from(attendance)
    .innerJoin(workers, eq(workers.id, attendance.workerId))
    .where(
      siteScopeCond
        ? and(eq(attendance.date, today), gt(attendance.hoursWorked, 0), siteScopeCond)
        : and(eq(attendance.date, today), gt(attendance.hoursWorked, 0))
    );
  const [{ c: presentToday }] = await presentBase;

  const [{ c: markedToday }] = await db
    .select({ c: sql<number>`count(distinct ${attendance.workerId})::int` })
    .from(attendance)
    .innerJoin(workers, eq(workers.id, attendance.workerId))
    .where(siteScopeCond ? and(eq(attendance.date, today), siteScopeCond) : eq(attendance.date, today));

  const [{ c: unassignedCount }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(workers)
    .where(and(eq(workers.status, 'active'), eq(workers.siteId, POOL_SITE_ID)));

  const [{ c: sitesCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(sites).where(ne(sites.id, POOL_SITE_ID));

  const siteFilter = scope === null ? undefined : inArray(sites.id, scope.length ? scope : [-1]);
  const siteBreakdown = await db
    .select({
      id: sites.id,
      name: sites.name,
      projectNumber: sites.projectNumber,
      workerCount: sql<number>`count(distinct ${workers.id}) filter (where ${workers.status} = 'active')::int`,
      presentToday: sql<number>`count(distinct case when ${attendance.date} = ${today} and ${attendance.hoursWorked} > 0 then ${attendance.workerId} end)::int`,
    })
    .from(sites)
    .leftJoin(workers, eq(workers.siteId, sites.id))
    .leftJoin(attendance, and(eq(attendance.workerId, workers.id), eq(attendance.siteId, sites.id)))
    .where(siteFilter)
    .groupBy(sites.id)
    .orderBy(sql`(${sites.id} = ${POOL_SITE_ID}) desc`, sql`${sites.projectNumber} nulls last`, sites.name);

  return {
    today,
    scope,
    totalWorkers,
    presentToday,
    markedToday,
    unassignedCount,
    sitesCount,
    siteBreakdown,
  };
}

export async function payrollRunsCount(): Promise<number> {
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(payrollRuns);
  return c;
}
