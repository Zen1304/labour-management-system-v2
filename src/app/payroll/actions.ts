'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { payrollRuns, payrollItemSites, payrollItems, payrollRunSiteVerifications } from '@/lib/db/schema';
import { requireActionCapability, ActionError } from '@/lib/auth/action-helpers';
import { logAudit } from '@/lib/audit';
import { generatePayroll, snapToPayPeriod } from '@/lib/entities/payroll';

export async function generatePayrollAction(formData: FormData) {
  let runId: number | null = null;
  try {
    const user = await requireActionCapability(formData, 'payroll.generate');
    const snapped = snapToPayPeriod(String(formData.get('periodStart') || ''));
    if (!snapped) throw new ActionError('Enter a valid period start date.');
    const notes = String(formData.get('notes') || '').trim() || null;

    const [existing] = await db
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.periodStart, snapped.start), eq(payrollRuns.periodEnd, snapped.end), eq(payrollRuns.flagged, false)))
      .orderBy(sql`id desc`)
      .limit(1);
    if (existing) {
      throw new ActionError(
        `A payroll run for ${snapped.start} → ${snapped.end} already exists (status: ${existing.status}). Flag that run first if you need to regenerate this period.`
      );
    }

    runId = await generatePayroll({ periodStart: snapped.start, periodEnd: snapped.end, notes }, user.id);
    await logAudit(user.id, 'create', 'payroll_run', runId, `${snapped.start} → ${snapped.end}`);
    revalidatePath('/payroll');
  } catch (e) {
    const message = e instanceof ActionError ? e.message : 'Could not generate that payroll run.';
    redirect('/payroll/new?error=' + encodeURIComponent(message));
  }
  redirect(`/payroll/${runId}`);
}

// Per-site verification — a Daily Wage/Subcontract/Piece Work mix all land
// on the same payroll_item_sites rows, so this one mechanism verifies all
// three modes identically, unchanged from the old app's design. Once every
// site touched by the run has a verification row, the run auto-flips to
// 'verified'.
export async function verifySiteAction(formData: FormData) {
  const runId = Number(formData.get('runId'));
  const siteId = Number(formData.get('siteId'));
  try {
    const user = await requireActionCapability(formData, 'payroll.approve');
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (run && run.status === 'pending_verification') {
      await db
        .insert(payrollRunSiteVerifications)
        .values({ payrollRunId: runId, siteId, verifiedBy: user.id })
        .onConflictDoNothing({ target: [payrollRunSiteVerifications.payrollRunId, payrollRunSiteVerifications.siteId] });
      await logAudit(user.id, 'verify_site', 'payroll_run', runId, `site ${siteId}`);

      // count(...) comes back from pg as a string (bigint) unless cast —
      // ::int forces the driver's integer parser so these compare as
      // numbers below, not strings.
      const [{ totalSites }] = await db
        .select({ totalSites: sql<number>`count(distinct ${payrollItemSites.siteId})::int` })
        .from(payrollItemSites)
        .innerJoin(payrollItems, eq(payrollItems.id, payrollItemSites.payrollItemId))
        .where(eq(payrollItems.payrollRunId, runId));
      const [{ verifiedSites }] = await db
        .select({ verifiedSites: sql<number>`count(*)::int` })
        .from(payrollRunSiteVerifications)
        .where(eq(payrollRunSiteVerifications.payrollRunId, runId));

      if (totalSites > 0 && verifiedSites >= totalSites) {
        await db.update(payrollRuns).set({ status: 'verified', verifiedBy: user.id, verifiedAt: new Date() }).where(eq(payrollRuns.id, runId));
        await logAudit(user.id, 'verify', 'payroll_run', runId, 'all sites verified');
      }
    }
    revalidatePath(`/payroll/${runId}`);
  } catch (e) {
    if (e instanceof ActionError) redirect(`/payroll/${runId}?error=` + encodeURIComponent(e.message));
    throw e;
  }
  redirect(`/payroll/${runId}`);
}

export async function completeRunAction(formData: FormData) {
  const runId = Number(formData.get('runId'));
  try {
    const user = await requireActionCapability(formData, 'payroll.approve');
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (run && run.status === 'verified') {
      await db.update(payrollRuns).set({ status: 'completed', completedBy: user.id, completedAt: new Date() }).where(eq(payrollRuns.id, runId));
      await logAudit(user.id, 'complete', 'payroll_run', runId, null);
    }
    revalidatePath(`/payroll/${runId}`);
  } catch (e) {
    if (e instanceof ActionError) redirect(`/payroll/${runId}?error=` + encodeURIComponent(e.message));
    throw e;
  }
  redirect(`/payroll/${runId}`);
}

export async function flagRunAction(formData: FormData) {
  const runId = Number(formData.get('runId'));
  try {
    const user = await requireActionCapability(formData, 'payroll.generate');
    const reason = String(formData.get('reason') || '').trim() || null;
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    if (run && !run.flagged) {
      await db.update(payrollRuns).set({ flagged: true, flaggedBy: user.id, flaggedAt: new Date(), flaggedReason: reason }).where(eq(payrollRuns.id, runId));
      await logAudit(user.id, 'flag', 'payroll_run', runId, reason);
    }
    revalidatePath('/payroll');
    revalidatePath(`/payroll/${runId}`);
  } catch (e) {
    if (e instanceof ActionError) redirect(`/payroll/${runId}?error=` + encodeURIComponent(e.message));
    throw e;
  }
  redirect(`/payroll/${runId}`);
}
