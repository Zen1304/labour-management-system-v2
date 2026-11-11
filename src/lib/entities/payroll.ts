// Payroll generation + verification — extended from the old app's
// generatePayroll() (see rebuild plan, "Payroll generation algorithm
// (redesigned)"). Unit of computation stays per worker × per site slice,
// exactly like the old app; what changed is *how* a slice's pay is
// computed, dispatching on whether an active pay_agreement covers that
// worker+site for this period:
//
//   1. No covering agreement        -> Daily Wage, the old hours*rate formula.
//   2. piece_work, worker's own entries -> quantity * rate_per_unit.
//   3. piece_work, team-level entries   -> team quantity's pay, split by
//                                          share_percent/equal split.
//   4. subcontract                      -> lump_sum_amount split by
//                                          share_percent/equal split,
//                                          guaranteed regardless of
//                                          attendance (Zen's explicit call),
//                                          paid out exactly once per
//                                          agreement (see lumpSumPaidAt on
//                                          the schema).
//
// Attendance is still mandatory under every mode, so hours/overtime are
// recorded on every slice for visibility even when they don't drive pay.
// site_performance cuts/bonuses/additional payments apply on top of any
// mode's computed slice pay, unchanged from the old app.
import { and, eq, gte, lte, or, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  attendance,
  siteOffDays,
  sites,
  workers,
  payAgreements,
  payAgreementWorkers,
  pieceWorkEntries,
  payrollRuns,
  payrollItems,
  payrollItemSites,
  payrollDeductions,
  payrollRunSiteVerifications,
  sitePerformance,
  type Worker,
  type PayAgreement,
} from '@/lib/db/schema';

// ---------- Pay-period math (ported verbatim: fixed Thu->Wed weeks) ----------

function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function snapToPayPeriod(dateStr: string | null | undefined): { start: string; end: string } | null {
  if (!dateStr) return null;
  const d = toUtcDate(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const dow = d.getUTCDay();
  const daysSinceThursday = (dow - 4 + 7) % 7;
  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - daysSinceThursday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: fmt(start), end: fmt(end) };
}

export function currentPayPeriod(): { start: string; end: string } {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  return snapToPayPeriod(todayStr)!;
}

// ---------- Share splitting (same rule as pay-agreements.ts validateShares) ----------

// Exported for unit testing (see src/lib/entities/__tests__/payroll.test.ts)
// — the same equal-split-when-every-share-is-null rule as
// pay-agreements.ts's validateShares(), reused here for both Subcontract
// lump sums and Piece Work team-entry splits.
export function splitAmount(amount: number, shares: { workerId: number; sharePercent: number | null }[]): Map<number, number> {
  const result = new Map<number, number>();
  if (shares.length === 0) return result;
  const allEqual = shares.every((s) => s.sharePercent === null);
  if (allEqual) {
    const each = amount / shares.length;
    for (const s of shares) result.set(s.workerId, each);
  } else {
    for (const s of shares) result.set(s.workerId, amount * ((s.sharePercent ?? 0) / 100));
  }
  return result;
}

// The callback type db.transaction() hands its body — used instead of
// `typeof db` since the transaction handle lacks db's own .transaction()
// method, which would otherwise make these helpers' parameter type and the
// actual argument structurally mismatched.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------- site_performance adjustments (ported verbatim) ----------

async function sitePerformanceAdjustmentsFor(tx: Tx, siteId: number, periodStart: string, periodEnd: string) {
  return tx
    .select()
    .from(sitePerformance)
    .where(and(eq(sitePerformance.siteId, siteId), lte(sitePerformance.periodStart, periodEnd), gte(sitePerformance.periodEnd, periodStart)))
    .orderBy(sitePerformance.id);
}

type SliceInput = {
  itemId: number;
  siteId: number;
  payAgreementId: number | null;
  hours: number;
  overtime: number;
  basePay: number;
  overtimePay: number;
  siteHoursTotal: number; // across every worker at this site this period (for additional_payment proration)
  workerHoursShare: number; // this worker's hours+overtime at this site this period
  siteName: string;
};

async function applySitePerformanceAndInsertSlice(tx: Tx, slice: SliceInput, periodStart: string, periodEnd: string) {
  const sliceTotal = slice.basePay + slice.overtimePay;
  const adjustments = await sitePerformanceAdjustmentsFor(tx, slice.siteId, periodStart, periodEnd);
  let adjustmentsTotal = 0;

  for (const adj of adjustments) {
    if (adj.adjustmentType === 'additional_payment') {
      if (!slice.siteHoursTotal || !adj.flatAmount) continue;
      const amount = Math.round(adj.flatAmount * (slice.workerHoursShare / slice.siteHoursTotal) * -100) / 100; // negative = addition
      if (amount === 0) continue;
      await tx.insert(payrollDeductions).values({
        payrollItemId: slice.itemId,
        reason: `${slice.siteName} additional payment (${adj.periodStart} to ${adj.periodEnd})${adj.reason ? ': ' + adj.reason : ''}`,
        amount,
      });
      adjustmentsTotal += amount;
    } else {
      if (!adj.cutPercent) continue;
      const sign = adj.adjustmentType === 'bonus' ? -1 : 1;
      const amount = Math.round(sliceTotal * (adj.cutPercent / 100) * sign * 100) / 100;
      if (amount === 0) continue;
      await tx.insert(payrollDeductions).values({
        payrollItemId: slice.itemId,
        reason: `${slice.siteName} performance ${adj.adjustmentType} — ${adj.cutPercent}% (${adj.periodStart} to ${adj.periodEnd})${adj.reason ? ': ' + adj.reason : ''}`,
        amount,
      });
      adjustmentsTotal += amount;
    }
  }

  await tx.insert(payrollItemSites).values({
    payrollItemId: slice.itemId,
    siteId: slice.siteId,
    payAgreementId: slice.payAgreementId,
    hoursWorked: slice.hours,
    overtimeHours: slice.overtime,
    basePay: slice.basePay,
    overtimePay: slice.overtimePay,
    adjustmentsTotal,
    netPay: sliceTotal - adjustmentsTotal,
  });
}

export interface GeneratePayrollInput {
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
}

export async function generatePayroll(input: GeneratePayrollInput, userId: number): Promise<number> {
  const { periodStart, periodEnd, notes } = input;

  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(payrollRuns)
      .values({ periodStart, periodEnd, generatedBy: userId, notes: notes || null })
      .returning({ id: payrollRuns.id });
    const runId = run.id;

    // Off-day exclusions: that site+date is excluded from pay entirely, no
    // matter what was logged (same rule as the old app; this rebuild also
    // now rejects these writes up front — see attendance.ts — so this is
    // defense-in-depth for any row written before a site was marked off).
    const offRows = await tx
      .select({ siteId: siteOffDays.siteId, date: siteOffDays.date })
      .from(siteOffDays)
      .where(and(gte(siteOffDays.date, periodStart), lte(siteOffDays.date, periodEnd)));
    const offSet = new Set(offRows.map((o) => `${o.siteId}:${o.date}`));

    const activeWorkers: Worker[] = await tx.select().from(workers).where(eq(workers.status, 'active'));

    // Agreements covering this period: active, period overlap.
    const agreements: PayAgreement[] = await tx
      .select()
      .from(payAgreements)
      .where(
        and(
          eq(payAgreements.status, 'active'),
          lte(payAgreements.periodStart, periodEnd),
          or(isNull(payAgreements.periodEnd), gte(payAgreements.periodEnd, periodStart))
        )
      );
    const agreementIds = agreements.map((a) => a.id);
    const agreementById = new Map(agreements.map((a) => [a.id, a]));

    const assignments = agreementIds.length
      ? await tx.select().from(payAgreementWorkers).where(inArray(payAgreementWorkers.payAgreementId, agreementIds))
      : [];
    const sharesByAgreement = new Map<number, { workerId: number; sharePercent: number | null }[]>();
    for (const a of assignments) {
      if (!sharesByAgreement.has(a.payAgreementId)) sharesByAgreement.set(a.payAgreementId, []);
      sharesByAgreement.get(a.payAgreementId)!.push({ workerId: a.workerId, sharePercent: a.sharePercent });
    }

    // Which agreements cover which worker (a worker can be assigned to more
    // than one, but realistically at most one per site — if more than one
    // covers the same worker+site, the first one found wins; this is a data
    // hygiene concern for pay-agreement admins, not something generation
    // tries to adjudicate).
    const workerAgreements = new Map<number, PayAgreement[]>();
    for (const a of agreements) {
      for (const share of sharesByAgreement.get(a.id) || []) {
        if (!workerAgreements.has(share.workerId)) workerAgreements.set(share.workerId, []);
        const list = workerAgreements.get(share.workerId)!;
        if (!list.some((x) => x.siteId === a.siteId)) list.push(a);
      }
    }

    // Piece-work entries dated within this period, for covering agreements.
    const pwEntries = agreementIds.length
      ? await tx
          .select()
          .from(pieceWorkEntries)
          .where(and(inArray(pieceWorkEntries.payAgreementId, agreementIds), gte(pieceWorkEntries.date, periodStart), lte(pieceWorkEntries.date, periodEnd)))
      : [];

    // Per-(agreement, worker) piece-work pay: individual entries pay the
    // worker directly; team-level entries (worker_id NULL) are pooled and
    // split by share/equal split across that agreement's assigned workers.
    const pieceWorkPay = new Map<string, number>(); // `${agreementId}:${workerId}` -> pay
    const teamQtyByAgreement = new Map<number, number>();
    for (const e of pwEntries) {
      const agreement = agreementById.get(e.payAgreementId);
      if (!agreement) continue;
      if (e.workerId == null) {
        teamQtyByAgreement.set(e.payAgreementId, (teamQtyByAgreement.get(e.payAgreementId) || 0) + e.quantity);
      } else {
        const key = `${e.payAgreementId}:${e.workerId}`;
        pieceWorkPay.set(key, (pieceWorkPay.get(key) || 0) + e.quantity * (agreement.ratePerUnit || 0));
      }
    }
    for (const [agreementId, teamQty] of teamQtyByAgreement) {
      const agreement = agreementById.get(agreementId)!;
      const teamPay = teamQty * (agreement.ratePerUnit || 0);
      const split = splitAmount(teamPay, sharesByAgreement.get(agreementId) || []);
      for (const [workerId, amt] of split) {
        const key = `${agreementId}:${workerId}`;
        pieceWorkPay.set(key, (pieceWorkPay.get(key) || 0) + amt);
      }
    }

    // Subcontract lump sums: paid out exactly once per agreement, the first
    // run generated once the agreement is active and covers this period.
    const lumpSumPay = new Map<string, number>(); // `${agreementId}:${workerId}` -> pay
    const agreementsToMarkPaid: number[] = [];
    for (const a of agreements) {
      if (a.mode !== 'subcontract' || a.lumpSumPaidAt) continue;
      const split = splitAmount(a.lumpSumAmount || 0, sharesByAgreement.get(a.id) || []);
      for (const [workerId, amt] of split) lumpSumPay.set(`${a.id}:${workerId}`, amt);
      agreementsToMarkPaid.push(a.id);
    }

    const siteNameCache = new Map<number, string>();
    async function siteName(siteId: number): Promise<string> {
      if (!siteNameCache.has(siteId)) {
        const [s] = await tx.select({ name: sites.name }).from(sites).where(eq(sites.id, siteId));
        siteNameCache.set(siteId, s?.name || `Site ${siteId}`);
      }
      return siteNameCache.get(siteId)!;
    }

    // First pass: attendance, grouped per worker and per site, plus a
    // period-wide per-site hours total (needed to prorate flat
    // additional_payment amounts across everyone who worked there — this
    // still runs off attendance hours for every mode, since attendance
    // stays mandatory under all three).
    type WorkerSlice = { hours: number; overtime: number };
    const siteTotals = new Map<number, WorkerSlice>();
    const workerData: Array<{
      w: Worker;
      presentDates: Set<string>;
      hoursWorked: number;
      overtimeHours: number;
      leaveHours: number;
      bySite: Map<number, WorkerSlice>;
    }> = [];

    for (const w of activeWorkers) {
      const records = await tx
        .select()
        .from(attendance)
        .where(and(eq(attendance.workerId, w.id), gte(attendance.date, periodStart), lte(attendance.date, periodEnd)));
      const filtered = records.filter((r) => !offSet.has(`${r.siteId}:${r.date}`));

      const presentDates = new Set<string>();
      let hoursWorked = 0,
        overtimeHours = 0,
        leaveHours = 0;
      const bySite = new Map<number, WorkerSlice>();
      for (const r of filtered) {
        if (r.hoursWorked > 0) presentDates.add(r.date);
        hoursWorked += r.hoursWorked || 0;
        overtimeHours += r.overtimeHours || 0;
        leaveHours += r.leaveHours || 0;
        const cur = bySite.get(r.siteId) || { hours: 0, overtime: 0 };
        cur.hours += r.hoursWorked || 0;
        cur.overtime += r.overtimeHours || 0;
        bySite.set(r.siteId, cur);
        const totalCur = siteTotals.get(r.siteId) || { hours: 0, overtime: 0 };
        totalCur.hours += r.hoursWorked || 0;
        totalCur.overtime += r.overtimeHours || 0;
        siteTotals.set(r.siteId, totalCur);
      }
      workerData.push({ w, presentDates, hoursWorked, overtimeHours, leaveHours, bySite });
    }

    // Second pass: dispatch each worker's slices across modes and insert
    // payroll_items / payroll_item_sites.
    for (const wd of workerData) {
      const { w } = wd;
      const coveringAgreements = workerAgreements.get(w.id) || [];
      const coveredSiteIds = new Set(coveringAgreements.map((a) => a.siteId));

      // Daily Wage pay only for sites NOT covered by an agreement for this worker.
      let dailyWageBasePay = 0;
      let dailyWageOvertimePay = 0;
      for (const [siteId, slice] of wd.bySite) {
        if (coveredSiteIds.has(siteId)) continue;
        dailyWageBasePay += slice.hours * w.wageRate;
        dailyWageOvertimePay += slice.overtime * w.wageRate * (w.overtimeMultiplier || 1.5);
      }

      const agreementSlices = coveringAgreements.map((a) => {
        const key = `${a.id}:${w.id}`;
        const pay = a.mode === 'piece_work' ? pieceWorkPay.get(key) || 0 : lumpSumPay.get(key) || 0;
        return { agreement: a, pay };
      });
      const agreementPayTotal = agreementSlices.reduce((sum, s) => sum + s.pay, 0);

      const totalBasePay = dailyWageBasePay + agreementPayTotal;
      const totalOvertimePay = dailyWageOvertimePay; // agreement pay has no overtime concept

      const modesPresent = new Set<string>();
      if (dailyWageBasePay > 0 || dailyWageOvertimePay > 0) modesPresent.add('daily_wage');
      for (const s of agreementSlices) if (s.pay > 0) modesPresent.add(s.agreement.mode);
      const payMode = modesPresent.size === 0 ? 'daily_wage' : modesPresent.size === 1 ? ([...modesPresent][0] as 'daily_wage' | 'subcontract' | 'piece_work') : 'mixed';
      const payoutMethod = coveringAgreements[0]?.payoutMethod || 'cash';

      const [item] = await tx
        .insert(payrollItems)
        .values({
          payrollRunId: runId,
          workerId: w.id,
          vendorId: w.vendorId,
          payMode,
          payoutMethod,
          daysPresent: wd.presentDates.size,
          leaveHours: wd.leaveHours,
          hoursWorked: wd.hoursWorked,
          overtimeHours: wd.overtimeHours,
          basePay: totalBasePay,
          overtimePay: totalOvertimePay,
        })
        .returning({ id: payrollItems.id });
      const itemId = item.id;

      // Daily Wage slices (uncovered sites).
      for (const [siteId, slice] of wd.bySite) {
        if (coveredSiteIds.has(siteId)) continue;
        const siteTotal = siteTotals.get(siteId) || { hours: 0, overtime: 0 };
        await applySitePerformanceAndInsertSlice(
          tx,
          {
            itemId,
            siteId,
            payAgreementId: null,
            hours: slice.hours,
            overtime: slice.overtime,
            basePay: slice.hours * w.wageRate,
            overtimePay: slice.overtime * w.wageRate * (w.overtimeMultiplier || 1.5),
            siteHoursTotal: siteTotal.hours + siteTotal.overtime,
            workerHoursShare: slice.hours + slice.overtime,
            siteName: await siteName(siteId),
          },
          periodStart,
          periodEnd
        );
      }

      // Agreement slices (Subcontract / Piece Work) — one per covering
      // agreement, created even with zero attendance so a subcontract
      // worker with no clock-ins that period still shows up for per-site
      // verification.
      for (const s of agreementSlices) {
        const attendanceSlice = wd.bySite.get(s.agreement.siteId) || { hours: 0, overtime: 0 };
        const siteTotal = siteTotals.get(s.agreement.siteId) || { hours: 0, overtime: 0 };
        await applySitePerformanceAndInsertSlice(
          tx,
          {
            itemId,
            siteId: s.agreement.siteId,
            payAgreementId: s.agreement.id,
            hours: attendanceSlice.hours,
            overtime: attendanceSlice.overtime,
            basePay: s.pay,
            overtimePay: 0,
            siteHoursTotal: siteTotal.hours + siteTotal.overtime,
            workerHoursShare: attendanceSlice.hours + attendanceSlice.overtime,
            siteName: await siteName(s.agreement.siteId),
          },
          periodStart,
          periodEnd
        );
      }
    }

    // Mark subcontract agreements paid, now that the run has succeeded.
    for (const agreementId of agreementsToMarkPaid) {
      await tx.update(payAgreements).set({ lumpSumPaidAt: new Date() }).where(eq(payAgreements.id, agreementId));
    }

    return runId;
  });
}

// ---------- Per-site aggregation, for the run detail/verification page ----------

export async function sitesForPayrollRun(runId: number) {
  const rows = await db
    .select({
      siteId: payrollItemSites.siteId,
      hoursWorked: sql<number>`coalesce(sum(${payrollItemSites.hoursWorked}), 0)`,
      overtimeHours: sql<number>`coalesce(sum(${payrollItemSites.overtimeHours}), 0)`,
      basePay: sql<number>`coalesce(sum(${payrollItemSites.basePay}), 0)`,
      overtimePay: sql<number>`coalesce(sum(${payrollItemSites.overtimePay}), 0)`,
      adjustmentsTotal: sql<number>`coalesce(sum(${payrollItemSites.adjustmentsTotal}), 0)`,
      netPay: sql<number>`coalesce(sum(${payrollItemSites.netPay}), 0)`,
      workerCount: sql<number>`count(distinct ${payrollItems.workerId})::int`,
    })
    .from(payrollItemSites)
    .innerJoin(payrollItems, eq(payrollItems.id, payrollItemSites.payrollItemId))
    .where(eq(payrollItems.payrollRunId, runId))
    .groupBy(payrollItemSites.siteId);

  const verifications = await db
    .select({ siteId: payrollRunSiteVerifications.siteId, verifiedAt: payrollRunSiteVerifications.verifiedAt })
    .from(payrollRunSiteVerifications)
    .where(eq(payrollRunSiteVerifications.payrollRunId, runId));
  const verifiedMap = new Map(verifications.map((v) => [v.siteId, v.verifiedAt]));

  return rows.map((r) => ({ ...r, verifiedAt: verifiedMap.get(r.siteId) || null }));
}
