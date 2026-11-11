import { requireUser } from '@/lib/auth/guard';
import { getSessionToken } from '@/lib/auth/session';
import { csrfToken } from '@/lib/auth/csrf';
import { ROLE_LABEL } from '@/lib/auth/permissions';
import { logoutAction } from './logout/actions';
import { Button } from '@/components/ui/button';

// Every authenticated page reads the session cookie via requireUser(),
// which is inherently request-time — opt out of static-shell prerendering
// for now rather than restructuring every page around Suspense boundaries
// in Phase 1. Revisit per-page once the app has enough traffic for it to
// matter (see Next's Cache Components migration guide).
export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser();
  const token = await getSessionToken();
  const csrf = csrfToken(token || '');

  return (
    <div className="mx-auto max-w-3xl py-16">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Labour Management System</h1>
          <p className="text-neutral-500">
            Signed in as {user.name} &middot; {ROLE_LABEL[user.role]}
          </p>
        </div>
        <form action={logoutAction}>
          <input type="hidden" name="_csrf" value={csrf} />
          <Button type="submit" variant="outline">Log out</Button>
        </form>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <p className="text-sm text-neutral-600">
          Phase 1 (auth/RBAC foundation) is live: login, logout, session management, login
          lockout, forced-password-change, and CSRF protection are all working end to end.
          Core business entities (sites, vendors, workers, attendance, pay agreements, payroll)
          land in the next phases.
        </p>
      </div>
    </div>
  );
}
