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
 *
 * Two views, both driven by the same fetched listings:
 *   - `/`               a curated homepage of horizontally scrollable rails.
 *   - `/?category=X`     a single filtered grid for that category.
 *
 * Every rail here is backed by real data (listing date, condition, category,
 * per-browser recently-viewed via localStorage) — none of it is decorative
 * or fake-personalized. There's no "recommended for you" or "based on your
 * browsing history" section because nothing here tracks that.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useWishlist } from '@/lib/useWishlist';
import { getRecentlyViewedIds } from '@/lib/recentlyViewed';
import { Package, RefreshCw, ArrowLeft } from 'lucide-react';
import type { StorefrontListing } from '@/lib/types';
import StoreNav from '@/components/StoreNav';
import StoreFooter from '@/components/StoreFooter';
import ProductCard, { ProductCardSize } from '@/components/ProductCard';
import CategoryQuadTile from '@/components/CategoryQuadTile';
import HorizontalRail from '@/components/HorizontalRail';

const SLOT_WIDTH: Record<ProductCardSize, string> = {
  standard: 'w-[220px]',
  compact: 'w-[160px]',
  large: 'w-[280px]',
  tall: 'w-[200px]',
};

function ProductSlot({ item, size, isFavorited, onToggleWishlist }: {
  item: StorefrontListing; size: ProductCardSize; isFavorited: boolean; onToggleWishlist: (id: string) => void;
}) {
  return (
    <div className={`shrink-0 snap-start ${SLOT_WIDTH[size]}`}>
      <ProductCard item={item} size={size} isFavorited={isFavorited} onToggleWishlist={onToggleWishlist} />
    </div>
  );
}

function StorefrontContent() {
  // useSearchParams (not a one-time window.location.search read): category
  // links (nav, quad tiles, breadcrumbs) are same-page client-side
  // navigations that would never re-run a mount-only effect otherwise.
  const categoryParam = useSearchParams().get('category');
  const [userId, setUserId] = useState<string | null>(null);
  const [listings, setListings] = useState<StorefrontListing[]>([]);
  const [loading, setLoading] = useState(true);
  const { wishlistIds, toggle } = useWishlist(userId);

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
      .order('created_at', { ascending: false });
    if (!error && data) setListings(data as StorefrontListing[]);
    setLoading(false);
  };

  const categories = useMemo(
    () => Array.from(new Set(listings.map(l => l.category).filter((c): c is string => Boolean(c)))),
    [listings],
  );

  const newArrivals = listings.slice(0, 12);
  const openBoxDeals = useMemo(
    () => listings.filter(l => (l.product_condition || 'NEW').toUpperCase() !== 'NEW').slice(0, 12),
    [listings],
  );
  const recentlyViewed = useMemo(() => {
    if (typeof window === 'undefined') return [];
    const ids = getRecentlyViewedIds();
    return ids.map(id => listings.find(l => l.id === id)).filter((l): l is StorefrontListing => Boolean(l));
  }, [listings]);

  // --- Category-filtered view -------------------------------------------
  if (categoryParam) {
    const filtered = listings.filter(l => l.category === categoryParam);
    return (
      <div className="flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">
        <StoreNav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
          <div className="mb-6 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 transition hover:text-gray-900">
              <ArrowLeft className="h-4 w-4" /> All categories
            </Link>
            <span className="text-gray-300">|</span>
            <h1 className="text-[18px] font-semibold text-gray-900">{categoryParam}</h1>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-indigo-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-gray-400">
              <Package className="mb-3 h-12 w-12 text-gray-200" />
              <p className="text-[14px]">No items in this category right now — check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map(item => (
                <ProductCard key={item.id} item={item} isFavorited={wishlistIds.has(item.id)} onToggleWishlist={toggle} />
              ))}
            </div>
          )}
        </main>
        <StoreFooter />
      </div>
    );
  }

  // --- Curated homepage ---------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">
      <StoreNav />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-indigo-600" /></div>
        ) : listings.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-gray-400">
            <Package className="mb-3 h-12 w-12 text-gray-200" />
            <p className="text-[14px]">No items in stock right now — check back soon.</p>
          </div>
        ) : (
          <>
            {categories.length > 0 && (
              <HorizontalRail title="Shop by Category">
                {categories.map(cat => (
                  <div key={cat} className="w-[220px] shrink-0 snap-start">
                    <CategoryQuadTile category={cat} items={listings.filter(l => l.category === cat)} />
                  </div>
                ))}
              </HorizontalRail>
            )}

            <HorizontalRail title="New Arrivals" subtitle="Freshly added to the store">
              {newArrivals.map((item, i) => (
                <ProductSlot key={item.id} item={item} size={i === 0 ? 'large' : 'standard'} isFavorited={wishlistIds.has(item.id)} onToggleWishlist={toggle} />
              ))}
            </HorizontalRail>

            {openBoxDeals.length > 0 && (
              <HorizontalRail title="Open-Box & Great Value" subtitle="Inspected, not sealed — priced accordingly">
                {openBoxDeals.map(item => (
                  <ProductSlot key={item.id} item={item} size="compact" isFavorited={wishlistIds.has(item.id)} onToggleWishlist={toggle} />
                ))}
              </HorizontalRail>
            )}

            {recentlyViewed.length > 0 && (
              <HorizontalRail title="Recently Viewed">
                {recentlyViewed.map(item => (
                  <ProductSlot key={item.id} item={item} size="standard" isFavorited={wishlistIds.has(item.id)} onToggleWishlist={toggle} />
                ))}
              </HorizontalRail>
            )}

            {categories.map((cat, i) => {
              const items = listings.filter(l => l.category === cat);
              const size: ProductCardSize = i % 2 === 0 ? 'tall' : 'standard';
              return (
                <HorizontalRail key={cat} title={cat}>
                  {items.map(item => (
                    <ProductSlot key={item.id} item={item} size={size} isFavorited={wishlistIds.has(item.id)} onToggleWishlist={toggle} />
                  ))}
                </HorizontalRail>
              );
            })}
          </>
        )}
      </main>
      <StoreFooter />
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
