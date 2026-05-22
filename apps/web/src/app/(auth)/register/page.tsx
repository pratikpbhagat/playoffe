import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/RegisterForm';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Create account' };

interface Props {
  searchParams: Promise<{ return?: string }>;
}

export default async function RegisterPage({ searchParams }: Props) {
  const { return: returnUrl } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black text-white">
            PLAY<span className="text-brand-600">OFFE</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">Create your account</p>
          <p className="mt-1 text-xs text-slate-500">One profile. Every club. Every tournament.</p>
        </div>
        <div className="rounded-xl bg-surface-card px-8 py-10 ring-1 ring-surface-border">
          <RegisterForm returnUrl={returnUrl} />
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href={returnUrl ? `/login?return=${encodeURIComponent(returnUrl)}` : '/login'} className="font-semibold text-brand-400 hover:text-brand-300">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
