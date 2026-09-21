'use client';

import { useEffect } from 'react';
import { recordProductView } from '@/lib/recentlyViewed';

/** Renders nothing; remembers this product in the visitor's own browser ("Recently Viewed"). */
export default function RecordView({ id }: { id: string }) {
  useEffect(() => {
    recordProductView(id);
  }, [id]);
  return null;
}
