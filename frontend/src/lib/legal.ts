/**
 * Operator details shown in the Impressum, the Datenschutzerklaerung and the
 * footer. Edit them here, in ONE place. The surrounding legal wording lives in
 * the pages themselves and must be reviewed by a lawyer / Steuerberater before
 * launch (see docs/MANUEL-ADIMLAR.md); this file only holds the facts.
 */
export const LEGAL = {
  name: 'Rıdvan Yiğit',
  street: 'Kühgasse 8/9',
  postalCode: '1110',
  city: 'Wien',
  country: 'Österreich',
  email: 'info@rai-recht.at',
  taxNumber: '03 796/2073',
  /** UID-Nummer; leave null while there is none (a Kleinunternehmer has no UID for sales). */
  vatId: null as string | null,
  chamber: 'Wirtschaftskammer Wien',
  supervisoryAuthority: 'Magistratisches Bezirksamt Wien',
  /** Update this line the moment the Gewerbeberechtigung is issued. */
  tradeLicense: 'Handelsgewerbe (freies Gewerbe gemäß Gewerbeordnung 1994) — Anmeldung in Vorbereitung',
} as const;
