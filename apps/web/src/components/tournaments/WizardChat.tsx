'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { WizardPreview } from './WizardPreview';
import type { WizardMessage, WizardPartialConfig } from '@/app/api/wizard/turn/route';

interface Props {
  clubId: string;
  clubName: string;
  existingTournamentNames: string[];
}

// ── Quick-reply chip definitions per step ─────────────────────────────────────

const ALL_CATEGORIES = [
  "Men's Singles",
  "Women's Singles",
  "Men's Doubles",
  "Women's Doubles",
  "Mixed Doubles",
  "Open Singles",
  "Open Doubles",
  "Men's A",
  "Men's B",
  "Women's A",
  "Women's B",
];

function getCategoryChips(
  tournamentName: string | null,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
): string[] {
  const name = (tournamentName ?? '').toLowerCase();
  const history = chatHistory.map((m) => m.content.toLowerCase()).join(' ');
  const combined = `${name} ${history}`;

  const score: Record<string, number> = {};
  for (const cat of ALL_CATEGORIES) {
    score[cat] = 0;
  }

  // Boost by keywords in name / history
  if (combined.includes('single')) {
    score["Men's Singles"] += 3;
    score["Women's Singles"] += 3;
    score["Open Singles"] += 2;
  }
  if (combined.includes('double')) {
    score["Men's Doubles"] += 3;
    score["Women's Doubles"] += 3;
    score["Open Doubles"] += 2;
  }
  if (combined.includes('mixed')) {
    score["Mixed Doubles"] += 4;
  }
  if (combined.match(/\bmen\b|men's/)) {
    score["Men's Singles"] += 2;
    score["Men's Doubles"] += 2;
    score["Men's A"] += 1;
    score["Men's B"] += 1;
  }
  if (combined.match(/\bwomen\b|women's/)) {
    score["Women's Singles"] += 2;
    score["Women's Doubles"] += 2;
    score["Women's A"] += 1;
    score["Women's B"] += 1;
  }
  if (combined.includes('open')) {
    score["Open Singles"] += 2;
    score["Open Doubles"] += 2;
  }
  if (combined.match(/\b[ab]\b|skill|level|beginner|advanced/)) {
    score["Men's A"] += 2;
    score["Men's B"] += 2;
    score["Women's A"] += 2;
    score["Women's B"] += 2;
  }

  // Sort by score desc, return top 6 with any score > 0, else defaults
  const sorted = ALL_CATEGORIES.filter((c) => score[c] > 0).sort(
    (a, b) => score[b] - score[a],
  );

  return sorted.length > 0
    ? sorted.slice(0, 6)
    : ["Men's Doubles", "Women's Doubles", "Mixed Doubles", "Men's Singles", "Women's Singles"];
}

function getChips(step: number): string[] {
  switch (step) {
    case 4:
      return ['1', '2', '3', '4', '5', '6', '8'];
    case 6:
      return ['Suggest a split based on ratings', "I'll enter the counts manually"];
    case 7:
      return ['Round Robin', 'Single Elimination', 'Group Stage + Knockout', 'Swiss'];
    // Step 8 (scoring) is multi-part (type, points/sets, golden point vs deuce, optional cap) —
    // chips come from Claude's suggested_replies field instead of a fixed list here.
    case 9:
      return ['Skip — no additional notes'];
    case 10:
      return ['Yes, let\'s upload players', 'No, skip for now'];
    case 11:
      return ['Looks good — create it!'];
    default:
      return [];
  }
}

// ── CSV upload button for step 10 ────────────────────────────────────────────

function CsvUploadButton({ onParsed }: { onParsed: (players: Array<{ name: string; email?: string }>, count: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = text.split(/\r?\n/).filter((r) => r.trim());
      const players: Array<{ name: string; email?: string }> = [];
      for (const row of rows) {
        const cols = row.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const name = cols[0];
        const email = cols[1];
        if (name && name.toLowerCase() !== 'name') {
          players.push({ name, ...(email ? { email } : {}) });
        }
      }
      onParsed(players, players.length);
    };
    reader.readAsText(file);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-teal-600 bg-teal-950/40 px-3 py-1.5 text-xs font-semibold text-teal-300 hover:bg-teal-900/50 active:scale-95 transition-all"
      >
        Upload CSV
      </button>
    </>
  );
}

// ── Date range picker for step 2 ─────────────────────────────────────────────

function DateRangePicker({ onSelect }: { onSelect: (msg: string) => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

  const handleConfirm = () => {
    if (!start) return;
    const msg = end && end !== start
      ? `${fmt(start)} to ${fmt(end)}`
      : fmt(start);
    onSelect(msg);
    setStart('');
    setEnd('');
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="date"
        min={today}
        value={start}
        onChange={(e) => {
          setStart(e.target.value);
          if (end && e.target.value > end) setEnd('');
        }}
        className="rounded-lg border border-teal-700 bg-surface px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 [color-scheme:dark]"
      />
      <span className="text-xs text-slate-500">to</span>
      <input
        type="date"
        min={start || today}
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="rounded-lg border border-teal-700 bg-surface px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 [color-scheme:dark]"
      />
      {start && (
        <button
          onClick={handleConfirm}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 active:scale-95 transition-all"
        >
          Use {end && end !== start ? 'these dates' : 'this date'}
        </button>
      )}
    </div>
  );
}

// ── Category checklist for step 5 list-confirmation messages ────────────────

function CategoryChecklist({
  items,
  onConfirm,
}: {
  items: string[];
  onConfirm: (selected: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(items));

  const toggle = (item: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const selectedCount = items.filter((item) => selected.has(item)).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <label
            key={item}
            className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-xs text-slate-200 cursor-pointer hover:border-teal-700"
          >
            <input
              type="checkbox"
              checked={selected.has(item)}
              onChange={() => toggle(item)}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-surface text-teal-600 accent-teal-600 focus:ring-teal-500/30"
            />
            {item}
          </label>
        ))}
      </div>
      <button
        onClick={() => onConfirm(items.filter((item) => selected.has(item)))}
        disabled={selectedCount === 0}
        className="self-start rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 active:scale-95 transition-all disabled:opacity-40 disabled:hover:bg-teal-600"
      >
        Confirm {selectedCount > 0 ? `${selectedCount} selected` : 'selection'}
      </button>
    </div>
  );
}

// ── Simple markdown renderer (bold, paragraphs, "- " bullet lists) ───────────

function renderInline(line: string): ReactNode[] {
  const parts = line.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part));
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');

  // Group consecutive "- " lines into a single bulleted list block
  const blocks: Array<{ type: 'list'; items: string[] } | { type: 'line'; content: string }> = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const isBullet = trimmed.startsWith('- ');
    const last = blocks[blocks.length - 1];
    if (isBullet) {
      const item = trimmed.slice(2).trim();
      if (last && last.type === 'list') {
        last.items.push(item);
      } else {
        blocks.push({ type: 'list', items: [item] });
      }
    } else {
      blocks.push({ type: 'line', content: rawLine });
    }
  }

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'list') {
          return (
            <ul key={i} className="my-1.5 list-disc space-y-1 pl-4">
              {block.items.map((item, j) => (
                <li key={j} className="leading-relaxed">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.content.trim() === '') {
          return <div key={i} className="h-2" />;
        }
        return (
          <p key={i} className="leading-relaxed">
            {renderInline(block.content)}
          </p>
        );
      })}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_PARTIAL_CONFIG: WizardPartialConfig = {
  step: 1,
  name: null,
  start_date: null,
  end_date: null,
  venue: null,
  courts: null,
  categories: null,
  notes: null,
  player_uploads: null,
  suggested_replies: null,
  suggested_categories: null,
};

export function WizardChat({ clubId, clubName, existingTournamentNames }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<WizardMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const [partialConfig, setPartialConfig] = useState<WizardPartialConfig>(DEFAULT_PARTIAL_CONFIG);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasStarted = useRef(false);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, loading]);

  // Return focus to input after each response (runs after DOM commits)
  useEffect(() => {
    if (!loading) {
      inputRef.current?.focus();
    }
  }, [loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const userText = text.trim();
      if (!userText || loading) return;

      setInput('');
      setError(null);

      // Optimistically add user message
      setDisplayMessages((prev) => [...prev, { role: 'user', content: userText }]);
      setLoading(true);
      // Step 11 confirmation is the turn that actually creates the tournament — show a more
      // specific loader than the generic typing dots while that request is in flight.
      if (partialConfig.step === 11) setCreatingTournament(true);

      try {
        const res = await fetch('/api/wizard/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clubId, messages, userMessage: userText, currentStep: partialConfig.step }),
        });

        let data: Record<string, unknown>;
        try {
          data = await res.json();
        } catch {
          setError(`Server error (${res.status}). Check that ANTHROPIC_API_KEY is set in your environment.`);
          setLoading(false);
          setCreatingTournament(false);
          return;
        }

        if (!res.ok || data.error) {
          setError((data.error as string | undefined) ?? 'Something went wrong. Please try again.');
          setLoading(false);
          setCreatingTournament(false);
          return;
        }

        const typed = data as unknown as import('@/app/api/wizard/turn/route').WizardTurnResponse;
        setMessages(typed.messages);
        setDisplayMessages((prev) => [
          ...prev,
          { role: 'assistant', content: typed.reply },
        ]);
        // Merge: never replace a confirmed field with null — prevents preview flicker
        setPartialConfig((prev) => {
          const next = typed.partialConfig ?? DEFAULT_PARTIAL_CONFIG;
          return {
            step: next.step,
            name: next.name ?? prev.name,
            start_date: next.start_date ?? prev.start_date,
            end_date: next.end_date ?? prev.end_date,
            venue: next.venue ?? prev.venue,
            courts: next.courts ?? prev.courts,
            categories: next.categories ?? prev.categories,
            notes: next.notes ?? prev.notes,
            player_uploads: next.player_uploads ?? prev.player_uploads,
            // Not merged with prev — these are per-turn and should not linger from an old step
            suggested_replies: next.suggested_replies,
            suggested_categories: next.suggested_categories,
          };
        });

        if (typed.tournamentCreated && typed.tournamentSlug) {
          // Keep the "Creating tournament..." state through the redirect delay — the
          // organizer shouldn't see the input box re-enable for a turn that's actually done.
          setTimeout(() => {
            router.push(`/tournaments/${typed.tournamentSlug!}`);
          }, 1500);
        } else {
          setCreatingTournament(false);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to reach the server: ${msg}`);
        setCreatingTournament(false);
      } finally {
        setLoading(false);
      }
    },
    [clubId, messages, loading, router, partialConfig.step],
  );

  // Kick off the wizard on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    void sendMessage(`Start the tournament setup wizard for club ${clubName}.`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastAssistantMsg = [...displayMessages].reverse().find((m) => m.role === 'assistant');

  // For step 5: pull category names Claude actually mentioned (handles long comma-separated bold lists)
  const claudeSuggestedCategories: string[] =
    partialConfig.step === 5 && lastAssistantMsg
      ? lastAssistantMsg.content
          .split('\n')
          .filter((line) => /\*\*/.test(line) && !/^(got it|confirmed|perfect|locked|✓)/i.test(line.trim()))
          .flatMap((line) => [...line.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1] ?? ''))
          .flatMap((s) => (s.includes(',') ? s.split(/,\s*(?:and\s+)?/) : [s]))
          .map((s) => s.trim())
          .filter((s) => s.length >= 3 && s.length <= 60 && !s.endsWith('?'))
      : [];

  // Permanent blocklist: club name + all existing tournament names (exact, case-insensitive)
  const blockedNames = new Set(
    [clubName, ...existingTournamentNames].map((s) => s.toLowerCase()),
  );

  const isBlockedChip = (s: string) => blockedNames.has(s.toLowerCase());

  // Claude's own suggested replies, emitted via the emit_config tool's suggested_replies field.
  // This is the authoritative source — Claude deliberately chose these, vs. us mining its prose
  // for bold/quoted text that may just be an inline example mentioned in passing.
  const claudeReplies: string[] = (partialConfig.suggested_replies ?? []).filter(
    (s) => !isBlockedChip(s),
  );

  const stepChips =
    partialConfig.step === 5
      ? [...new Set([...claudeSuggestedCategories, ...claudeReplies, ...getCategoryChips(partialConfig.name, displayMessages)])]
      : getChips(partialConfig.step);

  // Step 5: Claude's own suggested_categories field drives the checkbox list — deterministic,
  // unlike inferring it from prose formatting (bullets vs. commas), which Claude doesn't
  // produce consistently turn to turn.
  const categoryChoices: string[] = (partialConfig.suggested_categories ?? []).filter(
    (s) => !isBlockedChip(s),
  );

  // Legacy bold-text fallback — only used if Claude hasn't populated suggested_replies (e.g. an
  // older turn before this rolled out). No quote-based extraction: quoted text is often just an
  // inline example embedded inside the question itself, not a deliberate recommendation.
  const legacyBoldFallback: string[] = lastAssistantMsg
    ? lastAssistantMsg.content
        .split('\n')
        .filter((line) => !line.includes('?')) // drop lines that are (part of) a question
        .filter((line) => !/^(got it|confirmed|perfect|locked|✓|done —)/i.test(line.trim()) && /\*\*/.test(line))
        .flatMap((line) => [...line.matchAll(/\*\*([^*]{3,60})\*\*/g)].map((m) => m[1] ?? ''))
        .filter((s) => !s.endsWith('?') && !/^(what|where|when|how|who|is it|are|do you|does|shall|would|can|could)\b/i.test(s))
        .filter(Boolean)
        .filter((s) => !isBlockedChip(s))
    : [];

  // Detect confirmation questions (including "are you running the same ones?")
  const isConfirmationQuestion = lastAssistantMsg
    ? /is that right\??|does that (look|sound) (right|correct)\??|sound(s)? good\??|correct\??|shall we (go|move|proceed)\??|want to (change|adjust|update)\??|are you running the same\??|same (ones|categories|format)\??/i
        .test(lastAssistantMsg.content)
    : false;

  // Confirmation questions show only Yes/No — no other chips
  const baseChips = isConfirmationQuestion
    ? ["Yes, that's right", 'No, let me change it']
    : stepChips.length > 0
      ? stepChips
      : claudeReplies.length > 0
        ? claudeReplies
        : legacyBoldFallback;

  const chips = [...new Set(baseChips)];

  const showCategoryChecklist = partialConfig.step === 5 && categoryChoices.length >= 2;

  return (
    <div className="flex h-full min-h-0">
      {/* ── Chat panel ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700 hover:[&::-webkit-scrollbar-thumb]:bg-slate-600">
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
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-card px-4 py-2.5 text-sm text-slate-200 ring-1 ring-surface-border leading-relaxed">
                    <SimpleMarkdown text={msg.content} />
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && creatingTournament && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-sm bg-surface-card px-4 py-3 ring-1 ring-surface-border">
                <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-teal-500" />
                <span className="text-sm text-slate-300">Creating your tournament…</span>
              </div>
            </div>
          )}

          {loading && !creatingTournament && (
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

        {/* Category checklist (step 5 list-confirmation) */}
        {showCategoryChecklist && !loading && (
          <div className="shrink-0 border-t border-surface-border bg-surface px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Select categories
            </p>
            <CategoryChecklist
              key={categoryChoices.join('|')}
              items={categoryChoices}
              onConfirm={(selected) => void sendMessage(`Running: ${selected.join(', ')}`)}
            />
          </div>
        )}

        {/* Quick-reply chips + date picker */}
        {!showCategoryChecklist && (chips.length > 0 || partialConfig.step === 2) && !loading && (
          <div className="shrink-0 border-t border-surface-border bg-surface px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Suggested replies
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => void sendMessage(chip)}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-500 active:scale-95 transition-all"
                >
                  {chip}
                </button>
              ))}
              {partialConfig.step === 2 && (
                <DateRangePicker onSelect={(msg) => void sendMessage(msg)} />
              )}
              {partialConfig.step === 10 && (
                <CsvUploadButton
                  onParsed={(players, count) => {
                    // Send a message confirming the upload so Claude can acknowledge and continue
                    void sendMessage(`CSV uploaded: ${count} player${count !== 1 ? 's' : ''} parsed and ready to import.`);
                  }}
                />
              )}
            </div>
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
