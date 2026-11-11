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
    <div className="flex min-h-screen items-center justify-center bg-brand-sand px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/bilara-logo.png" alt="Bilara Group" className="h-20 w-auto" />
          <div className="mt-5 brand-rule w-16" />
        </div>

        <div className="rounded-xl border border-brand-line bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-semibold tracking-wide text-brand-ink">
              Labour Management
            </h1>
            <p className="mt-1 text-sm text-brand-ink-soft">Sign in to continue</p>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="_csrf" value={csrf} />
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-ink-soft">
                Username
              </label>
              <Input name="username" type="text" required autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-ink-soft">
                Password
              </label>
              <Input name="password" type="password" required />
            </div>
            <Button type="submit" variant="accent" className="w-full">
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs tracking-widest text-brand-ink-soft/70 uppercase">
          Bilara Group &middot; Carved Perfection
        </p>
      </div>
    </div>
  );
}
