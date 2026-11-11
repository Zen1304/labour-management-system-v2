import { requireUser } from '@/lib/auth/guard';
import { changePasswordAction, getChangePasswordCsrf } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Reads the session cookie at request time — see note in app/page.tsx.
export const instant = false;

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser({ allowMustChangePassword: true });
  const { error } = await searchParams;
  const csrf = await getChangePasswordCsrf();

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-2 text-xl font-bold">Change your password</h1>
      {user.mustChangePassword && (
        <p className="mb-6 text-sm text-amber-700">
          You must set a new password before continuing to use the app.
        </p>
      )}
      {error && <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      <form action={changePasswordAction} className="space-y-4">
        <input type="hidden" name="_csrf" value={csrf} />
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Current password</label>
          <Input name="currentPassword" type="password" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">New password</label>
          <Input name="newPassword" type="password" required minLength={8} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase text-brand-ink-soft">Confirm new password</label>
          <Input name="confirmPassword" type="password" required minLength={8} />
        </div>
        <Button type="submit" className="w-full">Update password</Button>
      </form>
    </div>
  );
}
