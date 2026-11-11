'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users, auditLog } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/guard';
import { getSessionToken } from '@/lib/auth/session';
import { verifyCsrf, csrfToken } from '@/lib/auth/csrf';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser({ allowMustChangePassword: true });
  const token = await getSessionToken();

  if (!token || !verifyCsrf(token, formData.get('_csrf'))) {
    redirect('/account/change-password?error=' + encodeURIComponent('Session expired — please try again.'));
  }

  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  const [row] = await db.select().from(users).where(eq(users.id, user.id));
  if (!row || !verifyPassword(currentPassword, row.salt, row.passwordHash)) {
    redirect('/account/change-password?error=' + encodeURIComponent('Current password is incorrect.'));
  }
  if (newPassword.length < 8) {
    redirect('/account/change-password?error=' + encodeURIComponent('New password must be at least 8 characters.'));
  }
  if (newPassword !== confirmPassword) {
    redirect('/account/change-password?error=' + encodeURIComponent('New password and confirmation do not match.'));
  }
  if (newPassword === currentPassword) {
    redirect('/account/change-password?error=' + encodeURIComponent('New password must be different from the current one.'));
  }

  const { hash, salt } = hashPassword(newPassword);
  await db.update(users).set({ passwordHash: hash, salt, mustChangePassword: false }).where(eq(users.id, user.id));
  await db.insert(auditLog).values({ userId: user.id, action: 'update', entityType: 'user', entityId: user.id, detail: 'changed own password' });

  redirect('/');
}

export async function getChangePasswordCsrf(): Promise<string> {
  const token = await getSessionToken();
  return csrfToken(token || '');
}
