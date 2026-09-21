import Image from 'next/image';
import { Package } from 'lucide-react';

interface ListingImageProps {
  src: string | null | undefined;
  alt: string;
  /** Classes for the photo itself (padding, object-fit). */
  className?: string;
  /** Classes for the placeholder icon shown when there is no usable photo. */
  fallbackClassName?: string;
  /** Load immediately instead of lazily (the main image above the fold). */
  eager?: boolean;
}

/**
 * A listing photo that fills its parent, which must be `relative` and sized
 * (for example `aspect-square`). Photos are pasted in as arbitrary https URLs, so
 * they cannot go through the Next image optimizer: it would need every host
 * allow-listed, or `**`, which turns /_next/image into an open image proxy. With
 * `unoptimized` next/image still gives lazy loading and no layout shift.
 * Anything that is not an https URL renders the placeholder instead.
 */
export default function ListingImage({ src, alt, className = 'object-contain p-4', fallbackClassName = 'h-16 w-16 text-gray-200', eager }: ListingImageProps) {
  if (!src || !/^https:\/\//i.test(src)) return <Package className={fallbackClassName} />;
  return <Image src={src} alt={alt} fill unoptimized loading={eager ? 'eager' : 'lazy'} className={className} />;
}
