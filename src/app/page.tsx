import { requireUser } from '@/lib/auth/guard';
import { AppShell } from '@/components/app-shell';

// Every authenticated page reads the session cookie via requireUser(),
// which is inherently request-time — opt out of static-shell prerendering
// for now rather than restructuring every page around Suspense boundaries
// in Phase 1. Revisit per-page once the app has enough traffic for it to
// matter (see Next's Cache Components migration guide).
export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <p className="text-sm text-neutral-600">
          Phase 1 (auth/RBAC) and Phase 2 (core entities) are live. Attendance, pay agreements,
          and payroll land in the next phases.
        </p>
      </div>
    </AppShell>
  );
}
