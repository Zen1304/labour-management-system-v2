// Shared helpers every mutating Server Action needs: an authenticated CSRF
// check (identity = the session token) plus the capability-gated current
// user. Not itself a "use server" file (exports a class/plain functions
// freely) — imported by the actual "use server" action files.
import { csrfToken, verifyCsrf } from './csrf';
import { getCurrentUser, getSessionToken } from './session';
import { can, type AuthUser, type Capability } from './permissions';

export class ActionError extends Error {}

// pg's error codes land on the raw error (direct pool.query calls) OR on
// `.cause` (Drizzle wraps every driver error in its own DrizzleQueryError).
// Check both so "already in use" detection works regardless of which path
// an action used to hit the DB.
export function pgErrorCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code ?? err?.cause?.code;
}

// For rendering the hidden _csrf field on a page — identity is the caller's
// own session token, so this must only be called for an already-logged-in
// user (every admin page calls requireCapability()/requireUser() first).
export async function authCsrfToken(): Promise<string> {
  const token = await getSessionToken();
  return csrfToken(token || '');
}

// Call at the top of every mutating Server Action: verifies CSRF against
// the acting session, re-checks the capability server-side (never trust
// that the page that rendered the form actually enforced it), and returns
// the authenticated user for the action to use (e.g. for audit logging).
export async function requireActionCapability(formData: FormData, capability: Capability): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new ActionError('Not signed in.');
  const token = await getSessionToken();
  if (!verifyCsrf(token || '', formData.get('_csrf'))) {
    throw new ActionError('Session expired — please reload the page and try again.');
  }
  if (!can(user, capability)) {
    throw new ActionError('You do not have permission to do that.');
  }
  return user;
}
