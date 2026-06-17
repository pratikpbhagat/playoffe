'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, Suspense } from 'react';

function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function schedule(fn: () => void, delay: number) {
    const t = setTimeout(fn, delay);
    timers.current.push(t);
  }

  // Navigation complete — finish and fade out
  useEffect(() => {
    setWidth(100);
    schedule(() => {
      setVisible(false);
      setWidth(0);
    }, 250);
    return clearTimers;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Click on an internal link — start the bar
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      try {
        const url = new URL(anchor.href, window.location.origin);
        if (url.origin !== window.location.origin) return;       // external
        if (url.pathname === pathname && url.search === window.location.search) return; // same page
        clearTimers();
        setVisible(true);
        setWidth(25);
        schedule(() => setWidth(55), 200);
        schedule(() => setWidth(75), 600);
      } catch {
        // ignore malformed hrefs
      }
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-[3px]"
      style={{
        width: `${width}%`,
        transition: width === 100 ? 'width 150ms ease-out' : 'width 400ms ease-in-out',
        background: 'linear-gradient(to right, #7c3aed, #a78bfa)',
        boxShadow: '0 0 12px 3px rgb(139 92 246 / 0.8), 0 0 24px 6px rgb(139 92 246 / 0.4)',
      }}
    >
      {/* bright leading-edge shimmer */}
      <div
        className="absolute right-0 top-0 h-full w-24"
        style={{
          background: 'linear-gradient(to right, transparent, rgb(196 181 253 / 0.9))',
          borderRadius: '0 2px 2px 0',
        }}
      />
    </div>
  );
}

export function TopProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}
