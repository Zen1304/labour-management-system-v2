// Super-admin protection + shared validation regexes — ported from the old
// app's superAdminGuardError()/EMAIL_RE/PHONE_RE.
import type { Role } from '@/lib/auth/permissions';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^\d{10,15}$/;

export function digitsOnly(s: string): string {
  return (s || '').replace(/\D/g, '');
}

export const SUPER_ADMIN_MANAGE_ERROR = 'Only a Super Admin can manage another Super Admin account.';
export const SUPER_ADMIN_PROMOTE_ERROR = 'Only a Super Admin can promote a user to Super Admin.';

export function superAdminGuardError(
  actingRole: Role,
  opts: { targetRole?: Role; submittedRole?: Role } = {}
): string | null {
  if (actingRole === 'super_admin') return null;
  if (opts.targetRole === 'super_admin') return SUPER_ADMIN_MANAGE_ERROR;
  if (opts.submittedRole === 'super_admin') return SUPER_ADMIN_PROMOTE_ERROR;
  return null;
}
