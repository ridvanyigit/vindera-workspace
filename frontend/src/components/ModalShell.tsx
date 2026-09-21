'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** Frame shared by the lifecycle modals: title bar, close button, scrolling body. */
export default function ModalShell({
  title,
  icon,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  onClose: () => void;
  /** Blocks closing while a request is running. */
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[90vh]">
        <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
          <h3 className="type-section-title text-gray-800 flex items-center gap-2">
            {icon} {title}
          </h3>
          <button onClick={onClose} disabled={busy} className="text-gray-400 hover:text-gray-700 transition disabled:opacity-40" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export const MODAL_INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-[14px] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 tabular-nums';

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700 break-words">
      {message}
    </div>
  );
}
