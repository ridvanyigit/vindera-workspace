'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';
import type { StorefrontListing } from '@/lib/types';

interface CategoryQuadTileProps {
  category: string;
  items: StorefrontListing[];
}

/** A 2x2 collage of real live thumbnails from one category — links to that category's filtered view. */
export default function CategoryQuadTile({ category, items }: CategoryQuadTileProps) {
  const slots = items.slice(0, 4);

  return (
    <Link
      href={`/?category=${encodeURIComponent(category)}`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="grid aspect-square grid-cols-2 grid-rows-2 gap-px bg-gray-100">
        {Array.from({ length: 4 }).map((_, i) => {
          const item = slots[i];
          return (
            <div key={i} className="flex items-center justify-center overflow-hidden bg-gray-50">
              {item?.image_url ? (
                <img src={item.image_url} alt="" className="h-full w-full object-contain p-2" />
              ) : (
                <Package className="h-6 w-6 text-gray-200" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-1 items-center justify-between p-4">
        <span className="text-[14px] font-semibold text-gray-900 transition group-hover:text-indigo-600">{category}</span>
        <span className="text-[12px] font-medium text-gray-400">Shop now →</span>
      </div>
    </Link>
  );
}
