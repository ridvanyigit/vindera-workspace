'use client';

/**
 * Austria market calendar — opened from the calendar icon in the Smart Radar header.
 *
 * Shows statutory and regional holidays, school terms, shopping events, sports,
 * festivals and concerts that matter for a resale business in Austria. Data
 * lives in `@/lib/austriaCalendar`; this component only renders it.
 *
 * Rendered inside the `.vindera-admin` root, so it relies on the shared dark-mode
 * overrides in globals.css (gray / indigo / red / amber / green / blue / purple / emerald).
 */

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  KIND_META, addDays, getCalendarItems, indexByDay, parseISO, toISO, weekdayOf,
  type CalendarItem, type CalendarKind,
} from '@/lib/austriaCalendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KINDS = Object.keys(KIND_META) as CalendarKind[];
const MAX_CHIPS_PER_DAY = 3;

const IMPACT_LABEL = { high: 'High impact', medium: 'Medium impact', low: 'Low impact' } as const;
const IMPACT_STYLE = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
} as const;

const localToday = () => {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

const formatDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  parseISO(iso).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

const formatRange = (item: CalendarItem) => {
  const short: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  return item.end && item.end !== item.start
    ? `${formatDay(item.start, short)} – ${formatDay(item.end, short)}`
    : formatDay(item.start, short);
};

export default function AustriaCalendarModal({ onClose }: { onClose: () => void }) {
  const [today] = useState(localToday);
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [selected, setSelected] = useState(today);
  const [hidden, setHidden] = useState<Set<CalendarKind>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const todayYear = Number(today.slice(0, 4));
  const items = useMemo(
    () => getCalendarItems([cursor.year - 1, cursor.year, cursor.year + 1, todayYear, todayYear + 1]),
    [cursor.year, todayYear],
  );
  const visibleItems = useMemo(() => items.filter(i => !hidden.has(i.kind)), [items, hidden]);
  const dayIndex = useMemo(() => indexByDay(visibleItems), [visibleItems]);

  // Month grid: Monday-first, only as many weeks as the month needs.
  const monthStart = toISO(cursor.year, cursor.month, 1);
  const leading = (weekdayOf(monthStart) + 6) % 7;
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((leading + daysInMonth) / 7) * 7 }, (_, i) => addDays(monthStart, i - leading));

  const goToMonth = (delta: number) => setCursor(({ year, month }) => {
    const index = year * 12 + (month - 1) + delta;
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });
  const goToDate = (iso: string) => { setSelected(iso); setCursor({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) }); };
  const toggleKind = (kind: CalendarKind) => setHidden(prev => {
    const next = new Set(prev);
    if (next.has(kind)) next.delete(kind); else next.add(kind);
    return next;
  });

  const selectedItems = dayIndex.get(selected) ?? [];
  const selectedClosed = weekdayOf(selected) === 0 || selectedItems.some(i => i.shopsClosed);

  // Key dates ahead: what is still relevant from today on, most important first within date order.
  const upcoming = useMemo(
    () => visibleItems
      .filter(i => (i.end ?? i.start) >= today && i.impact !== 'low')
      .sort((a, b) => a.start.localeCompare(b.start) || KIND_META[a.kind].order - KIND_META[b.kind].order)
      .slice(0, 10),
    [visibleItems, today],
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="Austria market calendar"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
          <div>
            <h3 className="type-section-title text-gray-800 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-indigo-600" /> Austria Market Calendar</h3>
            <p className="type-body text-gray-500 mt-0.5">Holidays, school terms, shopping days, sports, festivals and concerts that move demand in Austria.</p>
          </div>
          <button onClick={onClose} aria-label="Close calendar" className="text-gray-400 hover:text-gray-700 transition"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
          <div className="flex items-center gap-1">
            <button onClick={() => goToMonth(-1)} aria-label="Previous month" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition"><ChevronLeft className="h-4 w-4" /></button>
            <span className="type-section-title text-gray-800 w-40 text-center">{formatDay(monthStart, { month: 'long', year: 'numeric' })}</span>
            <button onClick={() => goToMonth(1)} aria-label="Next month" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => goToDate(today)} className="ml-2 px-3 py-1 rounded-lg border border-gray-200 type-label text-gray-600 hover:bg-gray-100 transition">Today</button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {KINDS.map(kind => {
              const active = !hidden.has(kind);
              return (
                <button
                  key={kind} onClick={() => toggleKind(kind)} aria-pressed={active} title={active ? 'Click to hide' : 'Click to show'}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] font-semibold transition ${active ? KIND_META[kind].chip : 'bg-white text-gray-400 border-gray-200'}`}
                >
                  <span className={`h-2 w-2 rounded-full ${active ? KIND_META[kind].dot : 'bg-gray-300'}`} />
                  {KIND_META[kind].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
          <div className="flex-1 min-w-0 p-4 lg:overflow-y-auto">
            <div className="grid grid-cols-7 border-l border-t border-gray-200 rounded-lg overflow-hidden">
              {WEEKDAYS.map(day => (
                <div key={day} className="bg-gray-50 border-r border-b border-gray-200 py-1.5 text-center type-label text-gray-500">{day}</div>
              ))}
              {cells.map((iso, index) => {
                const inMonth = Number(iso.slice(5, 7)) === cursor.month;
                const dayItems = dayIndex.get(iso) ?? [];
                const isHoliday = dayItems.some(i => i.shopsClosed);
                const isSunday = weekdayOf(iso) === 0;
                const isToday = iso === today;
                const isSelected = iso === selected;
                const shown = dayItems.slice(0, MAX_CHIPS_PER_DAY);
                const extra = dayItems.length - shown.length;
                return (
                  <button
                    key={iso} type="button" onClick={() => setSelected(iso)}
                    className={`min-h-[84px] p-1 border-r border-b border-gray-200 text-left flex flex-col gap-0.5 transition hover:bg-indigo-50 ${isHoliday ? 'bg-red-50' : 'bg-white'} ${isSelected ? 'ring-2 ring-inset ring-indigo-500' : ''}`}
                  >
                    <span className={`self-start text-[11px] font-semibold tabular-nums leading-none px-1 py-0.5 rounded-full ${isToday ? 'bg-indigo-600 text-white' : isHoliday || isSunday ? 'text-red-600' : inMonth ? 'text-gray-700' : 'text-gray-400'}`}>
                      {Number(iso.slice(8, 10))}
                    </span>
                    {shown.map(item => {
                      // Multi-day items repeat as a slim bar; the label is shown on the first day and at the start of each week.
                      const isRunning = !!item.end && item.end !== item.start && iso !== item.start && index % 7 !== 0;
                      return isRunning
                        ? <span key={item.id} className={`h-1.5 rounded-sm ${KIND_META[item.kind].dot} ${inMonth ? '' : 'opacity-50'}`} />
                        : <span key={item.id} className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${KIND_META[item.kind].chip} ${inMonth ? '' : 'opacity-60'}`}>{item.title}</span>;
                    })}
                    {extra > 0 && <span className="text-[10px] text-gray-500 font-semibold px-1">+{extra} more</span>}
                  </button>
                );
              })}
            </div>
            <p className="type-body text-gray-500 mt-3">
              Holidays and shopping days are calculated for any year. School terms, sports, festivals and concerts are researched for Sep 2026 – Sep 2027; the impact rating is a rule-of-thumb estimate for resale demand.
            </p>
          </div>

          <aside className="lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 bg-gray-50 lg:overflow-y-auto p-4 flex flex-col gap-5">
            <section>
              <h4 className="type-label text-gray-500 mb-2">{formatDay(selected, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h4>
              {selectedClosed && (
                <span className="inline-block mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">
                  {weekdayOf(selected) === 0 && !selectedItems.some(i => i.shopsClosed) ? 'Sunday — shops closed' : 'Shops closed'}
                </span>
              )}
              {selectedItems.length === 0
                ? <p className="type-body text-gray-500">{selectedClosed ? 'No special events on this day.' : 'Nothing scheduled — a regular trading day.'}</p>
                : <div className="flex flex-col gap-2">{selectedItems.map(item => <ItemCard key={item.id} item={item} />)}</div>}
            </section>

            <section>
              <h4 className="type-label text-gray-500 mb-2">Key dates ahead</h4>
              {upcoming.length === 0
                ? <p className="type-body text-gray-500">No high- or medium-impact dates for the selected filters.</p>
                : (
                  <div className="flex flex-col gap-1.5">
                    {upcoming.map(item => (
                      <button key={item.id} onClick={() => goToDate(item.start < today ? today : item.start)} className="text-left flex items-start gap-2 p-2 rounded-lg border border-transparent hover:border-gray-200 hover:bg-white transition">
                        <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${KIND_META[item.kind].dot}`} />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-gray-800 truncate">{item.title}</span>
                          <span className="block text-[11px] text-gray-500">{item.start < today ? `Ongoing until ${formatDay(item.end ?? item.start, { day: 'numeric', month: 'short' })}` : formatRange(item)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: CalendarItem }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border ${KIND_META[item.kind].chip}`}>{KIND_META[item.kind].label}</span>
        <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded border ${IMPACT_STYLE[item.impact]}`}>{IMPACT_LABEL[item.impact]}</span>
      </div>
      <p className="text-[13px] font-semibold text-gray-800">{item.title}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{formatRange(item)}{item.regions ? ` · ${item.regions}` : ''}</p>
      {item.note && <p className="type-body text-gray-600 mt-1.5">{item.note}</p>}
    </div>
  );
}
