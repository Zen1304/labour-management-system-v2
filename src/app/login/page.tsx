import { getAnonCsrfToken, loginAction } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Reads cookies()/searchParams at request time (CSRF token, flash error) —
// can't be part of a prerendered static shell. See the Cache Components
// migration guide; revisit with a proper Suspense boundary later if this
// page's load time ever matters (it's a login screen, not hot-path UI).
export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const csrf = await getAnonCsrfToken();

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm rounded-xl bg-neutral-900 p-8 shadow-xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-white">Labour Management System</h1>
          <p className="mt-1 text-sm text-neutral-400">Sign in to continue</p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-950 px-4 py-2 text-sm text-red-300">{error}</div>
        )}

        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="_csrf" value={csrf} />
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-neutral-400">Username</label>
            <Input name="username" type="text" required autoFocus className="bg-neutral-800 text-white border-neutral-700" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-neutral-400">Password</label>
            <Input name="password" type="password" required className="bg-neutral-800 text-white border-neutral-700" />
          </div>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
