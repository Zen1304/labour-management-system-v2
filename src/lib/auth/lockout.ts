// Login lockout — ported from the old app's src/auth.js. Deliberately
// simple for a small internal user base: keyed by username only (not IP),
// 8 failed attempts locks that username out for 15 minutes.
import { db } from '@/lib/db/client';
import { loginAttempts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function isLockedOut(username: string): Promise<boolean> {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.username, username));
  if (!row || !row.lockedUntil) return false;
  return row.lockedUntil.getTime() > Date.now();
}

export async function recordFailedAttempt(username: string): Promise<void> {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.username, username));
  const count = (row?.failedCount ?? 0) + 1;
  const lockedUntil = count >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : row?.lockedUntil ?? null;

  await db
    .insert(loginAttempts)
    .values({ username, failedCount: count, lockedUntil })
    .onConflictDoUpdate({
      target: loginAttempts.username,
      set: { failedCount: count, lockedUntil },
    });
}

export async function clearFailedAttempts(username: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.username, username));
}
