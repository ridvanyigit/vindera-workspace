'use client';

import Link from 'next/link';
import { Package, ExternalLink } from 'lucide-react';
import type { StorefrontListing } from '@/lib/types';

export type ProductCardSize = 'standard' | 'compact' | 'large' | 'tall';

interface ProductCardProps {
  item: StorefrontListing;
  size?: ProductCardSize;
}

const IMAGE_ASPECT: Record<ProductCardSize, string> = {
  standard: 'aspect-square',
  compact: 'aspect-square',
  large: 'aspect-square',
  tall: 'aspect-[3/4]',
};

const TITLE_CLASS: Record<ProductCardSize, string> = {
  standard: 'text-[14px]',
  compact: 'text-[13px]',
  large: 'text-[15px]',
  tall: 'text-[14px]',
};

const PRICE_CLASS: Record<ProductCardSize, string> = {
  standard: 'text-[19px]',
  compact: 'text-[16px]',
  large: 'text-[22px]',
  tall: 'text-[18px]',
};

const PADDING_CLASS: Record<ProductCardSize, string> = {
  standard: 'p-4',
  compact: 'p-3',
  large: 'p-5',
  tall: 'p-3',
};

/**
 * A single storefront product tile — fills whatever width its parent gives
 * it (a grid cell or a fixed-width rail slot). `size` only changes internal
 * proportions (image aspect ratio, type scale), never the outer width, so
 * the same component works in a CSS grid and in a horizontal rail alike.
 */
export default function ProductCard({ item, size = 'standard' }: ProductCardProps) {
  return (
    <div className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <Link href={`/product/${item.id}`} className={`flex ${IMAGE_ASPECT[size]} items-center justify-center overflow-hidden bg-gray-50`}>
        {item.image_url ? (
          <img src={item.image_url} alt={item.title} className="h-full w-full object-contain p-4" />
        ) : (
          <Package className="h-16 w-16 text-gray-200" />
        )}
      </Link>

      <div className={`flex flex-1 flex-col gap-2 ${PADDING_CLASS[size]}`}>
        <span className="self-start rounded bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
          {item.product_condition || 'NEW'}
        </span>
        <Link href={`/product/${item.id}`} className={`line-clamp-2 font-semibold leading-snug text-gray-900 hover:text-indigo-600 ${TITLE_CLASS[size]}`}>
          {item.title}
        </Link>

        <div className="mt-auto flex items-center justify-between pt-1">
          <span className={`font-bold tabular-nums text-indigo-600 ${PRICE_CLASS[size]}`}>€{Number(item.target_sell_price).toFixed(2)}</span>
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
