'use client';

/**
 * Public storefront — anyone can browse, no account required.
 *
 * Reads exclusively from the `storefront_listings` view (see
 * supabase/migrations), which already filters to in_inventory/listed items
 * and strips every internal column (buy price, margin, purchase thesis,
 * ...). There is no cart and no payment flow on purpose: "Buy" opens the
 * live Willhaben ad in a new tab, sidestepping the legal and
 * payment-processing overhead of running an actual checkout.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useWishlist } from '@/lib/useWishlist';
import { Package, RefreshCw, ShieldCheck } from 'lucide-react';
import { TARGET_CATEGORIES } from '@/lib/constants';
import type { StorefrontListing } from '@/lib/types';
import StoreNav from '@/components/StoreNav';
import ProductCard from '@/components/ProductCard';

function StorefrontContent() {
  // useSearchParams (not a one-time window.location.search read): the category
  // tabs in StoreNav link to `/?category=X`, which is a same-page client-side
  // navigation that would never re-run a mount-only effect.
  const categoryParam = useSearchParams().get('category') || 'All';
  const [userId, setUserId] = useState<string | null>(null);
  const [listings, setListings] = useState<StorefrontListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(categoryParam);
  const { wishlistIds, toggle } = useWishlist(userId);

  useEffect(() => { setCategory(categoryParam); }, [categoryParam]);

  useEffect(() => {
    fetchListings();

    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchListings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('storefront_listings')
      .select('*')
      .order('target_sell_price', { ascending: true });
    if (!error && data) setListings(data as StorefrontListing[]);
    setLoading(false);
  };

  const categories = ['All', ...TARGET_CATEGORIES.filter(c => c.value !== 'All').map(c => c.value)];
  const filteredListings = category === 'All' ? listings : listings.filter(l => l.category === category);

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-gray-900">
      <StoreNav />

      <header className="border-b border-gray-200/70 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Inspected & Hand-Picked
          </span>
          <h1 className="mt-4 text-[32px] font-semibold tracking-[-0.02em] text-gray-900">
            Certified Pre-Owned & Open-Box Deals
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-[14px] text-gray-500">
            Every item is quality-checked before listing. Find something you like and buy it directly on Willhaben.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
                category === cat ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-indigo-600" /></div>
        ) : filteredListings.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-400">
            <Package className="mb-3 h-12 w-12 text-gray-200" />
            <p className="text-[14px]">No items in this category right now — check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredListings.map(item => (
              <ProductCard key={item.id} item={item} isFavorited={wishlistIds.has(item.id)} onToggleWishlist={toggle} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function Storefront() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#f7f8fa]"><RefreshCw className="h-7 w-7 animate-spin text-indigo-600" /></div>}>
      <StorefrontContent />
    </Suspense>
  );
}
