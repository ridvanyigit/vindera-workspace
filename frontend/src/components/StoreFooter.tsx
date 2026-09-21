'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';
import { LEGAL } from '@/lib/legal';

/** Corporate footer with legal links — shared by every public storefront page. */
export default function StoreFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-gray-800 bg-gray-950 text-gray-300">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                <Package className="h-4 w-4 text-white" />
              </div>
              <span className="text-[15px] font-semibold text-white">VINDERA</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-gray-400">
              Geprüfte Gebraucht- und Open-Box-Ware, kuratiert und direkt über Willhaben erhältlich.
            </p>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-100">Shop</h3>
            <ul className="mt-3 flex flex-col gap-2 text-[13px]">
              <li><Link href="/" className="transition hover:text-white">Alle Produkte</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-100">Rechtliches</h3>
            <ul className="mt-3 flex flex-col gap-2 text-[13px]">
              <li><Link href="/impressum" className="transition hover:text-white">Impressum</Link></li>
              <li><Link href="/datenschutz" className="transition hover:text-white">Datenschutzerklärung</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-100">Kontakt</h3>
            <ul className="mt-3 flex flex-col gap-2 text-[13px]">
              <li><a href={`mailto:${LEGAL.email}`} className="transition hover:text-white">{LEGAL.email}</a></li>
              <li className="text-gray-500">{LEGAL.city}, {LEGAL.country}</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-gray-800 pt-6 text-[12px] text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {LEGAL.name} — Vindera</p>
          <p>Käufe erfolgen ausschließlich über Willhaben — Vindera ist nicht Vertragspartner des Kaufvertrags.</p>
        </div>
      </div>
    </footer>
  );
}
