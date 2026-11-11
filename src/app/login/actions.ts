'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { login } from '@/lib/auth/login';
import { verifyCsrf, csrfToken } from '@/lib/auth/csrf';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { ANON_CSRF_COOKIE } from '@/lib/auth/constants';

export async function getAnonCsrfToken(): Promise<string> {
  // Read-only: a Server Component can't set cookies, and middleware.ts
  // already guarantees this cookie exists before /login renders.
  const jar = await cookies();
  const anonId = jar.get(ANON_CSRF_COOKIE)?.value || '';
  return csrfToken(anonId);
}

export async function loginAction(formData: FormData) {
  const jar = await cookies();
  const anonId = jar.get(ANON_CSRF_COOKIE)?.value || '';
  const submittedCsrf = formData.get('_csrf');

  if (!verifyCsrf(anonId, submittedCsrf)) {
    redirect('/login?error=' + encodeURIComponent('Session expired — please try again.'));
  }

  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');

  const result = await login(username, password);

  if (!result.ok) {
    const message = result.locked
      ? 'Too many failed attempts. This account is locked for 15 minutes.'
      : 'Invalid username or password';
    redirect('/login?error=' + encodeURIComponent(message));
  }

  jar.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 60 * 60 * 12,
  });

  redirect('/');
}
