'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { destroySessionByToken, SESSION_COOKIE, getSessionToken } from '@/lib/auth/session';
import { verifyCsrf } from '@/lib/auth/csrf';

export async function logoutAction(formData: FormData) {
  const token = await getSessionToken();
  if (token) {
    // Logout is a state-changing POST (not a GET), CSRF-protected like
    // every other mutation — the old app had this exact fix (v9.8).
    if (!verifyCsrf(token, formData.get('_csrf'))) {
      redirect('/');
    }
    await destroySessionByToken(token);
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
