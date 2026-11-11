'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { attendance, workers, siteOffDays } from '@/lib/db/schema';
import { requireActionCapability, ActionError } from '@/lib/auth/action-helpers';
import {
  isValidDateStr,
  attendanceSiteError,
  attendanceWorkerError,
  attendanceWriteError,
  siteOffDayError,
  workerHoursOnDateExcludingSite,
  auditCrossSiteAttendance,
  ATTENDANCE_BAD_DATE,
} from '@/lib/entities/attendance';
import { logAudit } from '@/lib/audit';

export async function saveBulkAttendanceAction(formData: FormData) {
  const date = String(formData.get('date') || '');
  const siteId = Number(formData.get('siteId'));
  try {
    const user = await requireActionCapability(formData, 'attendance.mark');

    if (!isValidDateStr(date)) throw new ActionError(`${ATTENDANCE_BAD_DATE} Nothing was saved.`);
    const siteErr = await attendanceSiteError(user, siteId);
    if (siteErr) throw new ActionError(`${siteErr} Nothing was saved.`);
    const offErr = await siteOffDayError(siteId, date);
    if (offErr) throw new ActionError(`${offErr} Nothing was saved.`);

    // Collect every hours_<workerId> field, validate ALL rows before writing
    // anything, so a bulk save either fully succeeds or leaves nothing
    // half-saved.
    const workerIds: number[] = [];
    for (const key of formData.keys()) {
      const m = key.match(/^hours_(\d+)$/);
      if (m) workerIds.push(Number(m[1]));
    }

    for (const workerId of workerIds) {
      const workerErr = await attendanceWorkerError(workerId);
      if (workerErr) throw new ActionError(`${workerErr} Nothing was saved.`);
      const hours = parseFloat(String(formData.get(`hours_${workerId}`) || '')) || 0;
      const ot = parseFloat(String(formData.get(`ot_${workerId}`) || '')) || 0;
      const otherSitesTotal = await workerHoursOnDateExcludingSite(workerId, date, siteId);
      if (hours + ot > 10 || otherSitesTotal + hours + ot > 10) {
        const [w] = await db.select({ name: workers.name }).from(workers).where(eq(workers.id, workerId));
        const workerName = w?.name || `worker ${workerId}`;
        throw new ActionError(
          otherSitesTotal > 0
            ? `${workerName} already has ${otherSitesTotal}h logged at another site on ${date} — this entry would push their total for the day over 10 hours. Nothing was saved — fix the highlighted row(s) and resubmit.`
            : `Hours worked + overtime can't exceed 10 hours in a day for any worker. Nothing was saved — fix the highlighted row(s) and resubmit.`
        );
      }
    }

    for (const workerId of workerIds) {
      const hours = parseFloat(String(formData.get(`hours_${workerId}`) || '')) || 0;
      const leave = parseFloat(String(formData.get(`leave_${workerId}`) || '')) || 0;
      const ot = parseFloat(String(formData.get(`ot_${workerId}`) || '')) || 0;
      await db
        .insert(attendance)
        .values({ workerId, siteId, date, hoursWorked: hours, leaveHours: leave, overtimeHours: ot, markedBy: user.id })
        .onConflictDoUpdate({
          target: [attendance.workerId, attendance.date, attendance.siteId],
          set: { hoursWorked: hours, leaveHours: leave, overtimeHours: ot, markedBy: user.id, markedAt: new Date() },
        });
      await auditCrossSiteAttendance(user, workerId, siteId, date);
    }
    revalidatePath('/attendance');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not save attendance.';
    redirect(`/attendance?date=${encodeURIComponent(date)}&siteId=${siteId}&error=` + encodeURIComponent(message));
  }
  redirect(`/attendance?date=${encodeURIComponent(date)}&siteId=${siteId}`);
}

export async function saveSingleEntryAction(formData: FormData) {
  const date = String(formData.get('date') || '');
  try {
    const user = await requireActionCapability(formData, 'attendance.mark');
    const workerId = Number(formData.get('workerId'));
    const siteId = Number(formData.get('siteId'));
    const hours = parseFloat(String(formData.get('hours') || '')) || 0;
    const leave = parseFloat(String(formData.get('leave') || '')) || 0;
    const ot = parseFloat(String(formData.get('ot') || '')) || 0;

    const entryErr = await attendanceWriteError(user, { workerId, siteId, date });
    if (entryErr) throw new ActionError(entryErr);

    const otherSitesTotal = await workerHoursOnDateExcludingSite(workerId, date, siteId);
    if (hours + ot > 10 || otherSitesTotal + hours + ot > 10) {
      throw new ActionError(
        otherSitesTotal > 0
          ? `This worker already has ${otherSitesTotal}h logged at another site on ${date} — this entry would push their total for the day over 10 hours. Nothing was saved.`
          : "Hours worked + overtime can't exceed 10 hours in a day. Nothing was saved."
      );
    }

    await db
      .insert(attendance)
      .values({ workerId, siteId, date, hoursWorked: hours, leaveHours: leave, overtimeHours: ot, markedBy: user.id })
      .onConflictDoUpdate({
        target: [attendance.workerId, attendance.date, attendance.siteId],
        set: { hoursWorked: hours, leaveHours: leave, overtimeHours: ot, markedBy: user.id, markedAt: new Date() },
      });
    await auditCrossSiteAttendance(user, workerId, siteId, date);

    const [w] = await db.select({ name: workers.name }).from(workers).where(eq(workers.id, workerId));
    revalidatePath('/attendance/single-entry');
    redirect(`/attendance/single-entry?date=${encodeURIComponent(date)}&saved=${encodeURIComponent(w?.name || 'worker')}`);
  } catch (e) {
    if (e instanceof ActionError) {
      redirect(`/attendance/single-entry?date=${encodeURIComponent(date)}&error=` + encodeURIComponent(e.message));
    }
    throw e;
  }
}

export async function addSiteOffDayAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'attendance.mark');
    const siteId = Number(formData.get('siteId'));
    const date = String(formData.get('date') || '');
    if (!isValidDateStr(date)) throw new ActionError(ATTENDANCE_BAD_DATE);
    const reason = String(formData.get('reason') || '').trim() || null;
    const [row] = await db.insert(siteOffDays).values({ siteId, date, reason, createdBy: user.id }).returning();
    await logAudit(user.id, 'create', 'site_off_day', row.id, `site ${siteId} off on ${date}`);
    revalidatePath('/attendance/site-off');
  } catch (e) {
    const message =
      e instanceof ActionError
        ? e.message
        : 'That site is already marked off on that date, or the save failed.';
    redirect('/attendance/site-off?error=' + encodeURIComponent(message));
  }
  redirect('/attendance/site-off');
}

export async function deleteSiteOffDayAction(formData: FormData) {
  try {
    const user = await requireActionCapability(formData, 'attendance.mark');
    const id = Number(formData.get('id'));
    const [row] = await db.select().from(siteOffDays).where(eq(siteOffDays.id, id));
    if (row) {
      await db.delete(siteOffDays).where(eq(siteOffDays.id, id));
      await logAudit(user.id, 'delete', 'site_off_day', id, `site ${row.siteId} off on ${row.date}`);
    }
    revalidatePath('/attendance/site-off');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not remove that off day.';
    redirect('/attendance/site-off?error=' + encodeURIComponent(message));
  }
  redirect('/attendance/site-off');
}
