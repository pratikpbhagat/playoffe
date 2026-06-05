'use client';

import { useState, useTransition, useEffect } from 'react';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import type { DisplaySlide } from '@pickleball/shared';
import {
  updateDisplaySlideAction,
  updateDisplayPausedAction,
  updateRotationIntervalAction,
  updateEnabledSlidesAction,
  sendAnnouncementAction,
  dismissAnnouncementAction,
} from '@/lib/actions/display';

interface DisplayStateLocal {
  tournament_id: string;
  current_slide: string;
  is_pinned: boolean;
  rotation_interval_secs: number;
  active_announcement_id: string | null;
  active_category_filter: string | null;
  is_paused: boolean;
  enabled_slides?: DisplaySlide[];
}

interface AnnouncementRow {
  id: string;
  message: string;
  urgency: string;
  sent_at: string;
  dismissed_at: string | null;
}

interface Props {
  tournamentId: string;
  tournamentSlug: string;
  /** The short display code used in the /display/[code] URL (e.g. "F211D951").
   *  Distinct from the tournament slug — must come from tournaments.display_code. */
  displayCode: string;
  initialDisplayState: DisplayStateLocal;
  initialAnnouncements: AnnouncementRow[];
}

const SLIDES: { value: DisplaySlide; label: string; icon: string }[] = [
  { value: 'live_scores', label: 'Live Scores', icon: '🎯' },
  { value: 'upcoming_matches', label: 'Upcoming', icon: '📅' },
  { value: 'group_standings', label: 'Standings', icon: '📊' },
  { value: 'live_bracket', label: 'Bracket', icon: '🏆' },
  { value: 'full_schedule', label: 'Schedule', icon: '📋' },
  { value: 'category_podium', label: 'Podium', icon: '🥇' },
  { value: 'announcement', label: 'Announce', icon: '📢' },
  { value: 'wrap_up', label: 'Wrap-Up', icon: '🎉' },
];

const INTERVAL_OPTIONS = [10, 15, 20, 30, 45, 60];

const DEFAULT_ENABLED_SLIDES: DisplaySlide[] = [
  'live_scores', 'upcoming_matches', 'group_standings', 'live_bracket', 'full_schedule',
];

// All slides that can be added to / removed from the auto-rotation.
// 'announcement' is excluded — it activates automatically when sent.
const ROTATABLE_SLIDES: { value: DisplaySlide; label: string; icon: string }[] = [
  { value: 'live_scores',      label: 'Live Scores', icon: '🎯' },
  { value: 'upcoming_matches', label: 'Upcoming',    icon: '📅' },
  { value: 'group_standings',  label: 'Standings',   icon: '📊' },
  { value: 'live_bracket',     label: 'Bracket',     icon: '🏆' },
  { value: 'full_schedule',    label: 'Schedule',    icon: '📋' },
  { value: 'category_podium',  label: 'Podium',      icon: '🥇' },
  { value: 'wrap_up',          label: 'Wrap-Up',     icon: '🎉' },
];

export function DisplayControlPanel({
  tournamentId,
  tournamentSlug,
  displayCode,
  initialDisplayState,
  initialAnnouncements,
}: Props) {
  const [ds, setDs] = useState({
    ...initialDisplayState,
    enabled_slides: (initialDisplayState.enabled_slides?.length ?? 0) > 0
      ? initialDisplayState.enabled_slides!
      : DEFAULT_ENABLED_SLIDES,
  });
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [annMsg, setAnnMsg] = useState('');
  const [annUrgency, setAnnUrgency] = useState<'normal' | 'urgent'>('normal');
  const [annError, setAnnError] = useState<string | null>(null);
  const [annSent, setAnnSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Use the tournament's display_code (e.g. "F211D951"), not the slug.
  // Start relative so server/client agree during hydration; patch to absolute on mount.
  const relativePath = `/display/${displayCode}`;
  const [displayUrl, setDisplayUrl] = useState(relativePath);
  useEffect(() => {
    setDisplayUrl(`${window.location.origin}${relativePath}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSlideChange = (slide: DisplaySlide, pin: boolean) => {
    startTransition(async () => {
      const res = await updateDisplaySlideAction(tournamentId, slide, pin);
      if (!res.error) setDs((prev) => ({ ...prev, current_slide: slide, is_pinned: pin }));
    });
  };

  const handlePause = () => {
    startTransition(async () => {
      const next = !ds.is_paused;
      const res = await updateDisplayPausedAction(tournamentId, next);
      if (!res.error) setDs((prev) => ({ ...prev, is_paused: next }));
    });
  };

  const handleInterval = (secs: number) => {
    startTransition(async () => {
      const res = await updateRotationIntervalAction(tournamentId, secs);
      if (!res.error) setDs((prev) => ({ ...prev, rotation_interval_secs: secs }));
    });
  };

  const handleToggleSlide = (slide: DisplaySlide) => {
    const current = ds.enabled_slides;
    const isOn = current.includes(slide);
    if (isOn && current.length === 1) return; // must keep at least one
    const next = isOn ? current.filter((s) => s !== slide) : [...current, slide];
    startTransition(async () => {
      const res = await updateEnabledSlidesAction(tournamentId, next);
      if (!res.error) setDs((prev) => ({ ...prev, enabled_slides: next }));
    });
  };

  const handleSendAnnouncement = () => {
    if (!annMsg.trim()) { setAnnError('Message cannot be empty'); return; }
    setAnnError(null);
    startTransition(async () => {
      const res = await sendAnnouncementAction(tournamentId, annMsg, annUrgency);
      if (res.error) {
        setAnnError(res.error);
      } else {
        setAnnMsg('');
        setAnnSent(true);
        setTimeout(() => setAnnSent(false), 3000);
        const annId = (res as { announcementId?: string }).announcementId ?? null;
        setDs((prev) => ({ ...prev, current_slide: 'announcement', is_pinned: true, active_announcement_id: annId }));
      }
    });
  };

  const handleDismiss = (annId: string) => {
    startTransition(async () => {
      const res = await dismissAnnouncementAction(tournamentId, annId);
      if (!res.error) {
        setAnnouncements((prev) => prev.filter((a) => a.id !== annId));
        if (ds.active_announcement_id === annId) {
          setDs((prev) => ({ ...prev, is_pinned: false, active_announcement_id: null }));
        }
      }
    });
  };

  const activeAnn = announcements.find(
    (a) => a.id === ds.active_announcement_id && !a.dismissed_at,
  );

  return (
    <div className="space-y-6">
      {/* ── Status bar ── */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-2.5 w-2.5 rounded-full ${ds.is_paused ? 'bg-amber-500' : 'bg-accent-400'}`}
          />
          <span className="text-sm font-medium text-white">
            {ds.is_paused
              ? 'Paused'
              : ds.is_pinned
              ? `Pinned — ${SLIDES.find((s) => s.value === ds.current_slide)?.label ?? ds.current_slide}`
              : 'Auto-rotating'}
          </span>
        </div>
        <button
          disabled={isPending}
          onClick={handlePause}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            ds.is_paused
              ? 'bg-accent-500/20 text-accent-400 hover:bg-accent-500/30'
              : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
          }`}
        >
          {ds.is_paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {/* ── QR Code + URL ── */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-5 py-5">
        <h2 className="text-sm font-semibold text-white mb-4">Display URL</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="shrink-0 rounded-xl overflow-hidden bg-white p-2 self-center sm:self-auto">
            <QRCode value={displayUrl} size={120} level="M" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 mb-2">
              Open this URL on any browser connected to a TV or projector.
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 ring-1 ring-surface-border">
              <code className="text-xs text-brand-300 truncate flex-1">{displayUrl}</code>
              <button
                onClick={() => void navigator.clipboard.writeText(displayUrl)}
                className="shrink-0 text-xs text-slate-500 hover:text-white transition-colors"
              >
                Copy
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Display auto-rotates every {ds.rotation_interval_secs}s. Pin a slide below to freeze it.
            </p>
          </div>
        </div>
      </div>

      {/* ── Slide selector ── */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Slide control</h2>
          {ds.is_pinned && (
            <button
              disabled={isPending}
              onClick={() => handleSlideChange(ds.current_slide as DisplaySlide, false)}
              className="text-xs text-slate-500 hover:text-white transition-colors disabled:opacity-50"
            >
              Unpin (resume rotation)
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SLIDES.map((slide) => {
            const isActive = ds.current_slide === slide.value;
            const isPinned = isActive && ds.is_pinned;
            return (
              <button
                key={slide.value}
                disabled={isPending}
                onClick={() => handleSlideChange(slide.value, true)}
                className={`rounded-xl p-3 text-center transition-all disabled:opacity-50 ${
                  isPinned
                    ? 'bg-brand-600 ring-2 ring-brand-400 text-white'
                    : isActive
                    ? 'bg-surface ring-1 ring-brand-600/50 text-white'
                    : 'bg-surface ring-1 ring-surface-border text-slate-400 hover:text-white hover:ring-slate-500'
                }`}
              >
                <span className="block text-xl mb-1">{slide.icon}</span>
                <span className="block text-xs font-medium">{slide.label}</span>
                {isPinned && (
                  <span className="block text-[10px] text-brand-300 mt-0.5">Pinned</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Rotation speed ── */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-5 py-5">
        <h2 className="text-sm font-semibold text-white mb-4">Rotation speed</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {INTERVAL_OPTIONS.map((secs) => (
            <button
              key={secs}
              disabled={isPending}
              onClick={() => handleInterval(secs)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                ds.rotation_interval_secs === secs
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface ring-1 ring-surface-border text-slate-400 hover:text-white'
              }`}
            >
              {secs}s
            </button>
          ))}
        </div>
      </div>

      {/* ── Rotation slides ── */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-5 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Rotation slides</h2>
          <span className="text-xs text-slate-500">
            {ds.enabled_slides.length} of {ROTATABLE_SLIDES.length} enabled
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ROTATABLE_SLIDES.map((slide) => {
            const isOn = ds.enabled_slides.includes(slide.value);
            const isLastOn = isOn && ds.enabled_slides.length === 1;
            return (
              <button
                key={slide.value}
                disabled={isPending || isLastOn}
                onClick={() => handleToggleSlide(slide.value)}
                title={isLastOn ? 'At least one slide must remain enabled' : undefined}
                className={`flex items-center gap-2 rounded-xl px-3 py-4 text-left transition-all disabled:opacity-50 sm:gap-3 sm:py-3 ${
                  isOn
                    ? 'bg-brand-600/15 ring-1 ring-brand-500/60 text-white'
                    : 'bg-surface ring-1 ring-surface-border text-slate-500 hover:text-slate-300'
                }`}
              >
                {/* Checkbox indicator */}
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold transition-colors sm:h-4 sm:w-4 sm:text-[10px] ${
                    isOn ? 'bg-brand-500 text-white' : 'bg-slate-700 text-slate-500'
                  }`}
                >
                  {isOn ? '✓' : ''}
                </span>
                <span className="text-xl leading-none sm:text-lg">{slide.icon}</span>
                <span className="text-xs font-medium leading-tight">{slide.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-600">
          Checked slides cycle automatically · uncheck to skip a slide
        </p>
      </div>

      {/* ── Announcement sender ── */}
      <div className="rounded-xl bg-surface-card ring-1 ring-surface-border px-5 py-5">
        <h2 className="text-sm font-semibold text-white mb-4">Send announcement</h2>

        {/* Active announcement banner */}
        {activeAnn && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 ring-1 ${
              activeAnn.urgency === 'urgent'
                ? 'bg-red-900/20 ring-red-700/40'
                : 'bg-amber-900/20 ring-amber-700/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-amber-400 mb-1">
                  {activeAnn.urgency === 'urgent'
                    ? '🚨 Urgent — currently displayed'
                    : '📢 Active announcement'}
                </p>
                <p className="text-sm text-white">{activeAnn.message}</p>
              </div>
              <button
                disabled={isPending}
                onClick={() => handleDismiss(activeAnn.id)}
                className="shrink-0 rounded-lg bg-slate-700/50 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Compose form */}
        <div className="space-y-3">
          <textarea
            value={annMsg}
            onChange={(e) => {
              setAnnMsg(e.target.value.slice(0, 200));
              setAnnError(null);
            }}
            placeholder="Type your announcement... (max 200 chars)"
            rows={3}
            className="block w-full rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-brand-500 resize-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{annMsg.length}/200</span>
              <div className="flex items-center gap-1">
                {(['normal', 'urgent'] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setAnnUrgency(u)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      annUrgency === u
                        ? u === 'urgent'
                          ? 'bg-red-600/30 text-red-300 ring-1 ring-red-600'
                          : 'bg-brand-600/20 text-brand-300 ring-1 ring-brand-600'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {u === 'urgent' ? '🚨 Urgent' : '📢 Normal'}
                  </button>
                ))}
              </div>
            </div>
            <button
              disabled={isPending || !annMsg.trim()}
              onClick={handleSendAnnouncement}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {annSent ? 'Sent ✓' : isPending ? 'Sending...' : 'Send & display'}
            </button>
          </div>
          {annError && <p className="text-xs text-red-400">{annError}</p>}
        </div>

        {/* Recent announcements */}
        {announcements.filter((a) => a.id !== activeAnn?.id).length > 0 && (
          <div className="mt-4 border-t border-surface-border pt-4">
            <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-widest">
              Recent
            </p>
            <div className="space-y-2">
              {announcements
                .filter((a) => a.id !== activeAnn?.id)
                .slice(0, 5)
                .map((ann) => (
                  <div
                    key={ann.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2"
                  >
                    <p className="text-xs text-slate-400 truncate flex-1">{ann.message}</p>
                    <span className="text-xs text-slate-600 shrink-0">
                      {new Date(ann.sent_at).toLocaleTimeString('en-AU', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </span>
                    {!ann.dismissed_at && (
                      <button
                        disabled={isPending}
                        onClick={() => handleDismiss(ann.id)}
                        className="text-xs text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                      >
                        dismiss
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
