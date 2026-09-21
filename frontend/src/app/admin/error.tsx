'use client';

import Link from 'next/link';
import { AlertCircle, Sun, Moon } from 'lucide-react';
import { useDarkMode } from '@/lib/useDarkMode';

/** Boundary for an unexpected error in the back office. Same dark/light toggle as every admin page. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { dark, toggle } = useDarkMode();

  return (
    <div className="vindera-admin flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-100 px-6 text-center text-gray-500 transition-colors dark:bg-gray-950 dark:text-gray-400">
      <button
        onClick={toggle}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="fixed right-4 top-4 rounded-xl border border-gray-200 bg-white p-2.5 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      <AlertCircle className="h-12 w-12 text-red-400" />
      <h1 className="type-page-title text-gray-900 dark:text-gray-100">Something went wrong</h1>
      <p className="type-body max-w-md">This page hit an unexpected error. Your data is safe; try again, or go back to the workspace.</p>
      {error.digest && <p className="text-[12px] text-gray-400">Reference: {error.digest}</p>}
      <div className="mt-2 flex items-center gap-4">
        <button onClick={reset} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-indigo-700">Try again</button>
        <Link href="/admin" className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">Workspace</Link>
      </div>
    </div>
  );
}
