'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerPlayerSchema, type RegisterPlayerInput } from '@pickleball/shared';
import { registerAction, checkUsernameAction } from '@/lib/actions/auth';
import { useState, useEffect } from 'react';
import { useDebounce } from '@/hooks/useDebounce';

export function RegisterForm({ returnUrl }: { returnUrl?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterPlayerInput>({
    resolver: zodResolver(registerPlayerSchema),
  });

  const username = watch('username');
  const debouncedUsername = useDebounce(username, 400);

  useEffect(() => {
    if (!debouncedUsername || debouncedUsername.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    checkUsernameAction(debouncedUsername).then(({ available }) => {
      setUsernameStatus(available ? 'available' : 'taken');
    });
  }, [debouncedUsername]);

  async function onSubmit(data: RegisterPlayerInput) {
    setServerError(null);
    if (usernameStatus === 'taken') return;
    const result = await registerAction(data, returnUrl);
    if (result?.error) setServerError(result.error);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {serverError && (
        <div className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-sm text-red-400">{serverError}</div>
      )}

      <Field label="Full name" error={errors.full_name?.message}>
        <input
          {...register('full_name')}
          type="text"
          placeholder="Alex Rivera"
          className={inputClass(!!errors.full_name)}
        />
      </Field>

      <Field label="Email address" error={errors.email?.message}>
        <input
          {...register('email')}
          type="email"
          placeholder="alex@example.com"
          className={inputClass(!!errors.email)}
        />
      </Field>

      <Field
        label="Username"
        error={errors.username?.message}
        hint={
          usernameStatus === 'available'
            ? 'Username is available'
            : usernameStatus === 'taken'
            ? 'Username is already taken'
            : usernameStatus === 'checking'
            ? 'Checking...'
            : 'Your public profile URL: playoffe.com/p/your-username'
        }
        hintColor={
          usernameStatus === 'available' ? 'green' :
          usernameStatus === 'taken' ? 'red' : 'gray'
        }
      >
        <input
          {...register('username')}
          type="text"
          placeholder="alex-rivera"
          className={inputClass(!!errors.username || usernameStatus === 'taken')}
        />
      </Field>

      <Field label="Password" error={errors.password?.message}>
        <input
          {...register('password')}
          type="password"
          placeholder="Min. 8 characters"
          className={inputClass(!!errors.password)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Gender" error={errors.gender?.message}>
          <select {...register('gender')} className={`${inputClass(!!errors.gender)} cursor-pointer`}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>

        <Field label="Date of birth" error={errors.dob?.message}>
          <input
            {...register('dob')}
            type="date"
            className={inputClass(!!errors.dob)}
          />
        </Field>
      </div>

      <Field label="Location (optional)" error={errors.location?.message}>
        <input
          {...register('location')}
          type="text"
          placeholder="Sydney, Australia"
          className={inputClass(!!errors.location)}
        />
      </Field>

      <button
        type="submit"
        disabled={isSubmitting || usernameStatus === 'taken'}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  hintColor = 'gray',
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  hintColor?: 'gray' | 'green' | 'red';
  children: React.ReactNode;
}) {
  const hintColors = { gray: 'text-slate-500', green: 'text-accent-500', red: 'text-red-400' };
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-300">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      {hint && !error && <p className={`mt-1 text-xs ${hintColors[hintColor]}`}>{hint}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `block w-full rounded-lg border px-3 py-2 text-sm text-white bg-surface shadow-sm outline-none transition placeholder:text-slate-500 focus:ring-2 focus:ring-brand-500/30 ${
    hasError
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
      : 'border-slate-600 focus:border-brand-500'
  }`;
}
