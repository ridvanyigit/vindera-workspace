'use client';

/**
 * Product detail page — Amazon-style layout: image gallery on the left,
 * title/description in the middle, a buy box on the right, expandable
 * detail sections, and related items at the bottom.
 *
 * Honesty note: our data model doesn't carry Amazon-style "top highlights",
 * "style variants" or customer reviews, so this deliberately doesn't
 * fabricate any — the detail sections only show real columns we store
 * (the actual Willhaben ad copy, category, condition).
 */

import { use, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { recordProductView } from '@/lib/recentlyViewed';
import Link from 'next/link';
import { Package, ExternalLink, RefreshCw, ChevronDown, ChevronRight, ShieldCheck, Truck } from 'lucide-react';
import type { StorefrontListing } from '@/lib/types';
import StoreNav from '@/components/StoreNav';
import StoreFooter from '@/components/StoreFooter';
import ProductCard from '@/components/ProductCard';
import HorizontalRail from '@/components/HorizontalRail';

const Accordion = ({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-200 py-3">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between text-left">
        <span className="text-[14px] font-semibold text-gray-900">{title}</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-3 text-[13px] leading-relaxed text-gray-600 whitespace-pre-wrap">{children}</div>}
    </div>
  );
};

export default function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [item, setItem] = useState<StorefrontListing | null>(null);
  const [related, setRelated] = useState<StorefrontListing[]>([]);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetchItem();
  }, [id]);

  const fetchItem = async () => {
    setLoading(true);
    setNotFound(false);
    const { data, error } = await supabase.from('storefront_listings').select('*').eq('id', id).single();
    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const listing = data as StorefrontListing;
    setItem(listing);
    setActiveImage(listing.image_url || listing.gallery_image_urls?.[0] || null);
    setLoading(false);
    recordProductView(listing.id);

    if (listing.category) {
      const { data: relatedData } = await supabase
        .from('storefront_listings')
        .select('*')
        .eq('category', listing.category)
        .neq('id', listing.id)
        .limit(8);
      if (relatedData) setRelated(relatedData as StorefrontListing[]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f8fa]">
        <StoreNav />
        <div className="flex h-96 items-center justify-center"><RefreshCw className="h-7 w-7 animate-spin text-indigo-600" /></div>
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="flex min-h-screen flex-col bg-[#f7f8fa]">
        <StoreNav />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
          <Package className="h-12 w-12 text-gray-200" />
          <p className="text-[14px]">This item isn&apos;t available anymore.</p>
          <Link href="/" className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-700">Back to the store</Link>
        </div>
        <StoreFooter />
      </div>
    );
  }

  const images = [item.image_url, ...(item.gallery_image_urls || [])].filter((url): url is string => Boolean(url));

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">
      <StoreNav />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <div className="mb-6 flex items-center gap-1.5 text-[13px] text-gray-500">
          <Link href="/" className="hover:text-gray-900">Home</Link>
          {item.category && (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <Link href={`/?category=${encodeURIComponent(item.category)}`} className="hover:text-gray-900">{item.category}</Link>
            </>
          )}
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate text-gray-400">{item.title}</span>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Image gallery */}
          <div className="lg:col-span-5">
            <div className="flex gap-3">
              {images.length > 1 && (
                <div className="flex flex-col gap-2">
                  {images.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImage(url)}
                      className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition ${activeImage === url ? 'border-indigo-600' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <img src={url} alt="" className="h-full w-full object-contain p-1" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex aspect-square flex-1 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white">
                {activeImage ? (
                  <img src={activeImage} alt={item.title} className="h-full w-full object-contain p-6" />
                ) : (
                  <Package className="h-24 w-24 text-gray-200" />
                )}
              </div>
            </div>
          </div>

          {/* Title, description, detail accordions */}
          <div className="lg:col-span-4">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
              {item.product_condition || 'NEW'}
            </span>
            <h1 className="mt-2 text-[22px] font-semibold leading-snug text-gray-900">{item.title}</h1>
            {item.category && <p className="mt-1 text-[13px] text-gray-500">Category: {item.category}</p>}

            <div className="mt-6">
              <Accordion title="Product Details" defaultOpen>
                {item.generated_description || 'No further details provided for this item.'}
              </Accordion>
              <Accordion title="Item Details">
                {[
                  ['Condition', item.product_condition || 'NEW'],
                  ['Category', item.category || '—'],
                  ['Listing Title', item.generated_title || item.title],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between py-1">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-800">{value}</span>
                  </div>
                ))}
              </Accordion>
            </div>
          </div>

          {/* Buy box */}
          <div className="lg:col-span-3">
            <div className="sticky top-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <span className="text-[26px] font-bold tabular-nums text-indigo-600">€{Number(item.target_sell_price).toFixed(2)}</span>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
                <ShieldCheck className="h-4 w-4" /> {item.status === 'listed' ? 'Live on Willhaben' : 'In stock, ready to list'}
              </p>
              <p className="mt-3 flex items-start gap-1.5 text-[12px] text-gray-500">
                <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Shipping and pickup are arranged directly with the seller on Willhaben.
              </p>

              {item.willhaben_url ? (
                <a
                  href={item.willhaben_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-[14px] font-bold text-white transition hover:bg-indigo-700"
                >
                  Auf Willhaben Kaufen <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <button disabled className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 py-3 text-[14px] font-bold text-gray-400">
                  Bald verfügbar
                </button>
              )}
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-16">
            <HorizontalRail title="You might also like">
              {related.map(r => (
                <div key={r.id} className="w-[220px] shrink-0 snap-start">
                  <ProductCard item={r} />
                </div>
              ))}
            </HorizontalRail>
          </div>
        )}
      </main>
      <StoreFooter />
    </div>
  );
}
