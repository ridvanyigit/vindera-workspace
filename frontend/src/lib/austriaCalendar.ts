/**
 * Austria market calendar — data layer for the Smart Radar calendar modal.
 *
 * Two sources are merged:
 *   1. GENERATED items, computed from the year alone (statutory holidays,
 *      bridge days, Black Friday, Mother's Day …). They are correct for any year.
 *   2. CURATED items (STATIC_ITEMS): school terms, sports fixtures, festivals,
 *      concerts and one-off shopping events. These were researched from official
 *      sources (bmb.gv.at, ÖFB, Red Bull Ring, stadthalle.com, wien.gv.at,
 *      Amazon) in September 2026 and only cover 2026-09 → 2027-09.
 *      Refresh this list once a year (see CLAUDE.md).
 *
 * All dates are plain 'YYYY-MM-DD' strings and all date maths runs in UTC, so
 * daylight-saving changes and the viewer's timezone can never shift a day.
 */

export type CalendarKind =
  | 'holiday'
  | 'shopping'
  | 'school'
  | 'sport'
  | 'event'
  | 'concert'
  | 'regional'
  | 'observance';

/** Rough sales relevance for a resale business — a judgement call, not a measurement. */
export type CalendarImpact = 'high' | 'medium' | 'low';

export interface CalendarItem {
  id: string;
  kind: CalendarKind;
  title: string;
  /** First day, inclusive. */
  start: string;
  /** Last day, inclusive. Omitted for single-day items. */
  end?: string;
  note?: string;
  impact: CalendarImpact;
  /** Statutory holiday: retail is closed nationwide. */
  shopsClosed?: boolean;
  /** Which federal states the item applies to, when not nationwide. */
  regions?: string;
}

/**
 * Display metadata per kind. Class strings are spelled out in full (Tailwind
 * only sees literal class names) and use only colour families that have
 * dark-mode overrides in globals.css. Regional holidays are dashed grey because
 * green and emerald are too close to tell apart.
 */
export const KIND_META: Record<CalendarKind, { label: string; chip: string; dot: string; order: number }> = {
  holiday:    { label: 'Public holiday',    chip: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500',     order: 0 },
  shopping:   { label: 'Shopping event',    chip: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500',   order: 1 },
  school:     { label: 'School',            chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',    dot: 'bg-indigo-500',  order: 2 },
  sport:      { label: 'Sports',            chip: 'bg-green-50 text-green-700 border-green-200',       dot: 'bg-green-500',   order: 3 },
  event:      { label: 'Festival / fair',   chip: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500',    order: 4 },
  concert:    { label: 'Concert',           chip: 'bg-purple-50 text-purple-700 border-purple-200',    dot: 'bg-purple-500',  order: 5 },
  regional:   { label: 'Regional holiday',  chip: 'bg-gray-50 text-gray-600 border-gray-300 border-dashed', dot: 'bg-gray-500', order: 6 },
  observance: { label: 'Observance / bridge day', chip: 'bg-gray-100 text-gray-600 border-gray-200',   dot: 'bg-gray-400',    order: 7 },
};

// ---------------------------------------------------------------------------
// Date helpers (UTC, string based)
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** `month` is 1-based. */
export const toISO = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

export const parseISO = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const formatUTC = (date: Date) => toISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());

export const addDays = (iso: string, days: number): string => {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatUTC(date);
};

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (iso: string): number => parseISO(iso).getUTCDay();

/** The n-th (1-based) given weekday of a month, e.g. 2nd Sunday of May. */
const nthWeekday = (year: number, month: number, weekday: number, n: number): string => {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return toISO(year, month, 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7);
};

/** Gregorian Easter Sunday (anonymous / Meeus algorithm). */
const easterSunday = (year: number): string => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toISO(year, month, day);
};

// ---------------------------------------------------------------------------
// Generated items
// ---------------------------------------------------------------------------

function holidaysFor(year: number): CalendarItem[] {
  const easter = easterSunday(year);
  const holiday = (slug: string, title: string, start: string, note: string): CalendarItem => ({
    id: `hol-${year}-${slug}`, kind: 'holiday', title, start, note: `${note} Shops closed nationwide.`, impact: 'high', shopsClosed: true,
  });

  const fixed: CalendarItem[] = [
    holiday('neujahr', 'Neujahr', toISO(year, 1, 1), "New Year's Day."),
    holiday('dreikoenige', 'Heilige Drei Könige', toISO(year, 1, 6), 'Epiphany. Also the last day of the Christmas school break.'),
    holiday('ostermontag', 'Ostermontag', addDays(easter, 1), 'Easter Monday.'),
    holiday('staatsfeiertag', 'Staatsfeiertag', toISO(year, 5, 1), 'Labour Day.'),
    holiday('himmelfahrt', 'Christi Himmelfahrt', addDays(easter, 39), 'Ascension Day, always a Thursday — the Friday is a popular bridge day.'),
    holiday('pfingstmontag', 'Pfingstmontag', addDays(easter, 50), 'Whit Monday.'),
    holiday('fronleichnam', 'Fronleichnam', addDays(easter, 60), 'Corpus Christi, always a Thursday — the Friday is a popular bridge day.'),
    holiday('mariae-himmelfahrt', 'Mariä Himmelfahrt', toISO(year, 8, 15), 'Assumption Day.'),
    holiday('nationalfeiertag', 'Nationalfeiertag', toISO(year, 10, 26), 'Austrian National Day.'),
    holiday('allerheiligen', 'Allerheiligen', toISO(year, 11, 1), "All Saints' Day."),
    holiday('mariae-empfaengnis', 'Mariä Empfängnis', toISO(year, 12, 8), 'Immaculate Conception — a traditional Christmas-shopping day, but shops are closed (tourist zones excepted).'),
    holiday('christtag', 'Christtag', toISO(year, 12, 25), 'Christmas Day.'),
    holiday('stefanitag', 'Stefanitag', toISO(year, 12, 26), "St. Stephen's Day."),
  ];

  // Bridge days ("Fenstertage"): a holiday on Thursday makes Friday a popular
  // day off, a holiday on Tuesday does the same for Monday.
  const holidayDates = new Set(fixed.map(h => h.start));
  const bridges: CalendarItem[] = [];
  for (const h of fixed) {
    const weekday = weekdayOf(h.start);
    const bridge = weekday === 4 ? addDays(h.start, 1) : weekday === 2 ? addDays(h.start, -1) : null;
    if (bridge && !holidayDates.has(bridge)) {
      bridges.push({
        id: `bridge-${year}-${h.start}`, kind: 'observance', title: `Fenstertag (${h.title})`, start: bridge,
        note: 'Bridge day: many Austrians take it off for a long weekend. Shops are open; travel and leisure demand rises.', impact: 'medium',
      });
    }
  }

  const observances: CalendarItem[] = [
    { id: `obs-${year}-karfreitag`, kind: 'observance', title: 'Karfreitag', start: addDays(easter, -2), impact: 'low',
      note: 'Good Friday is not a public holiday in Austria — shops are open.' },
    { id: `obs-${year}-ostersonntag`, kind: 'observance', title: 'Ostersonntag', start: easter, impact: 'low',
      note: 'Easter Sunday. Toys, sweets and garden items peak in the week before.' },
    { id: `obs-${year}-pfingstsonntag`, kind: 'observance', title: 'Pfingstsonntag', start: addDays(easter, 49), impact: 'low', note: 'Whit Sunday.' },
    { id: `obs-${year}-heiliger-abend`, kind: 'observance', title: 'Heiliger Abend', start: toISO(year, 12, 24), impact: 'medium',
      note: 'Christmas Eve: shops close at 13:00. Last realistic delivery day for online gifts is earlier — check the carrier cut-offs.' },
    { id: `obs-${year}-silvester`, kind: 'observance', title: 'Silvester', start: toISO(year, 12, 31), impact: 'low', note: "New Year's Eve. Party goods and fireworks demand." },
  ];

  const regional = (slug: string, title: string, month: number, day: number, regions: string): CalendarItem => ({
    id: `reg-${year}-${slug}`, kind: 'regional', title, start: toISO(year, month, day), regions, impact: 'low',
    note: 'State holiday: schools and public offices closed, retail normally open.',
  });

  return [
    ...fixed,
    ...bridges,
    ...observances,
    regional('josefi', 'Josefstag', 3, 19, 'Carinthia, Styria, Tyrol, Vorarlberg'),
    regional('florian', 'Florianitag', 5, 4, 'Upper Austria'),
    regional('rupert', 'Rupertitag', 9, 24, 'Salzburg'),
    regional('volksabstimmung', 'Tag der Volksabstimmung', 10, 10, 'Carinthia'),
    regional('martini', 'Martinstag', 11, 11, 'Burgenland'),
    regional('leopoldi', 'Leopoldstag', 11, 15, 'Vienna, Lower Austria'),
  ];
}

function shoppingDaysFor(year: number): CalendarItem[] {
  const blackFriday = addDays(nthWeekday(year, 11, 4, 4), 1); // Friday after the 4th Thursday of November

  // Advent starts on the Sunday three weeks before the last Sunday before Christmas.
  let fourthAdvent = toISO(year, 12, 24);
  while (weekdayOf(fourthAdvent) !== 0) fourthAdvent = addDays(fourthAdvent, -1);

  return [
    { id: `shop-${year}-valentin`, kind: 'shopping', title: 'Valentinstag', start: toISO(year, 2, 14), impact: 'medium',
      note: "Valentine's Day: fashion, jewellery, perfume and small gifts." },
    { id: `shop-${year}-muttertag`, kind: 'shopping', title: 'Muttertag', start: nthWeekday(year, 5, 0, 2), impact: 'medium',
      note: "Mother's Day (2nd Sunday of May): beauty, home & garden, small electronics." },
    { id: `shop-${year}-vatertag`, kind: 'shopping', title: 'Vatertag', start: nthWeekday(year, 6, 0, 2), impact: 'low',
      note: "Father's Day in Austria (2nd Sunday of June): tools, tech, outdoor." },
    { id: `shop-${year}-urlaubsgeld`, kind: 'shopping', title: 'Urlaubsgeld (ca.)', start: toISO(year, 6, 1), impact: 'low',
      note: 'Approximate: many employees receive the 13th/14th salary "Urlaubsgeld" around June — purchasing power rises.' },
    { id: `shop-${year}-halloween`, kind: 'shopping', title: 'Halloween', start: toISO(year, 10, 31), impact: 'low',
      note: 'Costumes, decoration and sweets; buy stock earlier in October.' },
    { id: `shop-${year}-singles`, kind: 'shopping', title: "Singles' Day", start: toISO(year, 11, 11), impact: 'low',
      note: 'Online promotions start to appear; a warm-up for Black Week.' },
    { id: `shop-${year}-blackweek`, kind: 'shopping', title: 'Black Week', start: addDays(blackFriday, -4), end: addDays(blackFriday, 2), impact: 'high',
      note: 'Peak discount week. Amazon and retail prices drop — check buy-box prices before committing to stock, and avoid listing electronics at pre-sale prices.' },
    { id: `shop-${year}-blackfriday`, kind: 'shopping', title: 'Black Friday', start: blackFriday, impact: 'high',
      note: 'Biggest online shopping day of the year. Market prices are at their lowest — ideal for buying stock, poor for selling high.' },
    { id: `shop-${year}-cybermonday`, kind: 'shopping', title: 'Cyber Monday', start: addDays(blackFriday, 3), impact: 'high',
      note: 'Last big deal day of the Black Week cycle, strong for electronics.' },
    { id: `shop-${year}-weihnachtsgeld`, kind: 'shopping', title: 'Weihnachtsgeld (ca.)', start: toISO(year, 12, 1), impact: 'medium',
      note: 'Approximate: the Christmas bonus (13th/14th salary) is usually due by about 1 December — purchasing power peaks.' },
    { id: `shop-${year}-advent1`, kind: 'shopping', title: '1. Advent', start: addDays(fourthAdvent, -21), impact: 'medium',
      note: 'First Advent Sunday: the Christmas gift season is in full swing. Toys, tech and fashion sell fastest until mid-December.' },
    { id: `shop-${year}-krampus`, kind: 'shopping', title: 'Krampusnacht', start: toISO(year, 12, 5), impact: 'low', note: 'Krampus runs across Austria.' },
    { id: `shop-${year}-nikolaus`, kind: 'shopping', title: 'Nikolaustag', start: toISO(year, 12, 6), impact: 'low', note: "St. Nicholas Day: small gifts and sweets for children." },
  ];
}

// ---------------------------------------------------------------------------
// Curated items (researched September 2026, covers 2026-09 → 2027-09)
// ---------------------------------------------------------------------------

const EAST = 'Vienna, Lower Austria, Burgenland';
const WEST = 'Upper Austria, Styria, Carinthia, Salzburg, Tyrol, Vorarlberg';

export const STATIC_ITEMS: CalendarItem[] = [
  // --- School terms (bmb.gv.at, school year 2026/27) ---
  { id: 'school-2026-start-east', kind: 'school', title: 'Schulbeginn Ost', start: '2026-09-07', regions: EAST, impact: 'high',
    note: 'School year 2026/27 begins. Back-to-school demand: stationery, backpacks, laptops, calculators.' },
  { id: 'school-2026-start-west', kind: 'school', title: 'Schulbeginn West', start: '2026-09-14', regions: WEST, impact: 'high',
    note: 'School year 2026/27 begins in the western states.' },
  { id: 'school-2026-autumn', kind: 'school', title: 'Herbstferien', start: '2026-10-27', end: '2026-10-31', impact: 'medium',
    note: 'Autumn break, all states. Toys, games and family leisure items sell well.' },
  { id: 'school-2026-christmas', kind: 'school', title: 'Weihnachtsferien', start: '2026-12-24', end: '2027-01-06', impact: 'medium',
    note: 'Christmas break, all states. Gift vouchers get spent and the winter sales start straight after.' },
  { id: 'school-2027-semester-east', kind: 'school', title: 'Semesterferien Ost', start: '2027-02-01', end: '2027-02-06', regions: 'Vienna, Lower Austria', impact: 'medium',
    note: 'Staggered winter break — ski and winter-sports gear peaks.' },
  { id: 'school-2027-semester-central', kind: 'school', title: 'Semesterferien Mitte', start: '2027-02-08', end: '2027-02-13', regions: 'Burgenland, Carinthia', impact: 'medium',
    note: 'Staggered winter break — ski and winter-sports gear peaks.' },
  { id: 'school-2027-semester-west', kind: 'school', title: 'Semesterferien West', start: '2027-02-15', end: '2027-02-20', regions: 'Upper Austria, Salzburg, Styria, Tyrol, Vorarlberg', impact: 'medium',
    note: 'Staggered winter break — ski and winter-sports gear peaks.' },
  { id: 'school-2027-easter', kind: 'school', title: 'Osterferien', start: '2027-03-20', end: '2027-03-29', impact: 'medium',
    note: 'Easter break, all states. Toys, garden and outdoor items.' },
  { id: 'school-2027-whit', kind: 'school', title: 'Pfingstferien', start: '2027-05-15', end: '2027-05-17', impact: 'low', note: 'Whit break, all states.' },
  { id: 'school-2027-end-east', kind: 'school', title: 'Zeugnistag Ost', start: '2027-07-02', regions: EAST, impact: 'low', note: 'Last school day; report cards. Summer holidays begin.' },
  { id: 'school-2027-end-west', kind: 'school', title: 'Zeugnistag West', start: '2027-07-09', regions: WEST, impact: 'low', note: 'Last school day; report cards. Summer holidays begin.' },
  { id: 'school-2027-summer-east', kind: 'school', title: 'Sommerferien Ost', start: '2027-07-03', end: '2027-09-05', regions: EAST, impact: 'medium',
    note: 'Summer holidays. Outdoor, travel and leisure items sell; back-to-school shopping starts in late August.' },
  { id: 'school-2027-summer-west', kind: 'school', title: 'Sommerferien West', start: '2027-07-10', end: '2027-09-12', regions: WEST, impact: 'medium',
    note: 'Summer holidays. Outdoor, travel and leisure items sell; back-to-school shopping starts in late August.' },
  { id: 'school-2027-start-east', kind: 'school', title: 'Schulbeginn Ost 2027', start: '2027-09-06', regions: EAST, impact: 'high',
    note: 'School year 2027/28 begins (first Monday of September).' },
  { id: 'school-2027-start-west', kind: 'school', title: 'Schulbeginn West 2027', start: '2027-09-13', regions: WEST, impact: 'high',
    note: 'School year 2027/28 begins in the western states.' },

  // --- Shopping events that are not tied to a fixed rule ---
  { id: 'shop-2026-primedeal', kind: 'shopping', title: 'Amazon Prime Deal Days', start: '2026-10-06', end: '2026-10-07', impact: 'high',
    note: 'Amazon.de 48-hour deal event (announced by Amazon). Marketplace prices dip — check buy-box prices before buying and expect competitors to undercut.' },

  // --- Sports ---
  { id: 'sport-2026-nl-israel', kind: 'sport', title: 'ÖFB – Israel (Nations League)', start: '2026-09-24', impact: 'low',
    note: 'Home match at the Raiffeisen Arena, Linz.' },
  { id: 'sport-2026-nl-kosovo-home', kind: 'sport', title: 'ÖFB – Kosovo (Nations League)', start: '2026-09-27', impact: 'medium',
    note: 'Home match, 18:00, Ernst-Happel-Stadion Vienna. National-team matches lift TV and sports-bar demand.' },
  { id: 'sport-2026-nl-ireland-away', kind: 'sport', title: 'Irland – ÖFB (Nations League)', start: '2026-10-01', impact: 'low', note: 'Away match.' },
  { id: 'sport-2026-nl-kosovo-away', kind: 'sport', title: 'Kosovo – ÖFB (Nations League)', start: '2026-10-04', impact: 'low', note: 'Away match.' },
  { id: 'sport-2026-nl-ireland-home', kind: 'sport', title: 'ÖFB – Irland (Nations League)', start: '2026-11-14', impact: 'medium',
    note: 'Home match, 20:45, Raiffeisen Arena Linz.' },
  { id: 'sport-2026-nl-israel-away', kind: 'sport', title: 'Israel – ÖFB (Nations League)', start: '2026-11-17', impact: 'low', note: 'Away match.' },
  { id: 'sport-2026-soelden', kind: 'sport', title: 'Ski-Weltcup Auftakt Sölden', start: '2026-10-24', end: '2026-10-25', impact: 'medium',
    note: 'Alpine World Cup season opener on the Rettenbach glacier — ski gear and winter sportswear start selling.' },
  { id: 'sport-2026-erste-bank-open', kind: 'sport', title: 'Erste Bank Open (ATP Wien)', start: '2026-10-24', end: '2026-11-01', impact: 'low',
    note: 'Tennis tournament, Wiener Stadthalle.' },
  { id: 'sport-2026-wiener-derby', kind: 'sport', title: 'Wiener Derby (Austria – Rapid)', start: '2026-11-01', impact: 'medium',
    note: 'Per the Bundesliga fixture list of September 2026 — kick-off times can still change. Fan-merchandise and TV demand.' },
  { id: 'sport-2027-hahnenkamm', kind: 'sport', title: 'Hahnenkamm-Rennen Kitzbühel', start: '2027-01-19', end: '2027-01-24', impact: 'medium',
    note: 'The most famous ski race weekend of the season. Ski gear and TV demand.' },
  { id: 'sport-2027-schladming', kind: 'sport', title: 'Nightrace Schladming', start: '2027-01-26', end: '2027-01-27', impact: 'medium',
    note: 'Giant slalom on 26 Jan, night slalom on 27 Jan (Planai).' },
  { id: 'sport-2027-vcm', kind: 'sport', title: 'Vienna City Marathon', start: '2027-04-18', impact: 'medium',
    note: 'Race day 18 April, event programme 17–19 April. Running shoes, sportswear and fitness trackers.' },
  { id: 'sport-2027-f1', kind: 'sport', title: 'Formel 1 – Großer Preis von Österreich', start: '2027-07-09', end: '2027-07-11', impact: 'high',
    note: 'Red Bull Ring, Spielberg (Styria). Big regional crowds; fan merchandise, camping and outdoor gear.' },

  // --- Festivals, fairs and markets ---
  { id: 'event-2026-wiesn', kind: 'event', title: 'Wiener Kaiser Wiesn', start: '2026-09-24', end: '2026-10-11', impact: 'medium',
    note: "Vienna's Oktoberfest in the Prater. Dirndl, Lederhosen and Tracht accessories sell." },
  { id: 'event-2026-christkindlmarkt', kind: 'event', title: 'Wiener Christkindlmarkt (Rathausplatz)', start: '2026-11-13', end: '2026-12-26', impact: 'medium',
    note: "Vienna's largest Christmas market; the Eistraum ice rink runs until 6 Jan 2027. Other Viennese Advent markets open around the same time." },
  { id: 'event-2027-snowbombing', kind: 'event', title: 'Snowbombing Mayrhofen', start: '2027-04-05', end: '2027-04-10', impact: 'low', note: 'Winter music festival in the Zillertal (Tyrol).' },
  { id: 'event-2027-novarock', kind: 'event', title: 'Nova Rock', start: '2027-06-10', end: '2027-06-12', impact: 'medium',
    note: "Austria's biggest rock festival, Nickelsdorf (Burgenland). Camping, festival and outdoor gear is bought beforehand." },
  { id: 'event-2027-donauinselfest', kind: 'event', title: 'Donauinselfest', start: '2027-06-25', end: '2027-06-27', impact: 'medium',
    note: "One of Europe's largest open-air festivals, free entry, Danube Island in Vienna. Summer and outdoor items." },
  { id: 'event-2027-frequency', kind: 'event', title: 'Frequency Festival', start: '2027-08-19', end: '2027-08-21', impact: 'low',
    note: 'Music festival in St. Pölten (Lower Austria).' },

  // --- Concerts (selection of the biggest announced shows; not exhaustive) ---
  { id: 'concert-2026-deep-purple', kind: 'concert', title: 'Deep Purple', start: '2026-10-05', impact: 'low', note: 'Wiener Stadthalle, Halle D.' },
  { id: 'concert-2026-dylan', kind: 'concert', title: 'Bob Dylan', start: '2026-11-11', end: '2026-11-14', impact: 'low', note: 'Shows in Vienna and Salzburg on 11, 12 and 14 November.' },
  { id: 'concert-2026-parov', kind: 'concert', title: 'Parov Stelar', start: '2026-12-04', impact: 'low', note: 'Vienna, first big show in ten years.' },
  { id: 'concert-2026-seiler-speer', kind: 'concert', title: 'Seiler und Speer', start: '2026-12-11', end: '2026-12-12', impact: 'low', note: 'Vienna, 360° 3D audio show.' },
  { id: 'concert-2026-wanda', kind: 'concert', title: 'Weihnachten mit Wanda', start: '2026-12-19', impact: 'low', note: 'Vienna, the only Wanda show of the year.' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Every item that touches the given years: generated ones for those years plus all curated ones. */
export function getCalendarItems(years: number[]): CalendarItem[] {
  const generated = [...new Set(years)].flatMap(year => [...holidaysFor(year), ...shoppingDaysFor(year)]);
  return [...generated, ...STATIC_ITEMS];
}

/** Expands multi-day items so each day maps to everything happening on it. */
export function indexByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const index = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const last = item.end ?? item.start;
    for (let day = item.start; day <= last; day = addDays(day, 1)) {
      const bucket = index.get(day);
      if (bucket) bucket.push(item); else index.set(day, [item]);
    }
  }
  for (const bucket of index.values()) {
    bucket.sort((a, b) => KIND_META[a.kind].order - KIND_META[b.kind].order || a.title.localeCompare(b.title));
  }
  return index;
}
