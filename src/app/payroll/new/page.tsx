import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { currentPayPeriod } from '@/lib/entities/payroll';
import { generatePayrollAction } from '../actions';

export const instant = false;

export default async function NewPayrollRunPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireCapability('payroll.generate');
  const { error } = await searchParams;
  const csrf = await authCsrfToken();
  const period = currentPayPeriod();

  return (
    <AppShell user={user}>
      <h1 className="mb-2 text-2xl font-bold">Generate payroll run</h1>
      <p className="mb-6 text-sm text-brand-ink-soft">
        Pick any date inside the pay period you want — it snaps to the enclosing Thursday→Wednesday week automatically.
        Every active worker is included: Daily Wage from attendance, Subcontract/Piece Work from active pay agreements,
        dispatched automatically per worker per site.
      </p>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <form action={generatePayrollAction} className="max-w-md space-y-4">
        <input type="hidden" name="_csrf" value={csrf} />
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Period start (any date in the week)</label>
          <Input name="periodStart" type="date" defaultValue={period.start} required />
          <p className="mt-1 text-xs text-brand-ink-soft/70">
            Current period: {period.start} → {period.end}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Notes (optional)</label>
          <Input name="notes" />
        </div>
        <Button type="submit">Generate</Button>
      </form>
    </AppShell>
  );
}
