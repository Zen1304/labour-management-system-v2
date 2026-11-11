import { requireCapability } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';
import { attendanceTrend, payrollCostTrend, performanceAdjustmentImpact, vendorComparison } from '@/lib/entities/analytics';

export const instant = false;

const PAY_MODE_LABEL: Record<string, string> = {
  daily_wage: 'Daily Wage',
  subcontract: 'Subcontract',
  piece_work: 'Piece Work',
  mixed: 'Mixed',
};

function fmtMoney(v: number): string {
  return `₹${v.toFixed(2)}`;
}

export default async function AnalyticsPage() {
  const user = await requireCapability('analytics.view');
  const TREND_DAYS = 14;

  const [attendance, payrollTrend, siteImpact, vendors] = await Promise.all([
    attendanceTrend(TREND_DAYS),
    payrollCostTrend(10),
    performanceAdjustmentImpact(),
    vendorComparison(TREND_DAYS),
  ]);

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">Analytics</h1>

      <h2 className="mb-2 text-lg font-semibold">Attendance % by site — last {TREND_DAYS} days</h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-brand-line bg-white p-4">
        {attendance.rows.length === 0 ? (
          <p className="text-sm text-brand-ink-soft/70">No sites with active workers yet.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-brand-line text-left text-brand-ink-soft">
                <th className="py-1 pr-3">Site</th>
                {attendance.dates.map((d) => (
                  <th key={d} className="px-1 py-1 text-right">
                    {d.slice(5)}
                  </th>
                ))}
                <th className="py-1 pl-3 text-right">Avg</th>
              </tr>
            </thead>
            <tbody>
              {attendance.rows.map((r) => (
                <tr key={r.siteId} className="border-b border-brand-line/70">
                  <td className="py-1 pr-3">{r.siteName}</td>
                  {r.dailyPct.map((v, i) => (
                    <td key={i} className="px-1 py-1 text-right text-brand-ink-soft">
                      {v === null ? '—' : `${v}%`}
                    </td>
                  ))}
                  <td className="py-1 pl-3 text-right font-semibold">{r.avgPct === null ? '—' : `${r.avgPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Payroll cost trend</h2>
          <div className="rounded-lg border border-brand-line bg-white p-4">
            {payrollTrend.length === 0 ? (
              <p className="text-sm text-brand-ink-soft/70">No payroll runs generated yet.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-brand-line text-left text-brand-ink-soft">
                    <th className="py-1">Period</th>
                    <th className="py-1 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollTrend.map((r, i) => (
                    <tr key={i} className="border-b border-brand-line/70">
                      <td className="py-1">{r.periodStart}</td>
                      <td className="py-1 text-right">{fmtMoney(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-brand-ink-soft/70">Net payout per generated run, most recent 10 (excludes flagged runs).</p>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">Site performance impact</h2>
          <div className="rounded-lg border border-brand-line bg-white p-4">
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-brand-sand p-3">
                <div className="text-xs uppercase text-brand-ink-soft">Cuts logged ({siteImpact.totalCuts})</div>
                <div className="text-lg font-bold">{fmtMoney(siteImpact.totalDeducted)}</div>
              </div>
              <div className="rounded-md bg-brand-sand p-3">
                <div className="text-xs uppercase text-brand-ink-soft">Bonuses/payments ({siteImpact.totalBonusesAndPayments})</div>
                <div className="text-lg font-bold">{fmtMoney(siteImpact.totalAdded)}</div>
              </div>
            </div>
            {siteImpact.rows.length === 0 ? (
              <p className="text-sm text-brand-ink-soft/70">No site-performance adjustments logged yet.</p>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-brand-line text-left text-brand-ink-soft">
                    <th className="py-1">Site</th>
                    <th className="py-1">Type</th>
                    <th className="py-1 text-right">Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {siteImpact.rows.map((r) => (
                    <tr key={r.id} className="border-b border-brand-line/70">
                      <td className="py-1">{r.siteName}</td>
                      <td className="py-1">{r.adjustmentType}</td>
                      <td className="py-1 text-right">{fmtMoney(r.amountApplied)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <h2 className="mb-2 text-lg font-semibold">Vendor comparison</h2>
      <div className="overflow-x-auto rounded-lg border border-brand-line bg-white p-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-line text-left text-brand-ink-soft">
              <th className="py-2">Vendor</th>
              <th className="py-2">Workers</th>
              <th className="py-2">Avg attendance</th>
              <th className="py-2 text-right">Total paid</th>
              <th className="py-2 text-right">Cash</th>
              <th className="py-2 text-right">Bank/Cheque</th>
              <th className="py-2">By pay mode</th>
            </tr>
          </thead>
          <tbody>
            {vendors.rows.map((v) => (
              <tr key={v.id} className="border-b border-brand-line/70">
                <td className="py-2">
                  {v.name}
                  {v.isDirect ? ' (Direct)' : ''}
                </td>
                <td className="py-2">
                  {v.activeCount}/{v.workerCount}
                </td>
                <td className="py-2">{v.avgAttendancePct === null ? '—' : `${v.avgAttendancePct}%`}</td>
                <td className="py-2 text-right">{fmtMoney(v.totalPaid)}</td>
                <td className="py-2 text-right">{fmtMoney(v.cashPaid)}</td>
                <td className="py-2 text-right">{fmtMoney(v.bankPaid)}</td>
                <td className="py-2 text-xs text-brand-ink-soft">
                  {v.payModeBreakdown.length === 0
                    ? '—'
                    : v.payModeBreakdown.map((b) => `${PAY_MODE_LABEL[b.payMode] || b.payMode}: ${fmtMoney(b.total)}`).join(' · ')}
                </td>
              </tr>
            ))}
            {vendors.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-brand-ink-soft/70">
                  No vendors yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
