'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';

/** Boundary for an unexpected error on a public page. Details are never shown to visitors. */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f7f8fa] px-6 text-center text-gray-500">
      <Package className="h-12 w-12 text-gray-300" />
      <h1 className="text-[18px] font-semibold text-gray-900">Something went wrong</h1>
      <p className="max-w-md text-[14px]">The page could not be shown. Please try again in a moment.</p>
      {error.digest && <p className="text-[12px] text-gray-400">Reference: {error.digest}</p>}
      <div className="mt-2 flex items-center gap-4">
        <button onClick={reset} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-indigo-700">Try again</button>
        <Link href="/" className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-700">Back to the store</Link>
      </div>
    </div>
  );
}
