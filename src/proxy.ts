// Ensures the anonymous CSRF-identity cookie exists before the login page
// ever renders. A Server Component can't mutate cookies (only Server
// Actions/Route Handlers can), and generating a random id during render
// also conflicts with prerendering — so the one-time "create if missing"
// step happens here instead, in middleware, which can freely set response
// cookies.
import { NextResponse, type NextRequest } from 'next/server';
import { ANON_CSRF_COOKIE } from '@/lib/auth/constants';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== '/login') return NextResponse.next();
  if (request.cookies.get(ANON_CSRF_COOKIE)?.value) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(ANON_CSRF_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return response;
}

export const config = {
  matcher: '/login',
};
