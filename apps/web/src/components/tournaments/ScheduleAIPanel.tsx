'use client';

import { useState, useRef, useEffect } from 'react';
import { callScheduleAssistantAction } from '@/lib/actions/ai-schedule';
import type { AIMessage } from '@/lib/actions/ai-schedule';
import type { ScheduleUpdate } from '@/lib/actions/scheduling';

interface Props {
  tournamentSlug: string;
  currentSchedule: ScheduleUpdate[];
  availableCourts: number[];
  matchDurationMins: number;
  onApplyUpdates: (updates: ScheduleUpdate[]) => void;
  onClose: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  updates?: ScheduleUpdate[];
  conflicts?: string[];
  applied?: boolean;
}

export function ScheduleAIPanel({
  tournamentSlug,
  currentSchedule,
  availableCourts,
  matchDurationMins,
  onApplyUpdates,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content:
        'Hi! I can help you schedule matches. Tell me what you need — for example:\n\n' +
        '• "Schedule all group matches starting at 9am"\n' +
        '• "Put Men\'s Singles on courts 1 and 2"\n' +
        '• "Move everything 30 minutes later"\n' +
        '• "Schedule knockouts starting at 2pm on courts 1-3"',
    },
  ]);

  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const conversationHistory: AIMessage[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  async function handleSend() {
    const userText = input.trim();
    if (!userText || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setLoading(true);

    const result = await callScheduleAssistantAction({
      tournamentSlug,
      userMessage:         userText,
      conversationHistory,
      currentSchedule,
      availableCourts,
      matchDurationMins,
    });

    setLoading(false);

    if ('error' in result) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `❌ ${result.error}`,
      }]);
      return;
    }

    setMessages((prev) => [...prev, {
      role:      'assistant',
      content:   result.text,
      updates:   result.updates,
      conflicts: result.conflictsDetected,
    }]);
  }

  function handleApply(msgIdx: number) {
    const msg = messages[msgIdx];
    if (!msg.updates) return;
    onApplyUpdates(msg.updates);
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIdx ? { ...m, applied: true } : m)),
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-card border-l border-surface-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <span className="text-sm font-semibold text-white">AI Schedule Assistant</span>
          <span className="rounded-full bg-brand-900/50 px-2 py-0.5 text-[10px] font-bold text-brand-300">
            Claude
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === 'system' && (
              <div className="rounded-lg bg-surface px-3 py-2.5 text-xs text-slate-400 whitespace-pre-line border border-surface-border">
                {msg.content}
              </div>
            )}

            {msg.role === 'user' && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-3 py-2 text-sm text-white">
                  {msg.content}
                </div>
              </div>
            )}

            {msg.role === 'assistant' && (
              <div className="space-y-2">
                {/* Text response */}
                <div className="rounded-2xl rounded-tl-sm bg-surface px-3 py-2.5 text-sm text-slate-200 ring-1 ring-surface-border whitespace-pre-wrap">
                  {msg.content}
                </div>

                {/* Proposed updates */}
                {msg.updates && msg.updates.length > 0 && (
                  <div className={`rounded-lg ring-1 overflow-hidden ${
                    msg.applied ? 'ring-accent-700/40 bg-accent-950/20' : 'ring-brand-700/40 bg-brand-950/20'
                  }`}>
                    <div className="px-3 py-2 border-b border-surface-border flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">
                        {msg.updates.length} match{msg.updates.length !== 1 ? 'es' : ''} to update
                      </span>
                      {!msg.applied ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApply(i)}
                            className="rounded bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                          >
                            Apply →
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-accent-400 font-medium">✓ Applied</span>
                      )}
                    </div>

                    {/* Preview of first few updates */}
                    <div className="px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
                      {msg.updates.slice(0, 8).map((u) => (
                        <div key={u.matchId} className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500 font-mono truncate max-w-[80px]">
                            {u.matchId.slice(-8)}
                          </span>
                          <span className="text-brand-300">→</span>
                          <span className="text-slate-300">
                            Court {u.court} @ {u.scheduledTime
                              ? new Date(u.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : '—'
                            }
                          </span>
                        </div>
                      ))}
                      {msg.updates.length > 8 && (
                        <p className="text-xs text-slate-500">
                          +{msg.updates.length - 8} more…
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Conflict warnings */}
                {msg.conflicts && msg.conflicts.length > 0 && (
                  <div className="rounded-lg bg-amber-950/30 ring-1 ring-amber-700/40 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-300 mb-1">
                      ⚠️ Conflicts detected
                    </p>
                    <ul className="space-y-0.5">
                      {msg.conflicts.map((c, ci) => (
                        <li key={ci} className="text-xs text-amber-400/80">{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="animate-pulse">●</span>
            <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
            <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-surface-border shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder="Ask AI to schedule matches…"
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 disabled:opacity-50"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || loading}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 transition-colors disabled:opacity-40"
          >
            ↑
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-600">
          Changes are previewed first — click Apply to add them to the schedule.
        </p>
      </div>
    </div>
  );
}
