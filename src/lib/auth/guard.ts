// Shared page-level guards. The old app enforced must_change_password as
// a near-top-of-router gate in app.js; here, since there's no single
// request-dispatch chokepoint in the App Router, every protected page
// calls requireUser() itself at the top of its Server Component — same
// effect, explicit per page rather than implicit via middleware.
import { redirect } from 'next/navigation';
import { getCurrentUser } from './session';
import { can, type AuthUser, type Capability } from './permissions';

export async function requireUser(opts: { allowMustChangePassword?: boolean } = {}): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword && !opts.allowMustChangePassword) {
    redirect('/account/change-password');
  }
  return user;
}

export async function requireCapability(capability: Capability): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, capability)) redirect('/forbidden');
  return user;
}
