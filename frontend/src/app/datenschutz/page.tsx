'use client';

/**
 * Datenschutzerklärung (DSGVO / GDPR).
 *
 * Deliberately short: Vindera has no customer accounts, no login and no
 * wishlist (removed — nothing on the site is purchasable, so an account
 * never had anything to do). What's left to disclose is genuinely small:
 * anonymous server logs, a public read-only product catalog, and one
 * local-storage feature that never leaves the visitor's browser.
 *
 *   - Supabase (database) runs in the eu-central-1 (Frankfurt) region —
 *     verified directly against the project, not assumed.
 *   - No analytics/tracking is in place today, so none is claimed; a
 *     forward-looking clause in section 5 covers adding Google Analytics
 *     later, which will need a cookie-consent mechanism this site doesn't
 *     have yet — build that consent flow before actually turning GA on.
 *   - The hosting provider for the Next.js frontend itself is not yet
 *     chosen (no domain yet either), so that paragraph is intentionally
 *     generic — update it once a host is picked, ideally one with EU
 *     servers to keep this section accurate without changes.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StoreNav from '@/components/StoreNav';
import StoreFooter from '@/components/StoreFooter';
import { LEGAL } from '@/lib/legal';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <h2 className="mb-2 text-[15px] font-semibold text-gray-900">{title}</h2>
    <div className="flex flex-col gap-2 text-[14px] leading-relaxed text-gray-700">{children}</div>
  </section>
);

export default function Datenschutz() {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">
      <StoreNav />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-gray-900">Datenschutzerklärung</h1>
        <p className="mt-2 text-[13px] text-gray-500">Stand: {new Date().toLocaleDateString('de-AT', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="mt-8 flex flex-col gap-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <Section title="1. Verantwortlicher">
            <p>
              Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:<br />
              {LEGAL.name}, {LEGAL.street}, {LEGAL.postalCode} {LEGAL.city}, {LEGAL.country}<br />
              E-Mail: <a href={`mailto:${LEGAL.email}`} className="text-indigo-600 hover:text-indigo-700">{LEGAL.email}</a>
            </p>
            <p>Details zum Anbieter finden Sie in unserem <Link href="/impressum" className="text-indigo-600 hover:text-indigo-700">Impressum</Link>.</p>
          </Section>

          <Section title="2. Grundsätzliches">
            <p>
              Vindera ist eine reine Produktvitrine: Sie können unsere Website ohne Registrierung und ohne
              Nutzerkonto durchsuchen. Käufe finden nicht auf dieser Website statt, sondern ausschließlich auf
              Willhaben, an die Sie über die jeweilige Produktseite weitergeleitet werden. Wir erheben daher weder
              Konto-, Zahlungs- noch Versanddaten. Die im Folgenden beschriebene Verarbeitung erfolgt ausschließlich
              auf Grundlage einer gesetzlichen Erlaubnis (Art. 6 DSGVO).
            </p>
          </Section>

          <Section title="3. Hosting und Server-Log-Daten">
            <p>
              Diese Website wird bei einem Cloud-Hosting-Anbieter betrieben. Beim Aufruf der Website verarbeitet
              der Hosting-Anbieter automatisch technische Informationen (u. a. IP-Adresse, Datum und Uhrzeit des
              Zugriffs, aufgerufene Seite, Browsertyp, Referrer-URL) in sogenannten Server-Log-Files. Dies dient
              der technischen Bereitstellung und Absicherung der Website (Art. 6 Abs. 1 lit. f DSGVO, berechtigtes
              Interesse an einem stabilen und sicheren Betrieb) und wird nach kurzer Zeit automatisch gelöscht.
            </p>
          </Section>

          <Section title="4. Produktkatalog (Supabase)">
            <p>
              Die auf dieser Website angezeigten Produktdaten (Titel, Bild, Preis, Kategorie, Zustand) stammen aus
              unserer Datenbank, betrieben über den Dienst <strong>Supabase</strong> auf Servern in der EU (Region
              Frankfurt, eu-central-1). Der Abruf dieser öffentlichen Produktdaten ist rein lesend und ohne
              Personenbezug — es werden dabei keine Daten über Sie gespeichert.
            </p>
          </Section>

          <Section title="5. Lokale Speicherung im Browser">
            <p>
              Für die Funktion „Kürzlich angesehen“ speichern wir die IDs der von Ihnen besuchten Produktseiten im
              lokalen Speicher (Local Storage) Ihres Browsers. Diese Information verbleibt ausschließlich auf
              Ihrem Gerät, wird nicht an uns oder Dritte übertragen und dient ausschließlich der von Ihnen aktiv
              genutzten Funktion. Da dies technisch notwendig für eine von Ihnen gewünschte Funktion ist, ist
              hierfür keine gesonderte Einwilligung erforderlich (§ 165 Abs. 3 TKG 2021). Sie können diese Daten
              jederzeit über die Einstellungen Ihres Browsers löschen.
            </p>
          </Section>

          <Section title="6. Analyse- und Tracking-Tools">
            <p>
              Wir setzen derzeit <strong>keine</strong> Analyse-, Marketing- oder Trackingdienste (z. B. Google
              Analytics) und keine entsprechenden Cookies ein. Sollten wir künftig solche Dienste einsetzen, werden
              wir diese Datenschutzerklärung vorab aktualisieren und, soweit gesetzlich erforderlich, Ihre
              Einwilligung über ein Cookie-Consent-Tool einholen.
            </p>
          </Section>

          <Section title="7. Empfänger und Weitergabe">
            <p>
              Eine Weitergabe Ihrer Daten an Dritte erfolgt nicht. Klicken Sie auf „Auf Willhaben Kaufen“, verlassen
              Sie unsere Website; für die Datenverarbeitung auf Willhaben ist ausschließlich die willhaben internet
              service GmbH verantwortlich — es gelten deren eigene Datenschutzhinweise.
            </p>
          </Section>

          <Section title="8. Ihre Rechte">
            <p>
              Soweit wir personenbezogene Daten verarbeiten (siehe Abschnitt 3), stehen Ihnen nach der DSGVO
              folgende Rechte zu: Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der
              Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch gegen die Verarbeitung
              (Art. 21). Kontaktieren Sie uns hierzu unter{' '}
              <a href={`mailto:${LEGAL.email}`} className="text-indigo-600 hover:text-indigo-700">{LEGAL.email}</a>.
            </p>
            <p>
              Zudem haben Sie das Recht, sich bei der österreichischen Datenschutzbehörde zu beschweren:
              Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030 Wien,{' '}
              <a href="https://www.dsb.gv.at" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-700">www.dsb.gv.at</a>.
            </p>
          </Section>

          <Section title="9. Änderungen dieser Datenschutzerklärung">
            <p>
              Wir passen diese Datenschutzerklärung an, sobald sich unsere Datenverarbeitung ändert (z. B. bei
              Wahl eines Hosting-Anbieters oder Einführung neuer Funktionen). Die jeweils aktuelle Fassung finden
              Sie stets unter {origin ? `${origin}/datenschutz` : 'dieser Adresse'}.
            </p>
          </Section>
        </div>

        <p className="mt-6 text-[13px] text-gray-400">
          Siehe auch unser <Link href="/impressum" className="text-indigo-600 hover:text-indigo-700">Impressum</Link>.
        </p>
      </main>

      <StoreFooter />
    </div>
  );
}
