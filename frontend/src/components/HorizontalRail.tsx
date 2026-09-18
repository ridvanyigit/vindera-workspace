'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalRailProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/** A titled, horizontally scrollable row — the building block of the homepage's product sections. */
export default function HorizontalRail({ title, subtitle, children }: HorizontalRailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -el.clientWidth * 0.85 : el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-end justify-between px-1">
        <div>
          <h2 className="text-[18px] font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-[13px] text-gray-500">{subtitle}</p>}
        </div>
        <div className="hidden items-center gap-1 sm:flex">
          <button
            onClick={() => scroll('left')}
            aria-label="Scroll left"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            aria-label="Scroll right"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:text-gray-900"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  );
}
