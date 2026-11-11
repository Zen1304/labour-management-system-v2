// Combines password verification + lockout + session creation — ported
// from the old app's auth.login(). Used by the login server action.
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { verifyPassword } from './password';
import { isLockedOut, recordFailedAttempt, clearFailedAttempts } from './lockout';
import { createSession } from './session';

export type LoginResult = { ok: true; token: string } | { ok: false; locked: true } | { ok: false; locked: false };

export async function login(username: string, password: string): Promise<LoginResult> {
  if (await isLockedOut(username)) {
    return { ok: false, locked: true };
  }

  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user || !user.active) {
    await recordFailedAttempt(username);
    return { ok: false, locked: false };
  }

  if (!verifyPassword(password, user.salt, user.passwordHash)) {
    await recordFailedAttempt(username);
    return { ok: false, locked: false };
  }

  await clearFailedAttempts(username);
  const token = await createSession(user.id);
  return { ok: true, token };
}
