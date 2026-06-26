import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/supabase/server';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = { title: 'Set a new password' };

export default async function ResetPasswordPage() {
  // Without a session at this point, the recovery code exchange in
  // /api/auth/confirm either never ran or failed — show that clearly instead
  // of letting the user fill out the whole form only to fail on submit.
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-white">
            PLAY<span className="text-brand-600">OFFE</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">Set a new password</p>
        </div>
        <div className="rounded-xl bg-surface-card px-8 py-10 ring-1 ring-surface-border">
          {user ? (
            <ResetPasswordForm />
          ) : (
            <div className="space-y-4 text-center">
              <div className="text-4xl">⏳</div>
              <h2 className="text-lg font-semibold text-white">Link expired or invalid</h2>
              <p className="text-sm text-slate-400">
                This password reset link is no longer valid. Request a new one from the login page.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block w-full rounded-lg bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Request a new link
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
