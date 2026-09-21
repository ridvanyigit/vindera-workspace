import type { Metadata } from 'next';

// The back office is never for search engines (robots.txt also disallows /admin).
export const metadata: Metadata = {
  title: { absolute: 'Vindera Admin' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
