// Worker code generator + the two validation rules the old app enforced on
// every create/edit (exact-12-digit Aadhar, >=10-digit contact number).
import { pool, db } from '@/lib/db/client';
import { workers } from '@/lib/db/schema';
import { ne, eq, and } from 'drizzle-orm';

export async function nextWorkerCode(): Promise<string> {
  const { rows } = await pool.query<{ m: number | null }>(
    `SELECT MAX(CAST(SUBSTRING(worker_code FROM 2) AS INTEGER)) m FROM workers WHERE worker_code ~ '^W[0-9]{5}$'`
  );
  const next = (rows[0]?.m ?? 0) + 1;
  return 'W' + String(next).padStart(5, '0');
}

export const AADHAR_RE = /^\d{12}$/;

export function digitsOnly(s: string): string {
  return (s || '').replace(/\D/g, '');
}

export const PHONE_RE = /^\d{10,}$/;

export async function findWorkerByAadhar(aadhar: string, excludeId?: number) {
  const condition = excludeId
    ? and(eq(workers.aadharNumber, aadhar), ne(workers.id, excludeId))
    : eq(workers.aadharNumber, aadhar);
  const [row] = await db.select().from(workers).where(condition);
  return row || null;
}
