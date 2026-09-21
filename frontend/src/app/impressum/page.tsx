'use client';

/**
 * Impressum (Offenlegung gemäß § 5 ECG und § 25 MedienG).
 *
 * The operator's details come from lib/legal.ts (edit them there). They were
 * supplied directly by the site operator, not invented — two are provisional
 * because they don't exist yet:
 *   - the domain (read dynamically from window.location, never hardcoded,
 *     so this is always accurate for wherever the site is actually running)
 *   - the Gewerbeberechtigung (trade license), not yet registered
 * Update the Gewerbe line the moment the real one is issued.
 */

import Link from 'next/link';
import StoreNav from '@/components/StoreNav';
import StoreFooter from '@/components/StoreFooter';
import { LEGAL } from '@/lib/legal';
import { useOrigin } from '@/lib/useClientOnly';

export default function Impressum() {
  const origin = useOrigin();

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">
      <StoreNav />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-gray-900">Impressum</h1>
        <p className="mt-2 text-[13px] text-gray-500">Offenlegung gemäß § 5 ECG und § 25 Mediengesetz</p>

        <div className="mt-8 flex flex-col gap-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-[14px] leading-relaxed text-gray-700">
          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">Unternehmen</h2>
            <p>
              {LEGAL.name}<br />
              {LEGAL.street}, {LEGAL.postalCode} {LEGAL.city}<br />
              {LEGAL.country}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">Kontakt</h2>
            <p>
              E-Mail: <a href={`mailto:${LEGAL.email}`} className="text-indigo-600 hover:text-indigo-700">{LEGAL.email}</a><br />
              Web: {origin || '…'}
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">Unternehmensgegenstand</h2>
            <p>
              An- und Verkauf von Waren. Vindera stellt ausschließlich Produktinformationen dar; der Kaufvertrag
              kommt ausschließlich zwischen Käufer:in und dem jeweiligen Anbieter auf Willhaben zustande. Vindera
              ist an diesem Kaufvertrag nicht beteiligt und nicht Vertragspartner.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">Unternehmensdaten</h2>
            <p>
              Steuernummer: {LEGAL.taxNumber}<br />
              {LEGAL.vatId && <>UID-Nummer: {LEGAL.vatId}<br /></>}
              Mitglied der: {LEGAL.chamber}<br />
              Aufsichtsbehörde: {LEGAL.supervisoryAuthority}<br />
              Gewerbeberechtigung: {LEGAL.tradeLicense}<br />
              Anwendbare Vorschriften: Gewerbeordnung (abrufbar unter www.ris.bka.gv.at)
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">EU-Streitschlichtung</h2>
            <p>
              Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit, abrufbar unter{' '}
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-700">
                ec.europa.eu/consumers/odr
              </a>. Da der Kaufvertrag ausschließlich zwischen Käufer:in und dem jeweiligen Anbieter auf Willhaben
              zustande kommt, ist Vindera an einem etwaigen Streitbeilegungsverfahren nicht beteiligt.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-gray-500">Haftungshinweis</h2>
            <p>
              Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links,
              insbesondere für Inserate auf Willhaben. Für den Inhalt der verlinkten Seiten sind ausschließlich
              deren Betreiber verantwortlich.
            </p>
          </section>
        </div>

        <p className="mt-6 text-[13px] text-gray-400">
          Siehe auch unsere <Link href="/datenschutz" className="text-indigo-600 hover:text-indigo-700">Datenschutzerklärung</Link>.
        </p>
      </main>

      <StoreFooter />
    </div>
  );
}
