// Vendor dependency counts + the next-code generator — ported from the old
// app's app.js (vendorDependencyCounts/nextVendorCode). Shared between the
// vendors list page and the create/delete Server Actions.
import { pool } from '@/lib/db/client';

export async function nextVendorCode(): Promise<string> {
  const { rows } = await pool.query<{ m: number | null }>(
    `SELECT MAX(CAST(SUBSTRING(vendor_code FROM 2) AS INTEGER)) m FROM vendors WHERE vendor_code ~ '^V[0-9]{4}$'`
  );
  const next = (rows[0]?.m ?? 0) + 1;
  return 'V' + String(next).padStart(4, '0');
}

export interface VendorDependencyCounts {
  workers: number;
  activeWorkers: number;
  payrollItems: number;
}

export async function vendorDependencyCounts(vendorId: number): Promise<VendorDependencyCounts> {
  const [workers, activeWorkers] = await Promise.all([
    pool.query<{ c: string }>('SELECT COUNT(*) c FROM workers WHERE vendor_id = $1', [vendorId]),
    pool.query<{ c: string }>("SELECT COUNT(*) c FROM workers WHERE vendor_id = $1 AND status = 'active'", [vendorId]),
  ]);
  // payroll_items doesn't exist until Phase 5 — guarded so this function
  // works correctly (reports 0) before that table is created.
  let payrollItems = 0;
  try {
    const r = await pool.query<{ c: string }>('SELECT COUNT(*) c FROM payroll_items WHERE vendor_id = $1', [vendorId]);
    payrollItems = Number(r.rows[0]?.c ?? 0);
  } catch {
    payrollItems = 0;
  }
  return {
    workers: Number(workers.rows[0]?.c ?? 0),
    activeWorkers: Number(activeWorkers.rows[0]?.c ?? 0),
    payrollItems,
  };
}
