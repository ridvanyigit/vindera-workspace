'use client';

/**
 * Storefront navigation: logo, live search, category tabs. Shared by every
 * public storefront page (/, /product/[id]) — never rendered on /admin/*.
 *
 * No accounts here on purpose: nothing on this site can be bought — every
 * item redirects to its live Willhaben listing — so there is nothing a
 * customer account would actually do. See the admin dashboard for the
 * separate, unlinked back office (/admin/login).
 *
 * Hides on scroll-down and reappears on scroll-up, like most storefronts.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Package, Search, X } from 'lucide-react';
import { CARD_COLUMNS } from '@/lib/storefront';
import ListingImage from '@/components/ListingImage';
import { TARGET_CATEGORIES } from '@/lib/constants';
import type { StorefrontCardListing } from '@/lib/types';

export default function StoreNav() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StorefrontCardListing[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      setHidden(currentY > lastScrollY.current && currentY > 96);
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Debounced live search against the public storefront_listings view.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const timeout = setTimeout(async () => {
      const { data, error } = await supabase
        .from('storefront_listings')
        .select(CARD_COLUMNS)
        .ilike('title', `%${q}%`)
        .limit(8);
      if (!error) setResults((data as unknown as StorefrontCardListing[]) || []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  const categories = TARGET_CATEGORIES.filter(c => c.value !== 'All');

  return (
    <div className={`sticky top-0 z-50 border-b border-gray-200/70 bg-white/80 backdrop-blur-xl transition-transform duration-300 ${hidden ? '-translate-y-full' : 'translate-y-0'}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-6">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-sm"><Package className="h-5 w-5 text-white" /></div>
          <div className="hidden leading-tight sm:block">
            <div className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">VINDERA</div>
            <div className="text-[9px] font-medium tracking-[0.18em] text-gray-400">STORE</div>
          </div>
        </Link>

        <div className="flex flex-1 justify-center">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              placeholder="Search products..."
              className="h-10 w-full rounded-full border border-gray-200 bg-gray-50 pl-9 pr-8 text-[13px] text-gray-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-50"
            />
            {query && (
              <button onMouseDown={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}

            {showResults && query.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full mt-2 max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                {searching ? (
                  <div className="p-4 text-center text-[13px] text-gray-400">Searching...</div>
                ) : results.length === 0 ? (
                  <div className="p-4 text-center text-[13px] text-gray-400">No matches.</div>
                ) : results.map(r => (
                  <Link key={r.id} href={`/product/${r.id}`} className="flex items-center gap-3 border-b border-gray-50 p-3 last:border-0 hover:bg-gray-50">
                    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50">
                      <ListingImage src={r.image_url} alt="" className="object-contain" fallbackClassName="h-5 w-5 text-gray-200" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-gray-800">{r.title}</p>
                      <p className="text-[12px] font-semibold text-indigo-600">€{Number(r.target_sell_price).toFixed(2)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6 py-2">
          <Link href="/" className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-100">
            All
          </Link>
          {categories.map(cat => (
            <Link
              key={cat.value}
              href={`/?category=${encodeURIComponent(cat.value)}`}
              className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-100"
            >
              {cat.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
