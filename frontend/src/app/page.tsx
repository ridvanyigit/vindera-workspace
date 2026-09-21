'use client';

/**
 * Public storefront — anyone can browse, no account required.
 *
 * Reads exclusively from the `storefront_listings` view (see
 * supabase/migrations), which already filters to in_inventory/listed items
 * and strips every internal column (buy price, margin, purchase thesis,
 * ...). Only the card columns are selected, and only a limited page: the
 * homepage builds its rails from the newest HOME_LIMIT items, a category
 * grid loads PAGE_SIZE items at a time. There is no cart, no account and no payment flow on purpose: "Buy"
 * opens the live Willhaben ad in a new tab. Nothing here can be purchased on
 * Vindera itself, so there is nothing a customer account would do — see
 * the admin dashboard for the separate, unlinked back office.
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
import { getRecentlyViewedIds } from '@/lib/recentlyViewed';
import { CARD_COLUMNS, HOME_LIMIT, PAGE_SIZE } from '@/lib/storefront';
import { Package, RefreshCw, ArrowLeft, Info } from 'lucide-react';
import type { StorefrontCardListing } from '@/lib/types';
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

function ProductSlot({ item, size }: { item: StorefrontCardListing; size: ProductCardSize }) {
  return (
    <div className={`shrink-0 snap-start ${SLOT_WIDTH[size]}`}>
      <ProductCard item={item} size={size} />
    </div>
  );
}

/** Newest first; the id breaks ties so pages never overlap or skip a row. */
function listingsQuery(from: number, to: number) {
  return supabase
    .from('storefront_listings')
    .select(CARD_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, to);
}

function Spinner() {
  return <div className="flex h-64 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-indigo-600" /></div>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
      <Package className="h-12 w-12 text-gray-200" />
      <p className="text-[14px]">The products could not be loaded right now.</p>
      <button onClick={onRetry} className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-700">Try again</button>
    </div>
  );
}

/** `/?category=X` — one category as a grid, loaded PAGE_SIZE items at a time. */
function CategoryView({ category }: { category: string }) {
  const [items, setItems] = useState<StorefrontCardListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await listingsQuery(0, PAGE_SIZE - 1).eq('category', category);
      if (cancelled) return;
      setFailed(Boolean(error));
      setItems(error ? [] : (data as unknown as StorefrontCardListing[]));
      setHasMore(!error && (data?.length ?? 0) === PAGE_SIZE);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [category, attempt]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data, error } = await listingsQuery(items.length, items.length + PAGE_SIZE - 1).eq('category', category);
    if (error) {
      setFailed(true);
    } else {
      setItems(current => [...current, ...(data as unknown as StorefrontCardListing[])]);
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  };

  const retry = () => { setFailed(false); setLoading(true); setAttempt(n => n + 1); };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 transition hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> All categories
        </Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-[18px] font-semibold text-gray-900">{category}</h1>
      </div>

      {loading ? (
        <Spinner />
      ) : failed && items.length === 0 ? (
        <LoadError onRetry={retry} />
      ) : items.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-gray-400">
          <Package className="mb-3 h-12 w-12 text-gray-200" />
          <p className="text-[14px]">No items in this category right now — check back soon.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map(item => (
              <ProductCard key={item.id} item={item} />
            ))}
          </div>
          {failed && <p className="mt-6 text-center text-[13px] text-red-600">More items could not be loaded.</p>}
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-[13px] font-semibold text-gray-700 shadow-sm transition hover:border-gray-300 disabled:opacity-60"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

/** `/` — a curated homepage of horizontally scrollable rails built from the newest listings. */
function Homepage() {
  const [listings, setListings] = useState<StorefrontCardListing[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<StorefrontCardListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await listingsQuery(0, HOME_LIMIT - 1);
      if (cancelled) return;
      setFailed(Boolean(error));
      setListings(error ? [] : (data as unknown as StorefrontCardListing[]));
      setLoading(false);

      // Per-browser history: ask for exactly those ids, whatever their age.
      const ids = getRecentlyViewedIds();
      if (error || ids.length === 0) return;
      const { data: viewed } = await supabase.from('storefront_listings').select(CARD_COLUMNS).in('id', ids);
      if (cancelled || !viewed) return;
      const byId = new Map((viewed as unknown as StorefrontCardListing[]).map(item => [item.id, item]));
      setRecentlyViewed(ids.map(id => byId.get(id)).filter((item): item is StorefrontCardListing => Boolean(item)));
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  const categories = useMemo(
    () => Array.from(new Set(listings.map(l => l.category).filter((c): c is string => Boolean(c)))),
    [listings],
  );
  const newArrivals = listings.slice(0, 12);
  const openBoxDeals = useMemo(
    () => listings.filter(l => (l.product_condition || 'NEW').toUpperCase() !== 'NEW').slice(0, 12),
    [listings],
  );

  const retry = () => { setFailed(false); setLoading(true); setAttempt(n => n + 1); };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <div>
          <p className="type-label text-gray-900">How it works</p>
          <p className="type-body mt-0.5 text-gray-600">
            Vindera doesn&apos;t process purchases itself. The buy button opens the item&apos;s live Willhaben listing, and the transaction happens there.
          </p>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : failed ? (
        <LoadError onRetry={retry} />
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
              <ProductSlot key={item.id} item={item} size={i === 0 ? 'large' : 'standard'} />
            ))}
          </HorizontalRail>

          {openBoxDeals.length > 0 && (
            <HorizontalRail title="Open-Box & Great Value" subtitle="Inspected, not sealed — priced accordingly">
              {openBoxDeals.map(item => (
                <ProductSlot key={item.id} item={item} size="compact" />
              ))}
            </HorizontalRail>
          )}

          {recentlyViewed.length > 0 && (
            <HorizontalRail title="Recently Viewed">
              {recentlyViewed.map(item => (
                <ProductSlot key={item.id} item={item} size="standard" />
              ))}
            </HorizontalRail>
          )}

          {categories.map((cat, i) => {
            const items = listings.filter(l => l.category === cat).slice(0, 12);
            const size: ProductCardSize = i % 2 === 0 ? 'tall' : 'standard';
            return (
              <HorizontalRail key={cat} title={cat}>
                {items.map(item => (
                  <ProductSlot key={item.id} item={item} size={size} />
                ))}
              </HorizontalRail>
            );
          })}
        </>
      )}
    </main>
  );
}

function StorefrontContent() {
  // useSearchParams (not a one-time window.location.search read): category
  // links (nav, quad tiles, breadcrumbs) are same-page client-side
  // navigations that would never re-run a mount-only effect otherwise. The
  // key gives each category a fresh page state.
  const categoryParam = useSearchParams().get('category');

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">
      <StoreNav />
      {categoryParam ? <CategoryView key={categoryParam} category={categoryParam} /> : <Homepage />}
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
