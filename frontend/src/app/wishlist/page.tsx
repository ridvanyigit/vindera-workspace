'use client';

/**
 * Customer wishlist — the favorited items from the public storefront.
 *
 * `wishlists` only stores (user_id, opportunity_id); the actual listing data
 * is fetched separately from the public `storefront_listings` view rather
 * than embedded via a foreign-table select, since that view has no FK
 * PostgREST can embed through and the underlying `opportunities` table is
 * admin-only under RLS.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useWishlist } from '@/lib/useWishlist';
import { useRouter } from 'next/navigation';
import { Heart, RefreshCw } from 'lucide-react';
import type { StorefrontListing } from '@/lib/types';
import StoreNav from '@/components/StoreNav';
import StoreFooter from '@/components/StoreFooter';
import ProductCard from '@/components/ProductCard';

export default function Wishlist() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<StorefrontListing[]>([]);
  const [loading, setLoading] = useState(true);
  const { wishlistIds, toggle } = useWishlist(userId);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return; }
      setUserId(session.user.id);
    });
  }, [router]);

  useEffect(() => {
    if (userId === null) return;
    fetchListings();
  }, [userId, wishlistIds]);

  const fetchListings = async () => {
    setLoading(true);
    const ids = Array.from(wishlistIds);
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from('storefront_listings').select('*').in('id', ids);
    setItems((data as StorefrontListing[]) || []);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">
      <StoreNav />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <div className="mb-6 flex items-center gap-2">
          <Heart className="h-5 w-5 fill-red-500 text-red-500" />
          <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-gray-900">My Wishlist</h1>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-indigo-600" /></div>
        ) : items.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-400">
            <Heart className="mb-3 h-12 w-12 text-gray-200" />
            <p className="text-[14px]">Nothing saved yet — tap the heart on any item to add it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map(item => (
              <ProductCard key={item.id} item={item} isFavorited={wishlistIds.has(item.id)} onToggleWishlist={toggle} />
            ))}
          </div>
        )}
      </main>
      <StoreFooter />
    </div>
  );
}
