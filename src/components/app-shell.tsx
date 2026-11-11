// Shared chrome for every authenticated page: top bar (name/role + logout)
// plus a left nav gated per-link by capability. Each page still calls its
// own requireUser()/requireCapability() guard — this only hides links the
// current user couldn't use anyway, it isn't itself an authorization
// boundary.
import { can, ROLE_LABEL, type AuthUser, type Capability } from '@/lib/auth/permissions';
import { csrfToken } from '@/lib/auth/csrf';
import { getSessionToken } from '@/lib/auth/session';
import { logoutAction } from '@/app/logout/actions';
import { Button } from '@/components/ui/button';
import { SidebarNav } from '@/components/sidebar-nav';

const NAV: { href: string; label: string; capability?: Capability }[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/attendance', label: 'Attendance', capability: 'attendance.mark' },
  { href: '/pay-agreements', label: 'Pay Agreements', capability: 'payagreements.manage' },
  { href: '/payroll', label: 'Payroll', capability: 'payroll.view' },
  { href: '/analytics', label: 'Analytics', capability: 'analytics.view' },
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
    <div className="flex min-h-screen bg-brand-sand">
      <aside className="w-60 shrink-0 border-r border-brand-line bg-white p-5">
        <div className="mb-8 flex items-center gap-3 px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bilara-logo.png" alt="Bilara Group" className="h-9 w-auto" />
          <div>
            <p className="font-display text-base font-semibold leading-tight text-brand-ink">
              Labour Management
            </p>
            <p className="text-[11px] uppercase tracking-wide text-brand-ink-soft">Bilara Group</p>
          </div>
        </div>
        <SidebarNav links={links} />
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-brand-line bg-white px-6 py-3">
          <div className="text-sm text-brand-ink-soft">
            <span className="font-medium text-brand-ink">{user.name}</span> &middot; {ROLE_LABEL[user.role]}
          </div>
          <form action={logoutAction}>
            <input type="hidden" name="_csrf" value={csrf} />
            <Button type="submit" variant="outline" size="sm">
              Log out
            </Button>
          </form>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
