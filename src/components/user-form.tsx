import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ROLES, ROLE_LABEL, type Role } from '@/lib/auth/permissions';
import type { User } from '@/lib/db/schema';

export function UserForm({
  user,
  assignedSiteIds,
  siteOptions,
  actingRole,
  csrf,
  action,
  submitLabel,
}: {
  user?: User;
  assignedSiteIds?: number[];
  siteOptions: { id: number; label: string }[];
  actingRole: Role;
  csrf: string;
  action: (formData: FormData) => void;
  submitLabel: string;
}) {
  const assigned = new Set(assignedSiteIds || []);
  const selectableRoles = ROLES.filter((r) => r !== 'super_admin' || actingRole === 'super_admin');

  return (
    <form action={action} className="max-w-2xl space-y-4">
      <input type="hidden" name="_csrf" value={csrf} />
      {user && <input type="hidden" name="id" value={user.id} />}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Username (email)</label>
          <Input name="username" type="email" required defaultValue={user?.username} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Name</label>
          <Input name="name" required defaultValue={user?.name} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Contact phone</label>
          <Input name="contact" required defaultValue={user?.contact ?? ''} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">Role</label>
          <select
            name="role"
            required
            defaultValue={user?.role}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
          >
            {!user && <option value="">Select a role</option>}
            {selectableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase text-neutral-500">
          {user ? 'New password (leave blank to keep current)' : 'Password'}
        </label>
        <Input name={user ? 'newPassword' : 'password'} type="password" minLength={8} required={!user} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="mustChangePassword" value="1" defaultChecked={user ? user.mustChangePassword : true} />
        Require password change on {user ? 'next' : 'first'} login
      </label>

      <div>
        <p className="mb-1 text-xs font-medium uppercase text-neutral-500">
          Site assignments (Project Manager / Site Engineer only)
        </p>
        <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-200 p-2">
          {siteOptions.map((s) => (
            <label key={s.id} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" name="siteIds" value={s.id} defaultChecked={assigned.has(s.id)} />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
