// Plain constants used by both server actions and server components. Kept
// out of login/actions.ts because a "use server" file may only export
// async functions — a plain const export there is a build error.
export const ANON_CSRF_COOKIE = 'csrf_anon';
