'use client';

/**
 * Datenschutzerklärung (DSGVO / GDPR).
 *
 * Written to match what this codebase actually does — no invented data
 * flows. Notably:
 *   - Supabase (auth + database) runs in the eu-central-1 (Frankfurt)
 *     region — verified directly against the project, not assumed.
 *   - Email/password is the only sign-in method right now — Google/Apple
 *     were pulled from /login (see that file), so this doesn't claim them.
 *   - No analytics/tracking is in place today, so none is claimed; a
 *     forward-looking clause in section 8 covers adding Google Analytics
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
    <div className="min-h-screen bg-[#f7f8fa] text-gray-900">
      <StoreNav />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-gray-900">Datenschutzerklärung</h1>
        <p className="mt-2 text-[13px] text-gray-500">Stand: {new Date().toLocaleDateString('de-AT', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="mt-8 flex flex-col gap-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <Section title="1. Verantwortlicher">
            <p>
              Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:<br />
              Rıdvan Yiğit, Kühgasse 8/9, 1110 Wien, Österreich<br />
              E-Mail: <a href="mailto:info@rai-recht.at" className="text-indigo-600 hover:text-indigo-700">info@rai-recht.at</a>
            </p>
            <p>Details zum Anbieter finden Sie in unserem <Link href="/impressum" className="text-indigo-600 hover:text-indigo-700">Impressum</Link>.</p>
          </Section>

          <Section title="2. Grundsätzliches">
            <p>
              Wir verarbeiten personenbezogene Daten nur, soweit dies zur Bereitstellung unserer Website und
              unserer Funktionen (insbesondere der Wunschliste) erforderlich ist, und ausschließlich auf Grundlage
              einer gesetzlichen Erlaubnis (Art. 6 DSGVO). Vindera ist eine Produktvitrine: Käufe finden nicht auf
              dieser Website statt, sondern ausschließlich auf Willhaben, an die Sie über die jeweilige
              Produktseite weitergeleitet werden. Wir erheben daher keine Zahlungs- oder Versanddaten.
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

          <Section title="4. Datenbank und Authentifizierung (Supabase)">
            <p>
              Für Nutzerkonten, die Wunschliste und die zugrunde liegende Datenbank verwenden wir den Dienst{' '}
              <strong>Supabase</strong>. Die Daten werden auf Servern in der EU (Region Frankfurt, eu-central-1)
              gespeichert und verarbeitet. Mit Supabase besteht ein Auftragsverarbeitungsvertrag gemäß Art. 28
              DSGVO.
            </p>
          </Section>

          <Section title="5. Registrierung und Nutzerkonto">
            <p>
              Wenn Sie ein Konto anlegen, verarbeiten wir Ihre E-Mail-Adresse und ein von Ihnen gewähltes,
              verschlüsselt gespeichertes Passwort. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Erfüllung des
              Nutzungsverhältnisses). Ein Nutzerkonto ist ausschließlich erforderlich, um Produkte auf die
              Wunschliste zu setzen — das Durchsuchen der Website ist ohne Konto möglich. Sollten wir künftig eine
              Anmeldung über Drittanbieter (z. B. Google) anbieten, aktualisieren wir diese Erklärung vorab
              entsprechend.
            </p>
          </Section>

          <Section title="6. Wunschliste">
            <p>
              Speichern Sie ein Produkt auf Ihrer Wunschliste, verknüpfen wir dies mit Ihrem Nutzerkonto, um Ihnen
              die gespeicherten Produkte bei jedem Besuch anzuzeigen (Art. 6 Abs. 1 lit. b DSGVO). Diese Daten
              werden gelöscht, sobald Sie das jeweilige Produkt von der Liste entfernen oder Ihr Konto löschen
              lassen.
            </p>
          </Section>

          <Section title="7. Lokale Speicherung im Browser">
            <p>
              Für die Anmeldesitzung sowie für die Funktion „Kürzlich angesehen“ verwenden wir den lokalen
              Speicher (Local Storage) Ihres Browsers. Diese Informationen verbleiben ausschließlich auf Ihrem
              Gerät, werden nicht an uns oder Dritte übertragen und dienen ausschließlich der von Ihnen aktiv
              genutzten Funktion. Da dies technisch notwendig ist, ist hierfür keine gesonderte Einwilligung
              erforderlich (§ 165 Abs. 3 TKG 2021).
            </p>
          </Section>

          <Section title="8. Analyse- und Tracking-Tools">
            <p>
              Wir setzen derzeit <strong>keine</strong> Analyse-, Marketing- oder Trackingdienste (z. B. Google
              Analytics) und keine entsprechenden Cookies ein. Sollten wir künftig solche Dienste einsetzen, werden
              wir diese Datenschutzerklärung vorab aktualisieren und, soweit gesetzlich erforderlich, Ihre
              Einwilligung über ein Cookie-Consent-Tool einholen.
            </p>
          </Section>

          <Section title="9. Empfänger und Weitergabe">
            <p>
              Eine Weitergabe Ihrer Daten an Dritte erfolgt nicht, außer an den in dieser Erklärung genannten
              Auftragsverarbeiter (Supabase). Klicken Sie auf „Auf Willhaben Kaufen“, verlassen Sie unsere
              Website; für die Datenverarbeitung auf Willhaben ist ausschließlich die willhaben internet service
              GmbH verantwortlich.
            </p>
          </Section>

          <Section title="10. Speicherdauer">
            <p>
              Kontobezogene Daten speichern wir, solange Ihr Konto besteht. Nach Löschung Ihres Kontos werden Ihre
              Daten unverzüglich gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
            </p>
          </Section>

          <Section title="11. Ihre Rechte">
            <p>
              Ihnen stehen nach der DSGVO folgende Rechte zu: Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
              (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch
              gegen die Verarbeitung (Art. 21). Erteilte Einwilligungen können Sie jederzeit mit Wirkung für die
              Zukunft widerrufen. Kontaktieren Sie uns hierzu unter{' '}
              <a href="mailto:info@rai-recht.at" className="text-indigo-600 hover:text-indigo-700">info@rai-recht.at</a>.
            </p>
            <p>
              Zudem haben Sie das Recht, sich bei der österreichischen Datenschutzbehörde zu beschweren:
              Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030 Wien,{' '}
              <a href="https://www.dsb.gv.at" target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-700">www.dsb.gv.at</a>.
            </p>
          </Section>

          <Section title="12. Änderungen dieser Datenschutzerklärung">
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
