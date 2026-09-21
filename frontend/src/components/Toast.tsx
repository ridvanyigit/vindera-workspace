'use client';

/**
 * Shared feedback for admin mutations: a hook that collects toasts and a stack to
 * render them. Errors stay until dismissed (a failed save must not vanish
 * unnoticed); successes fade after a few seconds. Colors reuse the utility classes
 * that the `vindera-admin` dark-mode overrides already cover.
 */

import { useCallback, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';

export interface ToastItem {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

const SUCCESS_MS = 4000;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts(items => items.filter(item => item.id !== id)), []);

  const push = useCallback(
    (kind: ToastItem['kind'], message: string) => {
      const id = nextId.current++;
      setToasts(items => [...items, { id, kind, message }]);
      if (kind === 'success') setTimeout(() => dismiss(id), SUCCESS_MS);
    },
    [dismiss],
  );

  const success = useCallback((message: string) => push('success', message), [push]);
  const error = useCallback((message: string) => push('error', message), [push]);

  return { toasts, dismiss, success, error };
}

export function ToastStack({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[200] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0" aria-live="polite">
      {toasts.map(item => (
        <div
          key={item.id}
          role={item.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg ${
            item.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-white text-gray-800'
          }`}
        >
          {item.kind === 'error' ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <p className="flex-1 break-words text-[13px] leading-snug">{item.message}</p>
          <button onClick={() => dismiss(item.id)} className="shrink-0 opacity-60 transition hover:opacity-100" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
