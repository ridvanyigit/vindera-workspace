'use client';

import Link from 'next/link';
import { Heart, Package, ExternalLink } from 'lucide-react';
import type { StorefrontListing } from '@/lib/types';

interface ProductCardProps {
  item: StorefrontListing;
  isFavorited: boolean;
  onToggleWishlist: (id: string) => void;
}

/** A single storefront product tile — used on the homepage, wishlist and "related products". */
export default function ProductCard({ item, isFavorited, onToggleWishlist }: ProductCardProps) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <button
        onClick={() => onToggleWishlist(item.id)}
        title={isFavorited ? 'Remove from wishlist' : 'Add to wishlist'}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-105 hover:bg-white"
      >
        <Heart className={`h-4.5 w-4.5 transition-colors ${isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
      </button>

      <Link href={`/product/${item.id}`} className="flex aspect-square items-center justify-center overflow-hidden bg-gray-50">
        {item.image_url ? (
          <img src={item.image_url} alt={item.title} className="h-full w-full object-contain p-4" />
        ) : (
          <Package className="h-16 w-16 text-gray-200" />
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="self-start rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
          {item.product_condition || 'NEW'}
        </span>
        <Link href={`/product/${item.id}`} className="line-clamp-2 text-[14px] font-semibold leading-snug text-gray-900 hover:text-indigo-600">
          {item.title}
        </Link>

        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="text-[19px] font-bold tabular-nums text-indigo-600">€{Number(item.target_sell_price).toFixed(2)}</span>
        </div>

        {item.willhaben_url ? (
          <a
            href={item.willhaben_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-[13px] font-bold text-white transition hover:bg-indigo-700"
          >
            Auf Willhaben Kaufen <ExternalLink className="h-4 w-4" />
          </a>
        ) : (
          <button disabled className="mt-1 flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 py-3 text-[13px] font-bold text-gray-400">
            Bald verfügbar
          </button>
        )}
      </div>
    </div>
  );
}
