'use client';

/**
 * Last-resort boundary: replaces the root layout when the layout itself fails,
 * so it has to bring its own <html> and <body> and cannot rely on Tailwind
 * classes from a stylesheet that may not have loaded.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f7f8fa', color: '#111827' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>Something went wrong</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>Please try again in a moment.</p>
          {error.digest && <p style={{ margin: 0, color: '#9ca3af', fontSize: 12 }}>Reference: {error.digest}</p>}
          <button onClick={reset} style={{ marginTop: 8, padding: '10px 20px', borderRadius: 12, border: 0, background: '#4f46e5', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
