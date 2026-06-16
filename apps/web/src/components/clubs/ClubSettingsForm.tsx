'use client';

import { useState, useTransition, useRef } from 'react';
import Image from 'next/image';
import { updateClubAction, uploadClubLogoAction } from '@/lib/actions/clubs';
import type { UpdateClubInput } from '@/lib/actions/clubs';
import { useToast } from '@/components/ui/ToastProvider';

const PRESET_COLORS = [
  '#7c3aed', // brand purple
  '#2563eb', // blue
  '#059669', // green
  '#dc2626', // red
  '#d97706', // amber
  '#0891b2', // cyan
  '#be185d', // pink
  '#4f46e5', // indigo
];

const inputClass =
  'block w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

interface Props {
  clubId: string;
  clubSlug: string;
  initialValues: {
    name: string;
    description: string | null;
    city: string | null;
    location: string | null;
    website: string | null;
    founding_year: number | null;
    is_open_to_join: boolean;
    brand_primary_color: string;
    brand_secondary_color: string;
    logo_url: string | null;
  };
}

export function ClubSettingsForm({ clubId, clubSlug, initialValues }: Props) {
  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description ?? '');
  const [city, setCity] = useState(initialValues.city ?? '');
  const [location, setLocation] = useState(initialValues.location ?? '');
  const [website, setWebsite] = useState(initialValues.website ?? '');
  const [foundingYear, setFoundingYear] = useState(initialValues.founding_year?.toString() ?? '');
  const [isOpenToJoin, setIsOpenToJoin] = useState(initialValues.is_open_to_join);
  const [primaryColor, setPrimaryColor] = useState(initialValues.brand_primary_color);
  const [secondaryColor, setSecondaryColor] = useState(initialValues.brand_secondary_color);
  const [logoUrl, setLogoUrl] = useState(initialValues.logo_url);

  const [isSavePending, startSaveTransition] = useTransition();
  const [isLogoPending, startLogoTransition] = useTransition();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();

    const input: UpdateClubInput = {
      name: name.trim(),
      description: description.trim() || null,
      city: city.trim() || null,
      location: location.trim() || null,
      website: website.trim() || null,
      founding_year: foundingYear ? parseInt(foundingYear, 10) : null,
      is_open_to_join: isOpenToJoin,
      brand_primary_color: primaryColor,
      brand_secondary_color: secondaryColor,
    };

    startSaveTransition(async () => {
      const result = await updateClubAction(clubId, clubSlug, input);
      if ('error' in result && result.error) {
        toast(result.error as string, 'error');
      } else {
        toast('Club settings saved', 'success');
      }
    });
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('logo', file);

    startLogoTransition(async () => {
      const result = await uploadClubLogoAction(clubId, clubSlug, formData);
      if ('error' in result && result.error) {
        toast(result.error as string, 'error');
      } else if ('logo_url' in result && result.logo_url) {
        setLogoUrl(result.logo_url);
        toast('Logo updated', 'success');
      }
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-8">
      {/* Logo */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-6 py-5">
        <h3 className="mb-4 text-sm font-semibold text-white">Club logo</h3>
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <Image src={logoUrl} alt="Club logo" width={64} height={64} className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-xl text-2xl font-black text-white"
              style={{ backgroundColor: primaryColor }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={isLogoPending}
              className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-slate-300 hover:bg-surface hover:text-white transition-colors disabled:opacity-50"
            >
              {isLogoPending ? 'Uploading…' : 'Upload logo'}
            </button>
            <p className="mt-1 text-xs text-slate-600">PNG, JPG, WebP or SVG · max 2 MB</p>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              onChange={handleLogoChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Basic info */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-6 py-5 space-y-5">
        <h3 className="text-sm font-semibold text-white">Basic information</h3>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">
            Club name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Description</label>
          <textarea
            rows={3}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description of your club"
            className={`${inputClass} resize-none`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">City</label>
            <input
              type="text"
              maxLength={80}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Melbourne"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Venue / location</label>
            <input
              type="text"
              maxLength={200}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. 123 Main St"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Website</label>
            <input
              type="url"
              maxLength={500}
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourclub.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Founded year</label>
            <input
              type="number"
              min={1900}
              max={new Date().getFullYear()}
              value={foundingYear}
              onChange={(e) => setFoundingYear(e.target.value)}
              placeholder="e.g. 2018"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Open to join</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Allow players to request membership to your club.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpenToJoin((v) => !v)}
            aria-pressed={isOpenToJoin}
            className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isOpenToJoin ? 'bg-brand-600' : 'bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                isOpenToJoin ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Brand colours */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-6 py-5 space-y-5">
        <h3 className="text-sm font-semibold text-white">Brand colours</h3>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Primary colour</label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setPrimaryColor(c)}
                className="h-7 w-7 rounded-full transition focus:outline-none"
                style={{
                  backgroundColor: c,
                  boxShadow: primaryColor === c ? `0 0 0 2px #fff` : 'none',
                }}
                title={c}
              />
            ))}
            <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent"
              />
              Custom
            </label>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">Secondary colour</label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSecondaryColor(c)}
                className="h-7 w-7 rounded-full transition focus:outline-none"
                style={{
                  backgroundColor: c,
                  boxShadow: secondaryColor === c ? `0 0 0 2px #fff` : 'none',
                }}
                title={c}
              />
            ))}
            <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent"
              />
              Custom
            </label>
          </div>
        </div>

        {/* Colour preview */}
        <div className="flex gap-2">
          <div
            className="h-8 flex-1 rounded-lg"
            style={{ backgroundColor: primaryColor }}
            title={`Primary: ${primaryColor}`}
          />
          <div
            className="h-8 flex-1 rounded-lg"
            style={{ backgroundColor: secondaryColor }}
            title={`Secondary: ${secondaryColor}`}
          />
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSavePending}
          className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
        >
          {isSavePending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}
