'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadAvatarAction } from '@/lib/actions/profile';

interface Props {
  currentUrl: string | null;
  username: string;
}

export function PhotoUpload({ currentUrl, username }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Local preview
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setError(null);
    setUploading(true);

    const fd = new FormData();
    fd.append('file', file);
    const result = await uploadAvatarAction(fd);

    if (result.error) {
      setError(result.error);
      setPreview(currentUrl);
    } else {
      setPreview(result.url ?? null);
      router.refresh();
    }
    setUploading(false);
  }

  const initials = username.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-5 pb-6 mb-6 border-b border-surface-border">
      {/* Avatar preview */}
      <div
        className="relative h-16 w-16 shrink-0 rounded-full overflow-hidden bg-brand-600/30 flex items-center justify-center cursor-pointer ring-2 ring-surface-border hover:ring-brand-500 transition-all"
        onClick={() => inputRef.current?.click()}
        title="Click to change photo"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Avatar" className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl font-bold text-brand-400">{initials}</span>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-slate-300">Profile photo</p>
        <p className="mt-0.5 text-xs text-slate-500">JPEG, PNG or WebP · max 5 MB</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-2 rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:border-brand-500 hover:text-brand-400 transition-colors disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : preview ? 'Change photo' : 'Upload photo'}
        </button>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFile}
        className="sr-only"
        aria-label="Upload profile photo"
      />
    </div>
  );
}
