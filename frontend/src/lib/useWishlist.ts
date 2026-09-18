'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabase';

/**
 * Tracks a signed-in customer's wishlisted opportunity ids and toggles them.
 * Pass `null` for a signed-out visitor — `toggle` then redirects to /login.
 */
export function useWishlist(userId: string | null) {
  const router = useRouter();
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async (uid: string) => {
    const { data, error } = await supabase.from('wishlists').select('opportunity_id').eq('user_id', uid);
    if (!error && data) setWishlistIds(new Set(data.map((row: any) => row.opportunity_id)));
  }, []);

  useEffect(() => {
    if (userId) refresh(userId);
    else setWishlistIds(new Set());
  }, [userId, refresh]);

  const toggle = useCallback(async (listingId: string) => {
    if (!userId) { router.push('/login'); return; }
    const isFavorited = wishlistIds.has(listingId);

    // Optimistic — RLS on `wishlists` guarantees this only ever touches the
    // signed-in user's own rows either way.
    setWishlistIds(prev => {
      const next = new Set(prev);
      if (isFavorited) next.delete(listingId); else next.add(listingId);
      return next;
    });

    if (isFavorited) {
      await supabase.from('wishlists').delete().eq('user_id', userId).eq('opportunity_id', listingId);
    } else {
      await supabase.from('wishlists').insert({ user_id: userId, opportunity_id: listingId });
    }
  }, [userId, wishlistIds, router]);

  return { wishlistIds, toggle, refresh };
}
