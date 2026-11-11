// Shared chrome for every authenticated page: top bar (name/role + logout)
// plus a left nav gated per-link by capability. Each page still calls its
// own requireUser()/requireCapability() guard — this only hides links the
// current user couldn't use anyway, it isn't itself an authorization
// boundary.
import Link from 'next/link';
import { can, ROLE_LABEL, type AuthUser, type Capability } from '@/lib/auth/permissions';
import { csrfToken } from '@/lib/auth/csrf';
import { getSessionToken } from '@/lib/auth/session';
import { logoutAction } from '@/app/logout/actions';
import { Button } from '@/components/ui/button';

const NAV: { href: string; label: string; capability?: Capability }[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/attendance', label: 'Attendance', capability: 'attendance.mark' },
  { href: '/pay-agreements', label: 'Pay Agreements', capability: 'payagreements.manage' },
  { href: '/sites', label: 'Sites', capability: 'admin.full' },
  { href: '/vendors', label: 'Vendors', capability: 'admin.full' },
  { href: '/worker-types', label: 'Worker Types', capability: 'admin.full' },
  { href: '/workers', label: 'Workers', capability: 'workers.manage' },
  { href: '/users', label: 'Users', capability: 'admin.full' },
];

export async function AppShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const token = await getSessionToken();
  const csrf = csrfToken(token || '');
  const links = NAV.filter((item) => !item.capability || can(user, item.capability));

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-50 p-4">
        <div className="mb-6 px-2">
          <p className="text-sm font-bold">Labour Management</p>
          <p className="text-xs text-neutral-500">BilaraGroup</p>
        </div>
        <nav className="space-y-1">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
          <div className="text-sm text-neutral-600">
            {user.name} &middot; {ROLE_LABEL[user.role]}
          </div>
          <form action={logoutAction}>
            <input type="hidden" name="_csrf" value={csrf} />
            <Button type="submit" variant="outline">
              Log out
            </Button>
          </form>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
