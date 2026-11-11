import { requireCapability } from '@/lib/auth/guard';
import { authCsrfToken } from '@/lib/auth/action-helpers';
import { db } from '@/lib/db/client';
import { workerTypes } from '@/lib/db/schema';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createWorkerTypeAction, toggleWorkerTypeActiveAction } from './actions';

export const instant = false;

export default async function WorkerTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireCapability('admin.full');
  const { error } = await searchParams;
  const csrf = await authCsrfToken();
  const rows = await db.select().from(workerTypes).orderBy(workerTypes.name);

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">Worker Types</h1>
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <form action={createWorkerTypeAction} className="mb-6 flex items-end gap-2">
        <input type="hidden" name="_csrf" value={csrf} />
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">New worker type</label>
          <Input name="name" required placeholder="e.g. Mason" />
        </div>
        <Button type="submit">Add</Button>
      </form>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2">Name</th>
            <th className="py-2">Status</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-neutral-100">
              <td className="py-2">{row.name}</td>
              <td className="py-2">{row.active ? 'Active' : 'Inactive'}</td>
              <td className="py-2 text-right">
                <form action={toggleWorkerTypeActiveAction}>
                  <input type="hidden" name="_csrf" value={csrf} />
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="nextActive" value={(!row.active).toString()} />
                  <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                    {row.active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </form>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-6 text-center text-neutral-400">
                No worker types yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </AppShell>
  );
}
