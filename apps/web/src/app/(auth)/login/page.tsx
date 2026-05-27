import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Log in' };

interface Props {
  searchParams: Promise<{ return?: string; redirectTo?: string; joined?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { return: returnUrl, redirectTo, joined } = await searchParams;
  // Support both ?return= (explicit links) and ?redirectTo= (middleware redirect)
  const effectiveReturnUrl = returnUrl ?? redirectTo;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-white">
            PLAY<span className="text-brand-600">OFFE</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">Welcome back</p>
          <p className="mt-1 text-xs text-slate-500">Log in to your PLAYOFFE account</p>
        </div>
        {joined && (
          <div className="mb-4 rounded-lg border border-green-800 bg-green-950/60 px-4 py-3 text-sm text-green-300">
            ✓ You&apos;ve been added as a club manager. Log in to access your dashboard.
          </div>
        )}
        <div className="rounded-xl bg-surface-card px-8 py-10 ring-1 ring-surface-border">
          <LoginForm returnUrl={effectiveReturnUrl} />
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <Link href={effectiveReturnUrl ? `/register?return=${encodeURIComponent(effectiveReturnUrl)}` : '/register'} className="font-semibold text-brand-400 hover:text-brand-300">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
