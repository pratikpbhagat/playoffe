'use client';

import { useState } from 'react';
import { sendDigestAction } from '@/lib/actions/digest';

interface Props {
  clubId: string;
}

export function DigestButton({ clubId }: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSend() {
    setState('sending');
    setErrorMsg(null);
    const result = await sendDigestAction(clubId);
    if (result.error) {
      setErrorMsg(result.error);
      setState('error');
    } else {
      setState('sent');
      // Reset after 4 seconds
      setTimeout(() => setState('idle'), 4000);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSend}
        disabled={state === 'sending' || state === 'sent'}
        className={`whitespace-nowrap flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
          state === 'sent'
            ? 'bg-accent-500/20 text-accent-400 cursor-default'
            : 'border border-surface-border text-slate-400 hover:bg-surface hover:text-white'
        }`}
      >
        {state === 'sending' && (
          <span className="h-3 w-3 rounded-full border-2 border-slate-500 border-t-transparent animate-spin" />
        )}
        {state === 'sent' ? '✓ Digest sent to your email' : state === 'sending' ? 'Sending…' : '📧 Send digest email'}
      </button>
      {state === 'error' && errorMsg && (
        <p className="text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  );
}
