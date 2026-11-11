// Analytics/reports — ported from the old app's attendanceTrendChart /
// payrollCostTrendChart / performanceAdjustmentImpact / vendorComparisonRows,
// extended per the rebuild plan with pay-mode/payout-method breakdowns
// (the old app only ever had Daily Wage, so there was nothing to break
// down). Rendered as plain tables here rather than the old app's hand-rolled
// SVG line/bar charts — same underlying numbers, a lighter lift for a first
// pass; swap in real charts later if the tables prove hard to scan.
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sites, workers, attendance, payrollRuns, payrollItems, payrollDeductions, sitePerformance, vendors } from '@/lib/db/schema';
import { POOL_SITE_ID } from './attendance';

function lastNDates(n: number, todayStr: string): string[] {
  const today = new Date(`${todayStr}T00:00:00Z`);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export interface AttendanceTrendRow {
  siteId: number;
  siteName: string;
  dailyPct: (number | null)[];
  avgPct: number | null;
}

export async function attendanceTrend(days: number): Promise<{ dates: string[]; rows: AttendanceTrendRow[] }> {
  const today = new Date().toISOString().slice(0, 10);
  const dates = lastNDates(days, today);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const siteRows = await db.select({ id: sites.id, name: sites.name }).from(sites).where(ne(sites.id, POOL_SITE_ID)).orderBy(sql`${sites.projectNumber} nulls last`, sites.name);

  const activeCounts = await db
    .select({ siteId: workers.siteId, c: sql<number>`count(*)::int` })
    .from(workers)
    .where(eq(workers.status, 'active'))
    .groupBy(workers.siteId);
  const activeMap = new Map(activeCounts.map((r) => [r.siteId, r.c]));

  const presentRows = await db
    .select({ siteId: attendance.siteId, date: attendance.date, c: sql<number>`count(distinct ${attendance.workerId})::int` })
    .from(attendance)
    .where(and(gte(attendance.date, from), lte(attendance.date, to), sql`${attendance.hoursWorked} > 0`))
    .groupBy(attendance.siteId, attendance.date);
  const presentMap = new Map(presentRows.map((r) => [`${r.siteId}|${r.date}`, r.c]));

  const activeSites = siteRows.filter((s) => (activeMap.get(s.id) || 0) > 0).slice(0, 8);

  const rows: AttendanceTrendRow[] = activeSites.map((s) => {
    const denom = activeMap.get(s.id) || 0;
    const dailyPct = dates.map((date) => {
      if (denom === 0) return null;
      const present = presentMap.get(`${s.id}|${date}`) || 0;
      return Math.round((present / denom) * 1000) / 10;
    });
    const valid = dailyPct.filter((v): v is number => v !== null);
    const avgPct = valid.length ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10 : null;
    return { siteId: s.id, siteName: s.name, dailyPct, avgPct };
  });

  return { dates, rows };
}

export interface PayrollTrendRow {
  periodStart: string;
  periodEnd: string;
  net: number;
}

export async function payrollCostTrend(limit: number): Promise<PayrollTrendRow[]> {
  // Built with one query per run rather than a single nested-subquery SQL
  // string: a correlated subquery referencing payroll_runs.id by column
  // object alone rendered unqualified ("id") inside the doubly-nested
  // deductions subquery, which Postgres then rejected as ambiguous against
  // payroll_items.id in scope there. Looping is simpler and unambiguous —
  // this only ever runs over a handful of runs (`limit`, default 10).
  const runs = await db
    .select({ id: payrollRuns.id, periodStart: payrollRuns.periodStart, periodEnd: payrollRuns.periodEnd })
    .from(payrollRuns)
    .where(eq(payrollRuns.flagged, false))
    .orderBy(sql`${payrollRuns.id} desc`)
    .limit(limit);

  const withNet = await Promise.all(
    runs.map(async (r) => {
      const [{ gross }] = await db
        .select({ gross: sql<number>`coalesce(sum(${payrollItems.basePay} + ${payrollItems.overtimePay}), 0)` })
        .from(payrollItems)
        .where(eq(payrollItems.payrollRunId, r.id));
      const [{ deducted }] = await db
        .select({ deducted: sql<number>`coalesce(sum(${payrollDeductions.amount}), 0)` })
        .from(payrollDeductions)
        .innerJoin(payrollItems, eq(payrollItems.id, payrollDeductions.payrollItemId))
        .where(eq(payrollItems.payrollRunId, r.id));
      return { periodStart: r.periodStart, periodEnd: r.periodEnd, net: Number(gross) - Number(deducted) };
    })
  );
  return withNet.reverse();
}

export async function performanceAdjustmentImpact() {
  const adjustments = await db
    .select({
      id: sitePerformance.id,
      siteId: sitePerformance.siteId,
      siteName: sites.name,
      periodStart: sitePerformance.periodStart,
      periodEnd: sitePerformance.periodEnd,
      adjustmentType: sitePerformance.adjustmentType,
      cutPercent: sitePerformance.cutPercent,
      flatAmount: sitePerformance.flatAmount,
      reason: sitePerformance.reason,
    })
    .from(sitePerformance)
    .innerJoin(sites, eq(sites.id, sitePerformance.siteId))
    .orderBy(sql`${sitePerformance.periodStart} desc`);

  let totalDeducted = 0;
  let totalAdded = 0;

  const rows = await Promise.all(
    adjustments.map(async (a) => {
      const pattern =
        a.adjustmentType === 'additional_payment'
          ? `${a.siteName} additional payment (${a.periodStart} to ${a.periodEnd}%`
          : `${a.siteName} performance ${a.adjustmentType} — ${a.cutPercent}% (${a.periodStart} to ${a.periodEnd}%`;
      const [{ c }] = await db
        .select({ c: sql<number>`coalesce(sum(${payrollDeductions.amount}), 0)` })
        .from(payrollDeductions)
        .innerJoin(payrollItems, eq(payrollItems.id, payrollDeductions.payrollItemId))
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
        .where(and(sql`${payrollDeductions.reason} LIKE ${pattern}`, eq(payrollRuns.flagged, false)));
      const amount = Math.abs(Number(c));
      if (a.adjustmentType === 'cut') totalDeducted += amount;
      else totalAdded += amount;
      return { ...a, amountApplied: amount };
    })
  );

  const totalCuts = adjustments.filter((a) => a.adjustmentType === 'cut').length;
  const totalBonusesAndPayments = adjustments.length - totalCuts;
  return { rows, totalDeducted, totalAdded, totalCuts, totalBonusesAndPayments };
}

export interface VendorComparisonRow {
  id: number;
  name: string;
  isDirect: boolean;
  workerCount: number;
  activeCount: number;
  totalPaid: number;
  avgAttendancePct: number | null;
  cashPaid: number;
  bankPaid: number;
  payModeBreakdown: { payMode: string; total: number }[];
}

export async function vendorComparison(days: number): Promise<{ rows: VendorComparisonRow[]; maxPaid: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const dates = lastNDates(days, today);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const vendorRows = await db.select().from(vendors).orderBy(sql`${vendors.isDirect} desc`, vendors.name);

  const presentDaysRows = await db
    .select({ vendorId: workers.vendorId, c: sql<number>`count(*)::int` })
    .from(attendance)
    .innerJoin(workers, eq(workers.id, attendance.workerId))
    .where(and(gte(attendance.date, from), lte(attendance.date, to), sql`${attendance.hoursWorked} > 0`))
    .groupBy(workers.vendorId);
  const presentDaysMap = new Map(presentDaysRows.map((r) => [r.vendorId, r.c]));

  const rows = await Promise.all(
    vendorRows.map(async (v) => {
      const [{ c: workerCount }] = await db.select({ c: sql<number>`count(*)::int` }).from(workers).where(eq(workers.vendorId, v.id));
      const [{ c: activeCount }] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(workers)
        .where(and(eq(workers.vendorId, v.id), eq(workers.status, 'active')));

      const paidRows = await db
        .select({
          payMode: payrollItems.payMode,
          payoutMethod: payrollItems.payoutMethod,
          total: sql<number>`coalesce(sum(${payrollItems.basePay} + ${payrollItems.overtimePay}), 0)`,
        })
        .from(payrollItems)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.payrollRunId))
        .where(and(eq(payrollItems.vendorId, v.id), eq(payrollRuns.flagged, false)))
        .groupBy(payrollItems.payMode, payrollItems.payoutMethod);

      const totalPaid = paidRows.reduce((sum, r) => sum + Number(r.total), 0);
      const cashPaid = paidRows.filter((r) => r.payoutMethod === 'cash').reduce((sum, r) => sum + Number(r.total), 0);
      const bankPaid = paidRows.filter((r) => r.payoutMethod === 'bank_transfer').reduce((sum, r) => sum + Number(r.total), 0);
      const payModeTotals = new Map<string, number>();
      for (const r of paidRows) payModeTotals.set(r.payMode, (payModeTotals.get(r.payMode) || 0) + Number(r.total));
      const payModeBreakdown = [...payModeTotals.entries()].map(([payMode, total]) => ({ payMode, total }));

      const denom = activeCount * days;
      const avgAttendancePct = denom > 0 ? Math.min(100, Math.round(((presentDaysMap.get(v.id) || 0) / denom) * 1000) / 10) : null;

      return { id: v.id, name: v.name, isDirect: v.isDirect, workerCount, activeCount, totalPaid, avgAttendancePct, cashPaid, bankPaid, payModeBreakdown };
    })
  );

  const maxPaid = Math.max(...rows.map((r) => r.totalPaid), 0);
  return { rows, maxPaid };
}
