// Session handling — ported from the old app's src/auth.js. A 256-bit
// random token, 12-hour TTL, stored in a plain `sessions` table (no JWT —
// deliberately revocable server-side, same as before: deactivating a user
// must kill their live session immediately, not just block new logins).
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { sessions, users } from '@/lib/db/schema';
import type { AuthUser, Role } from './permissions';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
export const SESSION_COOKIE = 'session';

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ token, userId, expiresAt });
  return token;
}

export async function destroySessionByToken(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

// Re-checks `active` on every call (not just at login) — a deactivated
// user's existing session must stop working on their very next request.
export async function getUserFromToken(token: string): Promise<AuthUser | null> {
  const [row] = await db
    .select({
      token: sessions.token,
      expiresAt: sessions.expiresAt,
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token));

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await destroySessionByToken(token);
    return null;
  }
  if (!row.active) {
    await destroySessionByToken(token);
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role as Role,
    active: row.active,
    mustChangePassword: row.mustChangePassword,
  };
}

// Server Component / Server Action helper — the one place that reads the
// cookie jar, everything else works with a plain AuthUser.
export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserFromToken(token);
}

export async function getSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}
