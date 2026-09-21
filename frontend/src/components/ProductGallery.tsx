'use client';

import { useState } from 'react';
import ListingImage from '@/components/ListingImage';

/** Image gallery of the product page: a main image plus clickable thumbnails. */
export default function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(images[0] ?? null);

  return (
    <div className="flex gap-3">
      {images.length > 1 && (
        <div className="flex flex-col gap-2">
          {images.map((url, i) => (
            <button
              key={`${url}-${i}`}
              onClick={() => setActive(url)}
              aria-label={`Show image ${i + 1}`}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition ${active === url ? 'border-indigo-600' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <ListingImage src={url} alt="" className="object-contain p-1" fallbackClassName="hidden" />
            </button>
          ))}
        </div>
      )}
      <div className="relative flex aspect-square flex-1 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <ListingImage src={active} alt={title} className="object-contain p-6" fallbackClassName="h-24 w-24 text-gray-200" eager />
      </div>
    </div>
  );
}
