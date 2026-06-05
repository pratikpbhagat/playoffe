'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfileAction } from '@/lib/actions/profile';
import type { CareerEntry, Certification } from '@/lib/actions/profile';

interface Props {
  initial: {
    full_name: string;
    location: string | null;
    photo_url: string | null;
    headline: string | null;
    bio: string | null;
    playing_since: number | null;
    preferred_style: string | null;
    career_history: CareerEntry[];
    certifications: Certification[];
  };
  username: string;
}

const emptyCareer = (): CareerEntry => ({ role: '', club: '', years: '' });
const emptyCert = (): Certification => ({ name: '', issuer: '', year: new Date().getFullYear() });

export function EditProfileForm({ initial, username }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [values, setValues] = useState({
    full_name: initial.full_name,
    location: initial.location ?? '',
    headline: initial.headline ?? '',
    bio: initial.bio ?? '',
    playing_since: initial.playing_since?.toString() ?? '',
    preferred_style: initial.preferred_style ?? '',
  });

  const [careerHistory, setCareerHistory] = useState<CareerEntry[]>(
    initial.career_history.length > 0 ? initial.career_history : [],
  );
  const [certifications, setCertifications] = useState<Certification[]>(
    initial.certifications.length > 0 ? initial.certifications : [],
  );

  function set(field: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setSuccess(false);
  }

  function setCareer(index: number, field: keyof CareerEntry, value: string) {
    setCareerHistory((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)),
    );
  }

  function addCareer() {
    if (careerHistory.length < 5) setCareerHistory((prev) => [...prev, emptyCareer()]);
  }

  function removeCareer(index: number) {
    setCareerHistory((prev) => prev.filter((_, i) => i !== index));
  }

  function setCert(index: number, field: keyof Certification, value: string | number) {
    setCertifications((prev) =>
      prev.map((cert, i) => (i === index ? { ...cert, [field]: value } : cert)),
    );
  }

  function addCert() {
    if (certifications.length < 5) setCertifications((prev) => [...prev, emptyCert()]);
  }

  function removeCert(index: number) {
    setCertifications((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const result = await updateProfileAction({
      ...values,
      career_history: careerHistory,
      certifications,
    });

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setTimeout(() => router.push(`/p/${username}`), 800);
    }
    setSaving(false);
  }

  const bioLen = values.bio.length;
  const headlineLen = values.headline.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Display name */}
      <Field label="Display name" required>
        <input
          type="text"
          value={values.full_name}
          onChange={(e) => set('full_name', e.target.value)}
          placeholder="Your full name"
          maxLength={100}
          required
          className={inputCls}
        />
      </Field>

      {/* Location */}
      <Field label="Location" hint="City or region — shown on your profile and rankings">
        <input
          type="text"
          value={values.location}
          onChange={(e) => set('location', e.target.value)}
          placeholder="e.g. Sydney, NSW"
          maxLength={80}
          className={inputCls}
        />
      </Field>

      {/* Headline */}
      <Field label="Headline" hint={`${headlineLen}/120`}>
        <input
          type="text"
          value={values.headline}
          onChange={(e) => set('headline', e.target.value.slice(0, 120))}
          placeholder="e.g. Open singles finalist · 4.5 rated"
          maxLength={120}
          className={inputCls}
        />
      </Field>

      {/* Bio */}
      <Field label="Bio" hint={`${bioLen}/600`}>
        <textarea
          value={values.bio}
          onChange={(e) => set('bio', e.target.value.slice(0, 600))}
          placeholder="Tell other players a bit about yourself…"
          rows={4}
          maxLength={600}
          className={`${inputCls} resize-none`}
        />
      </Field>

      {/* Playing since */}
      <Field label="Playing since" hint="Year you started playing pickleball">
        <input
          type="number"
          value={values.playing_since}
          onChange={(e) => set('playing_since', e.target.value)}
          placeholder="e.g. 2021"
          min={1990}
          max={new Date().getFullYear()}
          className={`${inputCls} w-32`}
        />
      </Field>

      {/* Preferred style */}
      <Field label="Playing style" hint="Brief description of how you play">
        <input
          type="text"
          value={values.preferred_style}
          onChange={(e) => set('preferred_style', e.target.value.slice(0, 100))}
          placeholder="e.g. Aggressive baseliner, dink-heavy, serve and volley"
          maxLength={100}
          className={inputCls}
        />
      </Field>

      {/* Career history */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">Career history</label>
          {careerHistory.length < 5 && (
            <button
              type="button"
              onClick={addCareer}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              + Add entry
            </button>
          )}
        </div>
        {careerHistory.length === 0 && (
          <p className="text-xs text-slate-600">
            No career entries yet.{' '}
            <button type="button" onClick={addCareer} className="text-brand-400 hover:text-brand-300">
              Add one
            </button>
          </p>
        )}
        {careerHistory.map((entry, i) => (
          <div key={i} className="rounded-lg border border-slate-700 bg-surface p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 font-medium">Entry {i + 1}</span>
              <button
                type="button"
                onClick={() => removeCareer(i)}
                className="text-xs text-slate-600 hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={entry.role}
                onChange={(e) => setCareer(i, 'role', e.target.value)}
                placeholder="Role (e.g. Club captain)"
                maxLength={80}
                className={inputCls}
              />
              <input
                type="text"
                value={entry.club}
                onChange={(e) => setCareer(i, 'club', e.target.value)}
                placeholder="Club / organisation"
                maxLength={80}
                className={inputCls}
              />
            </div>
            <input
              type="text"
              value={entry.years}
              onChange={(e) => setCareer(i, 'years', e.target.value)}
              placeholder="Years (e.g. 2020–present)"
              maxLength={30}
              className={`${inputCls} w-48`}
            />
          </div>
        ))}
      </div>

      {/* Certifications */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">Certifications</label>
          {certifications.length < 5 && (
            <button
              type="button"
              onClick={addCert}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              + Add certification
            </button>
          )}
        </div>
        {certifications.length === 0 && (
          <p className="text-xs text-slate-600">
            No certifications yet.{' '}
            <button type="button" onClick={addCert} className="text-brand-400 hover:text-brand-300">
              Add one
            </button>
          </p>
        )}
        {certifications.map((cert, i) => (
          <div key={i} className="rounded-lg border border-slate-700 bg-surface p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 font-medium">Certification {i + 1}</span>
              <button
                type="button"
                onClick={() => removeCert(i)}
                className="text-xs text-slate-600 hover:text-red-400 transition-colors"
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={cert.name}
                onChange={(e) => setCert(i, 'name', e.target.value)}
                placeholder="Certification name"
                maxLength={80}
                className={inputCls}
              />
              <input
                type="text"
                value={cert.issuer}
                onChange={(e) => setCert(i, 'issuer', e.target.value)}
                placeholder="Issuing body"
                maxLength={80}
                className={inputCls}
              />
            </div>
            <input
              type="number"
              value={cert.year}
              onChange={(e) => setCert(i, 'year', parseInt(e.target.value, 10) || new Date().getFullYear())}
              placeholder="Year"
              min={1990}
              max={new Date().getFullYear() + 1}
              className={`${inputCls} w-28`}
            />
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-400">
          Profile saved! Redirecting…
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
        <button
          type="button"
          onClick={() => router.push(`/p/${username}`)}
          className="w-full rounded-lg border border-surface-border px-5 py-2.5 text-sm text-slate-400 hover:text-white hover:border-slate-500 transition-colors sm:w-auto"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 sm:w-auto"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  'block w-full rounded-lg border border-slate-700 bg-surface px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition';

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-sm font-medium text-slate-300">
          {label}
          {required && <span className="ml-1 text-red-400">*</span>}
        </label>
        {hint && <span className="text-xs text-slate-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
