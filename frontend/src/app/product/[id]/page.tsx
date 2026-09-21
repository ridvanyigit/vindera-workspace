/**
 * Product detail page — Amazon-style layout: image gallery on the left,
 * title/description in the middle, a buy box on the right, expandable
 * detail sections, and related items at the bottom.
 *
 * Rendered on the server (revalidated every minute) so that search engines and
 * link previews see the title, description, Open Graph image and Product JSON-LD.
 * Reads only the public `storefront_listings` view with the anon key. A sold,
 * removed or unknown item answers 404 with a friendly page (./not-found.tsx).
 *
 * Honesty note: our data model doesn't carry Amazon-style "top highlights",
 * "style variants" or customer reviews, so this deliberately doesn't
 * fabricate any — the detail sections only show real columns we store
 * (the actual Willhaben ad copy, category, condition).
 */

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, ChevronDown, ChevronRight, ShieldCheck, Truck } from 'lucide-react';
import { supabaseServer } from '@/lib/supabaseServer';
import { CARD_COLUMNS, DETAIL_COLUMNS } from '@/lib/storefront';
import { SITE_URL } from '@/lib/site';
import type { StorefrontCardListing, StorefrontListing } from '@/lib/types';
import StoreNav from '@/components/StoreNav';
import StoreFooter from '@/components/StoreFooter';
import ProductCard from '@/components/ProductCard';
import HorizontalRail from '@/components/HorizontalRail';
import ProductGallery from '@/components/ProductGallery';
import RecordView from '@/components/RecordView';

export const revalidate = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = { params: Promise<{ id: string }> };

/** One query per request, shared by generateMetadata and the page. Null when the item is not on sale. */
const getListing = cache(async (id: string): Promise<StorefrontListing | null> => {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabaseServer.from('storefront_listings').select(DETAIL_COLUMNS).eq('id', id).maybeSingle();
  // A failed query must not look like "sold": throwing keeps a 404 out of the cache.
  if (error) throw new Error(`storefront_listings query failed: ${error.message}`);
  return (data as unknown as StorefrontListing) ?? null;
});

async function getRelated(item: StorefrontListing): Promise<StorefrontCardListing[]> {
  if (!item.category) return [];
  const { data } = await supabaseServer
    .from('storefront_listings')
    .select(CARD_COLUMNS)
    .eq('category', item.category)
    .neq('id', item.id)
    .order('created_at', { ascending: false })
    .limit(8);
  return (data as unknown as StorefrontCardListing[]) ?? [];
}

const isHttps = (url: string | null | undefined): url is string => Boolean(url && /^https:\/\//i.test(url));

/** Ad copy collapsed to one line and cut at a word boundary, for meta descriptions. */
function summarize(text: string | null | undefined, max = 160): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

// schema.org has no "open box"; UsedCondition is the closest true statement. Other values are left out.
const SCHEMA_CONDITION: Record<string, string> = {
  'NEW': 'https://schema.org/NewCondition',
  'OPEN BOX': 'https://schema.org/UsedCondition',
};

function productJsonLd(item: StorefrontListing, images: string[]) {
  const condition = SCHEMA_CONDITION[(item.product_condition || 'NEW').toUpperCase()];
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.title,
    ...(images.length > 0 && { image: images }),
    ...(item.generated_description && { description: summarize(item.generated_description, 5000) }),
    ...(item.category && { category: item.category }),
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/product/${item.id}`,
      priceCurrency: 'EUR',
      price: Number(item.target_sell_price).toFixed(2),
      availability: 'https://schema.org/InStock',
      ...(condition && { itemCondition: condition }),
    },
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const item = await getListing((await params).id);
  if (!item) return { title: 'Not available', robots: { index: false, follow: true } };

  const price = `€${Number(item.target_sell_price).toFixed(2)}`;
  const description = summarize(item.generated_description) || `${item.title} — ${price}, available on Willhaben.`;
  const image = [item.image_url, ...(item.gallery_image_urls ?? [])].find(isHttps);
  return {
    title: item.title,
    description,
    alternates: { canonical: `/product/${item.id}` },
    openGraph: { type: 'website', siteName: 'Vindera', title: item.title, description, url: `/product/${item.id}`, ...(image && { images: [image] }) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: item.title, description },
  };
}

export default async function ProductDetail({ params }: PageProps) {
  const item = await getListing((await params).id);
  if (!item) notFound();

  const related = await getRelated(item);
  const images = [item.image_url, ...(item.gallery_image_urls || [])].filter(isHttps);
  // Escaping "<" stops ad copy from closing the script tag.
  const jsonLd = JSON.stringify(productJsonLd(item, images)).replace(/</g, '\\u003c');

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">
      <StoreNav />
      <RecordView id={item.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

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
          <div className="lg:col-span-5">
            <ProductGallery images={images} title={item.title} />
          </div>

          {/* Title, description, detail sections */}
          <div className="lg:col-span-4">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
              {item.product_condition || 'NEW'}
            </span>
            <h1 className="mt-2 text-[22px] font-semibold leading-snug text-gray-900">{item.title}</h1>
            {item.category && <p className="mt-1 text-[13px] text-gray-500">Category: {item.category}</p>}

            <div className="mt-6">
              <Details title="Product Details" defaultOpen>
                {item.generated_description || 'No further details provided for this item.'}
              </Details>
              <Details title="Item Details">
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
              </Details>
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
                  rel="noopener noreferrer nofollow"
                  className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-[14px] font-bold text-white transition hover:bg-indigo-700"
                >
                  Auf Willhaben Kaufen <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <>
                  <button disabled className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 py-3 text-[14px] font-bold text-gray-400">
                    Bald verfügbar
                  </button>
                  <p className="mt-2 text-[12px] text-gray-500">The Willhaben ad for this item is not live yet.</p>
                </>
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

/** Expandable section without client JavaScript (native <details>). */
function Details({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group border-b border-gray-200 py-3">
      <summary className="flex w-full cursor-pointer list-none items-center justify-between text-left [&::-webkit-details-marker]:hidden">
        <span className="text-[14px] font-semibold text-gray-900">{title}</span>
        <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 text-[13px] leading-relaxed text-gray-600 whitespace-pre-wrap">{children}</div>
    </details>
  );
}
