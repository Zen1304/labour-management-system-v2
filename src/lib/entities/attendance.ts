// Attendance eligibility checks — one rule set, called by every route that
// writes attendance (bulk grid, single entry), ported from the old app's
// attendanceSiteError/attendanceWorkerError/attendanceWriteError/
// workerHoursOnDateExcludingSite/auditCrossSiteAttendance. A rendered form
// only ever offers eligible options, but that's a convenience, not a
// boundary — every one of these re-checks server-side.
//
// New in this rebuild (not in the old app): attendanceWriteError also
// rejects a write against a site_off_days date, instead of silently
// allowing the write and only excluding it later at payroll time.
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sites, workers, siteOffDays, attendance, userSiteAssignments } from '@/lib/db/schema';
import type { AuthUser } from '@/lib/auth/permissions';
import { MULTI_SITE_ROLES } from '@/lib/auth/permissions';

export const POOL_SITE_ID = 100;

export const ATTENDANCE_BAD_DATE = "That date isn't valid.";
export const ATTENDANCE_BAD_SITE = "Attendance can't be recorded against that site. Choose an active site from the list.";
export const ATTENDANCE_BAD_WORKER = "That worker isn't available for attendance. Choose a worker from the list.";

export function isValidDateStr(s: unknown): boolean {
  const str = String(s == null ? '' : s);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

// null = unrestricted (every non-multi-site role with attendance.mark today
// is unrestricted); an array = exactly those site ids.
export async function siteScopeForUser(user: AuthUser): Promise<number[] | null> {
  if (!MULTI_SITE_ROLES.includes(user.role)) return null;
  const rows = await db
    .select({ siteId: userSiteAssignments.siteId })
    .from(userSiteAssignments)
    .where(eq(userSiteAssignments.userId, user.id));
  return rows.map((r) => r.siteId);
}

export async function attendanceSiteError(user: AuthUser, siteIdRaw: unknown): Promise<string | null> {
  const id = Number(siteIdRaw);
  if (!id || id === POOL_SITE_ID) return ATTENDANCE_BAD_SITE;
  const [site] = await db.select({ id: sites.id, status: sites.status }).from(sites).where(eq(sites.id, id));
  if (!site || site.status !== 'active') return ATTENDANCE_BAD_SITE;
  const scope = await siteScopeForUser(user);
  if (scope !== null && !scope.includes(id)) return ATTENDANCE_BAD_SITE;
  return null;
}

export async function attendanceWorkerError(workerIdRaw: unknown): Promise<string | null> {
  const id = Number(workerIdRaw);
  if (!id) return ATTENDANCE_BAD_WORKER;
  const [w] = await db.select({ id: workers.id, status: workers.status }).from(workers).where(eq(workers.id, id));
  if (!w || w.status !== 'active') return ATTENDANCE_BAD_WORKER;
  return null;
}

export async function siteOffDayError(siteIdRaw: unknown, date: string): Promise<string | null> {
  const id = Number(siteIdRaw);
  const [off] = await db
    .select()
    .from(siteOffDays)
    .where(and(eq(siteOffDays.siteId, id), eq(siteOffDays.date, date)));
  if (off) {
    return `This site is marked off on ${date}${off.reason ? ` (${off.reason})` : ''} — attendance can't be recorded for an off day.`;
  }
  return null;
}

export async function attendanceWriteError(
  user: AuthUser,
  { workerId, siteId, date }: { workerId: unknown; siteId: unknown; date: unknown }
): Promise<string | null> {
  if (!isValidDateStr(date)) return ATTENDANCE_BAD_DATE;
  return (
    (await attendanceSiteError(user, siteId)) ||
    (await attendanceWorkerError(workerId)) ||
    (await siteOffDayError(siteId, String(date)))
  );
}

export async function eligibleAttendanceSites(user: AuthUser) {
  const scope = await siteScopeForUser(user);
  const rows = await db
    .select({ id: sites.id, name: sites.name, status: sites.status })
    .from(sites)
    .where(and(eq(sites.status, 'active'), ne(sites.id, POOL_SITE_ID)))
    .orderBy(sql`${sites.projectNumber} nulls last`, sites.name);
  return rows.filter((s) => scope === null || scope.includes(s.id));
}

export async function workerHoursOnDateExcludingSite(
  workerId: number,
  date: string,
  excludeSiteId: number
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${attendance.hoursWorked} + ${attendance.overtimeHours}), 0)`,
    })
    .from(attendance)
    .where(and(eq(attendance.workerId, workerId), eq(attendance.date, date), ne(attendance.siteId, excludeSiteId)));
  return Number(row?.total) || 0;
}

export async function auditCrossSiteAttendance(user: AuthUser, workerId: number, siteId: number, date: string) {
  const [w] = await db.select({ name: workers.name, siteId: workers.siteId }).from(workers).where(eq(workers.id, workerId));
  if (!w || w.siteId === siteId) return;
  const { logAudit } = await import('@/lib/audit');
  await logAudit(user.id, 'create', 'attendance', null, `cross-site entry: ${w.name} (home site ${w.siteId}) recorded at site ${siteId} on ${date}`);
}
