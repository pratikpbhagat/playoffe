'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WizardPreview } from './WizardPreview';
import type { WizardMessage, WizardPartialConfig } from '@/app/api/wizard/turn/route';

interface Props {
  clubId: string;
  clubName: string;
}

// ── Quick-reply chip definitions per step ─────────────────────────────────────

function getChips(step: number): string[] {
  switch (step) {
    case 4:
      return ['1', '2', '3', '4', '5', '6', '8'];
    case 6:
      return ['Suggest a split based on ratings', 'I\'ll enter the counts manually'];
    case 7:
      return ['Round Robin', 'Single Elimination', 'Group Stage + Knockout', 'Swiss'];
    case 8:
      return [
        'Standard (11 pts, best of 3)',
        '11 pts, best of 1',
        '15 pts, best of 3',
        '21 pts, best of 1',
      ];
    case 9:
      return ['Skip — no additional notes'];
    case 10:
      return ['Looks good — create it!'];
    default:
      return [];
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_PARTIAL_CONFIG: WizardPartialConfig = {
  step: 1,
  name: null,
  date: null,
  venue: null,
  courts: null,
  categories: null,
  notes: null,
};

export function WizardChat({ clubId, clubName }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<WizardMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [partialConfig, setPartialConfig] = useState<WizardPartialConfig>(DEFAULT_PARTIAL_CONFIG);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasStarted = useRef(false);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const userText = text.trim();
      if (!userText || loading) return;

      setInput('');
      setError(null);

      // Optimistically add user message
      setDisplayMessages((prev) => [...prev, { role: 'user', content: userText }]);
      setLoading(true);

      try {
        const res = await fetch('/api/wizard/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clubId, messages, userMessage: userText }),
        });

        let data: Record<string, unknown>;
        try {
          data = await res.json();
        } catch {
          setError(`Server error (${res.status}). Check that ANTHROPIC_API_KEY is set in your environment.`);
          setLoading(false);
          return;
        }

        if (!res.ok || data.error) {
          setError((data.error as string | undefined) ?? 'Something went wrong. Please try again.');
          setLoading(false);
          return;
        }

        const typed = data as unknown as import('@/app/api/wizard/turn/route').WizardTurnResponse;
        setMessages(typed.messages);
        setDisplayMessages((prev) => [
          ...prev,
          { role: 'assistant', content: typed.reply },
        ]);
        setPartialConfig(typed.partialConfig ?? DEFAULT_PARTIAL_CONFIG);

        if (typed.tournamentCreated && typed.tournamentSlug) {
          // Small delay so the user sees the success message before redirect
          setTimeout(() => {
            router.push(`/tournaments/${typed.tournamentSlug!}`);
          }, 1500);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to reach the server: ${msg}`);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [clubId, messages, loading, router],
  );

  // Kick off the wizard on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    void sendMessage(`Start the tournament setup wizard for club ${clubName}.`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chips = getChips(partialConfig.step);

  return (
    <div className="flex h-full min-h-0">
      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
          {displayMessages.map((msg, i) => (
            <div key={i}>
              {msg.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm text-white">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-card px-4 py-2.5 text-sm text-slate-200 ring-1 ring-surface-border whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm bg-surface-card px-4 py-3 ring-1 ring-surface-border">
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-950/30 ring-1 ring-red-700/40 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Quick-reply chips */}
        {chips.length > 0 && !loading && (
          <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
            {chips.map((chip) => (
              <button
                key={chip}
                onClick={() => void sendMessage(chip)}
                className="rounded-full border border-brand-700/60 bg-brand-950/40 px-3 py-1 text-xs text-brand-300 hover:bg-brand-900/60 hover:border-brand-500 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 border-t border-surface-border shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              placeholder="Type your answer…"
              disabled={loading}
              className="flex-1 rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 disabled:opacity-50"
            />
            <button
              onClick={() => void sendMessage(input)}
              disabled={!input.trim() || loading}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 transition-colors disabled:opacity-40"
            >
              ↑
            </button>
          </div>
        </div>
      </div>

      {/* ── Preview panel (desktop) ──────────────────────────────────────────── */}
      <div className="hidden lg:flex w-72 xl:w-80 shrink-0 flex-col border-l border-surface-border bg-surface-card">
        <WizardPreview config={partialConfig} />
      </div>

      {/* ── Preview toggle (mobile) ──────────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-20 right-4 z-10">
        <button
          onClick={() => setPreviewOpen((v) => !v)}
          className="rounded-full bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-brand-700 transition-colors"
        >
          {previewOpen ? 'Hide preview' : 'Show preview'}
        </button>
      </div>

      {/* Mobile preview drawer */}
      {previewOpen && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-20 max-h-[60vh] overflow-y-auto rounded-t-2xl bg-surface-card border-t border-surface-border shadow-2xl">
          <div className="flex justify-between items-center px-4 pt-3 pb-1">
            <span className="text-sm font-semibold text-white">Tournament preview</span>
            <button
              onClick={() => setPreviewOpen(false)}
              className="text-slate-500 hover:text-slate-300 text-sm"
            >
              ✕
            </button>
          </div>
          <div className="h-full">
            <WizardPreview config={partialConfig} />
          </div>
        </div>
      )}
    </div>
  );
}
