'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

const STYLES: Record<ToastType, string> = {
  success: 'bg-surface-card ring-1 ring-accent-500/30 text-white',
  error:   'bg-surface-card ring-1 ring-red-500/40 text-white',
  info:    'bg-surface-card ring-1 ring-brand-500/30 text-white',
};

const ICON_STYLES: Record<ToastType, string> = {
  success: 'bg-accent-500/20 text-accent-400',
  error:   'bg-red-500/20 text-red-400',
  info:    'bg-brand-500/20 text-brand-400',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-xl animate-toast-in min-w-64 max-w-sm ${STYLES[toast.type]}`}
      role="alert"
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ICON_STYLES[toast.type]}`}>
        {ICONS[toast.type]}
      </span>
      <p className="flex-1 text-sm text-slate-200">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++nextId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {typeof window !== 'undefined' &&
        toasts.length > 0 &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="false"
            className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 items-end"
          >
            {toasts.map((t) => (
              <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
